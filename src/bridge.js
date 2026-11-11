import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { Client, GatewayIntentBits } from "discord.js"
import { readFileSync } from "node:fs"
import { EventEmitter } from "node:events"
import { shouldPrompt } from "./filter.js"
import { createQueue } from "./queue.js"
import { buildPrompt } from "./prompt.js"
import { chunkMessage } from "./chunk.js"
import { parseAttachments } from "./attachments.js"
import { postWebhook, editWebhookMessage } from "./webhook.js"
import { handleInteraction } from "./interaction.js"
import { registerCommands } from "./commands.js"
import { createFeedGate, formatToolLine } from "./feed.js"
import { runShell, awaitSessionTurn } from "./shell.js"
import { createTypingTicker } from "./typing.js"
import { createStream } from "./stream.js"
import { createSpeechQueue } from "./audio.js"
import { synthesizeWithPiper, wavToPcm48k } from "./tts.js"
import { sendSystemMessage } from "./windows-message.js"
import {
  createVoiceState,
  createVoiceJoinHandler,
  createVoiceInteractionDeps,
  leaveVoice as applyVoiceLeave,
} from "./voice.js"

const MIME_TYPES = {
  gif: "image/gif",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
}

function mimeOf(name) {
  const ext = name.split(".").pop()?.toLowerCase()
  return MIME_TYPES[ext] ?? "application/octet-stream"
}

export async function startBridge(config) {
  const endpoint = await Service.ensure()
  const openCode = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })

  // Fail fast if the paired session does not exist.
  await openCode.session.get({ sessionID: config.sessionId })

  const discord = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
  })
  const queue = createQueue()
  const feed = createFeedGate()
  const voiceState = createVoiceState()
  let paused = false
  const gate = {
    pause: () => { paused = true },
    resume: () => { paused = false },
    isPaused: () => paused,
  }
  let depth = 0
  const bootAt = Date.now()

  // Reply threading: the reply flush references the triggering message.
  let pendingRef = null
  // Typing indicator: armed on prompt enqueue, beat per delta, stop on ended.
  const typing = createTypingTicker(
    () => discord.channels.cache.get(config.channelId)?.sendTyping().catch(() => {}),
    { intervalMs: 8000 },
  )

  // Review-turn tracking (Task 10): awaitSessionTurn settles on the first
  // session.idle created after the prompt; stale idles from earlier turns are
  // filtered by timestamp, prompt failure aborts the wait. Failure mode stays
  // fail-closed — wrong/absent reply parses to null verdict → REJECT.
  const idleBus = new EventEmitter()
  async function latestAssistantText() {
    const res = await openCode.session.message.list({
      sessionID: config.sessionId,
      type: "assistant",
      limit: 1,
      order: "desc",
    })
    const msg = res.data?.[0]
    if (!msg || msg.type !== "assistant") return ""
    return (msg.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join("\n")
  }
  async function promptForReview(text) {
    const issuedAt = Date.now()
    const ac = new AbortController()
    const turn = awaitSessionTurn(idleBus, {
      signal: ac.signal,
      isStale: (ev) => (ev.created ?? 0) < issuedAt,
    })
    let promptErr = null
    const promptP = openCode.session.prompt({ sessionID: config.sessionId, text }).then(
      () => null,
      (err) => {
        promptErr = err
        ac.abort()
        return null
      },
    )
    try {
      await turn
    } catch (err) {
      throw promptErr ?? err
    }
    await promptP
    if (promptErr) throw promptErr
    return latestAssistantText()
  }
  async function createSession() {
    const s = await openCode.session.create({})
    config.sessionId = s.id
    return s.id
  }

  const joinVoice = createVoiceJoinHandler({ channels: discord.channels, state: voiceState })

  async function leaveVoiceChannel(guildId) {
    if (!voiceState.joined || voiceState.guildId !== guildId) return false
    applyVoiceLeave(voiceState)
    return true
  }

  const speakQueue = createSpeechQueue({
    synthesize: (text) => synthesizeWithPiper(text),
    convert: (wav) => wavToPcm48k(wav),
    speakQueue: () => voiceState.speakQueue,
    isJoined: () => voiceState.joined,
  })

  discord.on("interactionCreate", (interaction) => {
    if (!interaction.isChatInputCommand()) return
    handleInteraction(interaction, {
      config,
      feed,
      gate,
      promptForReview,
      runShell,
      sendSystemMessage,
      queueDepth: () => depth,
      uptimeMs: () => Date.now() - bootAt,
      createSession,
      ...createVoiceInteractionDeps(joinVoice, leaveVoiceChannel),
    }).catch(async (err) => {
      console.error("interaction failed:", err.message)
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(`⚠️ command failed: ${err.message}`)
        } else {
          await interaction.reply({ content: `⚠️ command failed: ${err.message}`, ephemeral: true })
        }
      } catch {}
    })
  })

  discord.on("messageCreate", (msg) => {
    if (msg.channelId !== config.channelId) return
    if (gate.isPaused()) return
    if (!shouldPrompt(msg)) return
    // Identity: use the immutable author ID, never the guild nickname/display
    // name — display names are user-set and can be used to impersonate others.
    const authorName = `${msg.author.username} (${msg.author.id})`
    pendingRef = msg.id
    typing.start()
    feed.arm()
    depth++
    queue
      .enqueue(async () => {
        try {
          await openCode.session.prompt({
            sessionID: config.sessionId,
            text: buildPrompt({ authorName, content: msg.content }),
          })
        } catch (err) {
          console.error("prompt failed:", err.message)
          await postWebhook(config.webhookUrl, `⚠️ prompt failed: ${err.message}`).catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => { depth-- })
  })

  // Outbound: stream replies live (create → throttled edits → final edit),
  // plus ⚡ tool feed while armed.
  const buffer = new Map()
  const streamStates = new Map()
  ;(async () => {
    console.log("diag: event loop starting")
    for await (const ev of openCode.event.subscribe({
      types: [
        "session.text.started",
        "session.text.delta",
        "session.text.ended",
        "session.idle",
        "session.tool.called",
        "session.tool.failed",
      ],
    })) {
      console.log(`diag: event ${ev.type} session=${ev.data?.sessionID}`)
      if (ev.data.sessionID !== config.sessionId) continue

      if (ev.type === "session.idle") {
        idleBus.emit("session.idle", ev)
        feed.disarm()
        continue
      }

      if (ev.type === "session.tool.called" || ev.type === "session.tool.failed") {
        if (!feed.shouldPost()) continue
        const name = ev.data.name ?? ev.data.id
        const input = ev.type === "session.tool.called" ? ev.data.input : undefined
        await postWebhook(config.webhookUrl, formatToolLine(name, input)).catch((err) =>
          console.error("feed post failed:", err.message),
        )
        continue
      }

      if (ev.type === "session.text.started") {
        const ref = pendingRef
        pendingRef = null
        let msgId = null
        try {
          const created = await postWebhook(config.webhookUrl, "…", [], ref ? { reference: ref } : {})
          msgId = created?.id ?? null
        } catch (err) {
          console.error("stream create failed:", err.message)
        }
        streamStates.set(ev.data.assistantMessageID, {
          stream: createStream({ editIntervalMs: 1500 }),
          msgId,
        })
        continue
      }

      if (ev.type === "session.text.delta") {
        typing.beat()
        buffer.set(
          ev.data.assistantMessageID,
          (buffer.get(ev.data.assistantMessageID) ?? "") + ev.data.delta,
        )
        const state = streamStates.get(ev.data.assistantMessageID)
        if (state) {
          const { edit } = state.stream.append(ev.data.delta, Date.now())
          if (edit && state.msgId) {
            try {
              await editWebhookMessage(config.webhookUrl, state.msgId, edit.slice(0, 2000))
            } catch (err) {
              console.error("stream edit failed:", err.message)
            }
          }
        }
        continue
      }

      if (ev.type !== "session.text.ended") continue
      const full = buffer.get(ev.data.assistantMessageID) || ev.data.text
      buffer.delete(ev.data.assistantMessageID)
      const state = streamStates.get(ev.data.assistantMessageID)
      streamStates.delete(ev.data.assistantMessageID)
      typing.stop()
      if (voiceState.joined && full && full.trim()) {
        try {
          void speakQueue.enqueue(full.trim())
        } catch (err) {
          console.error("tts enqueue failed:", err.message)
        }
      }
      if (!full) {
        if (state?.msgId) {
          await editWebhookMessage(config.webhookUrl, state.msgId, "").catch(() => {})
        }
        console.log("diag: ended with empty text")
        continue
      }
      try {
        const { text, files: filePaths } = parseAttachments(full)
        if (state?.msgId) {
          // Live message exists: final edit + overflow follow-ups + attachments.
          const base = text.slice(0, 2000)
          await editWebhookMessage(config.webhookUrl, state.msgId, base).catch((err) =>
            console.error("final edit failed:", err.message),
          )
          if (text.length > 2000) {
            for (const part of chunkMessage(text.slice(2000))) {
              await postWebhook(config.webhookUrl, part)
            }
          }
          if (filePaths.length > 0) {
            const files = filePaths.map((f) => {
              const bytes = readFileSync(f.path)
              return { ...f, bytes, type: mimeOf(f.name) }
            })
            await postWebhook(config.webhookUrl, `📎 ${files.map((f) => f.name).join(" ")}`, files)
          }
        } else {
          // No live message (create failed or no text.started): post fresh.
          const ref = pendingRef
          pendingRef = null
          const refOpts = ref ? { reference: ref } : {}
          let firstChunk = true
          if (text.trim()) {
            for (const part of chunkMessage(text)) {
              await postWebhook(config.webhookUrl, part, [], firstChunk ? refOpts : {})
              firstChunk = false
            }
          }
          if (filePaths.length > 0) {
            const files = filePaths.map((f) => {
              const bytes = readFileSync(f.path)
              return { ...f, bytes, type: mimeOf(f.name) }
            })
            await postWebhook(
              config.webhookUrl,
              `📎 ${files.map((f) => f.name).join(" ")}`,
              files,
              firstChunk ? refOpts : {},
            )
          }
        }
        console.log(`diag: posted reply (${full.length} chars, ${filePaths.length} files)`)
      } catch (err) {
        console.error("webhook post failed:", err.message)
      }
    }
    console.log("diag: event loop ENDED (subscription closed)")
  })()

  await discord.login(config.botToken)

  // Register slash commands on the guild (needs app id from the bot identity).
  try {
    const me = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${config.botToken}` },
    }).then((r) => r.json())
    const channel = await fetch(`https://discord.com/api/v10/channels/${config.channelId}`, {
      headers: { Authorization: `Bot ${config.botToken}` },
    }).then((r) => r.json())
    await registerCommands(me.id, channel.guild_id, config.botToken)
  } catch (err) {
    console.error("command registration failed:", err.message)
  }

  console.log(`bridge started: channel ${config.channelId}, session ${config.sessionId}`)
  return discord
}

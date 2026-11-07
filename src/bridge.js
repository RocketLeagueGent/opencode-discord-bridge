import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"
import { Client, GatewayIntentBits } from "discord.js"
import { readFileSync } from "node:fs"
import { shouldPrompt } from "./filter.js"
import { createQueue } from "./queue.js"
import { buildPrompt } from "./prompt.js"
import { chunkMessage } from "./chunk.js"
import { parseAttachments } from "./attachments.js"
import { postWebhook } from "./webhook.js"
import { handleInteraction } from "./interaction.js"
import { registerCommands } from "./commands.js"
import { createFeedGate } from "./feed.js"
import { runShell } from "./shell.js"

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
      GatewayIntentBits.MessageContent,
    ],
  })
  const queue = createQueue()
  const feed = createFeedGate()
  let paused = false
  const gate = {
    pause: () => { paused = true },
    resume: () => { paused = false },
    isPaused: () => paused,
  }
  let depth = 0
  const bootAt = Date.now()

  // Review-turn tracking: settle on the first session.idle after the prompt.
  // (Race-hardening of this helper is Task 10; failure mode is fail-closed —
  // a wrong/absent reply parses to null verdict → REJECT.)
  let reviewWaiter = null
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
  function promptForReview(text) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reviewWaiter = null
        reject(new Error("review timed out after 120s"))
      }, 120000)
      reviewWaiter = () => {
        clearTimeout(timer)
        reviewWaiter = null
        latestAssistantText().then(resolve, reject)
      }
      openCode.session
        .prompt({ sessionID: config.sessionId, text })
        .catch((err) => {
          clearTimeout(timer)
          reviewWaiter = null
          reject(err)
        })
    })
  }
  async function createSession() {
    const s = await openCode.session.create({})
    config.sessionId = s.id
    return s.id
  }

  discord.on("interactionCreate", (interaction) => {
    if (!interaction.isChatInputCommand()) return
    handleInteraction(interaction, {
      config,
      feed,
      gate,
      promptForReview,
      runShell,
      queueDepth: () => depth,
      uptimeMs: () => Date.now() - bootAt,
      createSession,
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
    const authorName = msg.member?.displayName ?? msg.author.username
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

  // Outbound: accumulate assistant text deltas, flush the full message on ended.
  const buffer = new Map()
  ;(async () => {
    console.log("diag: event loop starting")
    for await (const ev of openCode.event.subscribe({
      types: ["session.text.delta", "session.text.ended", "session.idle"],
    })) {
      console.log(`diag: event ${ev.type} session=${ev.data?.sessionID}`)
      if (ev.data.sessionID !== config.sessionId) continue
      if (ev.type === "session.idle") {
        if (reviewWaiter) reviewWaiter()
        continue
      }
      if (ev.type !== "session.text.delta" && ev.type !== "session.text.ended") continue
      if (ev.type === "session.text.delta") {
        buffer.set(
          ev.data.assistantMessageID,
          (buffer.get(ev.data.assistantMessageID) ?? "") + ev.data.delta,
        )
        continue
      }
      const full = buffer.get(ev.data.assistantMessageID) || ev.data.text
      buffer.delete(ev.data.assistantMessageID)
      if (!full) {
        console.log("diag: ended with empty text")
        continue
      }
      try {
        const { text, files: filePaths } = parseAttachments(full)
        if (text.trim()) {
          for (const part of chunkMessage(text)) {
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

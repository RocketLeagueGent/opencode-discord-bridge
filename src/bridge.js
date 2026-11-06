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

  discord.on("messageCreate", (msg) => {
    if (msg.channelId !== config.channelId) return
    if (!shouldPrompt(msg)) return
    const authorName = msg.member?.displayName ?? msg.author.username
    queue.enqueue(async () => {
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
  })

  // Outbound: accumulate assistant text deltas, flush the full message on ended.
  const buffer = new Map()
  ;(async () => {
    console.log("diag: event loop starting")
    for await (const ev of openCode.event.subscribe({
      types: ["session.text.delta", "session.text.ended"],
    })) {
      console.log(`diag: event ${ev.type} session=${ev.data?.sessionID}`)
      if (ev.type !== "session.text.delta" && ev.type !== "session.text.ended") continue
      if (ev.data.sessionID !== config.sessionId) continue
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
  console.log(`bridge started: channel ${config.channelId}, session ${config.sessionId}`)
  return discord
}

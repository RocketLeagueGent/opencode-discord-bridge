import { buildShellReview, parseVerdict } from "./shell.js"

const USAGE = "Unknown command. Try /status, /pause, /resume, /actionfeed, /newsession, /shell, /join, /leave."

export async function handleInteraction(interaction, deps) {
  const { config, feed, gate } = deps
  const name = interaction.commandName

  if (name === "shell") {
    if (interaction.user.id !== config.ownerUserId) {
      await interaction.deferReply({ ephemeral: true })
      await interaction.editReply("⛔ `/shell` is owner-only.")
      return
    }
    await interaction.deferReply({ ephemeral: false })
    const cmd = interaction.options.getString("cmd")
    const reviewText = buildShellReview({ user: interaction.user.username, cmd })
    let replyText
    try {
      replyText = await deps.promptForReview(reviewText)
    } catch (err) {
      await interaction.editReply(`⚠️ review failed: ${err.message}`)
      return
    }
    const { verdict, reason } = parseVerdict(replyText)
    if (verdict !== "APPROVE") {
      const why = reason || "no verdict received → treated as REJECT"
      await interaction.editReply(`🚫 REJECTED by reviewer:\n${why}`)
      return
    }
    const { exitCode, output } = await deps.runShell(cmd, { cwd: deps.shellCwd ?? process.cwd() })
    const header = exitCode === 0 ? "✅ APPROVED + executed" : `❌ executed (exit ${exitCode})`
    await interaction.editReply(`${header}\n\`\`\`\n${output || "(no output)"}\n\`\`\``)
    return
  }

  if (name === "status") {
    await interaction.deferReply({ ephemeral: true })
    await interaction.editReply(
      [
        "Bridge status",
        `session: ${config.sessionId}`,
        `uptime: ${Math.round(deps.uptimeMs() / 1000)}s`,
        `queue depth: ${deps.queueDepth()}`,
        `feed: ${feed.shouldPost() ? "armed+posting" : "not posting"}`,
        `paused: ${gate.isPaused() ? "yes" : "no"}`,
      ].join("\n"),
    )
    return
  }

  if (name === "pause") {
    await interaction.deferReply({ ephemeral: true })
    gate.pause()
    await interaction.editReply("⏸️ Channel intake paused.")
    return
  }

  if (name === "resume") {
    await interaction.deferReply({ ephemeral: true })
    gate.resume()
    await interaction.editReply("▶️ Channel intake resumed.")
    return
  }

  if (name === "actionfeed") {
    await interaction.deferReply({ ephemeral: true })
    const state = interaction.options.getString("state")
    feed.setEnabled(state === "on")
    await interaction.editReply(`⚡ Action feed turned ${state}.`)
    return
  }

  if (name === "newsession") {
    await interaction.deferReply({ ephemeral: true })
    const id = await deps.createSession()
    await interaction.editReply(`🆕 Fresh session created; bridge now paired to \`${id}\`.`)
    return
  }

  if (name === "join" || name === "leave") {
    await interaction.deferReply({ ephemeral: true })
    await interaction.editReply("🔊 Voice is Phase 2 — not built yet.")
    return
  }

  await interaction.deferReply({ ephemeral: true })
  await interaction.editReply(USAGE)
}

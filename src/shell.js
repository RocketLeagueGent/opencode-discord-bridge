import { exec } from "node:child_process"

// Resolves on the first matching session event after subscription; rejects on
// timeout. `isStale(event)` lets the caller skip idles that belong to an
// earlier turn. Listener is always removed (resolve or timeout) so a stray
// later idle cannot re-settle a finished turn.
export function awaitSessionTurn(emitter, { timeoutMs = 120000, isStale = () => false, signal } = {}) {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(new Error("session turn aborted"))
    }
    const onEvent = (event) => {
      if (isStale(event)) return
      cleanup()
      resolve(event)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`session turn timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    function cleanup() {
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      emitter.off("session.idle", onEvent)
    }
    if (signal) {
      if (signal.aborted) return onAbort()
      signal.addEventListener("abort", onAbort, { once: true })
    }
    emitter.on("session.idle", onEvent)
  })
}

export function buildShellReview({ user, cmd }) {
  return [
    `[Shell review] ${user} requested this shell command in Discord:`,
    "",
    cmd,
    "",
    "Review it for anything suspicious, destructive, or malicious, considering the user asked for it in a trusted testing server.",
    "Reply with APPROVE or REJECT as the FIRST line of your message. On the second and following lines give your reason.",
  ].join("\n")
}

export function parseVerdict(replyText) {
  const lines = (replyText ?? "").split("\n")
  const firstIdx = lines.findIndex((l) => l.trim() !== "")
  if (firstIdx === -1) return { verdict: null, reason: "" }
  const first = lines[firstIdx].trim().toUpperCase()
  if (first !== "APPROVE" && first !== "REJECT") return { verdict: null, reason: "" }
  const reason = lines.slice(firstIdx + 1).join("\n").trim()
  return { verdict: first, reason }
}

export function runShell(cmd, { cwd, timeoutMs = 30000, maxOutput = 1500 } = {}) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      let output = `${stdout ?? ""}${stderr ?? ""}`
      if (output.length > maxOutput) {
        const marker = "\n…[truncated]…\n"
        const head = Math.floor((maxOutput - marker.length) / 2)
        const tail = maxOutput - marker.length - head
        output = output.slice(0, head) + marker + output.slice(-tail)
      }
      let exitCode = 0
      if (err) {
        exitCode = typeof err.code === "number" ? err.code : 1
        if (err.killed) output += "\n…[timeout]…"
      }
      resolve({ exitCode, output })
    })
  })
}

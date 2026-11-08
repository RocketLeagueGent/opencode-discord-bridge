export function createTypingTicker(send, { intervalMs = 8000, now = Date.now } = {}) {
  let active = false
  let lastSentAt = -Infinity
  const ticker = {
    start() {
      active = true
      lastSentAt = -Infinity
    },
    stop() {
      active = false
    },
    beat() {
      if (!active) return
      const t = now()
      if (t - lastSentAt >= intervalMs) {
        lastSentAt = t
        send()
      }
    },
  }
  ticker.start()
  return ticker
}

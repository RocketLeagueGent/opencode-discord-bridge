export function createFeedGate() {
  let armed = false
  let enabled = true
  return {
    arm() {
      armed = true
    },
    disarm() {
      armed = false
    },
    isArmed() {
      return armed
    },
    setEnabled(value) {
      enabled = value
    },
    shouldPost() {
      return armed && enabled
    },
  }
}

export function formatToolLine(name, input) {
  if (input === undefined || input === null) return `⚡ ${name}`
  let summary = typeof input === "string" ? input : JSON.stringify(input)
  summary = summary.replace(/\s*\n\s*/g, " ")
  if (summary.length > 80) summary = summary.slice(0, 80) + "…"
  return `⚡ ${name} — ${summary}`
}

import { chunkMessage } from "./chunk.js"

export function createStream({ editIntervalMs = 1500 } = {}) {
  let buffer = ""
  let lastSentAt = -Infinity
  let lastSent = null

  return {
    append(delta, now) {
      buffer += delta
      if (now - lastSentAt >= editIntervalMs) {
        lastSentAt = now
        lastSent = buffer
        return { edit: buffer }
      }
      return { edit: null }
    },
    finalize() {
      if (buffer === "") {
        return { base: "", forceEdit: null, overflow: [] }
      }
      const base = buffer.slice(0, 2000)
      const overflow = buffer.length > 2000 ? chunkMessage(buffer.slice(2000)) : []
      return { base, forceEdit: base, overflow }
    },
  }
}

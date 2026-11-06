export function chunkMessage(text, limit = 2000) {
  if (text.length <= limit) return [text]
  const parts = []
  let rest = text
  while (rest.length > limit) {
    const window = rest.slice(0, limit)
    const nl = window.lastIndexOf("\n")
    if (nl === -1) {
      parts.push(rest.slice(0, limit))
      rest = rest.slice(limit)
    } else {
      parts.push(rest.slice(0, nl + 1))
      rest = rest.slice(nl + 1)
    }
  }
  if (rest.length > 0) parts.push(rest)
  return parts
}

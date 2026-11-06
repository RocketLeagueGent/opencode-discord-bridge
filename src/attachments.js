const ATTACHMENT_LINE = /^\s*📎\s+(.+)$/

export function parseAttachments(text) {
  const files = []
  const kept = []
  for (const line of text.split("\n")) {
    const match = line.match(ATTACHMENT_LINE)
    if (match) {
      const path = match[1].trim()
      const name = path.split(/[\\/]/).pop()
      files.push({ path, name })
    } else {
      kept.push(line)
    }
  }
  return { text: kept.join("\n"), files }
}

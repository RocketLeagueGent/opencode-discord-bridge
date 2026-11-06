export function shouldPrompt(message) {
  const { author, content } = message
  if (author.bot || author.webhookId) return false
  return Boolean(content && content.trim())
}

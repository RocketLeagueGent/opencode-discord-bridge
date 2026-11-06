export function buildPrompt({ authorName, content }) {
  return `[Discord] ${authorName}: ${content}`
}

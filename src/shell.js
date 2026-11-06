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

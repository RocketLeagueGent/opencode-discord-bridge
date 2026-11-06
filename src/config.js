const REQUIRED = ["DISCORD_BOT_TOKEN", "WEBHOOK_URL", "SESSION_ID", "OWNER_USER_ID"]
const DEFAULT_CHANNEL_ID = "1568362384114983085"

export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`)
  }
  return {
    botToken: env.DISCORD_BOT_TOKEN,
    webhookUrl: env.WEBHOOK_URL,
    channelId: env.CHANNEL_ID || DEFAULT_CHANNEL_ID,
    sessionId: env.SESSION_ID,
    ownerUserId: env.OWNER_USER_ID,
  }
}

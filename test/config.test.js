import { test } from "node:test"
import assert from "node:assert/strict"
import { loadConfig } from "../src/config.js"

test("throws listing missing keys", () => {
  assert.throws(() => loadConfig({}), /DISCORD_BOT_TOKEN.*WEBHOOK_URL.*SESSION_ID/s)
})

test("returns normalized config", () => {
  const cfg = loadConfig({ DISCORD_BOT_TOKEN: "t", WEBHOOK_URL: "w", SESSION_ID: "s", OWNER_USER_ID: "123" })
  assert.equal(cfg.channelId, "1568362384114983085")
  assert.equal(cfg.sessionId, "s")
  assert.equal(cfg.ownerUserId, "123")
})

test("missing OWNER_USER_ID listed in error", () => {
  assert.throws(
    () => loadConfig({ DISCORD_BOT_TOKEN: "t", WEBHOOK_URL: "w", SESSION_ID: "s" }),
    /OWNER_USER_ID/,
  )
})

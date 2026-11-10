import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveVoiceTarget } from "../src/voice.js"

test("resolveVoiceTarget returns null when the member is not in a voice channel", () => {
  const interaction = { member: { voice: null } }
  assert.equal(resolveVoiceTarget(interaction), null)
})

test("resolveVoiceTarget reads the invoking user's voice state from the guild cache", () => {
  const interaction = {
    user: { id: "user-123" },
    member: { user: { id: "user-123" } },
    guild: { voiceStates: { cache: new Map([["user-123", { channelId: "chan-123" }]]) } },
  }
  assert.equal(resolveVoiceTarget(interaction), "chan-123")
})

test("resolveVoiceTarget returns the member's current voice channel id", () => {
  const interaction = { member: { voice: { channelId: "chan-123" } } }
  assert.equal(resolveVoiceTarget(interaction), "chan-123")
})

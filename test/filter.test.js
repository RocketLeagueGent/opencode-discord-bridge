import { test } from "node:test"
import assert from "node:assert/strict"
import { shouldPrompt } from "../src/filter.js"

test("human message passes", () => {
  assert.equal(shouldPrompt({ author: { bot: false, webhookId: null }, content: "hi" }), true)
})
test("bot message blocked", () => {
  assert.equal(shouldPrompt({ author: { bot: true, webhookId: null }, content: "hi" }), false)
})
test("webhook message blocked", () => {
  assert.equal(shouldPrompt({ author: { bot: false, webhookId: "123" }, content: "hi" }), false)
})
test("empty content blocked", () => {
  assert.equal(shouldPrompt({ author: { bot: false, webhookId: null }, content: "  " }), false)
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { createTypingTicker } from "../src/typing.js"

test("first beat sends immediately", () => {
  let sent = 0
  let now = 0
  const t = createTypingTicker(() => sent++, { intervalMs: 8000, now: () => now })
  t.beat()
  assert.equal(sent, 1)
})

test("beat inside interval is suppressed", () => {
  let sent = 0
  let now = 0
  const t = createTypingTicker(() => sent++, { intervalMs: 8000, now: () => now })
  t.beat()
  now = 4000
  t.beat()
  assert.equal(sent, 1)
})

test("beat after interval sends again", () => {
  let sent = 0
  let now = 0
  const t = createTypingTicker(() => sent++, { intervalMs: 8000, now: () => now })
  t.beat()
  now = 4000
  t.beat()
  now = 8000
  t.beat()
  assert.equal(sent, 2)
})

test("stop halts beats; start resets", () => {
  let sent = 0
  let now = 0
  const t = createTypingTicker(() => sent++, { intervalMs: 8000, now: () => now })
  t.start()
  t.stop()
  now = 99000
  t.beat()
  assert.equal(sent, 0)
  t.start()
  t.beat()
  assert.equal(sent, 1)
})

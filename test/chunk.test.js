import { test } from "node:test"
import assert from "node:assert/strict"
import { chunkMessage } from "../src/chunk.js"

test("under limit stays one message", () => {
  assert.deepEqual(chunkMessage("hello"), ["hello"])
})

test("exactly 2000 stays one message", () => {
  const s = "x".repeat(2000)
  assert.deepEqual(chunkMessage(s), [s])
})

test("splits on newline and rejoins losslessly", () => {
  const text = "a".repeat(1990) + "\n" + "b".repeat(500)
  const parts = chunkMessage(text)
  assert.ok(parts.every(p => p.length <= 2000))
  assert.equal(parts.join(""), text)
  assert.ok(parts.length > 1)
})

test("hard-splits text with no newline", () => {
  const text = "x".repeat(4500)
  const parts = chunkMessage(text)
  assert.ok(parts.every(p => p.length <= 2000))
  assert.equal(parts.join(""), text)
})

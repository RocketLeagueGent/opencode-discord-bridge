import { test } from "node:test"
import assert from "node:assert/strict"
import { createStream } from "../src/stream.js"

test("first append emits immediately", () => {
  const s = createStream({ editIntervalMs: 1500 })
  const r = s.append("Hello", 0)
  assert.equal(r.edit, "Hello")
})

test("append within interval is suppressed", () => {
  const s = createStream({ editIntervalMs: 1500 })
  s.append("Hello", 0)
  const r = s.append("Hello world", 100)
  assert.equal(r.edit, null)
})

test("append after interval emits accumulated text", () => {
  const s = createStream({ editIntervalMs: 1500 })
  s.append("Hello", 0)
  s.append(" world", 100)
  const r = s.append(", again", 1600)
  assert.equal(r.edit, "Hello world, again")
})

test("finalize small reply forces final edit, no overflow", () => {
  const s = createStream({ editIntervalMs: 1500 })
  s.append("Short reply", 0)
  const r = s.finalize(100)
  assert.equal(r.forceEdit, "Short reply")
  assert.deepEqual(r.overflow, [])
})

test("finalize caps base at 2000 and chunks overflow losslessly", () => {
  const s = createStream({ editIntervalMs: 1500 })
  const full = "x".repeat(2500)
  s.append(full.slice(0, 1000), 0)
  s.append(full.slice(1000), 3000)
  const r = s.finalize(5000)
  assert.equal(r.base, full.slice(0, 2000))
  assert.equal(r.forceEdit.length, 2000)
  assert.equal(r.base + r.overflow.join(""), full)
  assert.ok(r.overflow.every(p => p.length <= 2000))
})

test("finalize with no text does nothing", () => {
  const s = createStream({ editIntervalMs: 1500 })
  const r = s.finalize(0)
  assert.equal(r.forceEdit, null)
  assert.deepEqual(r.overflow, [])
  assert.equal(r.base, "")
})

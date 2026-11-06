import { test } from "node:test"
import assert from "node:assert/strict"
import { createFeedGate, formatToolLine } from "../src/feed.js"

test("starts unarmed and toggles", () => {
  const g = createFeedGate()
  assert.equal(g.isArmed(), false)
  g.arm()
  assert.equal(g.isArmed(), true)
  g.disarm()
  assert.equal(g.isArmed(), false)
})

test("toggle switch respects global off", () => {
  const g = createFeedGate()
  g.setEnabled(false)
  g.arm()
  assert.equal(g.shouldPost(), false)
  g.setEnabled(true)
  assert.equal(g.shouldPost(), true)
  g.disarm()
  assert.equal(g.shouldPost(), false)
})

test("formats tool line with input summary", () => {
  assert.equal(formatToolLine("shell", { command: "dir" }), "⚡ shell — {\"command\":\"dir\"}")
})

test("truncates long summaries at 80 content chars", () => {
  const line = formatToolLine("edit", { path: "x".repeat(200) })
  assert.ok(line.length <= "⚡ edit — ".length + 81, `len ${line.length}`)
  assert.match(line, /…$/)
})

test("collapses newlines in summary", () => {
  const line = formatToolLine("shell", { cmd: "a\nb" })
  assert.ok(!line.includes("\n"))
})

test("no input yields bare tool name", () => {
  assert.equal(formatToolLine("write", undefined), "⚡ write")
})

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

test("formats tool line as human-readable activity", () => {
  assert.equal(
    formatToolLine("read", { path: "C:\\repo\\install.sh" }),
    "⚡ OpenCode used the read tool — path: C:\\repo\\install.sh",
  )
})

test("falls back to JSON for objects without interesting keys", () => {
  assert.equal(formatToolLine("shell", { foo: "bar" }), '⚡ OpenCode used the shell tool — {"foo":"bar"}')
})

test("renders command as key-value", () => {
  assert.equal(formatToolLine("shell", { command: "dir" }), "⚡ OpenCode used the shell tool — command: dir")
})

test("joins multiple interesting keys", () => {
  const line = formatToolLine("edit", { path: "a.txt", description: "fix" })
  assert.equal(line, "⚡ OpenCode used the edit tool — path: a.txt • description: fix")
})

test("truncates long summaries at 80 content chars", () => {
  const line = formatToolLine("edit", { path: "x".repeat(200) })
  assert.ok(line.length <= "⚡ OpenCode used the edit tool — ".length + 81, `len ${line.length}`)
  assert.match(line, /…$/)
})

test("collapses newlines in summary", () => {
  const line = formatToolLine("shell", { command: "a\nb" })
  assert.ok(!line.includes("\n"))
})

test("no input yields readable bare line", () => {
  assert.equal(formatToolLine("write", undefined), "⚡ OpenCode used the write tool")
})

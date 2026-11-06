import { test } from "node:test"
import assert from "node:assert/strict"
import { buildShellReview, parseVerdict } from "../src/shell.js"

test("buildShellReview embeds user, cmd, and verdict keywords", () => {
  const p = buildShellReview({ user: "Rocket", cmd: "dir C:\\" })
  assert.match(p, /Rocket/)
  assert.match(p, /dir C:\\/)
  assert.match(p, /APPROVE/)
  assert.match(p, /REJECT/)
})

test("parses APPROVE on first line", () => {
  const r = parseVerdict("APPROVE\nlooks safe, plain dir listing")
  assert.equal(r.verdict, "APPROVE")
  assert.match(r.reason, /plain dir/)
})

test("parses reject with reason", () => {
  const r = parseVerdict("REJECT\nbecause reasons")
  assert.equal(r.verdict, "REJECT")
  assert.equal(r.reason, "because reasons")
})

test("case-insensitive exact first line only", () => {
  assert.equal(parseVerdict("approve").verdict, "APPROVE")
  assert.equal(parseVerdict("approved please").verdict, null)
  assert.equal(parseVerdict("thinking...\nREJECT").verdict, null)
})

test("empty reply yields null verdict", () => {
  assert.equal(parseVerdict("").verdict, null)
  assert.equal(parseVerdict("   \n  ").verdict, null)
})

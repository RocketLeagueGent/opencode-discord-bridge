import { test } from "node:test"
import assert from "node:assert/strict"
import { buildShellReview, parseVerdict, runShell } from "../src/shell.js"

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

test("runShell executes and captures output", async () => {
  const r = await runShell("node -e \"console.log('hi')\"", { cwd: "." })
  assert.equal(r.exitCode, 0)
  assert.match(r.output, /hi/)
})

test("runShell reports non-zero exit", async () => {
  const r = await runShell("node -e \"process.exit(3)\"", { cwd: "." })
  assert.equal(r.exitCode, 3)
})

test("runShell caps huge output", async () => {
  const r = await runShell("node -e \"console.log('A'.repeat(5000))\"", { cwd: "." })
  assert.ok(r.output.length <= 1500, `len ${r.output.length}`)
  assert.match(r.output, /truncated/)
  assert.match(r.output, /^A/)
  assert.match(r.output, /A\n?$/)
})

test("runShell failing command yields non-zero and stderr", async () => {
  const r = await runShell("definitely_not_a_command_xyz", { cwd: "." })
  assert.notEqual(r.exitCode, 0)
  assert.ok(r.output.length > 0)
})


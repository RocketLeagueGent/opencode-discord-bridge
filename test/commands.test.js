import { test } from "node:test"
import assert from "node:assert/strict"
import { registrationBody } from "../src/commands.js"

test("registers the exact v2 command set", () => {
  const names = registrationBody().map(c => c.name).sort()
  assert.deepEqual(names, ["actionfeed", "join", "leave", "newsession", "pause", "resume", "shell", "status"].sort())
})

test("shell has required string option cmd", () => {
  const shell = registrationBody().find(c => c.name === "shell")
  const cmd = shell.options.find(o => o.name === "cmd")
  assert.equal(cmd.type, 3)
  assert.equal(cmd.required, true)
})

test("actionfeed has required on/off choice", () => {
  const feed = registrationBody().find(c => c.name === "actionfeed")
  const choice = feed.options.find(o => o.name === "state")
  assert.equal(choice.type, 3)
  assert.equal(choice.required, true)
  assert.deepEqual(choice.choices.map(c => c.value), ["on", "off"])
})

test("descriptions are within Discord limits", () => {
  for (const c of registrationBody()) {
    assert.ok(c.description.length > 0 && c.description.length <= 100, `${c.name} description bad`)
  }
})

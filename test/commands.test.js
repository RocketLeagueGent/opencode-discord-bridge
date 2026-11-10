import { test } from "node:test"
import assert from "node:assert/strict"
import { registrationBody, registerCommands } from "../src/commands.js"

test("registers the exact v2 command set", () => {
  const names = registrationBody().map(c => c.name).sort()
  assert.deepEqual(names, ["actionfeed", "join", "leave", "msg", "newsession", "pause", "resume", "shell", "status"].sort())
})

test("msg has a required string option message", () => {
  const msg = registrationBody().find(c => c.name === "msg")
  const message = msg.options.find(o => o.name === "message")
  assert.equal(message.type, 3)
  assert.equal(message.required, true)
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

test("registerCommands PUTs body to guild endpoint", async () => {
  const calls = []
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts })
    return { ok: true, json: async () => registrationBody() }
  }
  await registerCommands("app1", "guild1", "secret-token", fakeFetch)
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /\/applications\/app1\/guilds\/guild1\/commands$/)
  assert.equal(calls[0].opts.method, "PUT")
  assert.equal(calls[0].opts.headers.Authorization, "Bot secret-token")
  const body = JSON.parse(calls[0].opts.body)
  assert.deepEqual(body.map(c => c.name).sort(), registrationBody().map(c => c.name).sort())
})

test("registerCommands fails on non-ok response", async () => {
  const fakeFetch = async () => ({ ok: false, status: 403, json: async () => ({}) })
  await assert.rejects(() => registerCommands("a", "g", "t", fakeFetch), /403/)
})

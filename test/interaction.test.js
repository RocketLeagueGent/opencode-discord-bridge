import { test } from "node:test"
import assert from "node:assert/strict"
import { handleInteraction } from "../src/interaction.js"

function fakeInteraction({ commandName, user = { id: "owner-1" }, getString = () => "x", ephemeral = true } = {}) {
  const calls = { deferred: false, replied: [], edited: [] }
  return {
    commandName,
    user,
    options: { getString },
    deferred: false,
    deferReply: async (opts) => {
      calls.deferred = true
      calls.ephemeral = opts?.ephemeral
    },
    editReply: async (payload) => {
      calls.edited.push(typeof payload === "string" ? payload : payload.content)
    },
    reply: async (payload) => {
      calls.replied.push(payload)
    },
    calls,
  }
}

function fakeDeps(overrides = {}) {
  return {
    config: { ownerUserId: "owner-1", sessionId: "ses_1", channel: {} },
    promptForReview: async () => "APPROVE\nok",
    runShell: async () => ({ exitCode: 0, output: "ran" }),
    feed: { shouldPost: () => true, setEnabled: () => {}, isArmed: () => true },
    gate: { pause: () => {}, resume: () => {}, isPaused: () => false },
    queueDepth: () => 0,
    uptimeMs: () => 1234,
    ...overrides,
  }
}

test("non-owner /shell refused without review prompt", async () => {
  const i = fakeInteraction({ commandName: "shell", user: { id: "someone-else", username: "mallory" } })
  let prompted = false
  const deps = fakeDeps({ promptForReview: async () => { prompted = true; return "APPROVE" } })
  await handleInteraction(i, deps)
  assert.equal(prompted, false)
  assert.match(i.calls.edited.join(" "), /owner/i)
})

test("owner /shell with APPROVE runs and reports output", async () => {
  const i = fakeInteraction({ commandName: "shell", getString: () => "dir" })
  const ran = []
  const deps = fakeDeps({
    promptForReview: async (text) => { ran.push(text); return "APPROVE\nlooks fine" },
    runShell: async () => ({ exitCode: 0, output: "all good" }),
  })
  await handleInteraction(i, deps)
  assert.equal(i.calls.deferred, true)
  assert.match(ran[0], /dir/)
  assert.match(i.calls.edited.join(" "), /all good/)
})

test("null verdict never executes", async () => {
  const i = fakeInteraction({ commandName: "shell", getString: () => "rm -rf" })
  let executed = false
  const deps = fakeDeps({
    promptForReview: async () => "hmm, maybe not",
    runShell: async () => { executed = true; return { exitCode: 0, output: "" } },
  })
  await handleInteraction(i, deps)
  assert.equal(executed, false)
  assert.match(i.calls.edited.join(" "), /reject/i)
})

test("pause flips the gate", async () => {
  const i = fakeInteraction({ commandName: "pause" })
  let paused = false
  const deps = fakeDeps({ gate: { pause: () => { paused = true }, resume: () => {}, isPaused: () => paused } })
  await handleInteraction(i, deps)
  assert.equal(paused, true)
  assert.equal(i.calls.deferred, true)
})

test("actionfeed on flips toggle", async () => {
  const i = fakeInteraction({ commandName: "actionfeed", getString: () => "on" })
  let enabled = false
  const deps = fakeDeps({ feed: { shouldPost: () => false, setEnabled: (v) => { enabled = v }, isArmed: () => false } })
  await handleInteraction(i, deps)
  assert.equal(enabled, true)
})

test("status reports session ephemerally", async () => {
  const i = fakeInteraction({ commandName: "status" })
  const deps = fakeDeps()
  await handleInteraction(i, deps)
  assert.equal(i.calls.deferred, true)
  assert.match(i.calls.edited.join(" "), /ses_1/)
})

test("unknown command gets usage help", async () => {
  const i = fakeInteraction({ commandName: "warp" })
  await handleInteraction(i, fakeDeps())
  assert.match(i.calls.replied.concat(i.calls.edited).join(" "), /help|unknown|command/i)
})

test("join defers with not-built message until phase 2", async () => {
  const i = fakeInteraction({ commandName: "join" })
  await handleInteraction(i, fakeDeps())
  assert.equal(i.calls.deferred, true)
  assert.match(i.calls.edited.join(" "), /voice|phase/i)
})

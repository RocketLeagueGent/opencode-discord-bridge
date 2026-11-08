import { test } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { awaitSessionTurn } from "../src/shell.js"

test("resolves on first session.idle after subscription", async () => {
  const bus = new EventEmitter()
  const turn = awaitSessionTurn(bus)
  bus.emit("session.text.delta")
  bus.emit("session.idle")
  await turn
})

test("rejects on timeout with default 120s", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const bus = new EventEmitter()
  const turn = awaitSessionTurn(bus)
  const tracked = assert.rejects(turn, /timed out after 120000ms/)
  t.mock.timers.tick(120000)
  await tracked
})

test("rejects on custom timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const bus = new EventEmitter()
  const turn = awaitSessionTurn(bus, { timeoutMs: 5000 })
  const tracked = assert.rejects(turn, /timed out after 5000ms/)
  t.mock.timers.tick(5000)
  await tracked
})

test("stale events skipped while waiting for a current one", async () => {
  const bus = new EventEmitter()
  let stale = 1
  const turn = awaitSessionTurn(bus, { isStale: () => stale-- > 0 })
  bus.emit("session.idle") // stale: belongs to a previous turn
  bus.emit("session.idle") // current
  await turn
})

test("removes listener after settling", async () => {
  const bus = new EventEmitter()
  const turn = awaitSessionTurn(bus)
  bus.emit("session.idle")
  await turn
  assert.equal(bus.listenerCount("session.idle"), 0)
  // a later stray idle must not throw or re-settle
  bus.emit("session.idle")
})

test("removes listener after timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] })
  const bus = new EventEmitter()
  const turn = awaitSessionTurn(bus)
  const tracked = assert.rejects(turn, /timed out/)
  t.mock.timers.tick(120000)
  await tracked
  assert.equal(bus.listenerCount("session.idle"), 0)
})

test("abort signal rejects immediately and removes listener", { timeout: 500 }, async () => {
  const bus = new EventEmitter()
  const ac = new AbortController()
  const turn = awaitSessionTurn(bus, { signal: ac.signal })
  const tracked = assert.rejects(turn, /aborted/)
  ac.abort()
  await tracked
  assert.equal(bus.listenerCount("session.idle"), 0)
})

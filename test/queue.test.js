import { test } from "node:test"
import assert from "node:assert/strict"
import { createQueue } from "../src/queue.js"

test("runs tasks serially in order", async () => {
  const q = createQueue()
  const order = []
  const slow = () => new Promise(r => setTimeout(() => { order.push("a"); r() }, 30))
  await Promise.all([
    q.enqueue(slow),
    q.enqueue(async () => { order.push("b") }),
    q.enqueue(async () => { order.push("c") }),
  ])
  assert.deepEqual(order, ["a", "b", "c"])
})

test("rejection does not stall the queue", async () => {
  const q = createQueue()
  await q.enqueue(async () => { throw new Error("boom") }).catch(() => {})
  await q.enqueue(async () => {})
})

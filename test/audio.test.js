import { test } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { createSpeakQueue, createSpeechQueue } from "../src/audio.js"

class FakePlayer extends EventEmitter {
  constructor() {
    super()
    this.played = []
    this.active = false
    this.overlapped = false
  }

  play(resource) {
    if (this.active) this.overlapped = true
    this.active = true
    this.played.push(resource.pcm.toString())
    setImmediate(() => {
      this.active = false
      this.emit("stateChange", { status: "playing" }, { status: "idle" })
    })
  }

  stop() {
    if (!this.active) return false
    this.active = false
    this.emit("stateChange", { status: "playing" }, { status: "idle" })
    return true
  }
}

test("createSpeakQueue plays queued PCM sequentially", async () => {
  const player = new FakePlayer()
  const queue = createSpeakQueue({
    player,
    createResource: (pcm) => ({ pcm }),
    isJoined: () => true,
  })

  const first = queue.enqueue(Buffer.from("first"))
  const second = queue.enqueue(Buffer.from("second"))
  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.deepEqual(player.played, ["first", "second"])
  assert.equal(player.overlapped, false)
})

test("createSpeakQueue skips audio when the voice connection is gone", async () => {
  const player = new FakePlayer()
  const queue = createSpeakQueue({
    player,
    createResource: (pcm) => ({ pcm }),
    isJoined: () => false,
  })

  assert.equal(await queue.enqueue(Buffer.from("not played")), false)
  assert.deepEqual(player.played, [])
})

test("createSpeechQueue synthesizes and plays replies in submission order", async () => {
  const calls = []
  const speakQueue = {
    async enqueue(pcm) {
      calls.push(`play:${pcm.toString()}`)
      return true
    },
  }
  const queue = createSpeechQueue({
    synthesize: async (text) => { calls.push(`synthesize:${text}`); return Buffer.from(text) },
    convert: (wav) => { calls.push(`convert:${wav.toString()}`); return { pcm: wav } },
    speakQueue,
    isJoined: () => true,
  })

  await Promise.all([queue.enqueue("first"), queue.enqueue("second")])
  assert.deepEqual(calls, [
    "synthesize:first", "convert:first", "play:first",
    "synthesize:second", "convert:second", "play:second",
  ])
})

test("createSpeechQueue returns false when synthesis fails instead of rejecting", async () => {
  const queue = createSpeechQueue({
    synthesize: async () => { throw new Error("piper missing") },
    convert: (wav) => ({ pcm: wav }),
    speakQueue: { async enqueue() { throw new Error("should not play") } },
    isJoined: () => true,
  })

  assert.equal(await queue.enqueue("hello"), false)
})

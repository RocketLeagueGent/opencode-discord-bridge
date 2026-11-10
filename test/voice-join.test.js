import { test } from "node:test"
import assert from "node:assert/strict"
import { createVoiceState, joinVoice, leaveVoice, isJoined, createVoiceInteractionDeps, createVoiceJoinHandler, createResourceFromBuffer } from "../src/voice.js"
import { createSpeechQueue } from "../src/audio.js"

test("joinVoice marks state as joined and tracks the current channel", () => {
  const state = createVoiceState()
  joinVoice(state, "guild-1", "channel-1", { id: "conn-1" })
  assert.equal(state.joined, true)
  assert.equal(state.guildId, "guild-1")
  assert.equal(state.channelId, "channel-1")
  assert.equal(state.connection.id, "conn-1")
})

test("leaveVoice clears the connection and marks the state as not joined", () => {
  const state = createVoiceState()
  const conn = { destroy() { this.destroyed = true } }
  joinVoice(state, "guild-1", "channel-1", conn)
  leaveVoice(state)
  assert.equal(state.joined, false)
  assert.equal(state.guildId, null)
  assert.equal(state.channelId, null)
  assert.equal(state.connection, null)
  assert.equal(state.speakQueue, null)
  assert.equal(isJoined(state), false)
})

test("voice interaction dependency bundle exposes resolver and join/leave handlers", () => {
  const join = async () => true
  const leave = async () => true
  const deps = createVoiceInteractionDeps(join, leave)
  assert.equal(deps.resolveVoiceTarget({ member: { voice: { channelId: "v1" } } }), "v1")
  assert.equal(deps.joinVoice, join)
  assert.equal(deps.leaveVoice, leave)
})

test("createResourceFromBuffer encodes one 20ms PCM frame for voice playback", async () => {
  const resource = createResourceFromBuffer(Buffer.alloc(3840))
  const packets = []
  for await (const packet of resource.playStream) packets.push(packet)
  assert.ok(packets.some((packet) => packet.length > 0))
})

test("createSpeechQueue uses the current voice queue after join", async () => {
  let currentQueue = null
  const called = []
  const queue = {
    async enqueue(pcm) {
      called.push(pcm.toString())
      return true
    },
  }
  const speech = createSpeechQueue({
    synthesize: async (text) => Buffer.from(text),
    convert: (wav) => ({ pcm: wav }),
    speakQueue: () => currentQueue,
    isJoined: () => true,
  })

  currentQueue = queue
  assert.equal(await speech.enqueue("hello"), true)
  assert.deepEqual(called, ["hello"])
})

test("voice join handler passes the guild adapter and subscribes the audio player", async () => {
  const state = createVoiceState()
  const adapterCreator = () => ({})
  let received
  const connection = { subscribe(player) { this.player = player } }
  const channels = {
    cache: new Map([["channel-1", {
      guildId: "guild-1",
      guild: { voiceAdapterCreator: adapterCreator },
      isVoiceBased: () => true,
    }]]),
  }
  const join = createVoiceJoinHandler({
    channels,
    state,
    connect(options) { received = options; return connection },
  })

  assert.equal(await join("guild-1", "channel-1"), true)
  assert.equal(received.guildId, "guild-1")
  assert.equal(received.channelId, "channel-1")
  assert.equal(received.adapterCreator, adapterCreator)
  assert.equal(connection.player, state.player)
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { join } from "node:path"
import { synthesizeWithPiper, wavToPcm48k } from "../src/tts.js"

function wav16({ sampleRate = 22050, channels = 1, samples = 100 }) {
  const dataLen = samples * channels * 2
  const buf = Buffer.alloc(44 + dataLen)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataLen, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * channels * 2, 28)
  buf.writeUInt16LE(channels * 2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataLen, 40)
  for (let i = 0; i < samples; i++) {
    const v = i % 2 === 0 ? 1000 : -1000
    if (channels === 1) {
      buf.writeInt16LE(v, 44 + i * 2)
    } else {
      buf.writeInt16LE(v, 44 + i * 4)
      buf.writeInt16LE(-v, 44 + i * 4 + 2)
    }
  }
  return buf
}

test("wavToPcm48k converts 22050 mono wav to 48000 stereo PCM", () => {
  const res = wavToPcm48k(wav16({ sampleRate: 22050, channels: 1, samples: 100 }))
  assert.equal(res.sampleRate, 48000)
  assert.equal(res.channels, 2)
  assert.ok(res.pcm.length > 0)
  assert.ok(res.pcm.length % 4 === 0)
})

test("wavToPcm48k passes through 48000 stereo PCM without mutation", () => {
  const original = wav16({ sampleRate: 48000, channels: 2, samples: 50 })
  const res = wavToPcm48k(original)
  assert.equal(res.sampleRate, 48000)
  assert.equal(res.channels, 2)
  assert.ok(res.pcm.length >= 200)
})

test("wavToPcm48k rejects malformed input", () => {
  assert.throws(() => wavToPcm48k(Buffer.from("nope")), /Malformed/)
})

function fakePiperSpawn(exitCode = 0) {
  const calls = {}
  const spawnImpl = (_executable, args) => {
    calls.args = args
    const child = new EventEmitter()
    child.stderr = new EventEmitter()
    child.stdin = {
      end(text) {
        calls.text = text
        if (exitCode === 0) {
          const outputPath = args[args.indexOf("--output_file") + 1]
          writeFileSync(outputPath, wav16({ sampleRate: 22050, channels: 1, samples: 8 }))
        }
        queueMicrotask(() => child.emit("close", exitCode, null))
      },
    }
    return child
  }
  return { calls, spawnImpl }
}

test("synthesizeWithPiper passes text and model to Piper and returns its WAV", async () => {
  const { calls, spawnImpl } = fakePiperSpawn()
  const wav = await synthesizeWithPiper("hello voice", {
    executable: "piper-test",
    modelPath: "models/test.onnx",
    spawnImpl,
  })
  assert.equal(calls.text, "hello voice")
  assert.ok(calls.args.includes("--model"))
  assert.ok(calls.args.includes("models/test.onnx"))
  assert.ok(calls.args.includes("--output_file"))
  assert.equal(wav.toString("ascii", 0, 4), "RIFF")
})

test("synthesizeWithPiper rejects Piper errors instead of returning an empty WAV", async () => {
  const { spawnImpl } = fakePiperSpawn(7)
  await assert.rejects(
    synthesizeWithPiper("hello", { modelPath: "models/test.onnx", spawnImpl }),
    /exited with code 7/,
  )
})

test("synthesizeWithPiper automatically resolves a repo-local Piper install and model", async () => {
  const calls = []
  const { spawnImpl } = fakePiperSpawn()
  const originalCwd = process.cwd()
  const temp = mkdtempSync(join(tmpdir(), "piper-resolution-"))
  const realPath = resolve(temp, "tools", "piper", "bin", "piper", "piper.exe")
  const realModel = resolve(temp, "voices", "en_US-lessac-medium.onnx")
  try {
    process.chdir(temp)
    mkdirSync(resolve(temp, "tools", "piper", "bin", "piper"), { recursive: true })
    mkdirSync(resolve(temp, "voices"), { recursive: true })
    writeFileSync(realPath, "stub")
    writeFileSync(realModel, "stub")

    const wav = await synthesizeWithPiper("hello repo", {
      executable: undefined,
      modelPath: undefined,
      spawnImpl: (command, args) => {
        calls.push({ command, args })
        return spawnImpl(command, args)
      },
    })

    assert.equal(wav.toString("ascii", 0, 4), "RIFF")
    assert.ok(calls.some(({ command }) => command === realPath))
    assert.ok(calls.some(({ args }) => args.includes(realModel)))
  } finally {
    process.chdir(originalCwd)
    rmSync(temp, { recursive: true, force: true })
  }
})

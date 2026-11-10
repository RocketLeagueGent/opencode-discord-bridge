import { spawn as nodeSpawn } from "node:child_process"
import { existsSync, promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { randomUUID } from "node:crypto"

function existingFirst(paths, fallback) {
  for (const value of paths) {
    if (!value) continue
    try {
      if (existsSync(value)) return value
    } catch {
      // Ignore filesystem lookup issues and keep falling back.
    }
  }
  return fallback
}

function defaultExecutablePath() {
  if (process.env.PIPER_EXECUTABLE) return process.env.PIPER_EXECUTABLE
  return existingFirst([
    resolve(process.cwd(), "tools", "piper", "bin", "piper", "piper.exe"),
    resolve(process.cwd(), "tools", "piper", "bin", "piper", "piper"),
  ], "piper")
}

function defaultModelPath(voice = "en_US-lessac-medium") {
  return process.env.PIPER_MODEL_PATH || resolve(process.cwd(), "voices", `${voice}.onnx`)
}

export async function synthesizeWithPiper(text, {
  voice = "en_US-lessac-medium",
  executable = process.env.PIPER_EXECUTABLE || defaultExecutablePath(),
  modelPath = process.env.PIPER_MODEL_PATH || defaultModelPath(voice),
  spawnImpl = nodeSpawn,
} = {}) {
  const tempPath = join(tmpdir(), `opencode-piper-${randomUUID()}.wav`)
  const args = ["--model", modelPath, "--output_file", tempPath]
  try {
    await new Promise((resolveProcess, rejectProcess) => {
      const child = spawnImpl(executable, args, {
        cwd: process.cwd(),
        stdio: ["pipe", "ignore", "pipe"],
      })
      let stderr = ""
      child.stderr?.on("data", (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-4000)
      })
      child.once("error", rejectProcess)
      child.once("close", (code, signal) => {
        if (code === 0) {
          resolveProcess()
          return
        }
        const detail = stderr.trim() ? `: ${stderr.trim()}` : ""
        rejectProcess(new Error(`Piper exited with code ${code ?? signal}${detail}`))
      })
      child.stdin.end(text)
    })
    const wav = await fs.readFile(tempPath)
    if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") {
      throw new Error("Piper did not produce a valid WAV file")
    }
    return wav
  } finally {
    await fs.rm(tempPath, { force: true })
  }
}

export function wavToPcm48k(wavBuffer) {
  if (wavBuffer.length < 44) throw new Error("Malformed WAV buffer")
  const riff = wavBuffer.toString("ascii", 0, 4)
  if (riff !== "RIFF") throw new Error("Malformed WAV header")
  const format = wavBuffer.toString("ascii", 8, 12)
  if (format !== "WAVE") throw new Error("Malformed WAV format")

  const audioFormat = wavBuffer.readUInt16LE(20)
  if (audioFormat !== 1) throw new Error("Only PCM WAV input is supported")

  const channels = wavBuffer.readUInt16LE(22)
  const sampleRate = wavBuffer.readUInt32LE(24)
  const bitsPerSample = wavBuffer.readUInt16LE(34)
  const dataOffset = 44
  const dataSize = wavBuffer.readUInt32LE(40)
  const pcm = wavBuffer.subarray(dataOffset, dataOffset + dataSize)

  if (bitsPerSample !== 16) {
    throw new Error("Only 16-bit PCM WAV input is supported")
  }

  const frameSize = channels * 2
  const inputFrames = Math.floor(pcm.length / frameSize)
  const targetRate = 48000
  const targetChannels = 2
  const targetFrameSize = targetChannels * 2
  const targetFrames = Math.max(1, Math.ceil(inputFrames * (targetRate / sampleRate)))
  const out = Buffer.alloc(targetFrames * targetFrameSize)

  for (let i = 0; i < targetFrames; i++) {
    const sourceIndex = (i * sampleRate) / targetRate
    const base = Math.floor(sourceIndex)
    const next = Math.min(base + 1, inputFrames - 1)
    const t = sourceIndex - base
    const readFrame = (frameIndex) => {
      const offset = frameIndex * frameSize
      if (offset + 2 > pcm.length) return 0
      const left = pcm.readInt16LE(offset)
      const right = channels === 2 ? pcm.readInt16LE(offset + 2) : left
      return { left, right }
    }
    const a = readFrame(base)
    const b = readFrame(next)
    const left = Math.round(a.left + (b.left - a.left) * t)
    const right = Math.round(a.right + (b.right - a.right) * t)
    const outPos = i * targetFrameSize
    out.writeInt16LE(left, outPos)
    out.writeInt16LE(right, outPos + 2)
  }

  return { pcm: out, sampleRate: targetRate, channels: targetChannels }
}

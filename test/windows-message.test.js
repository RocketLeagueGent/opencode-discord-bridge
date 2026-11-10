import { test } from "node:test"
import assert from "node:assert/strict"
import { sendSystemMessage } from "../src/windows-message.js"

test("sendSystemMessage passes a literal message to the fixed local broadcast target", async () => {
  const message = 'Hello "world"; & more'
  const calls = []
  await sendSystemMessage(message, {
    platform: "win32",
    execFileImpl: (file, args, options, callback) => {
      calls.push({ file, args, options })
      callback(null, "", "")
    },
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].file, "msg.exe")
  assert.deepEqual(calls[0].args, ["*", message])
  assert.equal(calls[0].options.windowsHide, true)
  assert.notEqual(calls[0].options.shell, true)
})

test("sendSystemMessage rejects on non-Windows without spawning", async () => {
  let called = false
  await assert.rejects(
    sendSystemMessage("hello", {
      platform: "linux",
      execFileImpl: () => { called = true },
    }),
    /only available on Windows/i,
  )
  assert.equal(called, false)
})

test("sendSystemMessage rejects blank messages without spawning", async () => {
  let called = false
  await assert.rejects(
    sendSystemMessage("  ", {
      platform: "win32",
      execFileImpl: () => { called = true },
    }),
    /message.*required|empty/i,
  )
  assert.equal(called, false)
})

test("sendSystemMessage surfaces msg.exe failures", async () => {
  await assert.rejects(
    sendSystemMessage("hello", {
      platform: "win32",
      execFileImpl: (_file, _args, _options, callback) => callback(new Error("access denied")),
    }),
    /access denied/i,
  )
})

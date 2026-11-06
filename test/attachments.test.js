import { test } from "node:test"
import assert from "node:assert/strict"
import { parseAttachments } from "../src/attachments.js"

test("no attachment lines passes text through unchanged", () => {
  const r = parseAttachments("just a normal reply\nwith two lines")
  assert.equal(r.text, "just a normal reply\nwith two lines")
  assert.deepEqual(r.files, [])
})

test("extracts a single 📎 path and strips the line", () => {
  const r = parseAttachments("look at this\n📎 C:\\Users\\me\\Videos\\fun.gif\nnice right")
  assert.equal(r.text, "look at this\nnice right")
  assert.deepEqual(r.files, [{ path: "C:\\Users\\me\\Videos\\fun.gif", name: "fun.gif" }])
})

test("extracts multiple 📎 paths", () => {
  const r = parseAttachments("📎 C:\\a\\one.png\nmiddle\n📎 C:\\b\\two.mp4")
  assert.equal(r.text, "middle")
  assert.deepEqual(r.files.map(f => f.name), ["one.png", "two.mp4"])
})

test("ignores 📎 with nothing after it", () => {
  const r = parseAttachments("📎 \nhello")
  assert.equal(r.files.length, 0)
})

test("keeps files that have no extension", () => {
  const r = parseAttachments("📎 C:\\dir\\noext")
  assert.deepEqual(r.files, [{ path: "C:\\dir\\noext", name: "noext" }])
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { postWebhook } from "../src/webhook.js"

test("posts JSON content when there are no files", async () => {
  let seen
  const fakeFetch = async (url, init) => {
    seen = { url, init }
    return { ok: true, status: 204 }
  }
  await postWebhook("https://example.test/hook", "hello", [], fakeFetch)
  assert.equal(seen.init.headers["Content-Type"], "application/json")
  assert.deepEqual(JSON.parse(seen.init.body), { content: "hello" })
})

test("posts multipart FormData with files when files are given", async () => {
  let seen
  const fakeFetch = async (url, init) => {
    seen = init
    return { ok: true, status: 200 }
  }
  const bytes = new Uint8Array([1, 2, 3])
  await postWebhook("https://example.test/hook", "with file", [{ path: "/x/y.gif", name: "y.gif", bytes }], fakeFetch)
  assert.ok(seen.body instanceof FormData)
  const file = seen.body.get("files[0]")
  assert.equal(file.name, "y.gif")
  assert.equal(seen.body.get("content"), "with file")
})

test("throws when webhook responds not-ok", async () => {
  const fakeFetch = async () => ({ ok: false, status: 404 })
  await assert.rejects(() => postWebhook("https://example.test/hook", "x", [], fakeFetch), /404/)
})

test("includes message_reference in JSON body when reference given", async () => {
  let seen
  const fakeFetch = async (url, init) => { seen = init; return { ok: true, status: 204 } }
  await postWebhook("https://example.test/hook", "hi", [], { reference: "42", fetchImpl: fakeFetch })
  assert.deepEqual(JSON.parse(seen.body), { content: "hi", message_reference: { message_id: "42" } })
})

test("includes message_reference as payload_json when files present", async () => {
  let seen
  const fakeFetch = async (url, init) => { seen = init; return { ok: true, status: 200 } }
  const bytes = new Uint8Array([1])
  await postWebhook("https://example.test/hook", "with file", [{ path: "/x/y.gif", name: "y.gif", bytes }], { reference: "42", fetchImpl: fakeFetch })
  const payload = JSON.parse(seen.body.get("payload_json"))
  assert.deepEqual(payload, { message_reference: { message_id: "42" } })
  assert.equal(seen.body.get("content"), "with file")
})

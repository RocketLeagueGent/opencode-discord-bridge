import { test } from "node:test"
import assert from "node:assert/strict"
import { buildPrompt } from "../src/prompt.js"

test("prefixes author display name", () => {
  assert.equal(
    buildPrompt({ authorName: "Rocket", content: "hello there" }),
    "[Discord] Rocket: hello there"
  )
})

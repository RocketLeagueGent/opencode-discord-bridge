import { test } from "node:test"
import assert from "node:assert/strict"
import { buildPrompt } from "../src/prompt.js"

test("prefixes author username with immutable user ID (identity can't be faked by renaming)", () => {
  assert.equal(
    buildPrompt({ authorName: "Rocket (1449482449317789770)", content: "hello there" }),
    "[Discord] Rocket (1449482449317789770): hello there"
  )
})

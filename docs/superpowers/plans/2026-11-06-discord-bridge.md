# OpenCode ↔ Discord Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge Discord #general to the currently-running OpenCode session so every channel message is injected into that session and its replies post back via the "Opencode" webhook.

**Architecture:** A small Node.js (ESM) daemon: discord.js receives channel messages → filtered, queued, and prompted into the paired OpenCode session via `@opencode/client` → assistant-message events are chunked (≤2000 chars) and POSTed to the user's incoming webhook. The bot gateway is ears only; the webhook is mouth only.

**Tech Stack:** Node.js ≥20 (ESM, `node:test` built-in runner), discord.js v14, `@opencode/client`, dotenv.

**Spec:** `docs/superpowers/specs/2026-11-06-discord-bridge-design.md`

## Global Constraints

- Discord message hard cap: **2000 characters** per message; chunk boundaries never split mid-code-block if avoidable (split at newlines; hard-split only as last resort).
- Secrets (`DISCORD_BOT_TOKEN`, `WEBHOOK_URL`) live only in `.env`; `.env` is git-ignored; never commit or print either value.
- `CHANNEL_ID` = `1568362384114983085` (default; overridable via `.env`).
- The bridge prompts exactly one session: `SESSION_ID` from `.env` — never create sessions.
- `opencode.json` / `opencode.jsonc` must not be modified by this project.
- Loop guard: messages authored by a bot or a webhook are never prompted (hard rule, no config to disable).
- All channel-facing output goes through the webhook URL (username "Opencode"), never the bot's own identity.
- No network calls in unit tests; unit tests cover `src/filter.js`, `src/chunk.js`, `src/queue.js`, `src/config.js` only.

## Review Focus

1. **Message loop:** a reply posted by the webhook re-enters as input and the bridge talks to itself forever → `filter.js` webhook/bot rejection tested in Task 3.
2. **Oversized reply rejected (Discord 400):** assistant output >2000 chars → chunker tested at exact boundary in Task 2.
3. **Interleaved turns:** two users message while I'm mid-prompt → queue serializes prompts in arrival order, tested in Task 4.
4. **Wrong session / dead service:** bridge starts with an invalid SESSION_ID or OpenCode service down → config validation fails fast at startup (Task 1) and startup connection check posts an error to #general (Task 6).
5. **Author attribution lost:** prompt text must carry the Discord author's display name so the agent knows who's speaking → asserted in Task 5's prompt-builder test.

---

### Task 1: Scaffold project, config loader, git

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `src/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Produces: `loadConfig(env = process.env) -> { botToken, webhookUrl, channelId, sessionId }` (throws `Error` listing missing keys); `.env.example` documents all four keys.

- [ ] **Step 1: Init repo and package**

Run in `C:\Users\KRITIKOSAngelos\opencode-discord-bridge`:

```bash
git init
npm init -y
npm install discord.js @opencode/client dotenv
```

Edit `package.json`: set `"type": "module"`, add `"test": "node --test test/"`.

- [ ] **Step 2: Write `.gitignore`** — contents: `node_modules/`, `.env`.

- [ ] **Step 3: Write `.env.example`** with the four keys (placeholder values only):

```
DISCORD_BOT_TOKEN=
WEBHOOK_URL=
CHANNEL_ID=1568362384114983085
SESSION_ID=
```

- [ ] **Step 4: Write the failing config test** (`test/config.test.js`):

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { loadConfig } from "../src/config.js"

test("throws listing missing keys", () => {
  assert.throws(() => loadConfig({}), /DISCORD_BOT_TOKEN.*WEBHOOK_URL.*SESSION_ID/s)
})

test("returns normalized config", () => {
  const cfg = loadConfig({ DISCORD_BOT_TOKEN: "t", WEBHOOK_URL: "w", SESSION_ID: "s" })
  assert.equal(cfg.channelId, "1568362384114983085")
  assert.equal(cfg.sessionId, "s")
})
```

- [ ] **Step 5: Run to verify failure** — `npm test` → FAIL (`Cannot find module '../src/config.js'`).

- [ ] **Step 6: Implement `src/config.js`** — `loadConfig` reads the four keys from its `env` argument (dotenv already loaded by entry point), throws if any of the three required ones is empty (message joins missing names), defaults `channelId` to the pinned value.

- [ ] **Step 7: Run tests** — `npm test` → PASS.

- [ ] **Step 8: Commit** — `git add -A && git commit -m "scaffold project with config loader"`.

### Task 2: Message chunker

**Files:**
- Create: `src/chunk.js`
- Test: `test/chunk.test.js`

**Interfaces:**
- Produces: `chunkMessage(text, limit = 2000) -> string[]` (never returns `[]` for non-empty input; preserves order; joined result equals input).

- [ ] **Step 1: Write the failing test** (`test/chunk.test.js`):

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { chunkMessage } from "../src/chunk.js"

test("under limit stays one message", () => {
  assert.deepEqual(chunkMessage("hello"), ["hello"])
})

test("exactly 2000 stays one message", () => {
  const s = "x".repeat(2000)
  assert.deepEqual(chunkMessage(s), [s])
})

test("splits on newline and rejoins losslessly", () => {
  const text = "a".repeat(1990) + "\n" + "b".repeat(500)
  const parts = chunkMessage(text)
  assert.ok(parts.every(p => p.length <= 2000))
  assert.equal(parts.join(""), text)
  assert.ok(parts.length > 1)
})

test("hard-splits text with no newline", () => {
  const text = "x".repeat(4500)
  const parts = chunkMessage(text)
  assert.ok(parts.every(p => p.length <= 2000))
  assert.equal(parts.join(""), text)
})
```

- [ ] **Step 2: Run to verify failure** — `npm test` → FAIL (`Cannot find module '../src/chunk.js'`).

- [ ] **Step 3: Implement `chunkMessage` in `src/chunk.js`** — greedy split at the last `\n` within `limit`; if no newline in window, hard-split at `limit`.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "add message chunker"`.

### Task 3: Loop-guard filter

**Files:**
- Create: `src/filter.js`
- Test: `test/filter.test.js`

**Interfaces:**
- Produces: `shouldPrompt(message) -> boolean` — message shape is the discord.js `Message` subset `{ author: { bot, webhookId }, content }`.

- [ ] **Step 1: Write the failing test:**

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { shouldPrompt } from "../src/filter.js"

test("human message passes", () => {
  assert.equal(shouldPrompt({ author: { bot: false, webhookId: null }, content: "hi" }), true)
})
test("bot message blocked", () => {
  assert.equal(shouldPrompt({ author: { bot: true, webhookId: null }, content: "hi" }), false)
})
test("webhook message blocked", () => {
  assert.equal(shouldPrompt({ author: { bot: false, webhookId: "123" }, content: "hi" }), false)
})
test("empty content blocked", () => {
  assert.equal(shouldPrompt({ author: { bot: false, webhookId: null }, content: "  " }), false)
})
```

- [ ] **Step 2: Run to verify failure** → FAIL (module not found).

- [ ] **Step 3: Implement `shouldPrompt` in `src/filter.js`** — true only when `!author.bot && !author.webhookId && content.trim()`.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "add loop-guard filter"`.

### Task 4: FIFO prompt queue

**Files:**
- Create: `src/queue.js`
- Test: `test/queue.test.js`

**Interfaces:**
- Produces: `createQueue() -> { enqueue(fn: () => Promise<void>): Promise<void> }` — functions run strictly one at a time, in arrival order; a rejection doesn't stall later items (swallowed after handler).

- [ ] **Step 1: Write the failing test:**

```js
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
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `createQueue` in `src/queue.js`** — promise-chain tail; `enqueue` returns the task's own promise (rejections propagate to caller) while the chain itself catches to keep moving.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "add FIFO prompt queue"`.

### Task 5: Prompt builder (author attribution)

**Files:**
- Create: `src/prompt.js`
- Test: `test/prompt.test.js`

**Interfaces:**
- Produces: `buildPrompt({ authorName, content }) -> string` — format: `[Discord] <authorName>: <content>`.

- [ ] **Step 1: Write the failing test:**

```js
import { test } from "node:test"
import assert from "node:assert/strict"
import { buildPrompt } from "../src/prompt.js"

test("prefixes author display name", () => {
  assert.equal(
    buildPrompt({ authorName: "Rocket", content: "hello there" }),
    "[Discord] Rocket: hello there"
  )
})
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement `buildPrompt` in `src/prompt.js`** exactly per signature above.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "add prompt builder with author attribution"`.

### Task 6: Bridge wiring (Discord → OpenCode → webhook)

**Files:**
- Create: `src/bridge.js`, `src/index.js`, `.env` (real secrets, hand-placed)

**Interfaces:**
- Consumes: `loadConfig` (Task 1), `shouldPrompt` (Task 3), `createQueue` (Task 4), `buildPrompt` (Task 5), `chunkMessage` (Task 2).
- Produces: `startBridge(config)` → connects discord.js client, subscribes `client.event.subscribe()` from `@opencode/client`, returns promise resolving on disconnect.

- [ ] **Step 1: Implement `startBridge(config)` in `src/bridge.js`:**
  - OpenCode client: `Service.ensure()` + `OpenCode.make({ baseUrl, headers: Service.headers(endpoint) })`; verify `SESSION_ID` with `client.session.get?`/list before listening (fail fast — post error to webhook and exit if invalid).
  - discord.js: `Client({ intents: [Guilds, GuildMessages, MessageContent] })`, `client.on("messageCreate", …)` filtered to `config.channelId` and `shouldPrompt(msg)`.
  - Handler: `queue.enqueue(() => openCode.session.prompt({ sessionID: config.sessionId, text: buildPrompt({ authorName: msg.member?.displayName ?? msg.author.username, content: msg.content }) }))`.
  - Outbound: subscribe to events; for assistant message output, `chunkMessage(text)` and POST each part to `config.webhookUrl` sequentially (`fetch`, `Content-Type: application/json`, body `{ content: part }`).
  - On bridge errors (service unreachable, prompt failure): best-effort POST a one-line error notice to the webhook; log locally without printing secrets.
  - **Manual check of event shape:** before finalizing the subscription branch, inspect actual events via `opencode api` or a temporary log — the exact assistant-message event type/payload must be confirmed against reality, not guessed; adjust the branch accordingly and note the confirmed type in a code comment.

- [ ] **Step 2: Implement `src/index.js`** — loads dotenv, `loadConfig()`, `startBridge(config)`, logs "bridge started" with channel ID and session ID (never tokens).

- [ ] **Step 3: Create `.env`** with the real token/webhook/channel/session values (paste `SESSION_ID` by reading it from the running service — `opencode api get /api/sessions` or equivalent).

- [ ] **Step 4: Run unit suite** — `npm test` → all PASS.

- [ ] **Step 5: Smoke test** — `node src/index.js`, then post a test message in #general; verify a Tux/"Opencode" reply appears. Post a >2000-char request to confirm chunking. Verify TUI shows the injected `[Discord] …` prompt.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "wire discord bridge end to end"` (confirm `.env` is NOT in the commit).

### Task 7: README + runbook

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README** — what it is, `.env` keys, `npm test`, `node src/index.js`, how to pair a different `SESSION_ID`, token-reset note, and the trust warning (anyone in #general can drive the agent).

- [ ] **Step 2: Commit** — `git commit -am "add README"`.

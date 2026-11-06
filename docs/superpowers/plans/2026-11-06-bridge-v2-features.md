# Discord Bridge v2 Feature Batch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add slash commands with a review-gated `/shell`, typing/streaming/threading/feed behaviors, and (Phase 2) a full voice experience to the shipped Discord↔OpenCode bridge.

**Architecture:** Pure logic lives in small modules with `node:test` suites (command payloads, verdict parsing, shell exec, stream state machine, feed formatting, WAV resample); `src/bridge.js` wires them into discord.js gateway events (interactions, typing, edits) and the OpenCode event stream. Voice (Phase 2) adds `@discordjs/voice` receive/speak with local engines. The bridge stays stopped until final live smoke.

**Tech Stack:** Node ≥20 ESM, discord.js v14, `@opencode/client`, `node:test`. Phase 2 adds: `@discordjs/voice`, `opusscript` (WASM opus, no native build), `tweetnacl` (voice encryption). No ffmpeg unless found on PATH (verified, not assumed).

**Spec:** `docs/superpowers/specs/2026-11-06-bridge-v2-features-design.md` (v2) — v1 spec still governs unchanged behavior.

## Global Constraints

- `/shell` usable ONLY by owner user ID `1568364376413704294`? **No** — that is the BOT's ID. Owner = Rocket's user ID from `.env` (`OWNER_USER_ID`); add to config with test. Never execute `/shell` without a parsed `APPROVE` verdict from this session; unparsable verdict ⇒ REJECT.
- Interactions: always `deferReply` within the handler start; final answer via `editReply`.
- Webhook edit cadence ≥1500ms between `PATCH`s; final edit always sends.
- Reply text >2000 chars: first 2000 streamed, overflow chunked (≤2000) as follow-ups via `chunkMessage`.
- ⚡ feed posts only while armed (armed on Discord prompt enqueue, cleared on next `session.idle`); `/actionfeed` toggles globally.
- Shell exec: 30s timeout, output capped at 1500 chars (head+tail), cwd = paired session's location dir, no shell metacharacter sanitization beyond passing the raw string to `exec` (the review gate is the security control, per spec).
- Secrets stay in `.env`; never log token/webhook; `opencode.json` untouched; v1 tests stay green throughout (final suite gate every task).

## Review Focus

1. **Verdict forgery/confusion:** review replies that contain no clear APPROVE/REJECT, or text that mentions REJECT mid-approval → parser pins: first non-empty line must be exactly `APPROVE`/`REJECT` (case-insensitive) else null ⇒ REJECT (Task 3 tests).
2. **Shell runs without review:** wiring could call `runShell` on any interaction path → Task 7 router test asserts `/shell` requires verdict flow; `runShell` is only invoked post-verdict (code review point + Task 7 test on router dispatch order).
3. **Rate-limit storm from streaming edits:** throttle test in Task 5 with injected clock (first edit immediate, next at +1.5s boundary).
4. **Double-post / lost message on overflow:** Task 5 finalize test: exact 2000-boundary and >2000 cases assert one base message + correct overflow chunks rejoining losslessly.
5. **Feed leaks TUI work:** Task 6 tests arm/disarm lifecycle — tool lines only between arm and first `session.idle`.
6. **Owner gate:** Task 1 config test (`OWNER_USER_ID` required) + Task 7 test: `/shell` from non-owner → ephemeral refusal, no prompt sent.

---

### Task 1: Config + owner ID

**Files:** Modify: `src/config.js`, `.env.example`, `test/config.test.js`

**Interfaces:** `loadConfig` now also returns `ownerUserId` (required; throws listing missing keys like existing).

- [ ] **Step 1:** RED — add test: missing `OWNER_USER_ID` throws with it in the message; present config returns `ownerUserId`.
- [ ] **Step 2:** Run `npm test` → FAIL (expected reason).
- [ ] **Step 3:** Implement (add `OWNER_USER_ID` to `REQUIRED`, map `ownerUserId`); update `.env.example` (`OWNER_USER_ID=`) and real `.env` (Rocket's user ID — obtain via bridge-owned API call or user).
- [ ] **Step 4:** `npm test` → PASS all.
- [ ] **Step 5:** Commit `feat: require owner user id in config`.

### Task 2: Slash-command payloads

**Files:** Create: `src/commands.js`; Test: `test/commands.test.js`

**Interfaces:** `export const COMMANDS: object[]` — JSON payloads for `status`, `pause`, `resume`, `newsession`, `actionfeed` (option `choice` required: on/off), `shell` (option `cmd`, string, required), `join`, `leave`; `export function registrationBody() -> object[]` (name/description/options only, v10 shape).

- [ ] **Step 1:** RED — test: `registrationBody()` names = exact set above; `shell` has required string option `cmd`; `actionfeed` has required choice option with values `on`/`off`; no description >100 chars.
- [ ] **Step 2:** Verify FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS all.
- [ ] **Step 5:** Commit `feat: slash command payloads`.

### Task 3: Shell review prompt + verdict parser

**Files:** Create: `src/shell.js`; Test: `test/shell.test.js`

**Interfaces:**
- `buildShellReview({ user, cmd }) -> string` — prompt containing user, cmd, and instruction to answer `APPROVE` or `REJECT` on the first line.
- `parseVerdict(replyText) -> { verdict: "APPROVE"|"REJECT"|null, reason: string }` — first non-empty line trimmed, case-insensitive exact match; else verdict null; reason = remainder of reply.

- [ ] **Step 1:** RED — tests: approve happy path (first line `APPROVE`); reject with reason; `"approved please"` → null verdict (not exact line); `"REJECT\nbecause reasons"` → reason `because reasons`; empty/whitespace → null; `buildShellReview` embeds cmd and the two keywords.
- [ ] **Step 2:** Verify FAIL. [Step 3:] Implement. [Step 4:] PASS.
- [ ] **Step 5:** Commit `feat: shell review prompt and verdict parser`.

### Task 4: Shell executor

**Files:** Extend: `src/shell.js`; Test: extend `test/shell.test.js`

**Interfaces:** `runShell(cmd, { cwd, timeoutMs = 30000, maxOutput = 1500 }) -> Promise<{ exitCode, output }>` — uses `child_process.exec` (shell true); output = stdout+stderr, capped head/tail with `…[truncated]…` marker; timeout → exitCode null, output notes timeout.

- [ ] **Step 1:** RED — tests: `node -e "console.log('hi')"` → exit 0 + `hi`; `node -e "process.exit(3)"` → exit 3; output of 5000-char print → length ≤1500, contains marker, contains head and tail chars; nonexistent binary → non-zero exit, non-empty output.
- [ ] **Step 2:** Verify FAIL. [Step 3:] Implement. [Step 4:] PASS.
- [ ] **Step 5:** Commit `feat: shell executor with timeout and output cap`.

### Task 5: Stream state machine

**Files:** Create: `src/stream.js`; Test: `test/stream.test.js`

**Interfaces:**
- `createStream({ editIntervalMs = 1500 }) -> { append(delta, now), finalize(now) }`
- `append(text, now) -> { edit: string|null }` — sends edit when `now - lastSent >= editIntervalMs` (first append sends immediately), updates buffer/lastSent only when edit emitted.
- `finalize(now) -> { text, forceEdit: string|null, overflow: string[] }` — `forceEdit` = full base text if it differs from last sent (always sent by caller at ended), `overflow` = `chunkMessage` of everything beyond 2000... **Decision:** base = first 2000 chars streamed; overflow = `chunkMessage(text.slice(2000))`.

- [ ] **Step 1:** RED — tests: first append at t=0 emits; second at t=100 emits null; third at t=1600 emits full-so-far; finalize with ≤2000 total → forceEdit full, overflow []; 2500-char total → streamed capped at 2000, overflow chunk ≤2000 rejoining with base = original; empty stream finalize → no edit, no overflow.
- [ ] **Step 2:** Verify FAIL. [Step 3:] Implement. [Step 4:] PASS.
- [ ] **Step 5:** Commit `feat: streaming edit state machine`.

### Task 6: Feed arm/disarm + line formatting

**Files:** Create: `src/feed.js`; Test: `test/feed.test.js`

**Interfaces:** `createFeedGate() -> { arm(), disarm(), isArmed() }`; `formatToolLine(name, input) -> string` → `⚡ name — <input summary>` where summary = JSON/stringified, whitespace collapsed, truncated to 80 chars with `…`.

- [ ] **Step 1:** RED — tests: starts unarmed; arm→armed; disarm→unarmed; format truncates at 80; format collapses newlines; format of undefined input → just `⚡ name`.
- [ ] **Step 2:** Verify FAIL. [Step 3:] Implement. [Step 4:] PASS.
- [ ] **Step 5:** Commit `feat: action feed gate and formatting`.

### Task 7: Interaction router (wiring)

**Files:** Create: `src/interaction.js`; Modify: `src/bridge.js`, `src/commands.js` (registration call)

**Interfaces:**
- `registerCommands(applicationId, guildId, token) -> Promise<void>` — PUT guild commands with `registrationBody()` (fetch; log count, never token).
- `handleInteraction(interaction, deps)` where deps = `{ config, session, feed, pauseState, shellReview }`:
  - non-owner `/shell` → ephemeral "owner only".
  - `/shell` → defer → `buildShellReview` → `session.promptAndWait(text)` (helper: prompt + await that turn's `session.idle` — bridge tracks prompt↔idle) → `parseVerdict` → APPROVE: `runShell(cmd, {cwd})`, editReply output (chunk to 1990 via followUps if needed); REJECT/null: editReply reason or "no verdict → rejected".
  - `/status` → ephemeral: session id, uptime, queue depth, armed state.
  - `/pause`,`/resume` → flip gate, ephemeral confirm.
  - `/actionfeed on|off` → flip feed toggle, ephemeral confirm.
  - `/newsession` → create session, swap `config.sessionId`, ephemeral confirm (v1 constraint "never create sessions" applies only to v1; v2 spec allows via command).
  - `/join`,`/leave` → deferred "not built until Phase 2" ephemeral.
- bridge.js: `client.on("interactionCreate", …)` wired at startup; app ID from `GET /users/@me` with bot token at boot.

- [ ] **Step 1:** RED — test `interaction.js` router with fake deps/interactions: non-owner shell refusal (no prompt called); owner shell with APPROVE verdict calls runShell then editReply; verdict-null never calls runShell; `/pause` flips gate; `/actionfeed` flips toggle; unknown command → ephemeral help. (Mock interaction object: `{deferReply, editReply, reply, options.getString, member, user, commandName}`.)
- [ ] **Step 2:** Verify FAIL. [Step 3:] Implement router + bridge wiring + registration.
- [ ] **Step 4:** PASS all (v1 suites included).
- [ ] **Step 5:** Commit `feat: slash command router with gated shell review`.

### Task 8: Typing indicator + reply threading (wiring)

**Files:** Modify: `src/bridge.js`; Create: `src/typing.js`; Test: `test/typing.test.js`

**Interfaces:** `createTypingTicker(send, { intervalMs = 8000, now = Date.now }) -> { start(), stop(), beat() }` — `beat()` calls `send()` at most once per interval (first call immediate).

- [ ] **Step 1:** RED — tests: beat sends immediately once; second beat inside interval suppressed; after interval passes sends again (injected now).
- [ ] **Step 2:** Verify FAIL. [Step 3:] Implement ticker. [Step 4:] PASS.
- [ ] **Step 5 (wiring):** messageCreate stores `messageId` on queue entry; flush uses last entry's ID as `message_reference` in webhook body (extend `postWebhook(url, content, files, { reference }` — update webhook tests: JSON body includes `message_reference` when provided); typing ticker start on prompt enqueue + `beat()` on each text delta for paired session, stop on ended/flush complete.
- [ ] **Step 6:** `npm test` → all PASS. Commit `feat: typing indicator and reply threading`.

### Task 9: Streaming + ⚡ feed (wiring)

**Files:** Modify: `src/bridge.js`

- [ ] **Step 1:** Replace flush path: on `session.text.started` (paired session) → create message immediately via webhook (`executeWebhook` returns message id — extend `postWebhook` to return parsed JSON when needed) with `message_reference`; deltas → `stream.append` → throttled `PATCH` edits (`editWebhookMessage(url, messageId, content)` — new export in webhook.js, tested with fake fetch); ended → `finalize` → final edit + overflow follow-ups + attachment message (existing path).
- [ ] **Step 2:** Feed: subscribe adds `session.tool.called`/`session.tool.failed` types; while `feed.isArmed() && !feed.toggledOff` → post `formatToolLine`; arm on Discord prompt enqueue; disarm on first `session.idle` after it; `/actionfeed` toggle respected.
- [ ] **Step 3:** `npm test` → PASS (webhook edit test added RED-first in webhook.test.js before implementation).
- [ ] **Step 4:** Commit `feat: live streaming replies and tool action feed`.

### Task 10: `/shell` prompt↔verdict completion tracking

**Files:** Modify: `src/bridge.js`, `src/shell.js`

- [ ] **Step 1:** RED — test `shell.js` helper `awaitSessionTurn(deps)` semantics via fake emitter: resolves on first `session.idle` after prompt, rejects on timeout (default 120s).
- [ ] **Step 2:** Implement — bridge tracks "pending review turn": prompt → wait idle → fetch latest assistant message text (`session.context`/`message` API) → `parseVerdict`.
- [ ] **Step 3:** PASS. Commit `feat: review turn completion tracking`.

### Task 11: Phase 2 research gate — OpenCode voice session API

**Files:** Research note appended to v2 spec; possibly small spike file `spike/voice-notes.md`

- [ ] **Step 1:** Inspect `@opencode/client` experimental voice session surface (`ExperimentalVoiceSessionInput` etc.) + V2 docs page for voice.
- [ ] **Step 2:** Decide: adopt (redesign speaking/listening around it) or build on `@discordjs/voice` per spec. Ledger ruling in spec "Research gate" + report to user.
- [ ] **Step 3:** Commit research note.

### Task 12: Voice deps + `/join`/`/leave`

**Files:** Create: `src/voice.js`; Modify: `src/bridge.js`, `src/interaction.js` (real join/leave); deps install

- [ ] **Step 1:** `npm install @discordjs/voice opusscript tweetnacl`.
- [ ] **Step 2:** RED — test: `resolveVoiceTarget(memberVoiceState, interaction)` pure fn → channel ID or null (member not in voice → interaction reply "join a voice channel first").
- [ ] **Step 3:** Implement `voice.js`: `join(channelId, guildId)` (adapter from client), `leave()`, `isJoined()`; wire `/join`/`/leave`.
- [ ] **Step 4:** PASS. Commit `feat: voice channel join and leave`.

### Task 13: TTS speak pipeline

**Files:** Create: `src/tts.js`, `src/audio.js`; Test: `test/audio.test.js`

**Interfaces:**
- `synthesize(text) -> Promise<Buffer>` — PowerShell `System.Speech.Synthesis` → WAV (temp file, cleanup; reject on failure).
- `wavToPcm48k(wavBuffer) -> { pcm: Int16Array, sampleRate: 48000 }` — parse WAV header (PCM16), linear-resample any rate to 48000, upmix mono→stereo.
- `speakQueue` — sequential AudioPlayer play of `Buffer` sources while joined.

- [ ] **Step 1:** RED — `wavToPcm48k` tests: synthetic 22050Hz mono WAV → output rate 48000, stereo interleaved, length ≈ input×(48000/22050)×2, values in range; 48000 stereo passes through unchanged; malformed buffer throws.
- [ ] **Step 2:** Verify FAIL. [Step 3:] Implement audio parser/resampler. [Step 4:] PASS.
- [ ] **Step 5 (wiring):** on flush complete while joined → `synthesize(fullText)` → `wavToPcm48k` → enqueue speak. Smoke deferred.
- [ ] **Step 6:** PASS all. Commit `feat: tts synthesis and speak pipeline`.

### Task 14: STT listen pipeline

**Files:** Create: `src/stt.js`; Modify: `src/voice.js`, `src/bridge.js`; deps: STT engine

- [ ] **Step 1:** Engine decision: attempt Windows built-in recognition (PowerShell `System.Speech.Recognition` one-shot file-based); quality check on sample; if unusable → install `vosk` + small model (ledger ruling either way).
- [ ] **Step 2:** RED — `formatUtterance(displayName, text) -> "[Voice] <name>: <text>"` + silence/empty → null tests.
- [ ] **Step 3:** Implement: receiver audio (voice connection receiver → opus frame stream via opusscript decode → 16k mono PCM buffer per speaker) → engine → finalized utterance (debounce ≥1s silence) → `formatUtterance` → enqueue as prompt (armed feed + typing as normal) → reply goes to webhook AND speakQueue.
- [ ] **Step 4:** PASS. Commit `feat: voice stt to prompt pipeline`.

### Task 15: README + runbook

**Files:** Create/Modify: `README.md`

- [ ] **Step 1:** Cover: architecture diagram, all slash commands + `/shell` security model, `.env` keys incl. `OWNER_USER_ID`, standalone Windows launch (Task Scheduler / `start /b` note re: shell reaping), voice setup (`/join`), engine requirements, token rotation reminder, trust warning.
- [ ] **Step 2:** Commit `docs: v2 readme and runbook`.

### Task 16: Live smoke (requires user)

- [ ] Bridge start (standalone) → user verifies in #general: streamed reply, typing indicator, threaded reply, `!`-gone /`status` works, `/shell` approve + reject paths, `/actionfeed`, voice `/join` + spoken reply + spoken STT round trip.

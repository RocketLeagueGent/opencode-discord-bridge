# Discord Bridge v2 — Feature Batch Design

**Date:** 2026-11-06
**Status:** awaiting approval
**Supersedes scope of:** `2026-11-06-discord-bridge-design.md` (v1, shipped and live-tested)

## Intent

Turn the working text-only bridge into a full-featured Discord presence: native slash commands with a human-in-the-loop security gate on shell access, message feel (typing/streaming/threading), a tool-activity feed, and a complete voice experience — listening in voice channels and speaking replies aloud.

## Goals

- Native Discord slash commands registered on the guild: `/status`, `/pause`, `/resume`, `/newsession`, `/actionfeed`, `/shell`, `/join`.
- `/shell`: owner-only (user ID allowlist, starts with Rocket); every command is sent to the OpenCode session for an APPROVE/REJECT verdict before execution; verdict + output posted back to the channel.
- Typing indicator in #general while a reply generates.
- Live streaming: replies appear immediately and grow via message edits (~1.5s cadence), overflow >2000 chars posts as follow-ups.
- ⚡ tool-activity lines posted while a Discord-triggered turn is executing (armed on prompt, disarmed on idle; toggle via `/actionfeed`).
- Replies post as Discord replies to the triggering message.
- Voice: `/join` makes the bridge join the inviter's current voice channel; subsequent prompts are answered **aloud** via TTS; (stretch, see Phase 2) speech in that channel is transcribed (STT) and treated as prompts.

## Non-goals / anti-goals

- No wake word, no always-on STT in Phase 1.
- No cloud TTS/STT APIs by default — local/offline engines only (no keys, no cost) unless the user later opts in.
- **Screen-share/video in voice channels: OUT OF SCOPE (2026-11-07).** User requested bot screen-share ("stream applications and stuff"); research found no official Discord bot video API — voice docs have no video section, `@discordjs/voice` (0.19.2) is audio-only, and the only npm video libraries (`@dank074/discord-video-stream` et al.) are selfbot experiments violating Discord ToS. Gateway video opcodes (v3+) exist but are undocumented for bots, and DAVE E2EE (mandatory since 2026-03-01) makes reverse-engineering worse. User accepted audio-only. Revisit only if Discord documents bot video.
- No permissions system beyond the owner-only `/shell` allowlist (testing-server trust model unchanged).
- No multi-server support; one guild, one channel, one paired session (as v1).
- The bridge must never execute a `/shell` command without a recorded verdict from the agent session.

## Constraints

- Slash commands are registered via the Discord REST API against the guild (instant propagation); gateway `interactionCreate` handles them — no public URL needed.
- Interactions must be answered within 3 seconds → always `deferReply` first, edit later.
- Webhook edits (`PATCH`) share the webhook's rate limit → stream edits throttled to ≥1.5s.
- Discord voice requires 48kHz s16 PCM; Opus receive-side decoding needed for STT.
- Background shells in this harness are periodically reaped → README must document standalone process launch (Task carried from v1).
- Session-based verdict parsing must be race-free: a review prompt's verdict is read from that turn's assistant output only.

## Approaches considered

**Slash commands vs `!`-prefix (user chose slash):** native UX, argument typing, per-command permissions — costs registration setup; `!`-parser dropped.

**`/shell` review flow:** (a) agent verdict then bridge executes (chosen — deterministic, single executor, audit trail in session); (b) agent executes via its own tools (rejected — bypasses the "review before run" requirement, execution invisible to bridge).

**Voice architecture:** (a) build on `@discordjs/voice` + local engines (chosen); (b) investigate OpenCode's experimental voice-session API first (kept as a Phase-2 research step — may replace parts of (a) wholesale); (c) cloud TTS/STT (rejected — keys/cost).

**STT engine:** candidates — Windows built-in SAPI recognition (zero-install, English-only), Vosk (offline Node bindings, ~50MB model), whisper.cpp (best quality, heaviest). Decision deferred to plan: start with zero-install option, evaluate quality on real voice-channel audio, swap if inadequate.

**TTS engine:** Piper (local neural TTS — offline, free, no keys) → WAV → resample to 48kHz → `AudioPlayer`. **Overturned 2026-11-07:** original decision was Windows SAPI/System.Speech; user ruled "NOT window's TTS" — Piper chosen (user: "Whatever you want"). No ffmpeg dependency assumed; manual WAV parse/resample if ffmpeg absent (builder verifies).

## Decisions (user-made)

- All five text features: typing indicator, live streaming, ⚡ action feed, reply-threading, commands.
- Commands are native slash commands, not `!`-prefix.
- `/shell` restricted to Rocket's user ID; gate = agent APPROVE/REJECT on every command; openable later.
- TTS scope = option C: full voice assistant (listen + speak), not just message read-aloud.
- Bridge stays stopped during the rebuild; relaunch as standalone process when done.

## Design

### Phase 1 — text features + slash commands

1. **Command registration** at startup: POST guild commands (`/status`, `/pause`, `/resume`, `/actionfeed`, `/newsession`, `/shell cmd:<string>`, `/join` [Phase 2]) with Discord application ID.
2. **`interactionCreate` router:** harmless commands answered directly by the bridge (ephemeral where sensible: status/pause confirmations); `/shell` follows the review flow; unknown → ephemeral usage help.
3. **`/shell` flow:** `deferReply` → build review prompt (`buildShellReview`) → enqueue into the paired session → await that turn's completion → parse verdict from the reply (first non-empty line matching `APPROVE`/`REJECT`; ambiguous → treated as REJECT) → if APPROVE: run via `child_process.exec` (timeout 30s, cwd = project dir, output capped ~1500 chars) and `editReply` with output; if REJECT: `editReply` with my reason. `/shell pause`-gate interaction: `/pause` blocks both channel prompts and `/shell`.
4. **Typing indicator:** on prompt enqueue and every ~8s while text deltas flow for the active reply: `POST /channels/{id}/typing` (bot identity).
5. **Streaming:** first delta → `executeWebhook` creates message (with `message_reference` = triggering message ID) → throttled `PATCH` edits with accumulated text → final edit on `session.text.ended`; overflow beyond 2000 chars posted as chunked follow-ups; attachment line (`📎`) still handled per v1 (files attach to the final message).
6. **⚡ feed:** subscribe `session.tool.called` (and `.failed`) filtered to the paired session; armed flag set when a Discord prompt is enqueued, cleared on the next `session.idle`; while armed, post `⚡ <tool>` (tool name + safe arg summary, no secrets). `/actionfeed on|off` toggles.
7. **Reply threading:** each queued prompt carries its Discord message ID; the reply created for that turn references it (`message_reference`).

### Phase 2 — voice

8. **`/join`:** read the inviter's voice-state channel ID → `joinVoiceChannel` (adapter) → confirm in channel; `/leave` disconnects.
9. **TTS speak:** on reply completion while joined → synthesize via local engine → WAV → resample to 48kHz s16 stereo → `AudioPlayer` stream, queue sequentially; rate: one reply at a time.
10. **STT listen:** voice receiver → per-speaker Opus frames → decode → 16kHz mono PCM → local STT engine → finalized utterance → treated as a channel prompt (attributed `[Voice] <display name>: …`), answered in text (posted to #general via webhook) **and** spoken aloud if still joined.
11. **Research gate:** before building 9–10, inspect OpenCode's experimental voice-session API; if it covers STT/TTS loop, design adjusts (ledgered).

## What's left to the builder

- Exact Discord application ID + command registration payload shapes (from REST docs / client package).
- Verdict-prompt format and parsing edge cases (tests pin the happy path + ambiguous → REJECT).
- STT/TTS engine selection with real-world quality check (plan carries the decision procedure).
- ffmpeg availability check; manual WAV resampler if absent.
- Voice-session API evaluation result (may reshape Phase 2).
- Standalone Windows process launch instructions for README.

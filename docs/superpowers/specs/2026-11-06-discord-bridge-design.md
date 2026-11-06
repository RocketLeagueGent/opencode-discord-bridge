# OpenCode ↔ Discord Bridge — Design

**Date:** 2026-11-06
**Status:** awaiting approval

## Intent

Let members of the user's Discord testing server ("Rocket's Testing Server", channel #general) talk to the currently-running OpenCode session (this one) and see its replies posted as the "Opencode" webhook with the Tux avatar.

## Goals

- Every message in #general is injected into **this** OpenCode session (shared context with the user's TUI).
- Assistant replies are posted back to #general via the existing Discord webhook ("Opencode", Tux PFP).
- Run on the user's Windows machine, alongside the OpenCode background service.

## Non-goals / anti-goals

- No per-channel or per-user sessions; one shared session only.
- No mention-gating or allowlist — the server is a trusted testing ground.
- No slash commands, no reply/thread mapping, no multi-channel support (v1).
- Must not create message loops (webhook posts must never be re-read as input).

## Constraints

- Discord messages cap at 2000 chars → long replies are chunked.
- The webhook URL is a secret: stored in local `.env`, never committed.
- A Discord **bot** (Developer Portal application) is required for receiving messages; webhooks are send-only. The bot's token is also a `.env` secret.
- The bridge targets the session ID of the session it is paired with (captured at setup).
- If OpenCode is mid-turn when messages arrive, incoming messages queue in arrival order.

## Approaches considered

1. **Bot gateway in + webhook out (chosen).** A small Node script uses discord.js to receive channel messages and `@opencode/client` to prompt this session; replies POST to the user's webhook. Two Discord identities, but each does what it's best at: gateway = ears, webhook = mouth (custom name/avatar for free).
2. **Bot only (gateway in + bot posts out).** Simpler single identity, but replies would need the bot's own avatar/name instead of the Tux webhook the user already made.
3. **Interactions webhook only (no bot).** Receives slash commands only; cannot read ordinary channel messages. Doesn't meet the "open channel" requirement.

Chosen because it uses the webhook the user already created and keeps the bot's role purely inbound.

## Decisions (user-made)

- Shared session: Discord and TUI talk to the same session/context.
- Open channel: every #general message triggers the agent; no gating.
- Output through the existing webhook (Tux / "Opencode").
- Testing-server scope: trust the channel; no permission layer in v1.

## Design

1. **Inbound:** discord.js client listens for `messageCreate` in the configured channel ID.
   - Ignore messages authored by webhooks or other bots (loop prevention).
   - On a valid message: `session.prompt({ sessionID, text })` via `@opencode/client`, including the Discord author's display name so I know who's talking.
2. **Outbound:** subscribe to OpenCode events (`client.event.subscribe()`); on assistant message events, chunk text to ≤2000 chars and POST to the webhook URL sequentially (edit-in-place skipped in v1; plain sequential messages).
3. **Queueing:** a simple FIFO promise chain serializes prompts so overlapping messages don't interleave turns.
4. **Errors:** if the OpenCode service or Discord connection drops, log locally and post a one-line notice to #general on recovery/failure where possible.
5. **Config:** `.env` holds `DISCORD_BOT_TOKEN`, `WEBHOOK_URL`, `SESSION_ID`, and `CHANNEL_ID` (known value: `1568362384114983085`, #general in Rocket's Testing Server); `opencode.json` not modified.

## What's left to the builder

- File layout (single script vs small module split), package/tooling choices (bun vs node), exact event types to subscribe to, retry/backoff details.
- Capturing the session ID and service auth headers at setup (`@opencode/client/service`).

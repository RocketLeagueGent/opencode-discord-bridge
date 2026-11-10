# Repository Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Document, install, run, commit, and publish the existing Discord/OpenCode bridge as a private GitHub repository without uploading local secrets or downloaded assets.

**Architecture:** Keep the existing Node.js application and lockfile. Add paired Bash and Windows batch wrappers, an owner-only fixed-target Windows `/msg`, and document the current behavior. Use `.gitignore` to keep `.env`, Piper downloads, and voice models local. Create the private GitHub remote only after local verification and commit.

**Tech Stack:** Node.js ES modules, npm, Bash, Windows batch, Git, GitHub REST API with the existing Git Credential Manager credential.

**Spec:** `docs/superpowers/specs/2026-11-10-repository-packaging-design.md`

## Global Constraints

- `.env`, downloaded Piper files, and voice models must remain local and must not be staged or uploaded.
- Install scripts install Node dependencies and create `.env` from `.env.example` only when `.env` is absent.
- Run scripts start `src/index.js` from the project directory.
- When `PIPER_EXECUTABLE` is unset, local Piper auto-detection uses `tools/piper/bin/piper/piper.exe`; if absent, it falls back to `piper` on `PATH`.
- README claims must describe current behavior; incoming voice recognition is not implemented.
- The GitHub repository name is `opencode-discord-bridge` and its visibility must be private.
- Do not change Teams or delete local runtime assets.
- Commit intended project changes when the task is complete.
- Do not stage the separate, unapproved voice-conversation proposal at `docs/superpowers/specs/2026-11-10-discord-voice-conversation-design.md`.
- `/msg` is owner-only, Windows-only, fixed to local target `*`, and passes only the supplied non-empty message to `msg.exe` without a shell.

## Review Focus

- Message text containing quotes or shell metacharacters must be passed literally; test the injected `execFile` receives exactly `msg.exe` and arguments `['*', message]`.
- Non-owners must not be able to broadcast; test `/msg` rejects before calling the sender.
- Non-Windows systems and blank messages must fail clearly; test both helper rejection paths without invoking a process.
- Existing `.env` must never be overwritten and scripts must tolerate spaces in the checkout path; verify preserve-if-present logic and quoted script paths.
- No secret/model/runtime file may enter the commit or remote; verify the staged path list and GitHub push contents before pushing.

---

### Task 1: Correct optional local Piper resolution

**Files:**
- Modify: `src/tts.js`
- Test: `test/tts.test.js`

**Interfaces:**
- `synthesizeWithPiper` continues to accept explicit `executable` and `modelPath` options and environment overrides.
- With no executable override, prefer an existing `tools/piper/bin/piper/piper.exe`, then `piper` on `PATH`.

- [ ] **Step 1: Correct the regression test first:** use `resolve()` for Windows-normalized expected paths, capture both the executable and args from `spawnImpl`, and create the stub under `tools/piper/bin/piper/piper.exe`.
- [ ] **Step 2: Run `node --test test/tts.test.js`** and verify the repo-local resolution test fails because production still points at the old path.
- [ ] **Step 3: Implement correct local path resolution** and replace the ESM-incompatible `require('node:fs')` existence check with an ESM import; preserve explicit environment/options overrides and PATH fallback.
- [ ] **Step 4: Run `node --test test/tts.test.js`** and verify all TTS tests pass.

### Task 2: Keep secrets and downloaded voice assets out of Git

**Files:**
- Modify: `.gitignore`
- Modify: `.env.example`

**Interfaces:**
- `.env.example` remains the configuration template copied by install scripts.
- Piper runtime/model are configured with `PIPER_EXECUTABLE` and `PIPER_MODEL_PATH`; their files remain user-provided local assets.

- [ ] **Step 1: Add ignore rules** for `/voices/` and `/tools/piper/` without removing the existing `node_modules/`, `.env`, or `.superpowers/` rules.
- [ ] **Step 2: Add blank Piper path settings** `PIPER_EXECUTABLE=` and `PIPER_MODEL_PATH=` to `.env.example`; do not add real credentials or paths.
- [ ] **Step 3: Verify ignore and template behavior** with `git check-ignore -v .env voices/en_US-lessac-medium.onnx tools/piper/bin/piper/piper.exe`; confirm secret/Piper fields in `.env.example` are blank, the Piper executable and voice metadata remain local, and do not download a missing model as part of this task.

### Task 3: Add cross-platform install and run scripts

**Files:**
- Create: `install.sh`
- Create: `install.bat`
- Create: `run.sh`
- Create: `run.bat`

**Interfaces:**
- Install entrypoints copy `.env.example` to `.env` only if no `.env` exists, then run `npm ci` from the repository root.
- Run entrypoints switch to the repository root and invoke `node src/index.js`, propagating its exit code.

- [ ] **Step 1: Implement the Bash scripts** with quoted paths based on each script's own location; `install.sh` must preserve an existing `.env`, and `run.sh` must invoke the app from the repository root.
- [ ] **Step 2: Implement the Windows batch scripts** with `cd /d "%~dp0"`, preserve an existing `.env`, use `npm ci` for install, and return the Node process exit code from `run.bat`.
- [ ] **Step 3: Verify script syntax and path handling** using `bash -n install.sh run.sh` where Bash is available and inspect batch commands for quoted paths; confirm install logic does not overwrite `.env` and does not download Piper/model files.

### Task 4: Add the owner-only Windows `/msg` command

**Files:**
- Create: `src/windows-message.js`
- Modify: `src/commands.js`
- Modify: `src/interaction.js`
- Modify: `src/bridge.js`
- Test: `test/windows-message.test.js`
- Test: `test/interaction.test.js`

**Interfaces:**
- `sendSystemMessage(message, { platform = process.platform, execFileImpl = execFile } = {}) -> Promise<void>` rejects on non-Windows platforms, blank input, or `msg.exe` failure; on Windows it invokes `execFileImpl('msg.exe', ['*', message], { windowsHide: true }, callback)` without shell options.
- The `/msg` interaction uses a required `message` string option, checks `interaction.user.id === deps.config.ownerUserId`, and calls injected `deps.sendSystemMessage(message)` only for the owner.

- [ ] **Step 1: Add failing helper tests** for the exact executable/arguments (including quotes and shell metacharacters preserved as one message), non-Windows rejection, blank input rejection, and surfaced process errors.
- [ ] **Step 2: Run `node --test test/windows-message.test.js`** and verify the new tests fail because the helper is not implemented.
- [ ] **Step 3: Implement `sendSystemMessage`** using `node:child_process` `execFile`; do not use `exec`, `shell: true`, dynamic recipients, or caller-provided switches.
- [ ] **Step 4: Add failing interaction tests** proving non-owners cannot call the sender, owners pass the exact message, and blank messages are rejected.
- [ ] **Step 5: Register and handle `/msg`** in `src/commands.js` and `src/interaction.js`; inject the helper from `src/bridge.js`, make the reply ephemeral, and return a clear Windows-only/error response on failure.
- [ ] **Step 6: Run `node --test test/windows-message.test.js test/interaction.test.js`** and verify all focused tests pass.

### Task 5: Write the user-facing README

**Files:**
- Create: `README.md`
- Reference: `package.json`, `.env.example`, `src/commands.js`, `src/config.js`, `src/interaction.js`, `src/bridge.js`

**Interfaces:**
- The README points to the four install/run scripts, lists required environment variables, explains optional local Piper paths, documents current slash commands, and gives `npm test` as the test command.

- [ ] **Step 1: Document purpose and current behavior:** Discord channel messages go to the configured OpenCode session; replies post through the webhook; `/join` speaks replies with local Piper and `/leave` disconnects. Explicitly state that the bot does not yet transcribe incoming voice.
- [ ] **Step 2: Document setup/configuration:** prerequisites, `install` and `run` commands for Windows and Bash, how to fill `.env` from `.env.example`, required keys (`DISCORD_BOT_TOKEN`, `WEBHOOK_URL`, `SESSION_ID`, `OWNER_USER_ID`), optional `CHANNEL_ID`, and optional local Piper executable/model paths. Do not include real IDs, tokens, or downloaded files.
- [ ] **Step 3: Document commands and verification:** `/status`, `/pause`, `/resume`, `/newsession`, `/actionfeed`, owner-only `/shell`, owner-only Windows `/msg` (broadcasts to all sessions on the bridge host), `/join`, `/leave`, and `npm test`; keep descriptions aligned with actual command implementations.
- [ ] **Step 4: Review README accuracy** against the listed source files and confirm no feature, secret, or bundled Piper/model claim is invented.

### Task 6: Verify and commit the intended project state

**Files:**
- Verify: `.gitignore`, `.env.example`, `README.md`, `install.sh`, `install.bat`, `run.sh`, `run.bat`, current project source/tests, `/msg` tests

**Interfaces:**
- The final local commit contains intended bridge source, tests, docs, and packaging files; excludes `.env`, `voices/`, and `tools/piper/`.

- [ ] **Step 1: Run the full test suite** with `npm test` and verify it passes.
- [ ] **Step 2: Review and stage intended project files** with `git status --short` and `git diff --check`; exclude `.env`, `voices/`, `tools/piper/`, and the unapproved voice-conversation proposal. Verify `git diff --cached --name-only` contains none of those paths.
- [ ] **Step 3: Commit the verified project state** with message `docs: package Discord bridge for setup and private hosting`.

### Task 7: Create and push the private GitHub repository

**Files:**
- Git remote: `origin`

**Interfaces:**
- Use the already available Git Credential Manager authentication without printing or persisting its credential.
- Create repository `opencode-discord-bridge` with `private: true`, then push the current branch and set its upstream.

- [ ] **Step 1: Create the private repository** through GitHub's authenticated API; if the credential lacks repository-creation permission, stop and report that rather than changing visibility or asking for secrets in chat.
- [ ] **Step 2: Add `origin` and push the current branch** with upstream tracking; do not force-push.
- [ ] **Step 3: Verify publication** by confirming the remote URL, current branch tracking state, GitHub repository visibility is private, and the pushed tree excludes `.env`, model files, and Piper binaries/archive.

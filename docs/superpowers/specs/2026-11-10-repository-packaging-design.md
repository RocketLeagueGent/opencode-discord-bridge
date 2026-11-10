# Repository Packaging Design

## Intent

Make the existing Discord/OpenCode bridge understandable and straightforward to install and run, and publish its source as a private GitHub repository.

## Goals and constraints

- Write a readable README describing actual current behavior, configuration, setup, commands, and tests.
- Document the dependency-required Node.js minimum (`>=22.12.0`) in both the README and package metadata.
- Provide `install.sh`, `install.bat`, `run.sh`, and `run.bat` for dependency installation and startup.
- Add an owner-only `/msg` slash command that broadcasts a supplied message to all Windows sessions on the bridge host.
- Keep `.env`, Piper downloads, voice models, and other downloaded runtime assets out of Git and GitHub; keep local assets in place.
- Commit completed project changes. Create and push to a private GitHub repository named `opencode-discord-bridge` if the available GitHub credential permits it.
- Do not change Teams or claim incoming voice recognition exists.

## Approaches

- **Lean source repository (chosen):** track source, tests, lockfile, documentation, and scripts; ignore local secrets and downloaded runtime/model files, documenting their setup. This avoids uploading secrets or large external assets.
- **Self-contained repository:** include downloaded Piper/model assets for easier cloning, at the cost of a much larger repository and distributing third-party files. Not selected.
- **Direct `msg.exe` invocation (chosen for `/msg`):** call the Windows utility with a fixed `*` recipient and the message as one argument, without a shell. Routing through the general `/shell` command would introduce unnecessary command parsing and a broader execution path.

## Proposed behavior

Install scripts install Node dependencies and create `.env` from `.env.example` only when absent. Run scripts start `src/index.js` and keep configuration local. The README documents Piper as an optional local runtime configured through environment variables. At completion, commit intended project changes, create the private remote, and push the branch; never stage `.env`, voice models, or downloaded Piper files.

`/msg` is restricted to the configured owner, runs only on Windows, always targets `*` on the local host, and sends the supplied non-empty message through `msg.exe` without invoking a shell. It accepts no caller-supplied recipient, server, or command switches.


## Out of scope

Implementing incoming voice recognition, DMs, remote-host messaging, arbitrary `/msg` recipients/switches, changing Teams, publishing a public repository, deleting local runtime assets, or committing secrets/external binaries.

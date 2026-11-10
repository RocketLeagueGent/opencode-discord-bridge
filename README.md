# OpenCode Discord Bridge

A small Node.js service that connects one Discord text channel to an OpenCode session. It posts replies through a Discord webhook and can speak replies in a voice channel with local Piper TTS.

## What it does

- Forwards messages from the configured Discord channel to the configured OpenCode session.
- Posts OpenCode replies and optional tool activity to Discord through a webhook.
- Supports guild slash commands for bridge controls.
- With `/join`, joins the command user's current voice channel and speaks replies using local Piper; `/leave` disconnects.
- Does **not** capture or transcribe incoming voice.

## Requirements

- Node.js and npm.
- A Discord bot added to your server, with the required gateway intents enabled, including **Message Content** and **Guild Voice States**.
- A webhook URL for posting bridge replies.
- An OpenCode session available to the local OpenCode service.
- Optional: a local Piper executable and compatible voice model for spoken replies.

The bot needs access to the configured text channel. For voice commands, give it permission to connect and speak in the voice channel.

## Install and run

The install script runs `npm ci` and creates `.env` from `.env.example` only if `.env` does not already exist. Fill in `.env` before starting the bridge.

**Windows** (from the project folder):

```bat
install.bat
```

Edit `.env`, then run:

```bat
run.bat
```

**Bash** (Linux, macOS, or Git Bash):

```bash
bash ./install.sh
```

Edit `.env`, then run:

```bash
bash ./run.sh
```

The run script stays attached to the terminal so you can see logs; stop it with `Ctrl+C`.

## Configuration

Copy `.env.example` to `.env` if it was not created by the install script. Set these values:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token. |
| `WEBHOOK_URL` | Yes | Discord webhook used to post replies and activity. |
| `SESSION_ID` | Yes | OpenCode session that receives channel messages. |
| `OWNER_USER_ID` | Yes | Discord user ID allowed to use owner-only commands. |
| `CHANNEL_ID` | No | Discord text channel to listen to; defaults to the project’s configured channel. |
| `PIPER_EXECUTABLE` | No | Local Piper executable path; otherwise the bridge checks its local runtime path, then `PATH`. |
| `PIPER_MODEL_PATH` | No | Local `.onnx` voice model path; defaults to `voices/en_US-lessac-medium.onnx`. |

Keep secrets in `.env`. It is ignored by Git. `.env.example` contains no credentials; its optional `CHANNEL_ID` value is only a project default, not a secret.

### Local Piper voice

Piper and voice-model files are **not included** in this repository. Provide them locally if you want spoken replies. The default executable location is `tools/piper/bin/piper/piper.exe`; the default model location is `voices/en_US-lessac-medium.onnx` with its matching `.onnx.json` metadata file beside it. Alternatively, set `PIPER_EXECUTABLE` and `PIPER_MODEL_PATH` in `.env` to your local paths.

The `tools/piper/` and `voices/` directories are Git-ignored. Installing Node dependencies does not download Piper or a voice model.

## Slash commands

| Command | Behavior |
| --- | --- |
| `/status` | Shows session, uptime, queue, feed, and pause status. |
| `/pause` | Stops accepting messages from the configured text channel. |
| `/resume` | Resumes channel message intake. |
| `/newsession` | Creates a new OpenCode session and pairs the bridge with it. |
| `/actionfeed on\|off` | Turns the tool activity feed on or off. |
| `/shell <cmd>` | Owner-only. Requests a review before running a shell command on the bridge host. Treat this as powerful host access. |
| `/msg <message>` | Owner-only and Windows-only. Displays the message to **all Windows sessions on the bridge host**. Use only when you intend to broadcast locally. |
| `/join` | Joins your current voice channel and speaks OpenCode replies. |
| `/leave` | Leaves the voice channel. |

Slash commands are registered for the guild associated with `CHANNEL_ID` when the bridge starts.

## Tests

Run the test suite with:

```bash
npm test
```

## Security and local files

- Never commit `.env`, bot tokens, webhook URLs, voice models, or downloaded Piper binaries.
- `/shell` and `/msg` are restricted to `OWNER_USER_ID`; `/msg` broadcasts to all Windows sessions on this computer.
- Only use the bot in servers and channels where you have permission to connect it.

const STRING = 3

export const COMMANDS = [
  { name: "status", description: "Show bridge status (session, uptime, queue)" },
  { name: "pause", description: "Pause message intake from the channel" },
  { name: "resume", description: "Resume message intake from the channel" },
  {
    name: "newsession",
    description: "Create a fresh OpenCode session and point the bridge at it",
  },
  {
    name: "actionfeed",
    description: "Toggle the tool activity feed in this channel",
    options: [
      {
        name: "state",
        description: "Turn the feed on or off",
        type: STRING,
        required: true,
        choices: [
          { name: "on", value: "on" },
          { name: "off", value: "off" },
        ],
      },
    ],
  },
  {
    name: "shell",
    description: "Run a shell command after the agent reviews it (owner only)",
    options: [
      { name: "cmd", description: "The command to review and run", type: STRING, required: true },
    ],
  },
  { name: "join", description: "Join your current voice channel and speak replies aloud" },
  { name: "leave", description: "Leave the voice channel" },
]

export function registrationBody() {
  return COMMANDS.map(({ name, description, options }) => ({
    name,
    description,
    ...(options ? { options } : {}),
  }))
}

export async function registerCommands(applicationId, guildId, token, fetchImpl = fetch) {
  const res = await fetchImpl(`https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(registrationBody()),
  })
  if (!res.ok) throw new Error(`command registration responded ${res.status}`)
  const list = await res.json()
  console.log(`registered ${Array.isArray(list) ? list.length : 0} slash commands on guild ${guildId}`)
}

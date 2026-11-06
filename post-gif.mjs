import { readFileSync } from "node:fs"

const gifPath = process.argv[2]
const envText = readFileSync(new URL("./.env", import.meta.url), "utf8")
const webhookUrl = envText.split(/\r?\n/).find((l) => l.startsWith("WEBHOOK_URL=")).slice("WEBHOOK_URL=".length).trim()

const bytes = readFileSync(gifPath)
const form = new FormData()
form.append("files[0]", new Blob([bytes], { type: "image/gif" }), "pigeon-dance.gif")
form.append("content", "pigeon has entered the server 🐦")

const res = await fetch(webhookUrl, { method: "POST", body: form })
console.log(`status: ${res.status}`)
if (!res.ok) console.log(await res.text())

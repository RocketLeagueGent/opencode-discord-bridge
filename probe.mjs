import "dotenv/config"
import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/service"

const endpoint = await Service.ensure()
const client = OpenCode.make({ baseUrl: endpoint.url, headers: Service.headers(endpoint) })
const sessionID = process.env.SESSION_ID
console.log(`probe: subscribed, watching session ${sessionID}`)

let count = 0
const timer = setTimeout(() => {
  console.log(`probe: done, saw ${count} matching events`)
  process.exit(0)
}, 25000)

for await (const ev of client.event.subscribe({ types: ["session.text.delta", "session.text.ended"] })) {
  count++
  const match = ev.data?.sessionID === sessionID
  console.log(`${ev.type} session=${ev.data?.sessionID} match=${match} len=${(ev.data.text ?? ev.data.delta ?? "").length}`)
  if (count > 40) break
}

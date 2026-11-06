import "dotenv/config"
import { loadConfig } from "./config.js"
import { startBridge } from "./bridge.js"

const config = loadConfig()
startBridge(config).catch((err) => {
  console.error("bridge failed to start:", err.message)
  process.exit(1)
})

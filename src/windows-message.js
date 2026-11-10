import { execFile as nodeExecFile } from "node:child_process"

export function sendSystemMessage(message, {
  platform = process.platform,
  execFileImpl = nodeExecFile,
} = {}) {
  if (platform !== "win32") {
    return Promise.reject(new Error("/msg is only available on Windows."))
  }
  if (typeof message !== "string" || !message.trim()) {
    return Promise.reject(new Error("A non-empty message is required."))
  }

  return new Promise((resolve, reject) => {
    execFileImpl("msg.exe", ["*", message], { windowsHide: true }, (error) => {
      if (error) {
        reject(new Error(`msg.exe failed: ${error.message}`))
        return
      }
      resolve()
    })
  })
}

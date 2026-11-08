export async function postWebhook(url, content, files = [], opts = {}) {
  const { reference, fetchImpl = typeof opts === "function" ? opts : fetch } =
    typeof opts === "function" ? { fetchImpl: opts } : opts
  const refBody = reference ? { message_reference: { message_id: reference } } : null
  const target = `${url}${url.includes("?") ? "&" : "?"}wait=true`
  const maybeJson = async (res) => {
    if (res.status === 200 && typeof res.json === "function") {
      try {
        return await res.json()
      } catch {
        return null
      }
    }
    return null
  }

  if (files.length === 0) {
    const body = refBody ? { content, ...refBody } : { content }
    const res = await fetchImpl(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`webhook responded ${res.status}`)
    return maybeJson(res)
  }
  const form = new FormData()
  if (content) form.append("content", content)
  if (refBody) form.append("payload_json", JSON.stringify(refBody))
  files.forEach((file, i) => {
    form.append(
      `files[${i}]`,
      new Blob([file.bytes], { type: file.type ?? "application/octet-stream" }),
      file.name,
    )
  })
  const res = await fetchImpl(target, { method: "POST", body: form })
  if (!res.ok) throw new Error(`webhook responded ${res.status}`)
  return maybeJson(res)
}

export async function editWebhookMessage(webhookUrl, messageId, content, fetchImpl = fetch) {
  const res = await fetchImpl(`${webhookUrl}/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`webhook edit responded ${res.status}`)
}

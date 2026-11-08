export async function postWebhook(url, content, files = [], opts = {}) {
  const { reference, fetchImpl = typeof opts === "function" ? opts : fetch } =
    typeof opts === "function" ? { fetchImpl: opts } : opts
  const refBody = reference ? { message_reference: { message_id: reference } } : null

  if (files.length === 0) {
    const body = refBody ? { content, ...refBody } : { content }
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`webhook responded ${res.status}`)
    return
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
  const res = await fetchImpl(url, { method: "POST", body: form })
  if (!res.ok) throw new Error(`webhook responded ${res.status}`)
}

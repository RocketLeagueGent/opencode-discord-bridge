export async function postWebhook(url, content, files = [], fetchImpl = fetch) {
  if (files.length === 0) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error(`webhook responded ${res.status}`)
    return
  }
  const form = new FormData()
  if (content) form.append("content", content)
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

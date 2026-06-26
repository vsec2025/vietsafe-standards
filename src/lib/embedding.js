// Google text-embedding-005 — 768 dims, hỗ trợ tiếng Việt và Anh

export async function embedText(text) {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey || apiKey === 'placeholder') return null

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-005:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'models/text-embedding-005', content: { parts: [{ text }] } }),
    }
  )
  if (!res.ok) {
    console.error('Embedding error:', await res.text())
    return null
  }
  const data = await res.json()
  return data.embedding?.values ?? null
}

export async function embedBatch(texts) {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey || apiKey === 'placeholder') return null

  // Google batchEmbedContents: tối đa 100 items
  const BATCH = 100
  const results = []
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-005:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: 'models/text-embedding-005',
            content: { parts: [{ text }] },
          })),
        }),
      }
    )
    if (!res.ok) throw new Error(`Batch embed error: ${await res.text()}`)
    const data = await res.json()
    results.push(...data.embeddings.map((e) => e.values))
  }
  return results
}

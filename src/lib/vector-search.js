// Upstash Vector search wrapper

export async function vectorQuery(vector, { topK = 6, filter } = {}) {
  const url = process.env.UPSTASH_VECTOR_REST_URL
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN
  if (!url || !token || url === 'placeholder') return []

  const body = { vector, topK, includeMetadata: true, includeVectors: false }
  if (filter) body.filter = filter

  const res = await fetch(`${url}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error('Vector query error:', await res.text())
    return []
  }
  const data = await res.json()
  return (data.result ?? []).map((r) => ({
    id: r.id,
    score: r.score,
    metadata: r.metadata ?? {},
  }))
}

export async function vectorUpsert(items) {
  const url = process.env.UPSTASH_VECTOR_REST_URL
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN
  if (!url || !token || url === 'placeholder') return

  // items: [{id, vector, metadata}]
  const BATCH = 100
  for (let i = 0; i < items.length; i += BATCH) {
    const res = await fetch(`${url}/upsert`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(items.slice(i, i + BATCH)),
    })
    if (!res.ok) throw new Error(`Vector upsert error: ${await res.text()}`)
  }
}

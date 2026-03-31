// src/utils/liveData.js
// Calls the Vercel serverless functions from the frontend

/**
 * Fetch today's fixtures with full stats + quant analysis
 * Calls /api/scan which hits Sportmonks and runs the quant engine
 */
export async function scanToday() {
  const res = await fetch('/api/scan')
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `Scan failed: ${res.status}`)
  }
  return res.json()
}

/**
 * Get AI deep-dive prediction for a single fixture
 * Calls /api/predict which hits Claude with all the stats
 */
export async function getAIPrediction(fixture) {
  const res = await fetch('/api/predict', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(fixture),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? `Prediction failed: ${res.status}`)
  }
  return res.json()
}

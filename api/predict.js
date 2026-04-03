// api/predict.js — AI Deep-Dive Prediction via Claude
// Called per-fixture to generate a detailed punter report

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const fixture = req.body

  if (!fixture) return res.status(400).json({ error: 'No fixture data provided' })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' })

  // Build the deep-dive prompt using api-football field names
  const prompt = `You are an expert football quant analyst and betting advisor. Analyse this fixture and give a detailed punter report.

FIXTURE: ${fixture.name}
LEAGUE: ${fixture.league}
KICKOFF: ${fixture.kickoff}

MATCH STATISTICS:
Home Team: ${fixture.stats?.home?.name}
- xG: ${fixture.stats?.home?.xg ?? 'N/A'}
- Possession: ${fixture.stats?.home?.possession ?? 'N/A'}%
- Shots on Target: ${fixture.stats?.home?.shotsOnTarget ?? 'N/A'}
- Total Shots: ${fixture.stats?.home?.shots ?? 'N/A'}
- Corners: ${fixture.stats?.home?.corners ?? 'N/A'}
- Yellow Cards: ${fixture.stats?.home?.yellowCards ?? 'N/A'}
- Fouls: ${fixture.stats?.home?.fouls ?? 'N/A'}
- Offsides: ${fixture.stats?.home?.offsides ?? 'N/A'}

Away Team: ${fixture.stats?.away?.name}
- xG: ${fixture.stats?.away?.xg ?? 'N/A'}
- Possession: ${fixture.stats?.away?.possession ?? 'N/A'}%
- Shots on Target: ${fixture.stats?.away?.shotsOnTarget ?? 'N/A'}
- Total Shots: ${fixture.stats?.away?.shots ?? 'N/A'}
- Corners: ${fixture.stats?.away?.corners ?? 'N/A'}
- Yellow Cards: ${fixture.stats?.away?.yellowCards ?? 'N/A'}
- Fouls: ${fixture.stats?.away?.fouls ?? 'N/A'}
- Offsides: ${fixture.stats?.away?.offsides ?? 'N/A'}

BOOKMAKER ODDS:
Home Win: ${fixture.odds?.home ?? 'N/A'}
Draw: ${fixture.odds?.draw ?? 'N/A'}
Away Win: ${fixture.odds?.away ?? 'N/A'}

API-FOOTBALL PREDICTIONS:
Home Win%: ${fixture.predictions?.homeWinPct ?? 'N/A'}
Draw%: ${fixture.predictions?.drawPct ?? 'N/A'}
Away Win%: ${fixture.predictions?.awayWinPct ?? 'N/A'}
Predicted Winner: ${fixture.predictions?.winner ?? 'N/A'}
Advice: ${fixture.predictions?.advice ?? 'N/A'}

QUANT MODEL OUTPUT:
Luck Score: ${fixture.quant?.luckScore} (positive = home team over-performed their xG)
Home Pressure Index: ${fixture.quant?.pressure}
Volatility Score: ${fixture.quant?.volatility} (higher = more cards/fouls expected)
Fluke Score: ${fixture.quant?.flukeScore} (>0.7 = home team overvalued, FADE signal)

MODEL PROBABILITIES:
Home Win: ${fixture.markets?.result?.p1 != null ? (fixture.markets.result.p1 * 100).toFixed(1) + '%' : 'N/A'}
Draw: ${fixture.markets?.result?.px != null ? (fixture.markets.result.px * 100).toFixed(1) + '%' : 'N/A'}
Away Win: ${fixture.markets?.result?.p2 != null ? (fixture.markets.result.p2 * 100).toFixed(1) + '%' : 'N/A'}

EXPECTED METRICS:
Goals: ${fixture.markets?.goals?.expHome ?? 'N/A'} – ${fixture.markets?.goals?.expAway ?? 'N/A'}
BTTS probability: ${fixture.markets?.goals?.pBTTS != null ? (fixture.markets.goals.pBTTS * 100).toFixed(0) + '%' : 'N/A'}
Over 2.5 probability: ${fixture.markets?.goals?.pOver25 != null ? (fixture.markets.goals.pOver25 * 100).toFixed(0) + '%' : 'N/A'}
Expected corners: ${fixture.markets?.expCorners ?? 'N/A'}
Expected cards: ${fixture.markets?.expCards ?? 'N/A'}
Expected booking pts: ${fixture.markets?.expBkPts ?? 'N/A'}

TOP VALUE PICKS (model):
${(fixture.markets?.valuePicks ?? []).slice(0,5).map(p =>
  `- ${p.market} @ ${p.odds} | prob ${((p.prob||0)*100).toFixed(1)}% | EV ${(p.ev||0).toFixed(3)}`
).join('\n') || 'None identified'}

Respond in this EXACT JSON format (no markdown, no preamble):
{
  "verdict": "One sentence summary of the match outlook for punters",
  "confidence": "HIGH | MEDIUM | LOW",
  "primaryBet": {
    "market": "e.g. Away Win | BTTS Yes | Over 2.5 | Home Win | Draw",
    "reasoning": "2-3 sentences explaining why this bet has value based on the stats",
    "odds": "the decimal odds for this bet",
    "ev": "expected value as a decimal e.g. 0.087",
    "kelly": "kelly fraction as a decimal e.g. 0.042",
    "confidence": "HIGH | MEDIUM | LOW"
  },
  "secondaryBet": {
    "market": "second best value bet market",
    "reasoning": "2-3 sentences",
    "odds": "decimal odds",
    "confidence": "HIGH | MEDIUM | LOW"
  },
  "keyStats": [
    "Most important stat insight 1",
    "Most important stat insight 2",
    "Most important stat insight 3"
  ],
  "risks": [
    "Main risk to the primary bet",
    "Secondary risk"
  ],
  "flukeAlert": "null | a sentence if the fluke score is high (>0.65)",
  "btts": "Yes | No | Unlikely",
  "over25": "Yes | No | Unlikely",
  "predictedScore": "e.g. 2-1",
  "bookingsBet": "Over or Under total bookings and reasoning in one sentence"
}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await response.json()
    const raw  = data.content?.[0]?.text ?? '{}'

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      parsed = match ? JSON.parse(match[0]) : { verdict: raw, confidence: 'LOW' }
    }

    return res.status(200).json({ prediction: parsed, fixture: fixture.name })

  } catch (err) {
    console.error('AI prediction error:', err)
    return res.status(500).json({ error: err.message })
  }
}

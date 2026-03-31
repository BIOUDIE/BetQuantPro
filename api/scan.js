// api/scan.js  — Vercel Serverless Function
// Fetches today's fixtures + deep stats from Sportmonks for all 7 target leagues
// Deployed automatically by Vercel — no server needed

// ── League IDs on Sportmonks v3 ──────────────────────────────────────────────
const LEAGUE_IDS = {
  'EPL':                8,    // English Premier League
  'La Liga':            564,  // Spanish La Liga
  'Bundesliga':         82,   // German Bundesliga
  'Belgian Pro League': 4,    // Belgian Jupiler Pro League
  'Championship':       9,    // English Championship
  'Ligue 1':            301,  // French Ligue 1
  'Serie A':            384,  // Italian Serie A
}

const BASE = 'https://api.sportmonks.com/v3/football'

// Sportmonks stat type IDs we care about
const STAT_TYPES = {
  POSSESSION:        45,   // Ball Possession %
  SHOTS_ON_TARGET:   86,   // Shots On Target
  SHOTS_TOTAL:       84,   // Total Shots
  CORNERS:           54,   // Corner Kicks
  YELLOW_CARDS:      84,   // Yellow Cards  (type_id 84)
  FOULS:             51,   // Fouls
  ATTACKS:           156,  // Attacks
  DANGEROUS_ATTACKS: 157,  // Dangerous Attacks
  XG:                5304, // Expected Goals (xG)
}

async function smFetch(path, token) {
  const url = `${BASE}${path}&api_token=${token}`
  const res  = await fetch(url)
  if (!res.ok) throw new Error(`Sportmonks ${res.status}: ${path}`)
  const json = await res.json()
  return json.data ?? []
}

// ── Parse raw Sportmonks statistics array into a clean object ─────────────────
function parseStats(statistics = [], participants = []) {
  const home = participants.find(p => p.meta?.location === 'home')
  const away = participants.find(p => p.meta?.location === 'away')
  const homeId = home?.id
  const awayId = away?.id

  const get = (typeId, participantId) => {
    const s = statistics.find(
      s => s.type_id === typeId && s.participant_id === participantId
    )
    return s?.data?.value ?? null
  }

  return {
    home: {
      name:              home?.name ?? 'Home',
      image:             home?.image_path ?? null,
      possession:        get(45, homeId),
      shotsOnTarget:     get(86, homeId),
      shotsTotal:        get(84, homeId),
      corners:           get(54, homeId),
      yellowCards:       get(40, homeId),
      redCards:          get(41, homeId),
      fouls:             get(51, homeId),
      attacks:           get(156, homeId),
      dangerousAttacks:  get(157, homeId),
      xg:                get(5304, homeId),
    },
    away: {
      name:              away?.name ?? 'Away',
      image:             away?.image_path ?? null,
      possession:        get(45, awayId),
      shotsOnTarget:     get(86, awayId),
      shotsTotal:        get(84, awayId),
      corners:           get(54, awayId),
      yellowCards:       get(40, awayId),
      redCards:          get(41, awayId),
      fouls:             get(51, awayId),
      attacks:           get(156, awayId),
      dangerousAttacks:  get(157, awayId),
      xg:                get(5304, awayId),
    },
  }
}

// ── Parse odds into a clean object ───────────────────────────────────────────
function parseOdds(odds = []) {
  // Market 1 = Full Time Result, bookmaker label matching
  const ftResult = odds.filter(o => o.market_description === 'Full Time Result' || o.market_id === 1)
  const find = (label) => {
    const o = ftResult.find(o => o.label?.toLowerCase().includes(label))
    return o ? parseFloat(o.value) : null
  }
  return {
    home: find('home') || find('1'),
    draw: find('draw') || find('x'),
    away: find('away') || find('2'),
  }
}

// ── Parse Sportmonks built-in predictions ────────────────────────────────────
function parsePredictions(predictions = []) {
  const p = predictions[0] ?? {}
  return {
    homeWinPct:   p.predictions?.home_win   ?? null,
    drawPct:      p.predictions?.draw       ?? null,
    awayWinPct:   p.predictions?.away_win   ?? null,
    btts:         p.predictions?.btts       ?? null,
    over25:       p.predictions?.over_2_5   ?? null,
    correct_score:p.predictions?.correct_score ?? null,
  }
}

export default async function handler(req, res) {
  // Allow CORS for frontend calls
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const token = process.env.SPORTMONKS_API_KEY
  if (!token) {
    return res.status(500).json({ error: 'SPORTMONKS_API_KEY not set in environment variables' })
  }

  try {
    const today    = new Date().toISOString().split('T')[0]   // YYYY-MM-DD
    const leagueIds = Object.values(LEAGUE_IDS).join(',')

    // ── Step 1: Fetch today's fixtures for all 7 leagues in one call ──────────
    // includes: participants (teams), odds, predictions, statistics, xGFixture
    const includes = [
      'participants',
      'statistics.type',
      'xGFixture.type',
      'odds',
      'predictions',
      'scores',
      'state',
      'league',
    ].join(',')

    const fixtures = await smFetch(
      `/fixtures/date/${today}?include=${includes}&filters=fixtureLeagues:${leagueIds}`,
      token
    )

    if (!fixtures.length) {
      return res.status(200).json({ fixtures: [], date: today, message: 'No fixtures today for selected leagues' })
    }

    // ── Step 2: Enrich each fixture with computed quant metrics ───────────────
    const enriched = fixtures.map(fix => {
      const stats  = parseStats(fix.statistics ?? [], fix.participants ?? [])
      const odds   = parseOdds(fix.odds ?? [])
      const preds  = parsePredictions(fix.predictions ?? [])
      const score  = fix.scores?.find(s => s.description === 'CURRENT')
      const state  = fix.state?.developer_name ?? 'NS'   // NS=Not Started, LIVE, FT

      // ── Quant engine calculations ─────────────────────────────────────────
      const homeXG  = stats.home.xg ?? 0
      const awayXG  = stats.away.xg ?? 0
      const homeGoals = score?.score?.participant === 'home' ? score.score.goals : 0
      const awayGoals = score?.score?.participant === 'away' ? score.score.goals : 0

      // Luck Score
      const luckScore = (homeGoals - homeXG) - (awayGoals - awayXG)

      // Pressure Index [0–1]
      const homePressure = (
        0.40 * ((stats.home.possession ?? 50) / 100) +
        0.35 * ((stats.home.shotsOnTarget ?? 0) / 10) +
        0.25 * ((stats.home.corners ?? 0) / 12)
      )
      const awayPressure = (
        0.40 * ((stats.away.possession ?? 50) / 100) +
        0.35 * ((stats.away.shotsOnTarget ?? 0) / 10) +
        0.25 * ((stats.away.corners ?? 0) / 12)
      )

      // Volatility Score
      const volatility = (
        ((stats.home.yellowCards ?? 0) + (stats.away.yellowCards ?? 0)) * 10 +
        ((stats.home.redCards ?? 0)    + (stats.away.redCards ?? 0))    * 25 +
        ((stats.home.fouls ?? 0)       + (stats.away.fouls ?? 0))       * 1.5
      ) / 90

      // Implied probabilities from bookmaker odds
      const margin = 0.05
      const implHome = odds.home ? (1 / odds.home) / (1 + margin) : null
      const implDraw = odds.draw ? (1 / odds.draw) / (1 + margin) : null
      const implAway = odds.away ? (1 / odds.away) / (1 + margin) : null

      // Model probabilities from Sportmonks predictions (or fall back to implied)
      const modelHome = preds.homeWinPct != null ? preds.homeWinPct / 100 : implHome
      const modelDraw = preds.drawPct    != null ? preds.drawPct    / 100 : implDraw
      const modelAway = preds.awayWinPct != null ? preds.awayWinPct / 100 : implAway

      // Value Gap
      const gapHome = modelHome != null && implHome != null ? modelHome - implHome : null
      const gapDraw = modelDraw != null && implDraw != null ? modelDraw - implDraw : null
      const gapAway = modelAway != null && implAway != null ? modelAway - implAway : null

      // EV
      const evHome = modelHome != null && odds.home ? (modelHome * odds.home - 1) : null
      const evDraw = modelDraw != null && odds.draw ? (modelDraw * odds.draw - 1) : null
      const evAway = modelAway != null && odds.away ? (modelAway * odds.away - 1) : null

      // Kelly
      const kelly = (prob, odd) => {
        if (!prob || !odd) return null
        const b = odd - 1
        return Math.max(0, ((prob * b - (1 - prob)) / b) * 0.5)
      }

      // Fluke Score [0–1] — higher = overvalued home team
      const normLuck  = Math.min(Math.max((luckScore + 2) / 4, 0), 1)
      const xgRatio   = homeXG > 0 ? Math.min(awayXG / homeXG, 2) / 2 : 0.5
      const flukeScore = (
        0.40 * normLuck +
        0.25 * (1 - homePressure) +
        0.25 * xgRatio +
        0.10 * Math.min(volatility / 5, 1)
      )

      // Best value bet pick for punters
      const picks = [
        { market: 'Home Win', gap: gapHome, ev: evHome, odds: odds.home, kelly: kelly(modelHome, odds.home), prob: modelHome },
        { market: 'Draw',     gap: gapDraw, ev: evDraw, odds: odds.draw, kelly: kelly(modelDraw, odds.draw), prob: modelDraw },
        { market: 'Away Win', gap: gapAway, ev: evAway, odds: odds.away, kelly: kelly(modelAway, odds.away), prob: modelAway },
      ]
      .filter(p => p.gap != null && p.ev != null)
      .sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))

      const bestPick = picks[0] ?? null

      // Overall confidence signal
      const confidence =
        bestPick?.ev > 0.12 && bestPick?.gap > 0.07 ? 'HIGH' :
        bestPick?.ev > 0.05 && bestPick?.gap > 0.04 ? 'MEDIUM' : 'LOW'

      return {
        id:           fix.id,
        name:         fix.name,
        league:       fix.league?.name ?? 'Unknown',
        leagueId:     fix.league_id,
        kickoff:      fix.starting_at,
        state,
        score: {
          home: homeGoals,
          away: awayGoals,
        },
        stats,
        odds: {
          home: odds.home,
          draw: odds.draw,
          away: odds.away,
        },
        implied: { home: implHome, draw: implDraw, away: implAway },
        model:   { home: modelHome, draw: modelDraw, away: modelAway },
        gap:     { home: gapHome, draw: gapDraw, away: gapAway },
        ev:      { home: evHome, draw: evDraw, away: evAway },
        kelly:   {
          home: kelly(modelHome, odds.home),
          draw: kelly(modelDraw, odds.draw),
          away: kelly(modelAway, odds.away),
        },
        quant: {
          luckScore:    parseFloat(luckScore.toFixed(3)),
          homePressure: parseFloat(homePressure.toFixed(3)),
          awayPressure: parseFloat(awayPressure.toFixed(3)),
          volatility:   parseFloat(volatility.toFixed(3)),
          flukeScore:   parseFloat(flukeScore.toFixed(3)),
        },
        predictions: preds,
        bestPick,
        confidence,
        picks,
      }
    })

    // Sort by confidence then EV
    enriched.sort((a, b) => {
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 }
      if (order[a.confidence] !== order[b.confidence])
        return order[a.confidence] - order[b.confidence]
      return (b.bestPick?.ev ?? 0) - (a.bestPick?.ev ?? 0)
    })

    return res.status(200).json({
      date:     today,
      total:    enriched.length,
      leagues:  Object.keys(LEAGUE_IDS),
      fixtures: enriched,
    })

  } catch (err) {
    console.error('Scan error:', err)
    return res.status(500).json({ error: err.message })
  }
}

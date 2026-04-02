// api/picks.js — BQP AI Picks Engine v2.1
// Uses CommonJS module.exports for Vercel compatibility

const LEAGUES = {
  'EPL': 8, 'La Liga': 564, 'Bundesliga': 82,
  'Belgian Pro League': 4, 'Championship': 9,
  'Ligue 1': 301, 'Serie A': 384,
}
const LEAGUE_IDS = Object.values(LEAGUES).join(',')
const BASE = 'https://api.sportmonks.com/v3/football'

const LEAGUE_DEFAULTS = {
  8:   { avgGoals:2.82, avgCorners:10.1, avgCards:3.2, avgFouls:20.4, penRate:0.28, refStrictness:68 },
  564: { avgGoals:2.74, avgCorners:10.8, avgCards:4.8, avgFouls:26.4, penRate:0.32, refStrictness:88 },
  82:  { avgGoals:3.16, avgCorners:10.4, avgCards:3.9, avgFouls:22.1, penRate:0.26, refStrictness:72 },
  4:   { avgGoals:2.68, avgCorners:10.3, avgCards:3.7, avgFouls:23.6, penRate:0.26, refStrictness:74 },
  9:   { avgGoals:2.55, avgCorners:9.8,  avgCards:3.5, avgFouls:24.2, penRate:0.22, refStrictness:66 },
  301: { avgGoals:2.62, avgCorners:10.0, avgCards:3.6, avgFouls:21.8, penRate:0.24, refStrictness:68 },
  384: { avgGoals:2.58, avgCorners:10.6, avgCards:4.6, avgFouls:24.8, penRate:0.30, refStrictness:90 },
}

// Stat type IDs on Sportmonks
const T = {
  POSSESSION: 45, SHOTS_TOTAL: 84, SHOTS_ON_TARGET: 86,
  CORNERS: 34, YELLOW_CARDS: 40, RED_CARDS: 41,
  FOULS: 51, OFFSIDES: 55, XG: 5304, GOALS: 52,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function smFetch(path, token) {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BASE}${path}${sep}api_token=${token}`
  const r = await fetch(url)
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`Sportmonks ${r.status}: ${body.slice(0, 200)}`)
  }
  const j = await r.json()
  return j.data ?? []
}

function getStat(stats, typeId, pid) {
  if (!stats || !stats.length) return null
  const s = stats.find(x => x.type_id === typeId && x.participant_id === pid)
  return s?.data?.value ?? null
}

function getTeamAvg(ts, tid) {
  if (!ts || !ts.length) return null
  for (const s of ts) {
    const d = s.details?.find(x => x.type_id === tid)
    if (d?.value?.all?.average != null) return d.value.all.average
  }
  return null
}

const clamp = (v, lo = 0.01, hi = 0.99) => Math.min(hi, Math.max(lo, v || 0))
const implP  = (o, m = 0.05) => o ? (1 / o) / (1 + m) : null
const calcEV = (p, o) => (p != null && o) ? p * o - 1 : null
const calcK  = (p, o, f = 0.5) => {
  if (!p || !o) return null
  const b = o - 1, k = (p * b - (1 - p)) / b
  return Math.max(0, k * f)
}

function poisson(l, k) {
  let p = Math.exp(-l)
  for (let i = 1; i <= k; i++) p *= l / i
  return p
}
function pOver(l, line) {
  let c = 0
  for (let i = 0; i <= Math.floor(line); i++) c += poisson(l, i)
  return clamp(1 - c)
}

// ── Market model ──────────────────────────────────────────────────────────────
function buildMarkets(fd) {
  const {
    homeXG: hX, awayXG: aX,
    homeGoalsAvg: hG, awayGoalsAvg: aG,
    homeGoalsConcAvg: hGC, awayGoalsConcAvg: aGC,
    homeCorners: hC, awayCorners: aC,
    homeYellow: hY, awayYellow: aY,
    homeRed: hR, awayRed: aR,
    homeFouls: hF, awayFouls: aF,
    homeWinP: p1raw, drawP: pxraw, awayWinP: p2raw,
    refStrictness: rs, isDerby: dby, matchImportance: mi,
    leagueAvgCards: lC, leagueAvgCorners: lCo,
    leagueAvgFouls: lF, leagueAvgPens: lP,
    homePressure: hP,
  } = fd

  // Expected goals via Poisson
  const eH = clamp((hX || hG || 1.4) * 0.55 + (aGC || 1.1) * 0.45, 0.2, 5)
  const eA = clamp((aX || aG || 1.1) * 0.55 + (hGC || 1.0) * 0.45, 0.2, 5)
  const eT = eH + eA
  const pBTTS = (1 - Math.exp(-eH)) * (1 - Math.exp(-eA))

  // Expected corners
  const cH = hC || (lCo || 10.2) * 0.52
  const cA = aC || (lCo || 10.2) * 0.48
  const cT = cH + cA
  const cPct = l => clamp((cT - l + 0.5) / (cT * 0.75))

  // Expected cards
  const base = (hY || 2.0) + (aY || 1.8)
  const refM = ((rs || 65) / 65) * 0.40 + 0.60
  const derM = dby ? 1.18 : 1.00
  const impM = mi === 'Derby' ? 1.15 : mi === 'Title Decider' ? 1.12 : mi === 'Relegation' ? 1.14 : 1.00
  const fM   = (hF && aF) ? ((hF + aF) / ((lF || 22) * 0.95)) * 0.85 + 0.15 : 1.00
  const eY   = base * refM * derM * impM * fM
  const eR   = ((hR || 0.06) + (aR || 0.06)) * derM * impM
  const bkPts = eY * 10 + eR * 25

  // Result probabilities
  const ph = clamp(p1raw || clamp(eH / (eH + eA + 0.3) * 0.85, 0.15, 0.80))
  const pd = clamp(pxraw || clamp(0.35 - Math.abs(eH - eA) * 0.08, 0.15, 0.45))
  const pa = clamp(1 - ph - pd)

  // Helper: build pick with EV
  const fo = (p, m = 0.08) => p > 0.01 ? parseFloat((1 / (p * (1 + m))).toFixed(2)) : null
  const mkP = (cat, market, prob, odds) => {
    const p   = clamp(prob || 0.01)
    const o   = odds || fo(p)
    const ip  = implP(o)
    const ev  = calcEV(p, o)
    const gap = ip != null ? p - ip : null
    return {
      cat, market, prob: parseFloat(p.toFixed(4)), odds: o,
      impl: ip ? parseFloat(ip.toFixed(4)) : null,
      ev: ev != null ? parseFloat(ev.toFixed(4)) : null,
      gap: gap != null ? parseFloat(gap.toFixed(4)) : null,
      kelly: calcK(p, o),
      isValue: ev != null && ev > 0.03 && gap != null && gap > 0.03,
    }
  }

  const picks = [
    mkP('RESULT',  'Home Win',              ph,                fo(ph)),
    mkP('RESULT',  'Draw',                  pd,                fo(pd)),
    mkP('RESULT',  'Away Win',              pa,                fo(pa)),
    mkP('RESULT',  'Double Chance 1X',      ph + pd,           fo(ph + pd)),
    mkP('RESULT',  'Double Chance X2',      pd + pa,           fo(pd + pa)),
    mkP('RESULT',  'Draw No Bet Home',      ph / (ph + pa),    fo(ph / (ph + pa))),
    mkP('RESULT',  'Win to Nil Home',       ph * Math.exp(-eA),fo(ph * Math.exp(-eA))),
    mkP('GOALS',   'BTTS Yes',              pBTTS,             fo(pBTTS)),
    mkP('GOALS',   'BTTS No',               1 - pBTTS,         fo(1 - pBTTS)),
    mkP('GOALS',   'Over 1.5 Goals',        pOver(eT, 1.5),    fo(pOver(eT, 1.5))),
    mkP('GOALS',   'Over 2.5 Goals',        pOver(eT, 2.5),    fo(pOver(eT, 2.5))),
    mkP('GOALS',   'Over 3.5 Goals',        pOver(eT, 3.5),    fo(pOver(eT, 3.5))),
    mkP('GOALS',   'Under 2.5 Goals',       1 - pOver(eT, 2.5),fo(1 - pOver(eT, 2.5))),
    mkP('GOALS',   'HT Over 0.5 Goals',     pOver(eT * 0.42, 0.5), fo(pOver(eT * 0.42, 0.5))),
    mkP('CORNERS', 'Over 9.5 Corners',      cPct(9.5),         fo(cPct(9.5))),
    mkP('CORNERS', 'Over 10.5 Corners',     cPct(10.5),        fo(cPct(10.5))),
    mkP('CORNERS', 'Over 11.5 Corners',     cPct(11.5),        fo(cPct(11.5))),
    mkP('CORNERS', 'Under 10.5 Corners',    1 - cPct(10.5),    fo(1 - cPct(10.5))),
    mkP('CARDS',   'Over 3.5 Cards',        clamp((eY - 2.5) / 3.2), fo(clamp((eY - 2.5) / 3.2))),
    mkP('CARDS',   'Over 4.5 Cards',        clamp((eY - 3.5) / 3.2), fo(clamp((eY - 3.5) / 3.2))),
    mkP('CARDS',   'Under 3.5 Cards',       1 - clamp((eY - 2.5) / 3.2), fo(1 - clamp((eY - 2.5) / 3.2))),
    mkP('CARDS',   'Both Teams Carded',     clamp((eY - 2.5) / 3.2 * 0.85), fo(clamp((eY - 2.5) / 3.2 * 0.85))),
    mkP('CARDS',   'Booking Pts Over 35',   clamp((bkPts - 30) / 25), fo(clamp((bkPts - 30) / 25))),
    mkP('TIMING',  'Goal in 1st Half',      pOver(eT * 0.42, 0.5), fo(pOver(eT * 0.42, 0.5))),
    mkP('TIMING',  'Late Goal (75-90)',      clamp((hP || 0.55) * 0.4 + 0.18), fo(clamp((hP || 0.55) * 0.4 + 0.18))),
    mkP('PENALTY', 'Penalty Awarded',        clamp((lP || 0.28), 0.10, 0.38), fo(clamp((lP || 0.28), 0.10, 0.38))),
  ]

  const valuePicks = picks.filter(p => p.isValue).sort((a, b) => (b.ev || 0) - (a.ev || 0))
  const topPick    = valuePicks[0] ?? picks.sort((a, b) => (b.ev || 0) - (a.ev || 0))[0] ?? null

  return {
    picks, valuePicks, topPick,
    exp: {
      goals: parseFloat(eT.toFixed(2)),
      homeGoals: parseFloat(eH.toFixed(2)),
      awayGoals: parseFloat(eA.toFixed(2)),
      corners: parseFloat(cT.toFixed(1)),
      cards: parseFloat(eY.toFixed(2)),
      bookPts: parseFloat(bkPts.toFixed(1)),
      pBTTS: parseFloat(pBTTS.toFixed(3)),
      pOver25: parseFloat(pOver(eT, 2.5).toFixed(3)),
    },
    result: {
      p1: parseFloat(ph.toFixed(3)),
      px: parseFloat(pd.toFixed(3)),
      p2: parseFloat(pa.toFixed(3)),
    },
  }
}

// ── Parlay builder ────────────────────────────────────────────────────────────
function buildParlay(fixtures) {
  const pool = fixtures
    .filter(f => f.topPick && (f.topPick.ev || 0) > 0)
    .map(f => ({ ...f.topPick, match: f.name, league: f.league, fixId: f.id }))

  if (pool.length < 2) return null

  const eligible = pool.slice(0, 8)
  const nLegs    = Math.min(4, eligible.length)
  let bestEV = -Infinity, bestCombo = []

  const combine = (start, cur) => {
    if (cur.length === nLegs) {
      const ev = cur.reduce((a, p) => a * (p.prob || 0), 1)
               * cur.reduce((a, p) => a * (p.odds || 1), 1) - 1
      if (ev > bestEV) { bestEV = ev; bestCombo = [...cur] }
      return
    }
    for (let i = start; i < eligible.length; i++) combine(i + 1, [...cur, eligible[i]])
  }
  combine(0, [])
  if (!bestCombo.length) return null

  const totOdds = bestCombo.reduce((a, p) => a * (p.odds || 1), 1)
  const totProb = bestCombo.reduce((a, p) => a * (p.prob || 0), 1)
  return {
    legs: bestCombo,
    totOdds: parseFloat(totOdds.toFixed(2)),
    totProb: parseFloat(totProb.toFixed(4)),
    ev: parseFloat((totProb * totOdds - 1).toFixed(3)),
    kelly: parseFloat(Math.max(0, ((totProb * (totOdds - 1) - (1 - totProb)) / (totOdds - 1)) * 0.25).toFixed(3)),
  }
}

// ── Main handler (CommonJS for Vercel) ────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const smToken = process.env.SPORTMONKS_API_KEY
  const aiKey   = process.env.ANTHROPIC_API_KEY

  // ── Validate environment variables ────────────────────────────────────────
  if (!smToken) {
    return res.status(500).json({
      error: 'SPORTMONKS_API_KEY is not set.',
      fix: 'Go to Vercel → Your Project → Settings → Environment Variables → Add SPORTMONKS_API_KEY',
    })
  }
  if (!aiKey) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY is not set.',
      fix: 'Go to Vercel → Your Project → Settings → Environment Variables → Add ANTHROPIC_API_KEY',
    })
  }

  try {
    const today = new Date().toISOString().split('T')[0]

    // ── Step 1: Fetch today's fixtures ────────────────────────────────────
    let fixtures = []
    try {
      fixtures = await smFetch(
        `/fixtures/date/${today}?include=participants;statistics.type;xGFixture.type;odds;predictions;scores;state;league;referees&filters=fixtureLeagues:${LEAGUE_IDS}&per_page=50`,
        smToken
      )
    } catch (e) {
      return res.status(500).json({ error: `Sportmonks API error: ${e.message}` })
    }

    if (!fixtures || !fixtures.length) {
      return res.status(200).json({
        date: today, total: 0, fixtures: [], picks: [],
        parlay: null, dayVerdict: `No fixtures scheduled today (${today}) for the selected leagues.`,
        message: 'No fixtures today',
      })
    }

    // ── Step 2: Fetch team season stats ───────────────────────────────────
    const teamIds = [...new Set(
      fixtures.flatMap(f => (f.participants || []).map(p => p.id))
    )].filter(Boolean).slice(0, 28)

    let teamStatsMap = {}
    if (teamIds.length > 0) {
      try {
        const td = await smFetch(
          `/teams/multi/${teamIds.join(',')}?include=statistics.details.type&filters=currentSeasons:teamStatistic`,
          smToken
        )
        const arr = Array.isArray(td) ? td : [td]
        arr.forEach(t => { if (t && t.id) teamStatsMap[t.id] = t.statistics || [] })
      } catch (e) {
        // Non-fatal — fall back to league defaults
        console.warn('Team stats fetch failed, using league defaults')
      }
    }

    // ── Step 3: Build market model for each fixture ───────────────────────
    const enriched = fixtures.map(fix => {
      try {
        const home = (fix.participants || []).find(p => p.meta?.location === 'home')
        const away = (fix.participants || []).find(p => p.meta?.location === 'away')
        if (!home || !away) return null

        const stats = fix.statistics || []
        const ld    = LEAGUE_DEFAULTS[fix.league_id] || LEAGUE_DEFAULTS[8]
        const state = fix.state?.developer_name || 'NS'
        const homeXG = (fix.xGFixture || []).find(x => x.participant_id === home.id)?.data?.value
        const awayXG = (fix.xGFixture || []).find(x => x.participant_id === away.id)?.data?.value
        const hTS    = teamStatsMap[home.id] || []
        const aTS    = teamStatsMap[away.id] || []
        const ref    = (fix.referees || [])[0]
        const pred   = (fix.predictions || [])[0]?.predictions
        const scoreD = (fix.scores || []).find(s => s.description === 'CURRENT')
        const leagueName = fix.league?.name
          || Object.keys(LEAGUES).find(k => LEAGUES[k] === fix.league_id)
          || 'Unknown'

        const fd = {
          homeXG, awayXG,
          homeGoalsAvg:     getTeamAvg(hTS, T.GOALS)          || ld.avgGoals / 2,
          awayGoalsAvg:     getTeamAvg(aTS, T.GOALS)          || ld.avgGoals / 2,
          homeGoalsConcAvg: getTeamAvg(hTS, 88)               || ld.avgGoals / 2,
          awayGoalsConcAvg: getTeamAvg(aTS, 88)               || ld.avgGoals / 2,
          homeCorners:      getStat(stats, T.CORNERS, home.id) || getTeamAvg(hTS, T.CORNERS) || ld.avgCorners * 0.52,
          awayCorners:      getStat(stats, T.CORNERS, away.id) || getTeamAvg(aTS, T.CORNERS) || ld.avgCorners * 0.48,
          homeYellow:       getTeamAvg(hTS, T.YELLOW_CARDS)   || ld.avgCards / 2,
          awayYellow:       getTeamAvg(aTS, T.YELLOW_CARDS)   || ld.avgCards / 2,
          homeRed:          getTeamAvg(hTS, T.RED_CARDS)       || 0.06,
          awayRed:          getTeamAvg(aTS, T.RED_CARDS)       || 0.06,
          homeFouls:        getStat(stats, T.FOULS, home.id)   || getTeamAvg(hTS, T.FOULS) || ld.avgFouls / 2,
          awayFouls:        getStat(stats, T.FOULS, away.id)   || getTeamAvg(aTS, T.FOULS) || ld.avgFouls / 2,
          homePressure:     (fix.pressure || []).find(p => p.participant_id === home.id)?.data?.value || 0.55,
          homeWinP:         pred?.home_win ? pred.home_win / 100 : null,
          drawP:            pred?.draw     ? pred.draw / 100     : null,
          awayWinP:         pred?.away_win ? pred.away_win / 100 : null,
          refStrictness:    ld.refStrictness,
          isDerby:          false,
          matchImportance:  'Regular',
          leagueAvgCards:   ld.avgCards,
          leagueAvgCorners: ld.avgCorners,
          leagueAvgFouls:   ld.avgFouls,
          leagueAvgPens:    ld.penRate,
        }

        const markets = buildMarkets(fd)

        return {
          id:       fix.id,
          name:     fix.name,
          league:   leagueName,
          leagueId: fix.league_id,
          kickoff:  fix.starting_at,
          state,
          score: {
            home: scoreD?.score?.participant === 'home' ? (scoreD.score.goals || 0) : 0,
            away: scoreD?.score?.participant === 'away' ? (scoreD.score.goals || 0) : 0,
          },
          homeTeam:   { id: home.id, name: home.name, image: home.image_path },
          awayTeam:   { id: away.id, name: away.name, image: away.image_path },
          referee:    ref?.name || 'TBC',
          markets,
          topPick:    markets.topPick,
          valuePicks: markets.valuePicks,
          exp:        markets.exp,
          result:     markets.result,
        }
      } catch (e) {
        console.warn(`Fixture enrichment failed for fix ${fix.id}:`, e.message)
        return null
      }
    }).filter(Boolean)

    // ── Step 4: Build parlay ──────────────────────────────────────────────
    const parlay = buildParlay(enriched)

    // ── Step 5: AI synthesis ──────────────────────────────────────────────
    const fixtureContext = enriched.map(f => {
      const vp = f.valuePicks.slice(0, 4).map(p => `${p.market}@${p.odds}(EV:${(p.ev||0).toFixed(3)})`).join(', ')
      return `${f.name} (${f.league}) KO:${f.kickoff}
xG: ${f.exp.homeGoals}–${f.exp.awayGoals} | BTTS:${(f.exp.pBTTS*100).toFixed(0)}% | O2.5:${(f.exp.pOver25*100).toFixed(0)}%
Corners:${f.exp.corners} | Cards:${f.exp.cards} | BookPts:${f.exp.bookPts}
Win%: H${(f.result.p1*100).toFixed(0)} D${(f.result.px*100).toFixed(0)} A${(f.result.p2*100).toFixed(0)}
Top pick: ${f.topPick?.market||'none'} @${f.topPick?.odds||'—'} EV:${(f.topPick?.ev||0).toFixed(3)}
Value picks: ${vp||'none'}`
    }).join('\n\n---\n\n')

    let aiPicks = null
    try {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': aiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: `You are an expert quant betting analyst. Statistical models have already analysed every fixture. Your job: synthesise into clear picks for punters.

FIXTURES:
${fixtureContext}

Rules:
- Pick 1-3 BEST bets per fixture only where EV > 0 and model probability beats implied
- SKIP fixtures with no genuine edge — say skip:true and give a reason
- Stake sizing: HIGH confidence = 3-5% bankroll, MEDIUM = 1-2%
- Reference actual stats in reasoning (xG, corners, cards etc)

Respond ONLY in valid JSON (no markdown):
{
  "dayVerdict": "one sentence overview of today's value",
  "fixtures": [
    {
      "name": "exact fixture name",
      "verdict": "one punchy sentence — the key stat story",
      "skip": false,
      "skipReason": null,
      "picks": [
        {
          "market": "market name",
          "cat": "RESULT|GOALS|CORNERS|CARDS|TIMING|PENALTY",
          "odds": 2.10,
          "confidence": "HIGH|MEDIUM",
          "reasoning": "one sentence referencing the stats",
          "stake": "2%"
        }
      ]
    }
  ]
}`,
          }],
        }),
      })

      const aiData = await aiRes.json()
      const rawText = aiData.content?.[0]?.text || '{}'
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) aiPicks = JSON.parse(match[0])
    } catch (e) {
      console.warn('AI synthesis failed, returning raw quant picks:', e.message)
      // Fall back: auto-generate picks from quant model
      aiPicks = {
        dayVerdict: `${enriched.length} fixtures analysed. ${enriched.filter(f => f.valuePicks.length > 0).length} have value picks from the quant model.`,
        fixtures: enriched.map(f => ({
          name: f.name,
          verdict: `Expected ${f.exp.homeGoals}–${f.exp.awayGoals} goals. BTTS ${(f.exp.pBTTS*100).toFixed(0)}%.`,
          skip: f.valuePicks.length === 0,
          skipReason: f.valuePicks.length === 0 ? 'No statistical edge found' : null,
          picks: f.valuePicks.slice(0, 2).map(p => ({
            market: p.market,
            cat: p.cat,
            odds: p.odds,
            confidence: (p.ev || 0) > 0.08 ? 'HIGH' : 'MEDIUM',
            reasoning: `Model probability ${((p.prob||0)*100).toFixed(1)}% vs implied ${((p.impl||0)*100).toFixed(1)}%. EV: ${(p.ev||0).toFixed(3)}.`,
            stake: (p.ev || 0) > 0.08 ? '3%' : '2%',
          })),
        })),
      }
    }

    // ── Merge AI output with fixture data ─────────────────────────────────
    const finalFixtures = enriched.map(fix => {
      const aiF = (aiPicks?.fixtures || []).find(f =>
        f.name === fix.name ||
        fix.name.toLowerCase().includes((f.name || '').toLowerCase().split(' ')[0])
      )
      return { ...fix, ai: aiF || null }
    })

    return res.status(200).json({
      date:         today,
      total:        enriched.length,
      dayVerdict:   aiPicks?.dayVerdict || null,
      parlay,
      fixtures:     finalFixtures,
    })

  } catch (err) {
    console.error('BQP picks error:', err)
    return res.status(500).json({
      error: err.message,
      hint: 'Check Vercel function logs for details',
    })
  }
}

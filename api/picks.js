// api/picks.js — BQP Picks Engine v4.0
// Migrated from Sportmonks → api-football (api-sports.io)
// Fetches fixtures + statistics + predictions + odds in parallel per league

const BASE = 'https://v3.football.api-sports.io'

// Target league IDs (api-football)
const TARGET_LEAGUES = {
  'EPL':                39,
  'La Liga':            140,
  'Bundesliga':         78,
  'Belgian Pro League': 144,
  'Championship':       40,
  'Ligue 1':            61,
  'Serie A':            135,
}

// League stat defaults (used when live stats unavailable)
const LEAGUE_DEFAULTS = {
  39:  { name:'EPL',                avgGoals:2.82, avgCorners:10.1, avgCards:3.2, avgFouls:20.4, penRate:0.28, refStr:68 },
  140: { name:'La Liga',            avgGoals:2.74, avgCorners:10.8, avgCards:4.8, avgFouls:26.4, penRate:0.32, refStr:88 },
  78:  { name:'Bundesliga',         avgGoals:3.16, avgCorners:10.4, avgCards:3.9, avgFouls:22.1, penRate:0.26, refStr:72 },
  144: { name:'Belgian Pro League', avgGoals:2.68, avgCorners:10.3, avgCards:3.7, avgFouls:23.6, penRate:0.26, refStr:74 },
  40:  { name:'Championship',       avgGoals:2.55, avgCorners:9.8,  avgCards:3.5, avgFouls:24.2, penRate:0.22, refStr:66 },
  61:  { name:'Ligue 1',            avgGoals:2.62, avgCorners:10.0, avgCards:3.6, avgFouls:21.8, penRate:0.24, refStr:68 },
  135: { name:'Serie A',            avgGoals:2.58, avgCorners:10.6, avgCards:4.6, avgFouls:24.8, penRate:0.30, refStr:90 },
}

// ── API helper ─────────────────────────────────────────────────────────────────
async function apiFetch(path, token) {
  const r = await fetch(`${BASE}${path}`, {
    headers: {
      'x-apisports-key': token,
      'Accept': 'application/json',
    },
  })
  const text = await r.text()
  if (!r.ok) {
    let msg = `API-Football HTTP ${r.status}`
    try { const j = JSON.parse(text); msg = j.message || j.errors?.[0] || msg } catch(e) {}
    const err = new Error(msg)
    err.status = r.status
    throw err
  }
  try {
    const j = JSON.parse(text)
    // api-football wraps everything in { response: [...] }
    return j.response ?? []
  } catch(e) {
    throw new Error(`API-Football returned invalid JSON: ${text.slice(0,100)}`)
  }
}

// ── Fetch fixture statistics (xG, corners, cards, shots, possession, fouls) ───
async function fetchFixtureStats(fixtureId, token) {
  try {
    const data = await apiFetch(`/fixtures/statistics?fixture=${fixtureId}`, token)
    // Returns array of { team: { id, name }, statistics: [{ type, value }] }
    const result = {}
    for (const teamStats of (data || [])) {
      const teamId = teamStats.team?.id
      if (!teamId) continue
      const stats = {}
      for (const s of (teamStats.statistics || [])) {
        stats[s.type] = s.value
      }
      result[teamId] = stats
    }
    return result
  } catch(e) {
    return {}
  }
}

// ── Fetch fixture events (goals, cards — useful for live enrichment) ───────────
async function fetchFixtureEvents(fixtureId, token) {
  try {
    return await apiFetch(`/fixtures/events?fixture=${fixtureId}`, token)
  } catch(e) {
    return []
  }
}

// ── Fetch odds for a fixture ───────────────────────────────────────────────────
async function fetchFixtureOdds(fixtureId, token) {
  try {
    const data = await apiFetch(`/odds?fixture=${fixtureId}&bookmaker=6`, token) // bookmaker 6 = Bet365
    return data?.[0]?.bookmakers?.[0]?.bets ?? []
  } catch(e) {
    return []
  }
}

// ── Fetch predictions for a fixture ───────────────────────────────────────────
async function fetchFixturePredictions(fixtureId, token) {
  try {
    const data = await apiFetch(`/predictions?fixture=${fixtureId}`, token)
    return data?.[0] ?? null
  } catch(e) {
    return null
  }
}

// ── Parse a specific stat value by type name ──────────────────────────────────
function getStat(statsMap, teamId, typeName) {
  const val = statsMap?.[teamId]?.[typeName]
  if (val === null || val === undefined) return null
  // Some values come as "45%" strings
  if (typeof val === 'string' && val.endsWith('%')) return parseFloat(val)
  return typeof val === 'number' ? val : parseFloat(val) || null
}

// ── Parse odds bets array for a specific market ───────────────────────────────
function parseOddsBet(bets, betName) {
  const bet = bets.find(b => b.name?.toLowerCase().includes(betName.toLowerCase()))
  return bet?.values ?? []
}
function getOddsValue(bets, betName, valueName) {
  const values = parseOddsBet(bets, betName)
  const v = values.find(vv => vv.value?.toLowerCase() === valueName.toLowerCase())
  return v ? parseFloat(v.odd) : null
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const clamp = (v, lo=0.01, hi=0.99) => Math.min(hi, Math.max(lo, isNaN(v)?lo:v))
const fo    = (p, m=0.08) => p > 0.01 ? parseFloat((1/(p*(1+m))).toFixed(2)) : null
const calcEV= (p, o) => (p!=null && o) ? parseFloat((p*o-1).toFixed(4)) : null
const calcK = (p, o, f=0.5) => { if(!p||!o)return null; const b=o-1,k=(p*b-(1-p))/b; return parseFloat(Math.max(0,k*f).toFixed(4)) }

function poisson(l, k) { let p=Math.exp(-l); for(let i=1;i<=k;i++) p*=l/i; return p }
function pOver(l, line) { let c=0; for(let i=0;i<=Math.floor(line);i++) c+=poisson(l,i); return clamp(1-c) }

// ── Market model ───────────────────────────────────────────────────────────────
function buildMarkets(fd) {
  const { hXG, aXG, hGoals, aGoals, hConc, aConc, hCorners, aCorners,
    hYellow, aYellow, hRed, aRed, hFouls, aFouls,
    p1, px, p2, rs, isDerby, mi, lC, lCo, lF, lP, hP } = fd

  const eH = clamp((hXG||hGoals||1.4)*0.55 + (aConc||1.1)*0.45, 0.2, 5)
  const eA = clamp((aXG||aGoals||1.1)*0.55 + (hConc||1.0)*0.45, 0.2, 5)
  const eT = eH + eA
  const pBTTS = (1-Math.exp(-eH))*(1-Math.exp(-eA))

  const cH = hCorners||(lCo||10.2)*0.52
  const cA = aCorners||(lCo||10.2)*0.48
  const cT = cH+cA
  const cP = l => clamp((cT-l+0.5)/(cT*0.75))

  const base = (hYellow||2.0)+(aYellow||1.8)
  const refM = ((rs||65)/65)*0.40+0.60
  const derM = isDerby?1.18:1.00
  const impM = mi==='Derby'?1.15:mi==='Title Decider'?1.12:mi==='Relegation'?1.14:1.00
  const fM   = (hFouls&&aFouls)?((hFouls+aFouls)/((lF||22)*0.95))*0.85+0.15:1.00
  const eY   = base*refM*derM*impM*fM
  const eR   = ((hRed||0.06)+(aRed||0.06))*derM*impM
  const bkPts= eY*10+eR*25

  const ph = clamp(p1||clamp(eH/(eH+eA+0.3)*0.85,0.15,0.80))
  const pd = clamp(px||clamp(0.35-Math.abs(eH-eA)*0.08,0.15,0.45))
  const pa = clamp(1-ph-pd)

  const mkP = (cat, market, prob) => {
    const p  = clamp(prob||0.01)
    const o  = fo(p)
    const ip = o?(1/o)/(1.08):null
    const ev = calcEV(p,o)
    const gap= ip!=null?parseFloat((p-ip).toFixed(4)):null
    return { cat, market, prob:parseFloat(p.toFixed(4)), odds:o,
      impl:ip?parseFloat(ip.toFixed(4)):null, ev, gap,
      kelly:calcK(p,o), isValue:(ev||0)>0.03&&(gap||0)>0.03 }
  }

  const picks = [
    mkP('RESULT',  'Home Win',          ph),
    mkP('RESULT',  'Draw',              pd),
    mkP('RESULT',  'Away Win',          pa),
    mkP('RESULT',  'Double Chance 1X',  ph+pd),
    mkP('RESULT',  'Double Chance X2',  pd+pa),
    mkP('RESULT',  'Draw No Bet Home',  ph/(ph+pa)),
    mkP('RESULT',  'Win to Nil Home',   ph*Math.exp(-eA)),
    mkP('GOALS',   'BTTS Yes',          pBTTS),
    mkP('GOALS',   'BTTS No',           1-pBTTS),
    mkP('GOALS',   'Over 1.5 Goals',    pOver(eT,1.5)),
    mkP('GOALS',   'Over 2.5 Goals',    pOver(eT,2.5)),
    mkP('GOALS',   'Over 3.5 Goals',    pOver(eT,3.5)),
    mkP('GOALS',   'Under 2.5 Goals',   1-pOver(eT,2.5)),
    mkP('GOALS',   'HT Over 0.5 Goals', pOver(eT*0.42,0.5)),
    mkP('CORNERS', 'Over 9.5 Corners',  cP(9.5)),
    mkP('CORNERS', 'Over 10.5 Corners', cP(10.5)),
    mkP('CORNERS', 'Over 11.5 Corners', cP(11.5)),
    mkP('CORNERS', 'Under 10.5 Corners',1-cP(10.5)),
    mkP('CARDS',   'Over 3.5 Cards',    clamp((eY-2.5)/3.2)),
    mkP('CARDS',   'Over 4.5 Cards',    clamp((eY-3.5)/3.2)),
    mkP('CARDS',   'Under 3.5 Cards',   1-clamp((eY-2.5)/3.2)),
    mkP('CARDS',   'Both Teams Carded', clamp((eY-2.5)/3.2*0.85)),
    mkP('CARDS',   'Booking Pts Over 35',clamp((bkPts-30)/25)),
    mkP('TIMING',  'Goal in 1st Half',  pOver(eT*0.42,0.5)),
    mkP('TIMING',  'Late Goal (75-90)', clamp((hP||0.55)*0.4+0.18)),
    mkP('PENALTY', 'Penalty Awarded',   clamp(lP||0.28,0.10,0.38)),
  ]

  const valuePicks = picks.filter(p=>p.isValue).sort((a,b)=>(b.ev||0)-(a.ev||0))
  const topPick    = valuePicks[0] ?? picks.sort((a,b)=>(b.ev||0)-(a.ev||0))[0] ?? null

  return {
    picks, valuePicks, topPick,
    exp: {
      goals:parseFloat(eT.toFixed(2)), homeGoals:parseFloat(eH.toFixed(2)), awayGoals:parseFloat(eA.toFixed(2)),
      corners:parseFloat(cT.toFixed(1)), cards:parseFloat(eY.toFixed(2)),
      bookPts:parseFloat(bkPts.toFixed(1)), pBTTS:parseFloat(pBTTS.toFixed(3)),
      pOver25:parseFloat(pOver(eT,2.5).toFixed(3)),
    },
    result: { p1:parseFloat(ph.toFixed(3)), px:parseFloat(pd.toFixed(3)), p2:parseFloat(pa.toFixed(3)) },
  }
}

// ── Parlay builder ─────────────────────────────────────────────────────────────
function buildParlay(fixtures) {
  const pool = fixtures
    .filter(f=>f.topPick&&(f.topPick.ev||0)>0)
    .map(f=>({...f.topPick,match:f.name,league:f.league}))
  if (pool.length<2) return null
  const eligible=pool.slice(0,8)
  const nLegs=Math.min(4,eligible.length)
  let bestEV=-Infinity,bestCombo=[]
  const combo=(start,cur)=>{
    if(cur.length===nLegs){
      const ev=cur.reduce((a,p)=>a*(p.prob||0),1)*cur.reduce((a,p)=>a*(p.odds||1),1)-1
      if(ev>bestEV){bestEV=ev;bestCombo=[...cur]};return
    }
    for(let i=start;i<eligible.length;i++)combo(i+1,[...cur,eligible[i]])
  }
  combo(0,[])
  if(!bestCombo.length)return null
  const totOdds=bestCombo.reduce((a,p)=>a*(p.odds||1),1)
  const totProb=bestCombo.reduce((a,p)=>a*(p.prob||0),1)
  return {legs:bestCombo,totOdds:parseFloat(totOdds.toFixed(2)),totProb:parseFloat(totProb.toFixed(4)),ev:parseFloat((totProb*totOdds-1).toFixed(3)),kelly:parseFloat(Math.max(0,((totProb*(totOdds-1)-(1-totProb))/(totOdds-1))*0.25).toFixed(3))}
}

// ── AI synthesis ───────────────────────────────────────────────────────────────
async function synthesiseWithAI(enriched, aiKey) {
  const ctx = enriched.map(f=>{
    const vp=f.valuePicks.slice(0,4).map(p=>`${p.market}@${p.odds}(EV:${(p.ev||0).toFixed(3)})`).join(', ')
    return `${f.name} (${f.league}) KO:${f.kickoff}
xG: ${f.exp.homeGoals}–${f.exp.awayGoals} | BTTS:${(f.exp.pBTTS*100).toFixed(0)}% | O2.5:${(f.exp.pOver25*100).toFixed(0)}%
Corners:${f.exp.corners} | Cards:${f.exp.cards} | BookPts:${f.exp.bookPts}
Win%: H${(f.result.p1*100).toFixed(0)} D${(f.result.px*100).toFixed(0)} A${(f.result.p2*100).toFixed(0)}
Top pick: ${f.topPick?.market||'none'} @${f.topPick?.odds||'—'} EV:${(f.topPick?.ev||0).toFixed(3)}
Value picks: ${vp||'none'}`
  }).join('\n\n---\n\n')

  const r = await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':aiKey,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({
      model:'claude-sonnet-4-5',max_tokens:4000,
      messages:[{role:'user',content:`You are an expert quant betting analyst. Statistical models have analysed every fixture. Synthesise into clear, confident picks for punters.

FIXTURES:
${ctx}

Rules:
- Select 1-3 BEST bets per fixture where EV > 0 and model probability > implied
- Skip fixtures with no genuine edge (skip:true)
- Stake: HIGH confidence = 3-5%, MEDIUM = 1-2% of bankroll
- One sentence reasoning referencing actual stats (xG, corners, cards etc)

Return ONLY valid JSON (no markdown):
{
  "dayVerdict": "one sentence overview",
  "fixtures": [
    {
      "name": "exact name",
      "verdict": "key stat story in one sentence",
      "skip": false,
      "skipReason": null,
      "picks": [
        {"market":"name","cat":"RESULT|GOALS|CORNERS|CARDS|TIMING|PENALTY","odds":2.10,"confidence":"HIGH|MEDIUM","reasoning":"one sentence with stats","stake":"2%"}
      ]
    }
  ]
}`}],
    }),
  })
  const d=await r.json()
  const raw=d.content?.[0]?.text||'{}'
  const match=raw.match(/\{[\s\S]*\}/)
  return match?JSON.parse(match[0]):null
}

// ── Fallback AI picks from quant data ──────────────────────────────────────────
function quantFallbackPicks(enriched) {
  return {
    dayVerdict:`${enriched.length} fixtures analysed. ${enriched.filter(f=>f.valuePicks.length>0).length} have value picks.`,
    fixtures:enriched.map(f=>({
      name:f.name,
      verdict:`Expected ${f.exp.homeGoals}–${f.exp.awayGoals} goals. BTTS ${(f.exp.pBTTS*100).toFixed(0)}%. Over 2.5: ${(f.exp.pOver25*100).toFixed(0)}%.`,
      skip:f.valuePicks.length===0,
      skipReason:f.valuePicks.length===0?'No statistical edge found in this fixture.':null,
      picks:f.valuePicks.slice(0,2).map(p=>({
        market:p.market, cat:p.cat, odds:p.odds,
        confidence:(p.ev||0)>0.08?'HIGH':'MEDIUM',
        reasoning:`Model probability ${((p.prob||0)*100).toFixed(1)}% vs implied ${((p.impl||0)*100).toFixed(1)}%. Value gap: ${((p.gap||0)*100).toFixed(1)}%.`,
        stake:(p.ev||0)>0.08?'3%':'2%',
      })),
    })),
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const apiToken = process.env.API_FOOTBALL_KEY
  const aiKey    = process.env.ANTHROPIC_API_KEY

  if (!apiToken) return res.status(200).json({
    error:true,
    errorType:'MISSING_KEY',
    errorMessage:'API_FOOTBALL_KEY is not set in Vercel Environment Variables.',
    errorFix:'Vercel → Your Project → Settings → Environment Variables → Add API_FOOTBALL_KEY (from dashboard.api-football.com)',
    fixtures:[],parlay:null,total:0,
  })

  if (!aiKey) return res.status(200).json({
    error:true,
    errorType:'MISSING_KEY',
    errorMessage:'ANTHROPIC_API_KEY is not set in Vercel Environment Variables.',
    errorFix:'console.anthropic.com → API Keys → Create Key → Add to Vercel as ANTHROPIC_API_KEY',
    fixtures:[],parlay:null,total:0,
  })

  try {
    const today = new Date().toISOString().split('T')[0]
    const season = new Date().getFullYear()

    // ── STEP 1: Fetch today's fixtures for all target leagues in parallel ──────
    const leagueFixtureResults = await Promise.allSettled(
      Object.entries(TARGET_LEAGUES).map(async ([leagueName, leagueId]) => {
        const data = await apiFetch(
          `/fixtures?league=${leagueId}&season=${season}&date=${today}`,
          apiToken
        )
        return (data || []).map(f => ({ ...f, _leagueName: leagueName, _leagueId: leagueId }))
      })
    )

    let allFixtures = []
    let planWarning = null

    for (const result of leagueFixtureResults) {
      if (result.status === 'fulfilled') {
        allFixtures = allFixtures.concat(result.value)
      } else {
        const err = result.reason
        if (err?.status === 401) {
          return res.status(200).json({
            error:true, errorType:'INVALID_KEY',
            errorMessage:'Your API-Football key is invalid or expired.',
            errorFix:'Go to dashboard.api-football.com → My Subscriptions → copy your API key and update API_FOOTBALL_KEY in Vercel.',
            fixtures:[],parlay:null,total:0,
          })
        }
        if (err?.status === 403) {
          planWarning = 'Some leagues may require a paid API-Football plan. Visit api-football.com/pricing to upgrade.'
        }
      }
    }

    if (!allFixtures.length) {
      return res.status(200).json({
        date:today, total:0, fixtures:[], parlay:null,
        planWarning,
        dayVerdict:`No fixtures found today (${today}). Check back on a matchday.`,
        message:'No fixtures today',
      })
    }

    // ── STEP 2: For each fixture, fetch stats + predictions in parallel ─────────
    // We batch these to avoid hammering the API — max 10 concurrent
    const BATCH_SIZE = 10
    const enrichedRaw = []

    for (let i = 0; i < allFixtures.length; i += BATCH_SIZE) {
      const batch = allFixtures.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.allSettled(
        batch.map(async (fix) => {
          const fixtureId = fix.fixture?.id
          if (!fixtureId) return { fix, stats: {}, predictions: null, odds: [] }

          const isLiveOrFinished = ['1H','HT','2H','ET','P','FT','AET','PEN'].includes(fix.fixture?.status?.short)

          // Always fetch predictions; only fetch live stats if match is in progress or done
          const [predictions, stats, oddsBets] = await Promise.allSettled([
            fetchFixturePredictions(fixtureId, apiToken),
            isLiveOrFinished ? fetchFixtureStats(fixtureId, apiToken) : Promise.resolve({}),
            fetchFixtureOdds(fixtureId, apiToken),
          ])

          return {
            fix,
            stats:       stats.status === 'fulfilled'       ? stats.value       : {},
            predictions: predictions.status === 'fulfilled' ? predictions.value : null,
            oddsBets:    oddsBets.status === 'fulfilled'     ? oddsBets.value    : [],
          }
        })
      )
      for (const r of batchResults) {
        if (r.status === 'fulfilled') enrichedRaw.push(r.value)
      }
    }

    // ── STEP 3: Enrich each fixture with market model ─────────────────────────
    const enriched = enrichedRaw.map(({ fix, stats, predictions, oddsBets }) => {
      try {
        const home = fix.teams?.home
        const away = fix.teams?.away
        if (!home || !away) return null

        const leagueId   = fix._leagueId
        const ld         = LEAGUE_DEFAULTS[leagueId] ?? LEAGUE_DEFAULTS[39]
        const state      = fix.fixture?.status?.short ?? 'NS'
        const leagueName = fix._leagueName ?? fix.league?.name ?? 'Unknown'

        // ── Pull live stats if available ──
        const hId = home.id
        const aId = away.id

        const hXG  = getStat(stats, hId, 'expected_goals')
        const aXG  = getStat(stats, aId, 'expected_goals')
        const hPoss= getStat(stats, hId, 'Ball Possession')  // comes as "55%"
        const aPoss= getStat(stats, aId, 'Ball Possession')
        const hSoT = getStat(stats, hId, 'Shots on Goal')
        const aSoT = getStat(stats, aId, 'Shots on Goal')
        const hCorners = getStat(stats, hId, 'Corner Kicks')
        const aCorners = getStat(stats, aId, 'Corner Kicks')
        const hYellow  = getStat(stats, hId, 'Yellow Cards')
        const aYellow  = getStat(stats, aId, 'Yellow Cards')
        const hRed     = getStat(stats, hId, 'Red Cards')
        const aRed     = getStat(stats, aId, 'Red Cards')
        const hFouls   = getStat(stats, hId, 'Total passes') // fallback — fouls not always in API
        const aFouls   = getStat(stats, aId, 'Total passes')

        // ── Pull predictions ──
        const pred = predictions?.predictions
        const p1   = pred?.percent?.home ? parseInt(pred.percent.home) / 100 : null
        const px   = pred?.percent?.draw ? parseInt(pred.percent.draw) / 100 : null
        const p2   = pred?.percent?.away ? parseInt(pred.percent.away) / 100 : null

        // ── Pull bookmaker odds from oddsBets ──
        const homeOdds = getOddsValue(oddsBets, 'Match Winner', 'Home')
        const drawOdds = getOddsValue(oddsBets, 'Match Winner', 'Draw')
        const awayOdds = getOddsValue(oddsBets, 'Match Winner', 'Away')

        // ── Build fixture data for market engine ──
        const fd = {
          hXG:      hXG   ?? null,
          aXG:      aXG   ?? null,
          hGoals:   ld.avgGoals / 2,
          aGoals:   ld.avgGoals / 2,
          hConc:    ld.avgGoals / 2,
          aConc:    ld.avgGoals / 2,
          hCorners: hCorners ?? ld.avgCorners * 0.52,
          aCorners: aCorners ?? ld.avgCorners * 0.48,
          hYellow:  hYellow  ?? ld.avgCards / 2,
          aYellow:  aYellow  ?? ld.avgCards / 2,
          hRed:     hRed     ?? 0.06,
          aRed:     aRed     ?? 0.06,
          hFouls:   ld.avgFouls / 2,
          aFouls:   ld.avgFouls / 2,
          hP:       hPoss ? hPoss / 100 : 0.55,
          p1, px, p2,
          rs:       ld.refStr,
          isDerby:  false,
          mi:       'Regular',
          lC:       ld.avgCards,
          lCo:      ld.avgCorners,
          lF:       ld.avgFouls,
          lP:       ld.penRate,
        }

        const markets = buildMarkets(fd)

        // ── Current score ──
        const homeGoals = fix.goals?.home ?? 0
        const awayGoals = fix.goals?.away ?? 0

        return {
          id:       fix.fixture.id,
          name:     `${home.name} vs ${away.name}`,
          league:   leagueName,
          leagueId,
          kickoff:  fix.fixture.date,
          state,
          score:    { home: homeGoals, away: awayGoals },
          homeTeam: { id: home.id, name: home.name, image: home.logo },
          awayTeam: { id: away.id, name: away.name, image: away.logo },
          referee:  fix.fixture?.referee ?? 'TBC',
          // Live stat snapshot (shown in UI)
          liveStats: {
            home: { xg: hXG, possession: hPoss, shotsOnTarget: hSoT, corners: hCorners, yellowCards: hYellow },
            away: { xg: aXG, possession: aPoss, shotsOnTarget: aSoT, corners: aCorners, yellowCards: aYellow },
          },
          // Bookmaker odds snapshot
          bookOdds: { home: homeOdds, draw: drawOdds, away: awayOdds },
          markets,
          topPick:    markets.topPick,
          valuePicks: markets.valuePicks,
          exp:        markets.exp,
          result:     markets.result,
        }
      } catch(e) {
        console.warn(`Fixture ${fix.fixture?.id} failed:`, e.message)
        return null
      }
    }).filter(Boolean)

    if (!enriched.length) {
      return res.status(200).json({
        date:today,total:0,fixtures:[],parlay:null,planWarning,
        dayVerdict:'Fixtures were returned but could not be processed. Please try again.',
      })
    }

    // ── STEP 4: Build parlay ───────────────────────────────────────────────────
    const parlay = buildParlay(enriched)

    // ── STEP 5: AI synthesis ──────────────────────────────────────────────────
    let aiPicks = null
    try {
      aiPicks = await synthesiseWithAI(enriched, aiKey)
    } catch(e) {
      console.warn('AI synthesis failed, using quant fallback:', e.message)
      aiPicks = quantFallbackPicks(enriched)
    }
    if (!aiPicks) aiPicks = quantFallbackPicks(enriched)

    // ── STEP 6: Merge & return ────────────────────────────────────────────────
    const finalFixtures = enriched.map(fix => {
      const aiF = (aiPicks.fixtures||[]).find(f =>
        f.name === fix.name ||
        fix.name.toLowerCase().includes((f.name||'').toLowerCase().split(' ')[0])
      )
      return { ...fix, ai: aiF || null }
    })

    return res.status(200).json({
      date:    today,
      total:   enriched.length,
      leagues: Object.keys(TARGET_LEAGUES),
      planWarning: planWarning || null,
      dayVerdict:  aiPicks.dayVerdict || null,
      parlay,
      fixtures: finalFixtures,
    })

  } catch(err) {
    console.error('BQP picks error:', err)
    return res.status(500).json({
      error: true,
      errorType: 'SERVER_ERROR',
      errorMessage: err.message,
      hint: 'Check Vercel function logs: Vercel Dashboard → Your Project → Functions → picks → View logs',
    })
  }
}

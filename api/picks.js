// api/picks.js — BQP Picks Engine v5.0
// Fixes: season detection, date param, tomorrow support, robust error handling

const BASE = 'https://v3.football.api-sports.io'

const TARGET_LEAGUES = {
  'EPL':                39,
  'La Liga':            140,
  'Bundesliga':         78,
  'Belgian Pro League': 144,
  'Championship':       40,
  'Ligue 1':            61,
  'Serie A':            135,
}

const LEAGUE_DEFAULTS = {
  39:  { name:'EPL',                avgGoals:2.82, avgCorners:10.1, avgCards:3.2, avgFouls:20.4, penRate:0.28, refStr:68 },
  140: { name:'La Liga',            avgGoals:2.74, avgCorners:10.8, avgCards:4.8, avgFouls:26.4, penRate:0.32, refStr:88 },
  78:  { name:'Bundesliga',         avgGoals:3.16, avgCorners:10.4, avgCards:3.9, avgFouls:22.1, penRate:0.26, refStr:72 },
  144: { name:'Belgian Pro League', avgGoals:2.68, avgCorners:10.3, avgCards:3.7, avgFouls:23.6, penRate:0.26, refStr:74 },
  40:  { name:'Championship',       avgGoals:2.55, avgCorners:9.8,  avgCards:3.5, avgFouls:24.2, penRate:0.22, refStr:66 },
  61:  { name:'Ligue 1',            avgGoals:2.62, avgCorners:10.0, avgCards:3.6, avgFouls:21.8, penRate:0.24, refStr:68 },
  135: { name:'Serie A',            avgGoals:2.58, avgCorners:10.6, avgCards:4.6, avgFouls:24.8, penRate:0.30, refStr:90 },
}

// ── CRITICAL: Season detection for cross-year leagues ─────────────────────────
// Most European leagues run Aug-May, so on 2025-04-03 the season is 2024 not 2025
function detectSeason(leagueId, dateStr) {
  const date  = new Date(dateStr)
  const year  = date.getFullYear()
  const month = date.getMonth() + 1  // 1-12

  // Leagues that run Aug-May: season year = start year
  // If we're Jan-Jul, the current season started the previous year
  const crossYearLeagues = [39, 140, 78, 144, 40, 61, 135]
  if (crossYearLeagues.includes(leagueId)) {
    // Season starts around Aug/Sep. If month is Jan-Jun, season = year-1
    return month <= 6 ? year - 1 : year
  }
  // Summer leagues: season = current year
  return year
}

async function apiFetch(path, token) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'x-apisports-key': token, 'Accept': 'application/json' },
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
    // Check for API-level errors in response body
    if (j.errors && Object.keys(j.errors).length > 0) {
      throw new Error(JSON.stringify(j.errors))
    }
    return j.response ?? []
  } catch(e) {
    if (e.message.startsWith('{')) throw e
    throw new Error(`Invalid JSON: ${text.slice(0,100)}`)
  }
}

async function fetchPredictions(fixtureId, token) {
  try {
    const d = await apiFetch(`/predictions?fixture=${fixtureId}`, token)
    return d?.[0] ?? null
  } catch(e) { return null }
}

async function fetchOdds(fixtureId, token) {
  try {
    const d = await apiFetch(`/odds?fixture=${fixtureId}&bookmaker=6`, token)
    return d?.[0]?.bookmakers?.[0]?.bets ?? []
  } catch(e) { return [] }
}

// ── Market math ───────────────────────────────────────────────────────────────
const clamp = (v, lo=0.01, hi=0.99) => Math.min(hi, Math.max(lo, isNaN(v)?lo:v))
const fo    = (p, m=0.08) => p > 0.01 ? parseFloat((1/(p*(1+m))).toFixed(2)) : null
const calcEV= (p, o) => (p!=null && o) ? parseFloat((p*o-1).toFixed(4)) : null
const calcK = (p, o, f=0.5) => { if(!p||!o)return null; const b=o-1,k=(p*b-(1-p))/b; return parseFloat(Math.max(0,k*f).toFixed(4)) }
function poisson(l, k) { let p=Math.exp(-l); for(let i=1;i<=k;i++) p*=l/i; return p }
function pOver(l, line) { let c=0; for(let i=0;i<=Math.floor(line);i++) c+=poisson(l,i); return clamp(1-c) }

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
      impl:ip?parseFloat(ip.toFixed(4)):null, ev, gap, kelly:calcK(p,o),
      isValue:(ev||0)>0.03&&(gap||0)>0.03 }
  }

  const picks = [
    mkP('RESULT', 'Home Win',           ph),
    mkP('RESULT', 'Draw',               pd),
    mkP('RESULT', 'Away Win',           pa),
    mkP('RESULT', 'Double Chance 1X',   ph+pd),
    mkP('RESULT', 'Double Chance X2',   pd+pa),
    mkP('RESULT', 'Draw No Bet Home',   ph/(ph+pa)),
    mkP('RESULT', 'Win to Nil Home',    ph*Math.exp(-eA)),
    mkP('GOALS',  'BTTS Yes',           pBTTS),
    mkP('GOALS',  'BTTS No',            1-pBTTS),
    mkP('GOALS',  'Over 1.5 Goals',     pOver(eT,1.5)),
    mkP('GOALS',  'Over 2.5 Goals',     pOver(eT,2.5)),
    mkP('GOALS',  'Over 3.5 Goals',     pOver(eT,3.5)),
    mkP('GOALS',  'Under 2.5 Goals',    1-pOver(eT,2.5)),
    mkP('GOALS',  'HT Over 0.5 Goals',  pOver(eT*0.42,0.5)),
    mkP('CORNERS','Over 9.5 Corners',   cP(9.5)),
    mkP('CORNERS','Over 10.5 Corners',  cP(10.5)),
    mkP('CORNERS','Over 11.5 Corners',  cP(11.5)),
    mkP('CORNERS','Under 10.5 Corners', 1-cP(10.5)),
    mkP('CARDS',  'Over 3.5 Cards',     clamp((eY-2.5)/3.2)),
    mkP('CARDS',  'Over 4.5 Cards',     clamp((eY-3.5)/3.2)),
    mkP('CARDS',  'Under 3.5 Cards',    1-clamp((eY-2.5)/3.2)),
    mkP('CARDS',  'Both Teams Carded',  clamp((eY-2.5)/3.2*0.85)),
    mkP('CARDS',  'Booking Pts Over 35',clamp((bkPts-30)/25)),
    mkP('TIMING', 'Goal in 1st Half',   pOver(eT*0.42,0.5)),
    mkP('TIMING', 'Late Goal (75-90)',  clamp((hP||0.55)*0.4+0.18)),
    mkP('PENALTY','Penalty Awarded',    clamp(lP||0.28,0.10,0.38)),
  ]

  const valuePicks = picks.filter(p=>p.isValue).sort((a,b)=>(b.ev||0)-(a.ev||0))
  const topPick    = valuePicks[0] ?? picks.sort((a,b)=>(b.ev||0)-(a.ev||0))[0] ?? null

  return {
    picks, valuePicks, topPick,
    exp:{
      goals:parseFloat(eT.toFixed(2)), homeGoals:parseFloat(eH.toFixed(2)),
      awayGoals:parseFloat(eA.toFixed(2)), corners:parseFloat(cT.toFixed(1)),
      cards:parseFloat(eY.toFixed(2)), bookPts:parseFloat(bkPts.toFixed(1)),
      pBTTS:parseFloat(pBTTS.toFixed(3)), pOver25:parseFloat(pOver(eT,2.5).toFixed(3)),
    },
    result:{ p1:parseFloat(ph.toFixed(3)), px:parseFloat(pd.toFixed(3)), p2:parseFloat(pa.toFixed(3)) },
  }
}

function buildParlay(fixtures) {
  const pool = fixtures.filter(f=>f.topPick&&(f.topPick.ev||0)>0)
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
  return {legs:bestCombo,totOdds:parseFloat(totOdds.toFixed(2)),totProb:parseFloat(totProb.toFixed(4)),
    ev:parseFloat((totProb*totOdds-1).toFixed(3)),
    kelly:parseFloat(Math.max(0,((totProb*(totOdds-1)-(1-totProb))/(totOdds-1))*0.25).toFixed(3))}
}

async function synthesiseWithAI(enriched, aiKey, dateLabel) {
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
      messages:[{role:'user',content:`You are an expert quant betting analyst. Synthesise into clear picks for punters.

DATE: ${dateLabel}
FIXTURES:
${ctx}

Rules:
- Select 1-3 BEST bets per fixture where EV > 0 and model probability > implied
- Skip fixtures with no genuine edge (skip:true)
- Stake: HIGH confidence = 3-5%, MEDIUM = 1-2% of bankroll
- One sentence reasoning referencing actual stats

Return ONLY valid JSON:
{
  "dayVerdict": "one sentence overview",
  "fixtures": [
    {
      "name": "exact name",
      "verdict": "key stat story",
      "skip": false,
      "skipReason": null,
      "picks": [
        {"market":"name","cat":"RESULT|GOALS|CORNERS|CARDS|TIMING|PENALTY","odds":2.10,"confidence":"HIGH|MEDIUM","reasoning":"one sentence","stake":"2%"}
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

function quantFallback(enriched) {
  return {
    dayVerdict:`${enriched.length} fixtures analysed. ${enriched.filter(f=>f.valuePicks.length>0).length} have value picks.`,
    fixtures:enriched.map(f=>({
      name:f.name,
      verdict:`Expected ${f.exp.homeGoals}–${f.exp.awayGoals} goals. BTTS ${(f.exp.pBTTS*100).toFixed(0)}%. Over 2.5: ${(f.exp.pOver25*100).toFixed(0)}%.`,
      skip:f.valuePicks.length===0,
      skipReason:f.valuePicks.length===0?'No statistical edge found.':null,
      picks:f.valuePicks.slice(0,2).map(p=>({
        market:p.market, cat:p.cat, odds:p.odds,
        confidence:(p.ev||0)>0.08?'HIGH':'MEDIUM',
        reasoning:`Model ${((p.prob||0)*100).toFixed(1)}% vs implied ${((p.impl||0)*100).toFixed(1)}%. EV: ${(p.ev||0).toFixed(3)}.`,
        stake:(p.ev||0)>0.08?'3%':'2%',
      })),
    })),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const apiToken = process.env.API_FOOTBALL_KEY
  const aiKey    = process.env.ANTHROPIC_API_KEY

  if (!apiToken) return res.status(200).json({
    error:true, errorType:'MISSING_KEY',
    errorMessage:'API_FOOTBALL_KEY is not set in Vercel Environment Variables.',
    errorFix:'Vercel → Your Project → Settings → Environment Variables → Add API_FOOTBALL_KEY (from dashboard.api-football.com)',
    fixtures:[],parlay:null,total:0,
  })
  if (!aiKey) return res.status(200).json({
    error:true, errorType:'MISSING_KEY',
    errorMessage:'ANTHROPIC_API_KEY is not set in Vercel Environment Variables.',
    errorFix:'console.anthropic.com → API Keys → Create → Add as ANTHROPIC_API_KEY in Vercel',
    fixtures:[],parlay:null,total:0,
  })

  try {
    // ── Date: today or tomorrow ──────────────────────────────────────────────
    const queryDate = req.query?.date  // "today" | "tomorrow" | "YYYY-MM-DD"
    const now       = new Date()
    let targetDate  = new Date(now)

    if (queryDate === 'tomorrow') {
      targetDate.setDate(targetDate.getDate() + 1)
    } else if (queryDate && queryDate !== 'today' && queryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      targetDate = new Date(queryDate)
    }

    const dateStr   = targetDate.toISOString().split('T')[0]
    const dateLabel = queryDate === 'tomorrow' ? 'TOMORROW' : 'TODAY'

    // ── Fetch fixtures for all leagues ───────────────────────────────────────
    const leagueResults = await Promise.allSettled(
      Object.entries(TARGET_LEAGUES).map(async ([leagueName, leagueId]) => {
        const season = detectSeason(leagueId, dateStr)
        const data = await apiFetch(
          `/fixtures?league=${leagueId}&season=${season}&date=${dateStr}`,
          apiToken
        )
        return (data || []).map(f => ({ ...f, _leagueName: leagueName, _leagueId: leagueId }))
      })
    )

    let allFixtures = []
    let planWarning = null

    for (const r of leagueResults) {
      if (r.status === 'fulfilled') {
        allFixtures = allFixtures.concat(r.value)
      } else {
        const e = r.reason
        if (e?.status === 401) {
          return res.status(200).json({
            error:true, errorType:'INVALID_KEY',
            errorMessage:'Your API-Football key is invalid or expired.',
            errorFix:'Go to dashboard.api-football.com → My Subscriptions → copy your API key → update API_FOOTBALL_KEY in Vercel.',
            fixtures:[],parlay:null,total:0,
          })
        }
        if (e?.status === 403) planWarning = 'Some leagues require a paid API-Football plan.'
      }
    }

    if (!allFixtures.length) {
      return res.status(200).json({
        date:dateStr, dateLabel, total:0, fixtures:[], parlay:null, planWarning,
        dayVerdict:`No fixtures found for ${dateLabel.toLowerCase()} (${dateStr}) in the selected leagues. ${dateLabel==='TODAY'?'Try tomorrow\'s picks instead.':''}`,
      })
    }

    // ── Enrich fixtures: fetch predictions + odds ────────────────────────────
    // Free plan: 100 req/min — batch carefully, skip odds for large days
    const BATCH = 8
    const enrichedRaw = []
    for (let i=0;i<allFixtures.length;i+=BATCH) {
      const batch = allFixtures.slice(i,i+BATCH)
      const results = await Promise.allSettled(
        batch.map(async fix => {
          const fixtureId = fix.fixture?.id
          if (!fixtureId) return {fix,predictions:null,oddsBets:[]}
          const [preds,odds] = await Promise.allSettled([
            fetchPredictions(fixtureId, apiToken),
            fetchOdds(fixtureId, apiToken),
          ])
          return {
            fix,
            predictions: preds.status==='fulfilled'?preds.value:null,
            oddsBets:    odds.status==='fulfilled'?odds.value:[],
          }
        })
      )
      for (const r of results) {
        if (r.status==='fulfilled') enrichedRaw.push(r.value)
      }
    }

    // ── Build market model per fixture ───────────────────────────────────────
    const enriched = enrichedRaw.map(({fix,predictions,oddsBets})=>{
      try {
        const home = fix.teams?.home
        const away = fix.teams?.away
        if (!home||!away) return null

        const leagueId   = fix._leagueId
        const ld         = LEAGUE_DEFAULTS[leagueId] ?? LEAGUE_DEFAULTS[39]
        const state      = fix.fixture?.status?.short ?? 'NS'
        const leagueName = fix._leagueName ?? 'Unknown'
        const pred       = predictions?.predictions
        const p1 = pred?.percent?.home ? parseInt(pred.percent.home)/100 : null
        const px = pred?.percent?.draw ? parseInt(pred.percent.draw)/100 : null
        const p2 = pred?.percent?.away ? parseInt(pred.percent.away)/100 : null

        // Parse live stats (only available for in-progress/completed matches)
        const stats = fix.statistics ?? []
        const gS = (tid, type) => {
          const s = stats.find(t=>t.team?.id===tid)
          const v = s?.statistics?.find(x=>x.type===type)?.value
          if (v===null||v===undefined) return null
          if (typeof v==='string'&&v.endsWith('%')) return parseFloat(v)
          return typeof v==='number'?v:parseFloat(v)||null
        }

        const fd = {
          hXG:null, aXG:null,
          hGoals:ld.avgGoals/2, aGoals:ld.avgGoals/2,
          hConc:ld.avgGoals/2,  aConc:ld.avgGoals/2,
          hCorners:gS(home.id,'Corner Kicks')??ld.avgCorners*0.52,
          aCorners:gS(away.id,'Corner Kicks')??ld.avgCorners*0.48,
          hYellow:gS(home.id,'Yellow Cards')??ld.avgCards/2,
          aYellow:gS(away.id,'Yellow Cards')??ld.avgCards/2,
          hRed:gS(home.id,'Red Cards')??0.06,
          aRed:gS(away.id,'Red Cards')??0.06,
          hFouls:gS(home.id,'Fouls')??ld.avgFouls/2,
          aFouls:gS(away.id,'Fouls')??ld.avgFouls/2,
          hP:gS(home.id,'Ball Possession')!=null?(gS(home.id,'Ball Possession')/100):0.55,
          p1, px, p2,
          rs:ld.refStr, isDerby:false, mi:'Regular',
          lC:ld.avgCards, lCo:ld.avgCorners, lF:ld.avgFouls, lP:ld.penRate,
        }

        const markets = buildMarkets(fd)

        return {
          id:       fix.fixture.id,
          name:     `${home.name} vs ${away.name}`,
          league:   leagueName,
          leagueId,
          kickoff:  fix.fixture.date,
          state,
          score:    {home:fix.goals?.home??0, away:fix.goals?.away??0},
          homeTeam: {id:home.id, name:home.name, image:home.logo},
          awayTeam: {id:away.id, name:away.name, image:away.logo},
          referee:  fix.fixture?.referee??'TBC',
          predictions:pred?{homeWinPct:pred.percent?.home,drawPct:pred.percent?.draw,awayWinPct:pred.percent?.away,winner:pred.winner?.name,advice:pred.advice}:null,
          markets, topPick:markets.topPick,
          valuePicks:markets.valuePicks,
          exp:markets.exp, result:markets.result,
        }
      } catch(e) {
        console.warn(`Fixture ${fix.fixture?.id} failed:`, e.message)
        return null
      }
    }).filter(Boolean)

    if (!enriched.length) {
      return res.status(200).json({
        date:dateStr, dateLabel, total:0, fixtures:[], parlay:null, planWarning,
        dayVerdict:`Fixtures found but could not be processed. Please try again.`,
      })
    }

    const parlay = buildParlay(enriched)

    let aiPicks = null
    try { aiPicks = await synthesiseWithAI(enriched, aiKey, dateLabel) } catch(e) {}
    if (!aiPicks) aiPicks = quantFallback(enriched)

    const finalFixtures = enriched.map(fix=>{
      const aiF=(aiPicks.fixtures||[]).find(f=>
        f.name===fix.name||fix.name.toLowerCase().includes((f.name||'').toLowerCase().split(' ')[0])
      )
      return {...fix, ai:aiF||null}
    })

    return res.status(200).json({
      date:dateStr, dateLabel, total:enriched.length,
      leagues:Object.keys(TARGET_LEAGUES),
      planWarning:planWarning||null,
      dayVerdict:aiPicks.dayVerdict||null,
      parlay, fixtures:finalFixtures,
    })

  } catch(err) {
    console.error('BQP picks error:', err)
    return res.status(500).json({
      error:true, errorType:'SERVER_ERROR',
      errorMessage:err.message,
      hint:'Check Vercel function logs for details',
    })
  }
}

// api/picks.js — BQP Picks Engine v3.0
// Robust: auto-detects plan limits, graceful fallback, clear error messages

const BASE = 'https://api.sportmonks.com/v3/football'

// All 7 target leagues
const TARGET_LEAGUES = {
  'EPL':                8,
  'La Liga':            564,
  'Bundesliga':         82,
  'Belgian Pro League': 4,
  'Championship':       9,
  'Ligue 1':            301,
  'Serie A':            384,
}

// Free plan leagues (always available)
const FREE_LEAGUES = {
  'Scottish Premiership': 501,
  'Danish Superliga':     271,
}

// League stat defaults
const LEAGUE_DEFAULTS = {
  8:   { name:'EPL',                avgGoals:2.82, avgCorners:10.1, avgCards:3.2, avgFouls:20.4, penRate:0.28, refStr:68 },
  564: { name:'La Liga',            avgGoals:2.74, avgCorners:10.8, avgCards:4.8, avgFouls:26.4, penRate:0.32, refStr:88 },
  82:  { name:'Bundesliga',         avgGoals:3.16, avgCorners:10.4, avgCards:3.9, avgFouls:22.1, penRate:0.26, refStr:72 },
  4:   { name:'Belgian Pro League', avgGoals:2.68, avgCorners:10.3, avgCards:3.7, avgFouls:23.6, penRate:0.26, refStr:74 },
  9:   { name:'Championship',       avgGoals:2.55, avgCorners:9.8,  avgCards:3.5, avgFouls:24.2, penRate:0.22, refStr:66 },
  301: { name:'Ligue 1',            avgGoals:2.62, avgCorners:10.0, avgCards:3.6, avgFouls:21.8, penRate:0.24, refStr:68 },
  384: { name:'Serie A',            avgGoals:2.58, avgCorners:10.6, avgCards:4.6, avgFouls:24.8, penRate:0.30, refStr:90 },
  501: { name:'Scottish Prem',      avgGoals:2.60, avgCorners:10.2, avgCards:3.8, avgFouls:22.0, penRate:0.25, refStr:70 },
  271: { name:'Danish Superliga',   avgGoals:2.70, avgCorners:10.0, avgCards:3.4, avgFouls:21.0, penRate:0.24, refStr:65 },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function smFetch(path, token) {
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`${BASE}${path}${sep}api_token=${token}`, {
    headers: { 'Accept': 'application/json' },
  })
  const text = await r.text()
  if (!r.ok) {
    let msg = `Sportmonks HTTP ${r.status}`
    try { const j = JSON.parse(text); msg = j.message || j.error || msg } catch(e) {}
    const err = new Error(msg)
    err.status = r.status
    throw err
  }
  try {
    const j = JSON.parse(text)
    return j.data ?? []
  } catch(e) {
    throw new Error(`Sportmonks returned invalid JSON: ${text.slice(0,100)}`)
  }
}

const clamp = (v, lo=0.01, hi=0.99) => Math.min(hi, Math.max(lo, isNaN(v)?lo:v))
const fo    = (p, m=0.08) => p > 0.01 ? parseFloat((1/(p*(1+m))).toFixed(2)) : null
const calcEV= (p, o) => (p!=null && o) ? parseFloat((p*o-1).toFixed(4)) : null
const calcK = (p, o, f=0.5) => { if(!p||!o)return null; const b=o-1,k=(p*b-(1-p))/b; return parseFloat(Math.max(0,k*f).toFixed(4)) }

function poisson(l, k) { let p=Math.exp(-l); for(let i=1;i<=k;i++) p*=l/i; return p }
function pOver(l, line) { let c=0; for(let i=0;i<=Math.floor(line);i++) c+=poisson(l,i); return clamp(1-c) }

// ── Market model ──────────────────────────────────────────────────────────────
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

// ── Parlay builder ────────────────────────────────────────────────────────────
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

// ── AI synthesis ──────────────────────────────────────────────────────────────
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

// ── Fallback AI picks from quant data ─────────────────────────────────────────
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

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const smToken = process.env.SPORTMONKS_API_KEY
  const aiKey   = process.env.ANTHROPIC_API_KEY

  if (!smToken) return res.status(200).json({
    error:true,
    errorType:'MISSING_KEY',
    errorMessage:'SPORTMONKS_API_KEY is not set in Vercel Environment Variables.',
    errorFix:'Vercel → Your Project → Settings → Environment Variables → Add SPORTMONKS_API_KEY',
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

    // ── STEP 1: Test token & discover accessible leagues ──────────────────
    let accessibleLeagues = {}
    let planWarning = null

    // Test with a simple leagues call first
    try {
      const leagueTest = await smFetch('/leagues?per_page=100', smToken)
      const accessibleIds = new Set((leagueTest||[]).map(l=>l.id))

      // Check which target leagues are accessible
      for (const [name, id] of Object.entries(TARGET_LEAGUES)) {
        if (accessibleIds.has(id)) accessibleLeagues[name] = id
      }
      // Always add free plan leagues as fallback
      for (const [name, id] of Object.entries(FREE_LEAGUES)) {
        if (accessibleIds.has(id)) accessibleLeagues[name] = id
      }

      if (Object.keys(accessibleLeagues).length === 0) {
        // Can't detect from leagues list — try all target IDs directly
        accessibleLeagues = { ...TARGET_LEAGUES }
      }

      const targetIds = Object.values(TARGET_LEAGUES)
      const hasTargets = targetIds.some(id => accessibleIds.has(id))
      if (!hasTargets) {
        planWarning = `Your Sportmonks plan covers ${Object.keys(accessibleLeagues).join(', ')||'Scottish Premiership & Danish Superliga'}. The 7 target leagues (EPL, La Liga etc.) require a paid plan upgrade at sportmonks.com.`
        // Fall back to whatever is accessible
        accessibleLeagues = {}
        for (const l of (leagueTest||[])) {
          const ld = LEAGUE_DEFAULTS[l.id]
          if (ld) accessibleLeagues[ld.name] = l.id
        }
        // If nothing matches our defaults, use free plan leagues
        if (Object.keys(accessibleLeagues).length === 0) {
          accessibleLeagues = { ...FREE_LEAGUES }
        }
      }
    } catch(e) {
      if (e.status === 401) {
        return res.status(200).json({
          error:true, errorType:'INVALID_KEY',
          errorMessage:'Your Sportmonks API key is invalid or expired.',
          errorFix:'Go to dashboard.api-football.com → Account → My Access and copy a fresh API token.',
          fixtures:[],parlay:null,total:0,
        })
      }
      // Network error — use all target leagues and hope for the best
      accessibleLeagues = { ...TARGET_LEAGUES }
    }

    const leagueIds = Object.values(accessibleLeagues).join(',')

    // ── STEP 2: Fetch today's fixtures (minimal safe includes) ────────────
    let fixtures = []
    try {
      fixtures = await smFetch(
        `/fixtures/date/${today}?include=participants;statistics.type;scores;state;league;referees;predictions&filters=fixtureLeagues:${leagueIds}&per_page=50`,
        smToken
      )
    } catch(e) {
      if (e.status === 403) {
        return res.status(200).json({
          error:true, errorType:'PLAN_RESTRICTION',
          errorMessage:`Your Sportmonks plan does not include the requested leagues. ${planWarning||'Upgrade at sportmonks.com to access EPL, La Liga, Bundesliga, Serie A, Ligue 1, Championship and Belgian Pro League.'}`,
          errorFix:'Visit sportmonks.com/football-api/plans-pricing to upgrade.',
          planWarning,
          fixtures:[],parlay:null,total:0,
        })
      }
      throw e
    }

    if (!fixtures || fixtures.length === 0) {
      return res.status(200).json({
        date:today, total:0, fixtures:[], parlay:null,
        planWarning,
        dayVerdict:`No fixtures found today (${today}) for your accessible leagues: ${Object.keys(accessibleLeagues).join(', ')}. Check back on a matchday.`,
        message:'No fixtures today',
      })
    }

    // ── STEP 3: Enrich each fixture ───────────────────────────────────────
    const enriched = fixtures.map(fix => {
      try {
        const home = (fix.participants||[]).find(p=>p.meta?.location==='home')
        const away = (fix.participants||[]).find(p=>p.meta?.location==='away')
        if (!home||!away) return null

        const stats  = fix.statistics||[]
        const ld     = LEAGUE_DEFAULTS[fix.league_id]||LEAGUE_DEFAULTS[8]
        const state  = fix.state?.developer_name||'NS'
        const ref    = (fix.referees||[])[0]
        const pred   = (fix.predictions||[])[0]?.predictions
        const scoreD = (fix.scores||[]).find(s=>s.description==='CURRENT')
        const leagueName = fix.league?.name||ld.name||'Unknown'

        // Safe stat extractor
        const gS = (tid, pid) => {
          const s=(stats||[]).find(x=>x.type_id===tid&&x.participant_id===pid)
          return s?.data?.value??null
        }

        const fd = {
          hXG:null, aXG:null,
          hGoals:ld.avgGoals/2, aGoals:ld.avgGoals/2,
          hConc:ld.avgGoals/2,  aConc:ld.avgGoals/2,
          hCorners:gS(34,home.id)||ld.avgCorners*0.52,
          aCorners:gS(34,away.id)||ld.avgCorners*0.48,
          hYellow:ld.avgCards/2, aYellow:ld.avgCards/2,
          hRed:0.06, aRed:0.06,
          hFouls:gS(51,home.id)||ld.avgFouls/2,
          aFouls:gS(51,away.id)||ld.avgFouls/2,
          hP:0.55,
          p1:pred?.home_win?pred.home_win/100:null,
          px:pred?.draw?pred.draw/100:null,
          p2:pred?.away_win?pred.away_win/100:null,
          rs:ld.refStr, isDerby:false, mi:'Regular',
          lC:ld.avgCards, lCo:ld.avgCorners,
          lF:ld.avgFouls, lP:ld.penRate,
        }

        const markets = buildMarkets(fd)

        return {
          id:fix.id, name:fix.name, league:leagueName,
          leagueId:fix.league_id, kickoff:fix.starting_at, state,
          score:{
            home:scoreD?.score?.participant==='home'?(scoreD.score.goals||0):0,
            away:scoreD?.score?.participant==='away'?(scoreD.score.goals||0):0,
          },
          homeTeam:{id:home.id,name:home.name,image:home.image_path},
          awayTeam:{id:away.id,name:away.name,image:away.image_path},
          referee:ref?.name||'TBC',
          markets, topPick:markets.topPick,
          valuePicks:markets.valuePicks,
          exp:markets.exp, result:markets.result,
        }
      } catch(e) {
        console.warn(`Fixture ${fix.id} failed:`,e.message)
        return null
      }
    }).filter(Boolean)

    if (!enriched.length) {
      return res.status(200).json({
        date:today,total:0,fixtures:[],parlay:null,planWarning,
        dayVerdict:'Fixtures were returned but could not be processed. Please try again.',
      })
    }

    // ── STEP 4: Build parlay ──────────────────────────────────────────────
    const parlay = buildParlay(enriched)

    // ── STEP 5: AI synthesis ──────────────────────────────────────────────
    let aiPicks = null
    try {
      aiPicks = await synthesiseWithAI(enriched, aiKey)
    } catch(e) {
      console.warn('AI synthesis failed, using quant fallback:', e.message)
      aiPicks = quantFallbackPicks(enriched)
    }
    if (!aiPicks) aiPicks = quantFallbackPicks(enriched)

    // ── STEP 6: Merge & return ────────────────────────────────────────────
    const finalFixtures = enriched.map(fix => {
      const aiF = (aiPicks.fixtures||[]).find(f =>
        f.name===fix.name ||
        fix.name.toLowerCase().includes((f.name||'').toLowerCase().split(' ')[0])
      )
      return {...fix, ai:aiF||null}
    })

    return res.status(200).json({
      date:today,
      total:enriched.length,
      accessibleLeagues:Object.keys(accessibleLeagues),
      planWarning:planWarning||null,
      dayVerdict:aiPicks.dayVerdict||null,
      parlay,
      fixtures:finalFixtures,
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

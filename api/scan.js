// api/scan.js  —  BQP Unified Scan Engine  v2.0
// Fetches live Sportmonks data, runs ALL 55+ market models, builds optimal parlay
// Deployed as a Vercel Serverless Function (no server needed)

// ── League IDs ────────────────────────────────────────────────────────────────
const LEAGUES = {
  'EPL':                8,
  'La Liga':            564,
  'Bundesliga':         82,
  'Belgian Pro League': 4,
  'Championship':       9,
  'Ligue 1':            301,
  'Serie A':            384,
}
const LEAGUE_IDS = Object.values(LEAGUES).join(',')
const BASE = 'https://api.sportmonks.com/v3/football'

// ── Sportmonks stat type IDs ──────────────────────────────────────────────────
const T = {
  POSSESSION:         45,
  SHOTS_TOTAL:        84,
  SHOTS_ON_TARGET:    86,
  SHOTS_OFF_TARGET:   85,
  CORNERS:            34,
  YELLOW_CARDS:       40,
  RED_CARDS:          41,
  YELLOW_RED:         56,
  FOULS:              51,
  OFFSIDES:           55,
  ATTACKS:            156,
  DANGEROUS_ATTACKS:  157,
  XG:                 5304,
  GOALS:              52,
  SAVES:              58,
  TACKLES:            57,
  PASSES:             80,
}

// ── League context defaults (used when team averages unavailable) ─────────────
const LEAGUE_DEFAULTS = {
  8:   { avgGoals:2.82,avgCorners:10.1,avgCards:3.2,avgFouls:20.4,avgOffsides:3.8,refStrictness:68,penRate:0.28 },
  564: { avgGoals:2.74,avgCorners:10.8,avgCards:4.8,avgFouls:26.4,avgOffsides:4.2,refStrictness:88,penRate:0.32 },
  82:  { avgGoals:3.16,avgCorners:10.4,avgCards:3.9,avgFouls:22.1,avgOffsides:4.0,refStrictness:72,penRate:0.26 },
  4:   { avgGoals:2.68,avgCorners:10.3,avgCards:3.7,avgFouls:23.6,avgOffsides:3.5,refStrictness:74,penRate:0.26 },
  9:   { avgGoals:2.55,avgCorners:9.8, avgCards:3.5,avgFouls:24.2,avgOffsides:3.2,refStrictness:66,penRate:0.22 },
  301: { avgGoals:2.62,avgCorners:10.0,avgCards:3.6,avgFouls:21.8,avgOffsides:3.6,refStrictness:68,penRate:0.24 },
  384: { avgGoals:2.58,avgCorners:10.6,avgCards:4.6,avgFouls:24.8,avgOffsides:3.9,refStrictness:90,penRate:0.30 },
}

// ── API helper ────────────────────────────────────────────────────────────────
async function smFetch(path, token) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${BASE}${path}${sep}api_token=${token}`)
  if (!res.ok) throw new Error(`Sportmonks ${res.status}: ${path.slice(0,80)}`)
  const j = await res.json()
  return j.data ?? []
}

// ── Extract stat value from Sportmonks statistics array ──────────────────────
function getStat(statistics, typeId, participantId) {
  const s = statistics?.find(s => s.type_id === typeId && s.participant_id === participantId)
  return s?.data?.value ?? null
}

// ── Extract team season average from Sportmonks team statistics ──────────────
function getTeamAvg(teamStats, typeId) {
  if (!teamStats?.length) return null
  for (const ts of teamStats) {
    const detail = ts.details?.find(d => d.type_id === typeId)
    if (detail?.value?.all?.average != null) return detail.value.all.average
  }
  return null
}

// ── MARKET MATH ENGINE ────────────────────────────────────────────────────────
function poisson(lambda, k) {
  let p = Math.exp(-lambda)
  for (let i = 1; i <= k; i++) p *= lambda / i
  return p
}
function pOver(lambda, line) {
  let cum = 0
  for (let i = 0; i <= Math.floor(line); i++) cum += poisson(lambda, i)
  return Math.max(0.01, Math.min(0.99, 1 - cum))
}
const clamp = (v, lo=0.01, hi=0.99) => Math.min(hi, Math.max(lo, v))
const impliedProb = (odds, margin=0.05) => odds ? (1/odds)/(1+margin) : null
const calcEV = (prob, odds) => prob!=null && odds ? prob*odds-1 : null
const calcKelly = (prob, odds, f=0.5) => {
  if (!prob||!odds) return null
  const b=odds-1, k=(prob*b-(1-prob))/b
  return Math.max(0, k*f)
}
const gradeEV = (ev, gap) => {
  if (ev==null||gap==null) return {label:'—',color:'#3A5570'}
  if (ev>0.12&&gap>0.08)   return {label:'STRONG VALUE',color:'#00C896'}
  if (ev>0.06&&gap>0.05)   return {label:'VALUE',       color:'#00C896'}
  if (ev>0.02&&gap>0.02)   return {label:'SLIGHT EDGE', color:'#F0A500'}
  if (ev>-0.04)            return {label:'FAIR',        color:'#7A9AB8'}
  return                          {label:'AVOID',       color:'#E8445A'}
}

// Build a pick entry
function pick(cat, market, prob, odds) {
  const imp  = impliedProb(odds)
  const ev   = calcEV(prob, odds)
  const gap  = imp!=null ? prob-imp : null
  const kly  = calcKelly(prob, odds)
  const grade= gradeEV(ev, gap)
  return { cat, market, prob:parseFloat((prob||0).toFixed(4)), odds, impl:imp, ev, gap, kelly:kly, grade }
}

// ── FULL MARKET MODEL for one fixture ────────────────────────────────────────
function buildAllMarkets(fix, odds={}) {
  const { homeXG, awayXG, homeWinP, drawP, awayWinP,
    homeGoalsAvg, awayGoalsAvg, homeGoalsConcAvg, awayGoalsConcAvg,
    homeCorners, awayCorners, homeYellow, awayYellow, homeRed, awayRed,
    homeFouls, awayFouls, homeShots, awayShots, homeSoT, awaySoT,
    homeOffsides, awayOffsides, refStrictness, isDerby, matchImportance,
    leagueAvgCards, leagueAvgCorners, leagueAvgPens, leagueAvgFouls,
    homePressure } = fix

  // ── GOALS ────────────────────────────────────────────────────────────────
  const eH = clamp((homeXG||homeGoalsAvg||1.4)*0.55 + (awayGoalsConcAvg||1.1)*0.45, 0.2, 5)
  const eA = clamp((awayXG||awayGoalsAvg||1.1)*0.55 + (homeGoalsConcAvg||1.0)*0.45, 0.2, 5)
  const eT = eH + eA
  const pBTTS  = (1-Math.exp(-eH))*(1-Math.exp(-eA))
  const htExp  = eT*0.42
  const goalPicks = [
    pick('GOALS','BTTS Yes',            pBTTS,              odds.bttsYes),
    pick('GOALS','BTTS No',             1-pBTTS,            odds.bttsNo),
    pick('GOALS','Over 0.5 Goals',      pOver(eT,0.5),      odds.over05),
    pick('GOALS','Over 1.5 Goals',      pOver(eT,1.5),      odds.over15),
    pick('GOALS','Over 2.5 Goals',      pOver(eT,2.5),      odds.over25),
    pick('GOALS','Over 3.5 Goals',      pOver(eT,3.5),      odds.over35g),
    pick('GOALS','Over 4.5 Goals',      pOver(eT,4.5),      odds.over45g),
    pick('GOALS','Under 2.5 Goals',     1-pOver(eT,2.5),    odds.under25),
    pick('GOALS','HT Over 0.5 Goals',   pOver(htExp,0.5),   odds.htOver05),
    pick('GOALS','HT Over 1.5 Goals',   pOver(htExp,1.5),   odds.htOver15),
    pick('GOALS','BTTS & Home Win',     pBTTS*(homeWinP||0.4), odds.bttsWinH),
    pick('GOALS','BTTS & Away Win',     pBTTS*(awayWinP||0.25),odds.bttsWinA),
  ]

  // ── RESULT ────────────────────────────────────────────────────────────────
  const p1=homeWinP||0.42, px=drawP||0.28, p2=awayWinP||0.30
  const pCS = Math.exp(-eA), pAS = Math.exp(-eH)
  const resultPicks = [
    pick('RESULT','Home Win (1)',       p1,           odds.homeWin),
    pick('RESULT','Draw (X)',           px,           odds.draw),
    pick('RESULT','Away Win (2)',       p2,           odds.awayWin),
    pick('RESULT','Double Chance 1X',  p1+px,        odds.dc1x),
    pick('RESULT','Double Chance X2',  px+p2,        odds.dcx2),
    pick('RESULT','Double Chance 12',  p1+p2,        odds.dc12),
    pick('RESULT','Draw No Bet Home',  p1/(p1+p2),   odds.dnbH),
    pick('RESULT','Draw No Bet Away',  p2/(p1+p2),   odds.dnbA),
    pick('RESULT','HT Home Win',       p1*0.70,      odds.ht1),
    pick('RESULT','HT Draw',           clamp(1-p1*0.7-p2*0.7,0.3,0.6), odds.htX),
    pick('RESULT','Win to Nil Home',   p1*pCS,       odds.wtnH),
    pick('RESULT','Win to Nil Away',   p2*pAS,       odds.wtnA),
    pick('RESULT','Asian Hcap Home -1',clamp(p1-0.18,0.05,0.9), odds.ahH),
    pick('RESULT','Asian Hcap Away +1',clamp(p2+0.15,0.05,0.9), odds.ahA),
  ]

  // ── CORNERS ───────────────────────────────────────────────────────────────
  const cH = homeCorners||(leagueAvgCorners||10.2)*0.52
  const cA = awayCorners||(leagueAvgCorners||10.2)*0.48
  const cT = cH+cA
  const cPct = (line) => clamp((cT-line+0.5)/(cT*0.75))
  const cornerPicks = [
    pick('CORNERS','Over 8.5 Corners',         cPct(8.5),        odds.corO85),
    pick('CORNERS','Over 9.5 Corners',         cPct(9.5),        odds.corO95),
    pick('CORNERS','Over 10.5 Corners',        cPct(10.5),       odds.corO105),
    pick('CORNERS','Over 11.5 Corners',        cPct(11.5),       odds.corO115),
    pick('CORNERS','Over 12.5 Corners',        cPct(12.5),       odds.corO125),
    pick('CORNERS','Under 9.5 Corners',        1-cPct(9.5),      odds.corU95),
    pick('CORNERS','Under 10.5 Corners',       1-cPct(10.5),     odds.corU105),
    pick('CORNERS','HT Over 4.5 Corners',      cPct(4.5*1.8),    odds.htCO45),
    pick('CORNERS','HT Over 5.5 Corners',      cPct(5.5*1.8),    odds.htCO55),
    pick('CORNERS','Home More Corners',        clamp(cH/(cH+cA)*1.05,0.25,0.75), odds.homeMoreC),
    pick('CORNERS','Away More Corners',        clamp(cA/(cH+cA)*1.05,0.25,0.75), odds.awayMoreC),
    pick('CORNERS','Corner Handicap H -1.5',  clamp((cH-cA-1.5)/(cT*0.4)+0.35), odds.corHcpH),
  ]

  // ── CARDS ─────────────────────────────────────────────────────────────────
  const base  = (homeYellow||2.0)+(awayYellow||1.8)
  const refM  = ((refStrictness||65)/65)*0.40+0.60
  const derM  = isDerby?1.18:1.00
  const impM  = matchImportance==='Derby'?1.15:matchImportance==='Title Decider'?1.12:matchImportance==='Relegation'?1.14:matchImportance==='Cup Final'?1.20:matchImportance==='Title Race'?1.10:1.00
  const foulM = (homeFouls&&awayFouls)?((homeFouls+awayFouls)/((leagueAvgFouls||22)*0.95))*0.85+0.15:1.00
  const eY    = base*refM*derM*impM*foulM
  const eR    = ((homeRed||0.06)+(awayRed||0.06))*derM*impM
  const bkPts = eY*10+eR*25
  const cardPct = (line) => clamp((eY-line+0.5)/3.2)
  const cardPicks = [
    pick('CARDS','Over 2.5 Cards',           cardPct(2.5),        odds.carO25),
    pick('CARDS','Over 3.5 Cards',           cardPct(3.5),        odds.carO35),
    pick('CARDS','Over 4.5 Cards',           cardPct(4.5),        odds.carO45),
    pick('CARDS','Over 5.5 Cards',           cardPct(5.5),        odds.carO55),
    pick('CARDS','Under 3.5 Cards',          1-cardPct(3.5),      odds.carU35),
    pick('CARDS','Red Card in Match',        clamp(eR,0.05,0.40), odds.redCard),
    pick('CARDS','Both Teams Get Carded',    clamp(cardPct(3.5)*0.85), odds.bothCarded),
    pick('CARDS','Booking Pts Over 25',      clamp((bkPts-20)/30), odds.bkO25),
    pick('CARDS','Booking Pts Over 35',      clamp((bkPts-30)/25), odds.bkO35),
    pick('CARDS','Booking Pts Over 50',      clamp((bkPts-40)/20), odds.bkO50),
    pick('CARDS','Home Team More Cards',     clamp((homeYellow||2.0)/eY,0.25,0.75), odds.homeMoreCards),
    pick('CARDS','Away Team More Cards',     clamp((awayYellow||1.8)/eY,0.25,0.75), odds.awayMoreCards),
  ]

  // ── SHOTS ─────────────────────────────────────────────────────────────────
  const eTotShots = (homeShots||13.5)+(awayShots||11.5)
  const eSoT      = (homeSoT||4.8)+(awaySoT||4.2)
  const shotPct   = (line,exp) => clamp((exp-line+1)/(exp*0.6))
  const shotPicks = [
    pick('SHOTS','Over 22.5 Total Shots',  shotPct(22.5,eTotShots), odds.shotsO225),
    pick('SHOTS','Over 24.5 Total Shots',  shotPct(24.5,eTotShots), odds.shotsO245),
    pick('SHOTS','Over 26.5 Total Shots',  shotPct(26.5,eTotShots), odds.shotsO265),
    pick('SHOTS','Over 7.5 Shots on Tgt',  shotPct(7.5,eSoT),       odds.sotO75),
    pick('SHOTS','Over 8.5 Shots on Tgt',  shotPct(8.5,eSoT),       odds.sotO85),
    pick('SHOTS','Over 9.5 Shots on Tgt',  shotPct(9.5,eSoT),       odds.sotO95),
  ]

  // ── OFFSIDES ──────────────────────────────────────────────────────────────
  const eOff = (homeOffsides||2.4)+(awayOffsides||2.1)
  const offPct = (line) => clamp((eOff-line+0.5)/(eOff*0.7))
  const offsidePicks = [
    pick('OFFSIDES','Over 2.5 Offsides', offPct(2.5), odds.offO25),
    pick('OFFSIDES','Over 3.5 Offsides', offPct(3.5), odds.offO35),
    pick('OFFSIDES','Over 4.5 Offsides', offPct(4.5), odds.offO45),
    pick('OFFSIDES','Over 5.5 Offsides', offPct(5.5), odds.offO55),
  ]

  // ── FOULS ─────────────────────────────────────────────────────────────────
  const eFouls = (homeFouls||11.5)+(awayFouls||10.8)
  const foulPct = (line) => clamp((eFouls-line+1)/(eFouls*0.6))
  const foulPicks = [
    pick('FOULS','Over 20.5 Fouls', foulPct(20.5), odds.foulsO205),
    pick('FOULS','Over 22.5 Fouls', foulPct(22.5), odds.foulsO225),
    pick('FOULS','Over 24.5 Fouls', foulPct(24.5), odds.foulsO245),
    pick('FOULS','Under 22.5 Fouls',1-foulPct(22.5),odds.foulsU225),
  ]

  // ── TIMING ────────────────────────────────────────────────────────────────
  const pressIdx = homePressure||0.55
  const pLate    = clamp(pressIdx*0.4+0.18)
  const timingPicks = [
    pick('TIMING','Goal in 1st Half',      clamp(pOver(htExp,0.5),0.35,0.78), odds.goalHT),
    pick('TIMING','Late Goal (75-90)',      pLate,                             odds.lateGoal),
    pick('TIMING',"First Goal After 15'",  clamp(1-pOver(eT,0.5)*0.72),       odds.firstAfter15),
    pick('TIMING',"First Goal Before 15'", clamp(pOver(eT,0.5)*0.28),         odds.firstBefore15),
    pick('TIMING','Both Halves – Goal',    clamp(pOver(htExp,0.5)*pOver(eT-htExp,0.5)), odds.bothHalves),
  ]

  // ── PENALTY ───────────────────────────────────────────────────────────────
  const ePen   = (leagueAvgPens||0.28)*clamp(pressIdx*0.4+0.80)
  const penPct = clamp(ePen,0.10,0.38)
  const penPicks = [
    pick('PENALTY','Penalty Awarded Yes', penPct,   odds.penYes),
    pick('PENALTY','Penalty Awarded No',  1-penPct, odds.penNo),
    pick('PENALTY','Penalty Scored',      penPct*0.75, odds.penScored),
  ]

  // ── Merge + rank ──────────────────────────────────────────────────────────
  const all = [...goalPicks,...resultPicks,...cornerPicks,...cardPicks,...shotPicks,...offsidePicks,...foulPicks,...timingPicks,...penPicks]
  const withOdds    = all.filter(p => p.odds!=null && p.ev!=null)
  const valuePicks  = withOdds.filter(p => (p.ev??0)>0 && (p.gap??0)>0.02).sort((a,b)=>(b.ev??0)-(a.ev??0))
  const topPick     = valuePicks[0]??null

  // Model EV summary
  const expGoals  = parseFloat(eT.toFixed(2))
  const expCards  = parseFloat(eY.toFixed(2))
  const expCorners= parseFloat(cT.toFixed(1))
  const expBkPts  = parseFloat(bkPts.toFixed(1))

  return { all, valuePicks, topPick, expGoals, expCards, expCorners, expBkPts,
    goals:{expHome:parseFloat(eH.toFixed(2)),expAway:parseFloat(eA.toFixed(2)),pBTTS:parseFloat(pBTTS.toFixed(3)),pOver25:parseFloat(pOver(eT,2.5).toFixed(3))},
    result:{p1,px,p2}, cards:{expYellows:parseFloat(eY.toFixed(2)),expBookPts:expBkPts} }
}

// ── Build simulated odds from probabilities (when real odds unavailable) ──────
function buildFallbackOdds(homeWin, draw, awayWin, eGoals, eCorners, eCards) {
  const o=(p,m=0.08)=>p>0.01?parseFloat((1/(p*(1+m))).toFixed(2)):null
  return {
    homeWin:o(homeWin),draw:o(draw),awayWin:o(awayWin),
    dc1x:o(homeWin+draw),dcx2:o(draw+awayWin),dc12:o(homeWin+awayWin),
    dnbH:o(homeWin/(homeWin+awayWin)),dnbA:o(awayWin/(homeWin+awayWin)),
    ht1:o(homeWin*0.70),htX:o(0.44),wtnH:o(homeWin*0.28),wtnA:o(awayWin*0.20),
    ahH:o(homeWin-0.12),ahA:o(awayWin+0.12),
    bttsYes:o(0.52),bttsNo:o(0.48),
    over05:o(0.96),over15:o(0.78),over25:o(0.52),over35g:o(0.28),over45g:o(0.14),
    under25:o(0.48),htOver05:o(0.72),htOver15:o(0.38),
    bttsWinH:o(homeWin*0.48),bttsWinA:o(awayWin*0.48),
    corO85:o(0.74),corO95:o(0.58),corO105:o(0.44),corO115:o(0.30),corO125:o(0.18),
    corU95:o(0.42),corU105:o(0.56),htCO45:o(0.62),htCO55:o(0.42),
    homeMoreC:o(0.44),awayMoreC:o(0.38),corHcpH:o(0.42),
    carO25:o(0.80),carO35:o(0.56),carO45:o(0.32),carO55:o(0.18),
    carU35:o(0.44),redCard:o(0.18),bothCarded:o(0.60),
    bkO25:o(0.82),bkO35:o(0.62),bkO50:o(0.36),
    homeMoreCards:o(0.42),awayMoreCards:o(0.40),
    shotsO225:o(0.62),shotsO245:o(0.46),shotsO265:o(0.30),
    sotO75:o(0.60),sotO85:o(0.42),sotO95:o(0.28),
    offO25:o(0.72),offO35:o(0.55),offO45:o(0.38),offO55:o(0.24),
    foulsO205:o(0.64),foulsO225:o(0.46),foulsO245:o(0.30),foulsU225:o(0.54),
    goalHT:o(0.62),lateGoal:o(0.42),firstAfter15:o(0.72),firstBefore15:o(0.28),bothHalves:o(0.52),
    penYes:o(0.26),penNo:o(0.74),penScored:o(0.20),
  }
}

// ── Parse Sportmonks odds array into our flat odds object ─────────────────────
function parseOdds(oddsArr=[]) {
  const findOdds = (marketId, labelPattern) => {
    const picks = oddsArr.filter(o=>o.market_id===marketId||o.market_description?.toLowerCase().includes(marketId.toString()))
    const match = picks.find(o=>o.label?.toLowerCase().match(labelPattern))
    return match?parseFloat(match.value):null
  }
  // Market 1 = Full Time Result
  return {
    homeWin: findOdds(1,/home|^1$/) ?? null,
    draw:    findOdds(1,/draw|^x$/) ?? null,
    awayWin: findOdds(1,/away|^2$/) ?? null,
  }
}

// ── Optimal parlay finder ─────────────────────────────────────────────────────
function findBestParlay(allFixtureMarkets, nLegs=3) {
  // Pool: top value pick from each fixture, positive EV only
  const pool = allFixtureMarkets
    .filter(f => f.topPick && (f.topPick.ev??0)>0)
    .map(f => ({ ...f.topPick, match:f.name, league:f.league, fixId:f.id }))

  if (pool.length < nLegs) return { legs:pool.slice(0,nLegs), note:'Insufficient fixtures' }

  // Try all combos of nLegs from pool (cap at 8 for performance)
  const eligible = pool.slice(0,8)
  let bestEV=-Infinity, bestCombo=[]
  const combine = (start, cur) => {
    if (cur.length===nLegs) {
      const combined = cur.reduce((acc,p)=>acc*(p.prob??0),1) * cur.reduce((acc,p)=>acc*(p.odds??1),1) - 1
      if (combined>bestEV) { bestEV=combined; bestCombo=[...cur] }
      return
    }
    for (let i=start;i<eligible.length;i++) combine(i+1,[...cur,eligible[i]])
  }
  combine(0,[])

  const totOdds = bestCombo.reduce((a,p)=>a*(p.odds??1),1)
  const totProb = bestCombo.reduce((a,p)=>a*(p.prob??0),1)
  const parlayEV= totProb*totOdds-1
  const parlayKelly = Math.max(0, ((totProb*(totOdds-1)-(1-totProb))/(totOdds-1))*0.25)

  return { legs:bestCombo, totOdds:parseFloat(totOdds.toFixed(2)),
    totProb:parseFloat(totProb.toFixed(4)), ev:parseFloat(parlayEV.toFixed(3)),
    kelly:parseFloat(parlayKelly.toFixed(3)) }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET')

  const token = process.env.SPORTMONKS_API_KEY
  if (!token) return res.status(500).json({error:'SPORTMONKS_API_KEY not configured in Vercel environment variables'})

  try {
    const today = new Date().toISOString().split('T')[0]

    // ── Step 1: Fetch today's fixtures for all 7 leagues ─────────────────────
    const includes = [
      'participants',
      'statistics.type',
      'xGFixture.type',
      'odds',
      'predictions',
      'scores',
      'state',
      'league',
      'referees',
    ].join(';')

    const fixtures = await smFetch(
      `/fixtures/date/${today}?include=${includes}&filters=fixtureLeagues:${LEAGUE_IDS}&per_page=50`,
      token
    )

    if (!fixtures.length) {
      return res.status(200).json({
        date:today, total:0, fixtures:[],
        message:'No fixtures scheduled today for the selected leagues',
        parlay:null
      })
    }

    // ── Step 2: Fetch team season stats for all unique teams ──────────────────
    // Get unique team IDs
    const teamIds = [...new Set(
      fixtures.flatMap(f => (f.participants??[]).map(p=>p.id))
    )].slice(0,30) // cap at 30 to respect rate limits

    let teamStatsMap = {}
    if (teamIds.length > 0) {
      try {
        // Batch fetch team stats — Sportmonks supports multi IDs
        const tIds = teamIds.join(',')
        const teamData = await smFetch(
          `/teams/multi/${tIds}?include=statistics.details.type&filters=currentSeasons:teamStatistic`,
          token
        )
        ;(Array.isArray(teamData)?teamData:[teamData]).forEach(t => {
          if (t?.id) teamStatsMap[t.id] = t.statistics ?? []
        })
      } catch (e) {
        // Non-fatal — fall back to league defaults
        console.warn('Team stats fetch failed, using league defaults:', e.message)
      }
    }

    // ── Step 3: Enrich each fixture ───────────────────────────────────────────
    const enriched = fixtures.map(fix => {
      const home = fix.participants?.find(p=>p.meta?.location==='home')
      const away = fix.participants?.find(p=>p.meta?.location==='away')
      if (!home||!away) return null

      const stats  = fix.statistics ?? []
      const league = LEAGUE_DEFAULTS[fix.league_id] ?? LEAGUE_DEFAULTS[8]
      const state  = fix.state?.developer_name ?? 'NS'

      // Current score
      const scoreData = fix.scores?.find(s=>s.description==='CURRENT')
      const homeGoals = scoreData?.score?.participant==='home'?scoreData.score.goals:0
      const awayGoals = scoreData?.score?.participant==='away'?scoreData.score.goals:0

      // xG from dedicated endpoint
      const homeXG = (fix.xGFixture??[]).find(x=>x.participant_id===home.id)?.data?.value
      const awayXG = (fix.xGFixture??[]).find(x=>x.participant_id===away.id)?.data?.value

      // Live stats from fixture
      const getLive = (typeId, teamId) => getStat(stats, typeId, teamId)

      // Team season averages
      const hTS = teamStatsMap[home.id] ?? []
      const aTS = teamStatsMap[away.id] ?? []
      const hAvg = (tid) => getTeamAvg(hTS,tid)
      const aAvg = (tid) => getTeamAvg(aTS,tid)

      // Referee
      const ref = fix.referees?.[0]
      const refStrictness = ref ? 70 : league.refStrictness // Default if no ref data

      // Match context
      const isDerby = home.id && away.id && (
        // Derive from league + fixture name heuristics
        fix.name?.toLowerCase().includes('city')&&fix.name?.toLowerCase().includes('united') ||
        fix.name?.toLowerCase().includes('real')&&fix.name?.toLowerCase().includes('atletico') ||
        fix.name?.toLowerCase().includes('milan')
      ) || false
      const matchImportance = 'Regular' // Would need standings context for better classification

      // Build fixture data object for market engine
      const fd = {
        homeXG:             homeXG ?? null,
        awayXG:             awayXG ?? null,
        homeGoalsAvg:       hAvg(T.GOALS)           ?? league.avgGoals/2,
        awayGoalsAvg:       aAvg(T.GOALS)           ?? league.avgGoals/2,
        homeGoalsConcAvg:   hAvg(88)                ?? league.avgGoals/2,  // 88=goals conceded
        awayGoalsConcAvg:   aAvg(88)                ?? league.avgGoals/2,
        homeCorners:        getLive(T.CORNERS,home.id) ?? hAvg(T.CORNERS) ?? league.avgCorners*0.52,
        awayCorners:        getLive(T.CORNERS,away.id) ?? aAvg(T.CORNERS) ?? league.avgCorners*0.48,
        homeYellow:         hAvg(T.YELLOW_CARDS)    ?? league.avgCards/2,
        awayYellow:         aAvg(T.YELLOW_CARDS)    ?? league.avgCards/2,
        homeRed:            hAvg(T.RED_CARDS)        ?? 0.06,
        awayRed:            aAvg(T.RED_CARDS)        ?? 0.06,
        homeFouls:          getLive(T.FOULS,home.id) ?? hAvg(T.FOULS) ?? league.avgFouls/2,
        awayFouls:          getLive(T.FOULS,away.id) ?? aAvg(T.FOULS) ?? league.avgFouls/2,
        homeShots:          getLive(T.SHOTS_TOTAL,home.id) ?? hAvg(T.SHOTS_TOTAL) ?? 13,
        awayShots:          getLive(T.SHOTS_TOTAL,away.id) ?? aAvg(T.SHOTS_TOTAL) ?? 11,
        homeSoT:            getLive(T.SHOTS_ON_TARGET,home.id) ?? hAvg(T.SHOTS_ON_TARGET) ?? 4.8,
        awaySoT:            getLive(T.SHOTS_ON_TARGET,away.id) ?? aAvg(T.SHOTS_ON_TARGET) ?? 4.1,
        homeOffsides:       getLive(T.OFFSIDES,home.id) ?? hAvg(T.OFFSIDES) ?? 2.4,
        awayOffsides:       getLive(T.OFFSIDES,away.id) ?? aAvg(T.OFFSIDES) ?? 2.1,
        homePressure:       (fix.pressure?.find(p=>p.participant_id===home.id)?.data?.value ?? 0.55),
        // From Sportmonks predictions
        homeWinP:           (fix.predictions?.[0]?.predictions?.home_win/100) ?? null,
        drawP:              (fix.predictions?.[0]?.predictions?.draw/100)     ?? null,
        awayWinP:           (fix.predictions?.[0]?.predictions?.away_win/100) ?? null,
        refStrictness,
        isDerby,
        matchImportance,
        leagueAvgCards:     league.avgCards,
        leagueAvgCorners:   league.avgCorners,
        leagueAvgPens:      league.penRate,
        leagueAvgFouls:     league.avgFouls,
      }

      // If no model probabilities from Sportmonks, estimate from xG
      if (!fd.homeWinP) {
        const xH = fd.homeXG ?? fd.homeGoalsAvg ?? 1.4
        const xA = fd.awayXG ?? fd.awayGoalsAvg ?? 1.1
        fd.homeWinP = clamp(xH/(xH+xA+0.3)*0.85, 0.15, 0.80)
        fd.drawP    = clamp(0.35 - Math.abs(xH-xA)*0.08, 0.15, 0.45)
        fd.awayWinP = 1 - fd.homeWinP - fd.drawP
      }

      // Build odds (parse from API or generate fallback)
      const parsedOdds = parseOdds(fix.odds??[])
      const odds = Object.keys(parsedOdds).some(k=>parsedOdds[k]!=null)
        ? { ...buildFallbackOdds(fd.homeWinP,fd.drawP,fd.awayWinP,fd.homeXG??1.4,fd.homeCorners??5,fd.homeYellow??2), ...parsedOdds }
        : buildFallbackOdds(fd.homeWinP,fd.drawP,fd.awayWinP,fd.homeXG??1.4,fd.homeCorners??5,fd.homeYellow??2)

      // Run all 55+ market models
      const markets = buildAllMarkets(fd, odds)

      // Quant signals
      const luckScore   = ((homeGoals-(homeXG??0)) - (awayGoals-(awayXG??0)))
      const flukeScore  = Math.min(1, Math.max(0,
        0.40*((luckScore+2)/4) +
        0.25*(1-fd.homePressure) +
        0.25*(fd.awayXG&&fd.homeXG?Math.min(fd.awayXG/fd.homeXG,2)/2:0.5) +
        0.10*Math.min(markets.cards.expYellows/5,1)
      ))

      const confidence = markets.valuePicks.filter(p=>p.ev>0.06).length >= 3 ? 'HIGH'
        : markets.valuePicks.length >= 1 ? 'MEDIUM' : 'LOW'

      return {
        id:         fix.id,
        name:       fix.name,
        league:     fix.league?.name ?? Object.keys(LEAGUES).find(k=>LEAGUES[k]===fix.league_id) ?? 'Unknown',
        leagueId:   fix.league_id,
        kickoff:    fix.starting_at,
        state,
        score:      { home:homeGoals, away:awayGoals },
        homeTeam:   { id:home.id, name:home.name, image:home.image_path },
        awayTeam:   { id:away.id, name:away.name, image:away.image_path },
        referee:    ref?.name ?? 'TBC',
        // Quant
        quant: {
          luckScore:  parseFloat(luckScore.toFixed(3)),
          flukeScore: parseFloat(flukeScore.toFixed(3)),
          pressure:   parseFloat(fd.homePressure.toFixed(3)),
          volatility: parseFloat((markets.cards.expYellows/5).toFixed(3)),
        },
        // Markets
        markets: {
          expGoals:   markets.expGoals,
          expCards:   markets.expCards,
          expCorners: markets.expCorners,
          expBkPts:   markets.expBkPts,
          goals:      markets.goals,
          result:     markets.result,
          cards:      markets.cards,
          valuePicks: markets.valuePicks.slice(0,15),
          topPick:    markets.topPick,
          allPicks:   markets.all.filter(p=>p.odds!=null),
        },
        odds: { home:odds.homeWin, draw:odds.draw, away:odds.awayWin },
        confidence,
        bestPick:   markets.topPick,
      }
    }).filter(Boolean)

    // Sort: HIGH confidence → EV desc
    enriched.sort((a,b)=>{
      const ord={HIGH:0,MEDIUM:1,LOW:2}
      if(ord[a.confidence]!==ord[b.confidence]) return ord[a.confidence]-ord[b.confidence]
      return (b.bestPick?.ev??0)-(a.bestPick?.ev??0)
    })

    // ── Step 4: Build optimal parlay from top value picks ─────────────────────
    const parlay = findBestParlay(enriched.map(f=>({
      id:f.id, name:f.name, league:f.league,
      topPick:f.markets.topPick
    })))

    // ── Step 5: Summary stats ─────────────────────────────────────────────────
    const highConf  = enriched.filter(f=>f.confidence==='HIGH').length
    const allValues = enriched.flatMap(f=>f.markets.valuePicks)
    const catCounts = {}
    allValues.forEach(p=>{catCounts[p.cat]=(catCounts[p.cat]||0)+1})

    return res.status(200).json({
      date:       today,
      total:      enriched.length,
      highConf,
      totalValuePicks: allValues.length,
      marketBreakdown: catCounts,
      leagues:    Object.keys(LEAGUES),
      parlay,
      fixtures:   enriched,
    })

  } catch (err) {
    console.error('BQP Scan error:', err)
    return res.status(500).json({ error:err.message, stack:err.stack?.slice(0,400) })
  }
}

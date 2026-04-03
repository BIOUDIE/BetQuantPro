// api/scan.js  —  BQP Unified Scan Engine  v3.0
// Migrated from Sportmonks → api-football (api-sports.io)
// Fetches fixtures + statistics + xG + odds + predictions per league

// ── League IDs (api-football) ─────────────────────────────────────────────────
const LEAGUES = {
  'EPL':                39,
  'La Liga':            140,
  'Bundesliga':         78,
  'Belgian Pro League': 144,
  'Championship':       40,
  'Ligue 1':            61,
  'Serie A':            135,
}

const BASE = 'https://v3.football.api-sports.io'

// ── api-football stat type names ───────────────────────────────────────────────
// These are the exact string keys returned by /fixtures/statistics
const STAT = {
  SHOTS_TOTAL:        'Total Shots',
  SHOTS_ON_TARGET:    'Shots on Goal',
  SHOTS_OFF_TARGET:   'Shots off Goal',
  SHOTS_BLOCKED:      'Blocked Shots',
  CORNERS:            'Corner Kicks',
  YELLOW_CARDS:       'Yellow Cards',
  RED_CARDS:          'Red Cards',
  FOULS:              'Fouls',
  OFFSIDES:           'Offsides',
  BALL_POSSESSION:    'Ball Possession',
  GOALKEEPER_SAVES:   'Goalkeeper Saves',
  PASSES_TOTAL:       'Total passes',
  PASSES_ACCURATE:    'Passes accurate',
  PASSES_PCT:         'Passes %',
  XG:                 'expected_goals',   // only in premium fixtures endpoint
}

// ── League context defaults ────────────────────────────────────────────────────
const LEAGUE_DEFAULTS = {
  39:  { avgGoals:2.82, avgCorners:10.1, avgCards:3.2, avgFouls:20.4, avgOffsides:3.8, refStrictness:68, penRate:0.28 },
  140: { avgGoals:2.74, avgCorners:10.8, avgCards:4.8, avgFouls:26.4, avgOffsides:4.2, refStrictness:88, penRate:0.32 },
  78:  { avgGoals:3.16, avgCorners:10.4, avgCards:3.9, avgFouls:22.1, avgOffsides:4.0, refStrictness:72, penRate:0.26 },
  144: { avgGoals:2.68, avgCorners:10.3, avgCards:3.7, avgFouls:23.6, avgOffsides:3.5, refStrictness:74, penRate:0.26 },
  40:  { avgGoals:2.55, avgCorners:9.8,  avgCards:3.5, avgFouls:24.2, avgOffsides:3.2, refStrictness:66, penRate:0.22 },
  61:  { avgGoals:2.62, avgCorners:10.0, avgCards:3.6, avgFouls:21.8, avgOffsides:3.6, refStrictness:68, penRate:0.24 },
  135: { avgGoals:2.58, avgCorners:10.6, avgCards:4.6, avgFouls:24.8, avgOffsides:3.9, refStrictness:90, penRate:0.30 },
}

// ── API helper ─────────────────────────────────────────────────────────────────
async function apiFetch(path, token) {
  const r = await fetch(`${BASE}${path}`, {
    headers: {
      'x-apisports-key': token,
      'Accept': 'application/json',
    },
  })
  if (!r.ok) throw new Error(`API-Football ${r.status}: ${path.slice(0,80)}`)
  const j = await r.json()
  return j.response ?? []
}

// ── Extract a stat value from the /fixtures/statistics response ───────────────
// statsMap shape: { [teamId]: { [statTypeName]: value } }
function getStat(statsMap, teamId, typeName) {
  const val = statsMap?.[teamId]?.[typeName]
  if (val === null || val === undefined) return null
  if (typeof val === 'string' && val.endsWith('%')) return parseFloat(val)
  return typeof val === 'number' ? val : parseFloat(val) || null
}

// ── Fetch & normalise fixture statistics ──────────────────────────────────────
async function fetchFixtureStats(fixtureId, token) {
  try {
    const data = await apiFetch(`/fixtures/statistics?fixture=${fixtureId}`, token)
    const result = {}
    for (const teamStat of (data || [])) {
      const teamId = teamStat.team?.id
      if (!teamId) continue
      result[teamId] = {}
      for (const s of (teamStat.statistics || [])) {
        result[teamId][s.type] = s.value
      }
    }
    return result
  } catch(e) {
    console.warn(`Stats fetch failed for fixture ${fixtureId}:`, e.message)
    return {}
  }
}

// ── Fetch team season statistics (goals scored/conceded, cards, corners avg) ──
async function fetchTeamStats(teamId, leagueId, season, token) {
  try {
    const data = await apiFetch(
      `/teams/statistics?team=${teamId}&league=${leagueId}&season=${season}`,
      token
    )
    // data is a single object, not an array
    return data?.[0] ?? data ?? null
  } catch(e) {
    return null
  }
}

// ── Parse team season averages from /teams/statistics response ─────────────────
function parseTeamSeasonStats(teamStats) {
  if (!teamStats) return {}
  const goals  = teamStats.goals
  const cards  = teamStats.cards
  const passes = teamStats.passes
  return {
    goalsFor:     goals?.for?.average?.total   ? parseFloat(goals.for.average.total)   : null,
    goalsAgainst: goals?.against?.average?.total ? parseFloat(goals.against.average.total) : null,
    yellowCards:  cards?.yellow ? Object.values(cards.yellow).reduce((s,v)=>s+(v?.total||0),0) : null,
    redCards:     cards?.red    ? Object.values(cards.red).reduce((s,v)=>s+(v?.total||0),0)    : null,
    form:         teamStats.form ?? null,   // e.g. "WWLLD"
    cleanSheets:  teamStats.clean_sheet?.total ?? null,
    failedToScore:teamStats.failed_to_score?.total ?? null,
  }
}

// ── Fetch bookmaker odds ───────────────────────────────────────────────────────
async function fetchOdds(fixtureId, token) {
  try {
    // Bookmaker 6 = Bet365 (most widely available on free plan)
    const data = await apiFetch(`/odds?fixture=${fixtureId}&bookmaker=6`, token)
    const bets = data?.[0]?.bookmakers?.[0]?.bets ?? []
    return bets
  } catch(e) {
    return []
  }
}

// ── Fetch predictions ──────────────────────────────────────────────────────────
async function fetchPredictions(fixtureId, token) {
  try {
    const data = await apiFetch(`/predictions?fixture=${fixtureId}`, token)
    return data?.[0] ?? null
  } catch(e) {
    return null
  }
}

// ── Parse a specific odds market from bets array ──────────────────────────────
function getOddsValue(bets, betName, valueName) {
  const bet = (bets || []).find(b => b.name?.toLowerCase().includes(betName.toLowerCase()))
  if (!bet) return null
  const v = (bet.values || []).find(vv =>
    typeof vv.value === 'string' && vv.value.toLowerCase() === valueName.toLowerCase()
  )
  return v ? parseFloat(v.odd) : null
}

// ── Build full odds object from bookmaker bets ────────────────────────────────
function parseAllOdds(bets) {
  if (!bets?.length) return {}
  const o = (betName, valueName) => getOddsValue(bets, betName, valueName)
  return {
    homeWin:   o('Match Winner', 'Home'),
    draw:      o('Match Winner', 'Draw'),
    awayWin:   o('Match Winner', 'Away'),
    bttsYes:   o('Both Teams Score', 'Yes'),
    bttsNo:    o('Both Teams Score', 'No'),
    over05:    o('Goals Over/Under', 'Over 0.5'),
    over15:    o('Goals Over/Under', 'Over 1.5'),
    over25:    o('Goals Over/Under', 'Over 2.5'),
    over35g:   o('Goals Over/Under', 'Over 3.5'),
    over45g:   o('Goals Over/Under', 'Over 4.5'),
    under25:   o('Goals Over/Under', 'Under 2.5'),
    corO85:    o('Corner Kicks Over/Under', 'Over 8.5'),
    corO95:    o('Corner Kicks Over/Under', 'Over 9.5'),
    corO105:   o('Corner Kicks Over/Under', 'Over 10.5'),
    corU95:    o('Corner Kicks Over/Under', 'Under 9.5'),
    corU105:   o('Corner Kicks Over/Under', 'Under 10.5'),
    carO25:    o('Cards Over/Under', 'Over 2.5'),
    carO35:    o('Cards Over/Under', 'Over 3.5'),
    carO45:    o('Cards Over/Under', 'Over 4.5'),
    carU35:    o('Cards Over/Under', 'Under 3.5'),
    dc1x:      o('Double Chance', '1X'),
    dcx2:      o('Double Chance', 'X2'),
    dc12:      o('Double Chance', '12'),
    htOver05:  o('HT/FT Goals Over/Under', 'Over 0.5'),
    htOver15:  o('HT/FT Goals Over/Under', 'Over 1.5'),
  }
}

// ── Build simulated odds when real odds unavailable ────────────────────────────
function buildFallbackOdds(homeWin, draw, awayWin) {
  const o=(p,m=0.08)=>p>0.01?parseFloat((1/(p*(1+m))).toFixed(2)):null
  return {
    homeWin:o(homeWin), draw:o(draw), awayWin:o(awayWin),
    dc1x:o(homeWin+draw), dcx2:o(draw+awayWin), dc12:o(homeWin+awayWin),
    dnbH:o(homeWin/(homeWin+awayWin)), dnbA:o(awayWin/(homeWin+awayWin)),
    ht1:o(homeWin*0.70), htX:o(0.44), wtnH:o(homeWin*0.28), wtnA:o(awayWin*0.20),
    ahH:o(homeWin-0.12), ahA:o(awayWin+0.12),
    bttsYes:o(0.52), bttsNo:o(0.48),
    over05:o(0.96), over15:o(0.78), over25:o(0.52), over35g:o(0.28), over45g:o(0.14),
    under25:o(0.48), htOver05:o(0.72), htOver15:o(0.38),
    bttsWinH:o(homeWin*0.48), bttsWinA:o(awayWin*0.48),
    corO85:o(0.74), corO95:o(0.58), corO105:o(0.44), corO115:o(0.30), corO125:o(0.18),
    corU95:o(0.42), corU105:o(0.56), htCO45:o(0.62), htCO55:o(0.42),
    homeMoreC:o(0.44), awayMoreC:o(0.38), corHcpH:o(0.42),
    carO25:o(0.80), carO35:o(0.56), carO45:o(0.32), carO55:o(0.18),
    carU35:o(0.44), redCard:o(0.18), bothCarded:o(0.60),
    bkO25:o(0.82), bkO35:o(0.62), bkO50:o(0.36),
    homeMoreCards:o(0.42), awayMoreCards:o(0.40),
    shotsO225:o(0.62), shotsO245:o(0.46), shotsO265:o(0.30),
    sotO75:o(0.60), sotO85:o(0.42), sotO95:o(0.28),
    offO25:o(0.72), offO35:o(0.55), offO45:o(0.38), offO55:o(0.24),
    foulsO205:o(0.64), foulsO225:o(0.46), foulsO245:o(0.30), foulsU225:o(0.54),
    goalHT:o(0.62), lateGoal:o(0.42), firstAfter15:o(0.72), firstBefore15:o(0.28), bothHalves:o(0.52),
    penYes:o(0.26), penNo:o(0.74), penScored:o(0.20),
  }
}

// ── MARKET MATH ENGINE ─────────────────────────────────────────────────────────
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

function pick(cat, market, prob, odds) {
  const imp  = impliedProb(odds)
  const ev   = calcEV(prob, odds)
  const gap  = imp!=null ? prob-imp : null
  const kly  = calcKelly(prob, odds)
  const grade= gradeEV(ev, gap)
  return { cat, market, prob:parseFloat((prob||0).toFixed(4)), odds, impl:imp, ev, gap, kelly:kly, grade }
}

// ── Full market model for one fixture ─────────────────────────────────────────
function buildAllMarkets(fix, odds={}) {
  const { homeXG, awayXG, homeWinP, drawP, awayWinP,
    homeGoalsAvg, awayGoalsAvg, homeGoalsConcAvg, awayGoalsConcAvg,
    homeCorners, awayCorners, homeYellow, awayYellow, homeRed, awayRed,
    homeFouls, awayFouls, homeShots, awayShots, homeSoT, awaySoT,
    homeOffsides, awayOffsides, refStrictness, isDerby, matchImportance,
    leagueAvgCards, leagueAvgCorners, leagueAvgPens, leagueAvgFouls,
    homePressure } = fix

  // ── GOALS ──────────────────────────────────────────────────────────────────
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

  // ── RESULT ─────────────────────────────────────────────────────────────────
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

  // ── CORNERS ────────────────────────────────────────────────────────────────
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

  // ── CARDS ──────────────────────────────────────────────────────────────────
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

  // ── SHOTS ──────────────────────────────────────────────────────────────────
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

  // ── OFFSIDES ───────────────────────────────────────────────────────────────
  const eOff = (homeOffsides||2.4)+(awayOffsides||2.1)
  const offPct = (line) => clamp((eOff-line+0.5)/(eOff*0.7))
  const offsidePicks = [
    pick('OFFSIDES','Over 2.5 Offsides', offPct(2.5), odds.offO25),
    pick('OFFSIDES','Over 3.5 Offsides', offPct(3.5), odds.offO35),
    pick('OFFSIDES','Over 4.5 Offsides', offPct(4.5), odds.offO45),
    pick('OFFSIDES','Over 5.5 Offsides', offPct(5.5), odds.offO55),
  ]

  // ── FOULS ──────────────────────────────────────────────────────────────────
  const eFouls = (homeFouls||11.5)+(awayFouls||10.8)
  const foulPct = (line) => clamp((eFouls-line+1)/(eFouls*0.6))
  const foulPicks = [
    pick('FOULS','Over 20.5 Fouls', foulPct(20.5), odds.foulsO205),
    pick('FOULS','Over 22.5 Fouls', foulPct(22.5), odds.foulsO225),
    pick('FOULS','Over 24.5 Fouls', foulPct(24.5), odds.foulsO245),
    pick('FOULS','Under 22.5 Fouls',1-foulPct(22.5),odds.foulsU225),
  ]

  // ── TIMING ─────────────────────────────────────────────────────────────────
  const pressIdx = homePressure||0.55
  const pLate    = clamp(pressIdx*0.4+0.18)
  const timingPicks = [
    pick('TIMING','Goal in 1st Half',      clamp(pOver(htExp,0.5),0.35,0.78), odds.goalHT),
    pick('TIMING','Late Goal (75-90)',      pLate,                             odds.lateGoal),
    pick('TIMING',"First Goal After 15'",  clamp(1-pOver(eT,0.5)*0.72),       odds.firstAfter15),
    pick('TIMING',"First Goal Before 15'", clamp(pOver(eT,0.5)*0.28),         odds.firstBefore15),
    pick('TIMING','Both Halves – Goal',    clamp(pOver(htExp,0.5)*pOver(eT-htExp,0.5)), odds.bothHalves),
  ]

  // ── PENALTY ────────────────────────────────────────────────────────────────
  const ePen   = (leagueAvgPens||0.28)*clamp(pressIdx*0.4+0.80)
  const penPct = clamp(ePen,0.10,0.38)
  const penPicks = [
    pick('PENALTY','Penalty Awarded Yes', penPct,      odds.penYes),
    pick('PENALTY','Penalty Awarded No',  1-penPct,    odds.penNo),
    pick('PENALTY','Penalty Scored',      penPct*0.75, odds.penScored),
  ]

  // ── Merge + rank ───────────────────────────────────────────────────────────
  const all = [...goalPicks,...resultPicks,...cornerPicks,...cardPicks,...shotPicks,...offsidePicks,...foulPicks,...timingPicks,...penPicks]
  const withOdds    = all.filter(p => p.odds!=null && p.ev!=null)
  const valuePicks  = withOdds.filter(p => (p.ev??0)>0 && (p.gap??0)>0.02).sort((a,b)=>(b.ev??0)-(a.ev??0))
  const topPick     = valuePicks[0]??null

  return { all, valuePicks, topPick,
    expGoals:   parseFloat(eT.toFixed(2)),
    expCards:   parseFloat(eY.toFixed(2)),
    expCorners: parseFloat(cT.toFixed(1)),
    expBkPts:   parseFloat(bkPts.toFixed(1)),
    goals: { expHome:parseFloat(eH.toFixed(2)), expAway:parseFloat(eA.toFixed(2)), pBTTS:parseFloat(pBTTS.toFixed(3)), pOver25:parseFloat(pOver(eT,2.5).toFixed(3)) },
    result: { p1, px, p2 },
    cards: { expYellows:parseFloat(eY.toFixed(2)), expBookPts:parseFloat(bkPts.toFixed(1)) },
  }
}

// ── Optimal parlay finder ──────────────────────────────────────────────────────
function findBestParlay(allFixtureMarkets, nLegs=3) {
  const pool = allFixtureMarkets
    .filter(f => f.topPick && (f.topPick.ev??0)>0)
    .map(f => ({ ...f.topPick, match:f.name, league:f.league, fixId:f.id }))

  if (pool.length < nLegs) return { legs:pool.slice(0,nLegs), note:'Insufficient fixtures' }

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

// ── Main handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET')

  const token = process.env.API_FOOTBALL_KEY
  if (!token) return res.status(500).json({
    error: 'API_FOOTBALL_KEY not configured in Vercel environment variables. ' +
           'Add it at: Vercel → Project → Settings → Environment Variables'
  })

  try {
    const today  = new Date().toISOString().split('T')[0]
    const season = new Date().getFullYear()

    // ── STEP 1: Fetch today's fixtures for all 7 leagues in parallel ──────────
    const leagueResults = await Promise.allSettled(
      Object.entries(LEAGUES).map(async ([leagueName, leagueId]) => {
        const data = await apiFetch(
          `/fixtures?league=${leagueId}&season=${season}&date=${today}`,
          token
        )
        return (data || []).map(f => ({ ...f, _leagueName: leagueName, _leagueId: leagueId }))
      })
    )

    let allFixtures = []
    for (const r of leagueResults) {
      if (r.status === 'fulfilled') allFixtures = allFixtures.concat(r.value)
    }

    if (!allFixtures.length) {
      return res.status(200).json({
        date:today, total:0, fixtures:[],
        message:'No fixtures scheduled today for the selected leagues',
        parlay:null,
      })
    }

    // ── STEP 2: Per fixture — fetch stats, predictions, and odds in parallel ──
    // Batched to avoid rate-limit (free plan = 100 req/min)
    const BATCH = 5
    const enrichedRaw = []

    for (let i = 0; i < allFixtures.length; i += BATCH) {
      const batch = allFixtures.slice(i, i + BATCH)

      const batchData = await Promise.allSettled(
        batch.map(async (fix) => {
          const fixtureId = fix.fixture?.id
          if (!fixtureId) return { fix, stats:{}, teamStatsH:null, teamStatsA:null, predictions:null, odds:{} }

          const home = fix.teams?.home
          const away = fix.teams?.away
          const leagueId = fix._leagueId

          const isLiveOrDone = ['1H','HT','2H','ET','P','FT','AET','PEN'].includes(fix.fixture?.status?.short)

          // Parallel fetch everything we need for this fixture
          const [
            statsResult,
            teamStatsHResult,
            teamStatsAResult,
            predictionsResult,
            oddsResult,
          ] = await Promise.allSettled([
            isLiveOrDone ? fetchFixtureStats(fixtureId, token) : Promise.resolve({}),
            home?.id ? fetchTeamStats(home.id, leagueId, season, token) : Promise.resolve(null),
            away?.id ? fetchTeamStats(away.id, leagueId, season, token) : Promise.resolve(null),
            fetchPredictions(fixtureId, token),
            fetchOdds(fixtureId, token),
          ])

          return {
            fix,
            stats:        statsResult.status === 'fulfilled'        ? statsResult.value        : {},
            teamStatsH:   teamStatsHResult.status === 'fulfilled'   ? teamStatsHResult.value   : null,
            teamStatsA:   teamStatsAResult.status === 'fulfilled'   ? teamStatsAResult.value   : null,
            predictions:  predictionsResult.status === 'fulfilled'  ? predictionsResult.value  : null,
            oddsBets:     oddsResult.status === 'fulfilled'         ? oddsResult.value         : [],
          }
        })
      )

      for (const r of batchData) {
        if (r.status === 'fulfilled') enrichedRaw.push(r.value)
      }
    }

    // ── STEP 3: Enrich each fixture with market models ─────────────────────────
    const enriched = enrichedRaw.map(({ fix, stats, teamStatsH, teamStatsA, predictions, oddsBets }) => {
      const home = fix.teams?.home
      const away = fix.teams?.away
      if (!home || !away) return null

      try {
        const leagueId   = fix._leagueId
        const league     = LEAGUE_DEFAULTS[leagueId] ?? LEAGUE_DEFAULTS[39]
        const state      = fix.fixture?.status?.short ?? 'NS'

        const hId = home.id
        const aId = away.id

        // ── Live match stats (only populated mid-game / post-game) ──
        const hXG          = getStat(stats, hId, STAT.XG)
        const aXG          = getStat(stats, aId, STAT.XG)
        const hPoss        = getStat(stats, hId, STAT.BALL_POSSESSION)  // "55%" → 55
        const aPoss        = getStat(stats, aId, STAT.BALL_POSSESSION)
        const hSoT         = getStat(stats, hId, STAT.SHOTS_ON_TARGET)
        const aSoT         = getStat(stats, aId, STAT.SHOTS_ON_TARGET)
        const hShots       = getStat(stats, hId, STAT.SHOTS_TOTAL)
        const aShots       = getStat(stats, aId, STAT.SHOTS_TOTAL)
        const hCornersLive = getStat(stats, hId, STAT.CORNERS)
        const aCornersLive = getStat(stats, aId, STAT.CORNERS)
        const hYellowLive  = getStat(stats, hId, STAT.YELLOW_CARDS)
        const aYellowLive  = getStat(stats, aId, STAT.YELLOW_CARDS)
        const hRedLive     = getStat(stats, hId, STAT.RED_CARDS)
        const aRedLive     = getStat(stats, aId, STAT.RED_CARDS)
        const hFoulsLive   = getStat(stats, hId, STAT.FOULS)
        const aFoulsLive   = getStat(stats, aId, STAT.FOULS)
        const hOffsides    = getStat(stats, hId, STAT.OFFSIDES)
        const aOffsides    = getStat(stats, aId, STAT.OFFSIDES)

        // ── Team season averages ──
        const hSeason = parseTeamSeasonStats(teamStatsH)
        const aSeason = parseTeamSeasonStats(teamStatsA)

        // ── Predictions (api-football /predictions endpoint) ──
        const pred = predictions?.predictions
        const p1   = pred?.percent?.home ? parseInt(pred.percent.home) / 100 : null
        const px   = pred?.percent?.draw ? parseInt(pred.percent.draw) / 100 : null
        const p2   = pred?.percent?.away ? parseInt(pred.percent.away) / 100 : null

        // ── Build odds object (real from bookmaker, fallback to model) ──
        const realOdds   = parseAllOdds(oddsBets)
        const fallbackP1 = p1 ?? clamp((hXG||1.4)/((hXG||1.4)+(aXG||1.1)+0.3)*0.85,0.15,0.80)
        const fallbackPx = px ?? clamp(0.35-Math.abs((hXG||1.4)-(aXG||1.1))*0.08,0.15,0.45)
        const fallbackP2 = p2 ?? (1-fallbackP1-fallbackPx)
        const fallbackOdds = buildFallbackOdds(fallbackP1, fallbackPx, fallbackP2)
        const odds = { ...fallbackOdds, ...Object.fromEntries(Object.entries(realOdds).filter(([,v])=>v!=null)) }

        // ── Build the market model input ──
        const fd = {
          homeXG:              hXG   ?? null,
          awayXG:              aXG   ?? null,
          homeGoalsAvg:        hSeason.goalsFor     ?? league.avgGoals / 2,
          awayGoalsAvg:        aSeason.goalsFor     ?? league.avgGoals / 2,
          homeGoalsConcAvg:    hSeason.goalsAgainst ?? league.avgGoals / 2,
          awayGoalsConcAvg:    aSeason.goalsAgainst ?? league.avgGoals / 2,
          homeCorners:         hCornersLive ?? league.avgCorners * 0.52,
          awayCorners:         aCornersLive ?? league.avgCorners * 0.48,
          homeYellow:          hYellowLive  ?? hSeason.yellowCards / 38 ?? league.avgCards / 2,
          awayYellow:          aYellowLive  ?? aSeason.yellowCards / 38 ?? league.avgCards / 2,
          homeRed:             hRedLive     ?? hSeason.redCards / 38    ?? 0.06,
          awayRed:             aRedLive     ?? aSeason.redCards / 38    ?? 0.06,
          homeFouls:           hFoulsLive   ?? league.avgFouls / 2,
          awayFouls:           aFoulsLive   ?? league.avgFouls / 2,
          homeShots:           hShots       ?? 13,
          awayShots:           aShots       ?? 11,
          homeSoT:             hSoT         ?? 4.8,
          awaySoT:             aSoT         ?? 4.1,
          homeOffsides:        hOffsides    ?? 2.4,
          awayOffsides:        aOffsides    ?? 2.1,
          homePressure:        hPoss ? hPoss / 100 : 0.55,
          homeWinP:            p1 ?? fallbackP1,
          drawP:               px ?? fallbackPx,
          awayWinP:            p2 ?? fallbackP2,
          refStrictness:       league.refStrictness,
          isDerby:             false,
          matchImportance:     'Regular',
          leagueAvgCards:      league.avgCards,
          leagueAvgCorners:    league.avgCorners,
          leagueAvgPens:       league.penRate,
          leagueAvgFouls:      league.avgFouls,
        }

        const markets = buildAllMarkets(fd, odds)

        // ── Quant signals ──
        const homeGoals = fix.goals?.home ?? 0
        const awayGoals = fix.goals?.away ?? 0
        const luckScore = ((homeGoals-(hXG??0)) - (awayGoals-(aXG??0)))
        const flukeScore = Math.min(1, Math.max(0,
          0.40 * ((luckScore+2)/4) +
          0.25 * (1-(fd.homePressure)) +
          0.25 * (aXG&&hXG ? Math.min(aXG/hXG,2)/2 : 0.5) +
          0.10 * Math.min(markets.expCards/5,1)
        ))

        const confidence = markets.valuePicks.filter(p=>p.ev>0.06).length >= 3 ? 'HIGH'
          : markets.valuePicks.length >= 1 ? 'MEDIUM' : 'LOW'

        return {
          id:         fix.fixture.id,
          name:       `${home.name} vs ${away.name}`,
          league:     fix._leagueName ?? 'Unknown',
          leagueId,
          kickoff:    fix.fixture.date,
          state,
          score:      { home: homeGoals, away: awayGoals },
          homeTeam:   { id: home.id, name: home.name, image: home.logo },
          awayTeam:   { id: away.id, name: away.name, image: away.logo },
          referee:    fix.fixture?.referee ?? 'TBC',
          // Live stat snapshot for UI
          stats: {
            home: { xg:hXG, possession:hPoss, shotsOnTarget:hSoT, shots:hShots, corners:hCornersLive, yellowCards:hYellowLive, fouls:hFoulsLive, offsides:hOffsides, name:home.name },
            away: { xg:aXG, possession:aPoss, shotsOnTarget:aSoT, shots:aShots, corners:aCornersLive, yellowCards:aYellowLive, fouls:aFoulsLive, offsides:aOffsides, name:away.name },
          },
          // Team season form
          seasonStats: { home: hSeason, away: aSeason },
          // Bookmaker odds
          odds: { home: odds.homeWin, draw: odds.draw, away: odds.awayWin },
          // Prediction percentages
          predictions: pred ? {
            homeWinPct: pred.percent?.home,
            drawPct:    pred.percent?.draw,
            awayWinPct: pred.percent?.away,
            winner:     pred.winner?.name ?? null,
            advice:     pred.advice ?? null,
          } : null,
          // Quant
          quant: {
            luckScore:  parseFloat(luckScore.toFixed(3)),
            flukeScore: parseFloat(flukeScore.toFixed(3)),
            pressure:   parseFloat(fd.homePressure.toFixed(3)),
            volatility: parseFloat((markets.expCards/5).toFixed(3)),
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
          confidence,
          bestPick: markets.topPick,
        }
      } catch(e) {
        console.warn(`Enrich failed for ${fix.fixture?.id}:`, e.message)
        return null
      }
    }).filter(Boolean)

    // Sort: HIGH → MEDIUM → LOW, then by EV
    enriched.sort((a,b)=>{
      const ord={HIGH:0,MEDIUM:1,LOW:2}
      if(ord[a.confidence]!==ord[b.confidence]) return ord[a.confidence]-ord[b.confidence]
      return (b.bestPick?.ev??0)-(a.bestPick?.ev??0)
    })

    // ── STEP 4: Build optimal parlay ───────────────────────────────────────────
    const parlay = findBestParlay(enriched.map(f=>({
      id:f.id, name:f.name, league:f.league, topPick:f.markets.topPick
    })))

    // ── STEP 5: Summary stats ──────────────────────────────────────────────────
    const highConf   = enriched.filter(f=>f.confidence==='HIGH').length
    const allValues  = enriched.flatMap(f=>f.markets.valuePicks)
    const catCounts  = {}
    allValues.forEach(p=>{catCounts[p.cat]=(catCounts[p.cat]||0)+1})

    return res.status(200).json({
      date:             today,
      total:            enriched.length,
      highConf,
      totalValuePicks:  allValues.length,
      marketBreakdown:  catCounts,
      leagues:          Object.keys(LEAGUES),
      parlay,
      fixtures:         enriched,
    })

  } catch (err) {
    console.error('BQP Scan error:', err)
    return res.status(500).json({ error:err.message, stack:err.stack?.slice(0,400) })
  }
}

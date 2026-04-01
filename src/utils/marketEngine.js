// ─── BQP Multi-Market Engine ─────────────────────────────────────────────────
// Models 20+ betting markets from raw match statistics

// ── Booking points formula ────────────────────────────────────────────────────
export const bookingPts = (y, r, yr = 0) => y * 10 + r * 25 + yr * 35

// ── Implied probability from decimal odds ────────────────────────────────────
export const impl = (odds, margin = 0.05) =>
  odds ? (1 / odds) / (1 + margin) : null

// ── Expected value ────────────────────────────────────────────────────────────
export const ev = (prob, odds) =>
  prob != null && odds ? prob * odds - 1 : null

// ── Quarter-Kelly stake ───────────────────────────────────────────────────────
export const kelly = (prob, odds, fraction = 0.5) => {
  if (!prob || !odds) return null
  const b = odds - 1
  const k = (prob * b - (1 - prob)) / b
  return Math.max(0, k * fraction)
}

// ── Value grade ───────────────────────────────────────────────────────────────
export const valueGrade = (evVal, gap) => {
  if (evVal == null || gap == null) return { label: '—', color: '#3A5570' }
  if (evVal > 0.10 && gap > 0.07)  return { label: 'STRONG VALUE', color: '#00C896' }
  if (evVal > 0.05 && gap > 0.04)  return { label: 'VALUE',        color: '#00C896' }
  if (evVal > 0    && gap > 0.02)  return { label: 'SLIGHT EDGE',  color: '#F0A500' }
  if (evVal > -0.05)               return { label: 'FAIR',         color: '#7A9AB8' }
  return                                  { label: 'AVOID',        color: '#E8445A' }
}

// ─── MARKET MODELS ────────────────────────────────────────────────────────────

// 1. GOALS MARKETS
export function modelGoals(fix) {
  const { homeXG, awayXG, homeGoalsAvg, awayGoalsAvg, homeGoalsConcAvg, awayGoalsConcAvg } = fix
  const expHome = (homeXG ?? homeGoalsAvg ?? 1.4) * 0.6 + (awayGoalsConcAvg ?? 1.2) * 0.4
  const expAway = (awayXG ?? awayGoalsAvg ?? 1.1) * 0.6 + (homeGoalsConcAvg ?? 1.0) * 0.4
  const expTotal = expHome + expAway

  // Poisson approximation for totals
  const poisson = (lambda, k) => {
    let p = Math.exp(-lambda)
    for (let i = 1; i <= k; i++) p *= lambda / i
    return p
  }
  const pExact = (lambda, k) => poisson(lambda, k)
  const pOver  = (lambda, line) => {
    let cum = 0
    for (let i = 0; i <= Math.floor(line); i++) cum += pExact(lambda, i)
    return Math.max(0.01, Math.min(0.99, 1 - cum))
  }

  const pBTTS  = (1 - Math.exp(-expHome)) * (1 - Math.exp(-expAway))
  const pOver05 = pOver(expTotal, 0.5)
  const pOver15 = pOver(expTotal, 1.5)
  const pOver25 = pOver(expTotal, 2.5)
  const pOver35 = pOver(expTotal, 3.5)
  const pOver45 = pOver(expTotal, 4.5)

  // Half-time goals (roughly 40% of goals in first half)
  const htExp = expTotal * 0.42
  const pHT05 = pOver(htExp, 0.5)
  const pHT15 = pOver(htExp, 1.5)

  return {
    expHome:  parseFloat(expHome.toFixed(2)),
    expAway:  parseFloat(expAway.toFixed(2)),
    expTotal: parseFloat(expTotal.toFixed(2)),
    pBTTS:    parseFloat(pBTTS.toFixed(3)),
    pOver05:  parseFloat(pOver05.toFixed(3)),
    pOver15:  parseFloat(pOver15.toFixed(3)),
    pOver25:  parseFloat(pOver25.toFixed(3)),
    pOver35:  parseFloat(pOver35.toFixed(3)),
    pOver45:  parseFloat(pOver45.toFixed(3)),
    pHT05:    parseFloat(pHT05.toFixed(3)),
    pHT15:    parseFloat(pHT15.toFixed(3)),
  }
}

// 2. CORNERS MARKETS
export function modelCorners(fix) {
  const { homeCorners, awayCorners, homeAttacking, awayAttacking, leagueAvgCorners = 10.2 } = fix
  const expHome = homeCorners ?? (homeAttacking ?? 1) * 5.2
  const expAway = awayCorners ?? (awayAttacking ?? 1) * 4.8
  const expTotal = expHome + expAway

  const pOver  = (line) => Math.min(0.97, Math.max(0.03, (expTotal - line + 0.5) / (expTotal * 0.8)))
  const pOver85  = pOver(8.5)
  const pOver95  = pOver(9.5)
  const pOver105 = pOver(10.5)
  const pOver115 = pOver(11.5)
  const pOver125 = pOver(12.5)

  // First half corners typically 45%
  const htExp = expTotal * 0.45
  const pHT45 = Math.min(0.95, Math.max(0.05, (htExp - 4.5 + 0.5) / (htExp * 0.8)))
  const pHT55 = Math.min(0.90, Math.max(0.05, (htExp - 5.5 + 0.5) / (htExp * 0.8)))

  // Team corners handicap — home team expected to lead
  const pHomeMore = expHome > expAway
    ? 0.45 + (expHome - expAway) / (expHome + expAway) * 0.40
    : 0.45 - (expAway - expHome) / (expHome + expAway) * 0.40

  return {
    expHome:   parseFloat(expHome.toFixed(1)),
    expAway:   parseFloat(expAway.toFixed(1)),
    expTotal:  parseFloat(expTotal.toFixed(1)),
    pOver85:   parseFloat(pOver85.toFixed(3)),
    pOver95:   parseFloat(pOver95.toFixed(3)),
    pOver105:  parseFloat(pOver105.toFixed(3)),
    pOver115:  parseFloat(pOver115.toFixed(3)),
    pOver125:  parseFloat(pOver125.toFixed(3)),
    pHT45:     parseFloat(pHT45.toFixed(3)),
    pHT55:     parseFloat(pHT55.toFixed(3)),
    pHomeMore: parseFloat(pHomeMore.toFixed(3)),
    pAwayMore: parseFloat((1 - pHomeMore - 0.12).toFixed(3)), // 12% draw
  }
}

// 3. CARDS / BOOKINGS MARKETS
export function modelCards(fix) {
  const { homeYellow, awayYellow, homeRed, awayRed, refStrictness, isDerby, matchImportance, homeFouls, awayFouls, leagueAvgCards = 3.8 } = fix

  const base  = (homeYellow ?? 2.0) + (awayYellow ?? 1.8)
  const refMod = ((refStrictness ?? 65) / 65) * 0.40 + 0.60
  const derbyMod = isDerby ? 1.18 : 1.00
  const impMod =
    matchImportance === 'Derby'         ? 1.15 :
    matchImportance === 'Title Decider' ? 1.12 :
    matchImportance === 'Relegation'    ? 1.14 :
    matchImportance === 'Title Race'    ? 1.10 :
    matchImportance === 'Cup Final'     ? 1.20 : 1.00

  const foulMod = homeFouls && awayFouls
    ? ((homeFouls + awayFouls) / (leagueAvgCards * 5.5)) * 0.85 + 0.15
    : 1.00

  const expYellows = base * refMod * derbyMod * impMod * foulMod
  const expReds    = (homeRed ?? 0.08) + (awayRed ?? 0.08) * derbyMod * impMod
  const expPts     = bookingPts(expYellows, expReds)

  const pOver25C = Math.min(0.96, Math.max(0.10, (expYellows - 1.5) / 2.8))
  const pOver35C = Math.min(0.93, Math.max(0.05, (expYellows - 2.5) / 2.8))
  const pOver45C = Math.min(0.88, Math.max(0.03, (expYellows - 3.5) / 2.8))
  const pOver55C = Math.min(0.75, Math.max(0.02, (expYellows - 4.5) / 2.8))
  const pRedCard = Math.min(0.40, Math.max(0.05, expReds))
  const pBothCard= Math.min(0.90, pOver35C * 0.85)

  // Booking points
  const pOver25Pts = Math.min(0.95, Math.max(0.05, (expPts - 20) / 30))
  const pOver35Pts = Math.min(0.90, Math.max(0.05, (expPts - 30) / 25))
  const pOver50Pts = Math.min(0.80, Math.max(0.03, (expPts - 40) / 20))

  return {
    expYellows:  parseFloat(expYellows.toFixed(2)),
    expReds:     parseFloat(expReds.toFixed(2)),
    expBookPts:  parseFloat(expPts.toFixed(1)),
    pOver25C:    parseFloat(pOver25C.toFixed(3)),
    pOver35C:    parseFloat(pOver35C.toFixed(3)),
    pOver45C:    parseFloat(pOver45C.toFixed(3)),
    pOver55C:    parseFloat(pOver55C.toFixed(3)),
    pRedCard:    parseFloat(pRedCard.toFixed(3)),
    pBothCard:   parseFloat(pBothCard.toFixed(3)),
    pOver25Pts:  parseFloat(pOver25Pts.toFixed(3)),
    pOver35Pts:  parseFloat(pOver35Pts.toFixed(3)),
    pOver50Pts:  parseFloat(pOver50Pts.toFixed(3)),
  }
}

// 4. MATCH RESULT + DERIVED MARKETS
export function modelResult(fix) {
  const { homeWinProb, drawProb, awayWinProb, homeXG, awayXG } = fix
  const p1  = homeWinProb ?? 0.45
  const px  = drawProb    ?? 0.28
  const p2  = awayWinProb ?? 0.27

  const pDNB_Home = p1 / (p1 + p2)
  const pDNB_Away = p2 / (p1 + p2)
  const pDC_1X    = p1 + px
  const pDC_X2    = px + p2
  const pDC_12    = p1 + p2

  // Half-time result (more draws, home slightly less dominant)
  const pHT1  = p1 * 0.70
  const pHTX  = 1 - pHT1 - (p2 * 0.70)
  const pHT2  = p2 * 0.70

  // Win to nil (win AND clean sheet)
  const pHomeCS = homeXG ? Math.exp(-((awayXG ?? 1.1))) : 0.28
  const pAwayCS = awayXG ? Math.exp(-((homeXG ?? 1.4))) : 0.20
  const pWTN_Home = p1 * pHomeCS
  const pWTN_Away = p2 * pAwayCS

  // Asian handicap -0.5 (win only, no draw)
  const pAH_Home  = p1
  const pAH_Away  = p2

  // BTTS + Win combos
  const btts = (1 - Math.exp(-(homeXG ?? 1.4))) * (1 - Math.exp(-(awayXG ?? 1.1)))
  const pBTTS_Home = btts * p1
  const pBTTS_Away = btts * p2

  return {
    p1, px, p2,
    pDNB_Home: parseFloat(pDNB_Home.toFixed(3)),
    pDNB_Away: parseFloat(pDNB_Away.toFixed(3)),
    pDC_1X:    parseFloat(pDC_1X.toFixed(3)),
    pDC_X2:    parseFloat(pDC_X2.toFixed(3)),
    pDC_12:    parseFloat(pDC_12.toFixed(3)),
    pHT1:      parseFloat(pHT1.toFixed(3)),
    pHTX:      parseFloat(Math.max(0.1, pHTX).toFixed(3)),
    pHT2:      parseFloat(pHT2.toFixed(3)),
    pWTN_Home: parseFloat(pWTN_Home.toFixed(3)),
    pWTN_Away: parseFloat(pWTN_Away.toFixed(3)),
    pBTTS_Home:parseFloat(pBTTS_Home.toFixed(3)),
    pBTTS_Away:parseFloat(pBTTS_Away.toFixed(3)),
  }
}

// 5. SHOTS MARKETS
export function modelShots(fix) {
  const { homeShotsAvg, awayShotsAvg, homeShotsOnTgt, awayShotsOnTgt } = fix
  const expHS  = homeShotsAvg    ?? 13.2
  const expAS  = awayShotsAvg    ?? 11.4
  const expHST = homeShotsOnTgt  ?? 4.8
  const expAST = awayShotsOnTgt  ?? 4.1
  const expTot = expHS + expAS
  const expTotOnTgt = expHST + expAST

  const pO225T  = Math.min(0.95, Math.max(0.05, (expTot - 22.5 + 1) / (expTot * 0.6)))
  const pO245T  = Math.min(0.90, Math.max(0.05, (expTot - 24.5 + 1) / (expTot * 0.6)))
  const pO75SOT = Math.min(0.90, Math.max(0.05, (expTotOnTgt - 7.5 + 0.5) / (expTotOnTgt * 0.6)))
  const pO85SOT = Math.min(0.85, Math.max(0.05, (expTotOnTgt - 8.5 + 0.5) / (expTotOnTgt * 0.6)))

  return {
    expHomeTot: parseFloat(expHS.toFixed(1)),
    expAwayTot: parseFloat(expAS.toFixed(1)),
    expTot:     parseFloat(expTot.toFixed(1)),
    expHomeSoT: parseFloat(expHST.toFixed(1)),
    expAwaySoT: parseFloat(expAST.toFixed(1)),
    pO225T:     parseFloat(pO225T.toFixed(3)),
    pO245T:     parseFloat(pO245T.toFixed(3)),
    pO75SOT:    parseFloat(pO75SOT.toFixed(3)),
    pO85SOT:    parseFloat(pO85SOT.toFixed(3)),
  }
}

// 6. OFFSIDES MARKETS
export function modelOffsides(fix) {
  const { homeOffsides, awayOffsides } = fix
  const expH = homeOffsides ?? 2.4
  const expA = awayOffsides ?? 2.1
  const expT = expH + expA
  const pO35 = Math.min(0.88, Math.max(0.08, (expT - 3.5 + 0.5) / (expT * 0.7)))
  const pO45 = Math.min(0.80, Math.max(0.05, (expT - 4.5 + 0.5) / (expT * 0.7)))
  const pO55 = Math.min(0.70, Math.max(0.04, (expT - 5.5 + 0.5) / (expT * 0.7)))
  return {
    expH: parseFloat(expH.toFixed(1)),
    expA: parseFloat(expA.toFixed(1)),
    expT: parseFloat(expT.toFixed(1)),
    pO35: parseFloat(pO35.toFixed(3)),
    pO45: parseFloat(pO45.toFixed(3)),
    pO55: parseFloat(pO55.toFixed(3)),
  }
}

// 7. FOULS MARKETS
export function modelFouls(fix) {
  const { homeFouls, awayFouls } = fix
  const expH = homeFouls ?? 11.5
  const expA = awayFouls ?? 10.8
  const expT = expH + expA
  const pO205 = Math.min(0.90, Math.max(0.05, (expT - 20.5 + 1) / (expT * 0.6)))
  const pO225 = Math.min(0.85, Math.max(0.05, (expT - 22.5 + 1) / (expT * 0.6)))
  const pO245 = Math.min(0.75, Math.max(0.04, (expT - 24.5 + 1) / (expT * 0.6)))
  return {
    expH: parseFloat(expH.toFixed(1)),
    expA: parseFloat(expA.toFixed(1)),
    expT: parseFloat(expT.toFixed(1)),
    pO205: parseFloat(pO205.toFixed(3)),
    pO225: parseFloat(pO225.toFixed(3)),
    pO245: parseFloat(pO245.toFixed(3)),
  }
}

// 8. TIMING / GOAL TIMING MARKETS
export function modelTiming(fix) {
  const { homeScoring1st, awayScoring1st, leagueAvgFirstGoalMin = 34 } = fix
  const p1stHalf = Math.min(0.70, Math.max(0.30, (60 - (leagueAvgFirstGoalMin ?? 34)) / 60))
  const pLateGoal = Math.min(0.65, Math.max(0.20, (fix.homePressure ?? 0.5) * 0.4 + 0.2))
  const pFirstGoalU15 = 0.28
  const pFirstGoalO15 = 1 - pFirstGoalU15
  const pAnytimeGoal75 = Math.min(0.75, Math.max(0.30, (fix.homeXG ?? 1.4) * 0.3))

  return {
    p1stHalf:     parseFloat(p1stHalf.toFixed(3)),
    pLateGoal:    parseFloat(pLateGoal.toFixed(3)),
    pFirstU15:    parseFloat(pFirstGoalU15.toFixed(3)),
    pFirstO15:    parseFloat(pFirstGoalO15.toFixed(3)),
    pGoalIn75:    parseFloat(pAnytimeGoal75.toFixed(3)),
    pGoalIn80_90: parseFloat((pLateGoal * 0.38).toFixed(3)),
  }
}

// 9. PENALTY MARKETS
export function modelPenalty(fix) {
  const leagueAvgPens = fix.leagueAvgPens ?? 0.28
  const pressureMod   = (fix.homePressure ?? 0.5) * 0.3 + 0.85
  const expPens       = leagueAvgPens * pressureMod
  const pYes          = Math.min(0.38, Math.max(0.10, expPens))
  return {
    expPens: parseFloat(expPens.toFixed(2)),
    pYes:    parseFloat(pYes.toFixed(3)),
    pNo:     parseFloat((1 - pYes).toFixed(3)),
  }
}

// ─── MASTER ENGINE: run all models for one fixture and generate ranked picks ──
export function analyzeFixture(fix) {
  const goals    = modelGoals(fix)
  const corners  = modelCorners(fix)
  const cards    = modelCards(fix)
  const result   = modelResult(fix)
  const shots    = modelShots(fix)
  const offsides = modelOffsides(fix)
  const fouls    = modelFouls(fix)
  const timing   = modelTiming(fix)
  const penalty  = modelPenalty(fix)

  const odds = fix.odds ?? {}

  // Build master picks list across ALL markets
  const allPicks = [
    // ── RESULT ──────────────────────────────────────────────────────────────
    { cat:'RESULT',   market:'Home Win (1)',        prob: result.p1,         odds: odds.homeWin,    },
    { cat:'RESULT',   market:'Draw (X)',             prob: result.px,         odds: odds.draw,       },
    { cat:'RESULT',   market:'Away Win (2)',          prob: result.p2,         odds: odds.awayWin,    },
    { cat:'RESULT',   market:'Double Chance 1X',     prob: result.pDC_1X,     odds: odds.dc1x,       },
    { cat:'RESULT',   market:'Double Chance X2',     prob: result.pDC_X2,     odds: odds.dcx2,       },
    { cat:'RESULT',   market:'Double Chance 12',     prob: result.pDC_12,     odds: odds.dc12,       },
    { cat:'RESULT',   market:'Draw No Bet – Home',   prob: result.pDNB_Home,  odds: odds.dnbHome,    },
    { cat:'RESULT',   market:'Draw No Bet – Away',   prob: result.pDNB_Away,  odds: odds.dnbAway,    },
    { cat:'RESULT',   market:'HT Result – Home',     prob: result.pHT1,       odds: odds.ht1,        },
    { cat:'RESULT',   market:'HT Result – Draw',     prob: result.pHTX,       odds: odds.htX,        },
    { cat:'RESULT',   market:'Win to Nil – Home',    prob: result.pWTN_Home,  odds: odds.wtnHome,    },
    { cat:'RESULT',   market:'Win to Nil – Away',    prob: result.pWTN_Away,  odds: odds.wtnAway,    },
    // ── GOALS ────────────────────────────────────────────────────────────────
    { cat:'GOALS',    market:'BTTS Yes',             prob: goals.pBTTS,       odds: odds.bttsYes,    },
    { cat:'GOALS',    market:'BTTS No',              prob: 1-goals.pBTTS,     odds: odds.bttsNo,     },
    { cat:'GOALS',    market:'Over 0.5 Goals',       prob: goals.pOver05,     odds: odds.over05,     },
    { cat:'GOALS',    market:'Over 1.5 Goals',       prob: goals.pOver15,     odds: odds.over15,     },
    { cat:'GOALS',    market:'Over 2.5 Goals',       prob: goals.pOver25,     odds: odds.over25,     },
    { cat:'GOALS',    market:'Over 3.5 Goals',       prob: goals.pOver35,     odds: odds.over35,     },
    { cat:'GOALS',    market:'Over 4.5 Goals',       prob: goals.pOver45,     odds: odds.over45,     },
    { cat:'GOALS',    market:'Under 2.5 Goals',      prob: 1-goals.pOver25,   odds: odds.under25,    },
    { cat:'GOALS',    market:'HT Over 0.5 Goals',    prob: goals.pHT05,       odds: odds.htOver05,   },
    { cat:'GOALS',    market:'HT Over 1.5 Goals',    prob: goals.pHT15,       odds: odds.htOver15,   },
    { cat:'GOALS',    market:'BTTS & Win Home',      prob: result.pBTTS_Home, odds: odds.bttsWinH,   },
    { cat:'GOALS',    market:'BTTS & Win Away',      prob: result.pBTTS_Away, odds: odds.bttsWinA,   },
    // ── CORNERS ──────────────────────────────────────────────────────────────
    { cat:'CORNERS',  market:'Over 8.5 Corners',     prob: corners.pOver85,   odds: odds.cornersO85, },
    { cat:'CORNERS',  market:'Over 9.5 Corners',     prob: corners.pOver95,   odds: odds.cornersO95, },
    { cat:'CORNERS',  market:'Over 10.5 Corners',    prob: corners.pOver105,  odds: odds.cornersO105,},
    { cat:'CORNERS',  market:'Over 11.5 Corners',    prob: corners.pOver115,  odds: odds.cornersO115,},
    { cat:'CORNERS',  market:'Over 12.5 Corners',    prob: corners.pOver125,  odds: odds.cornersO125,},
    { cat:'CORNERS',  market:'Under 9.5 Corners',    prob:1-corners.pOver95,  odds: odds.cornersU95, },
    { cat:'CORNERS',  market:'HT Over 4.5 Corners',  prob: corners.pHT45,     odds: odds.htCornO45,  },
    { cat:'CORNERS',  market:'HT Over 5.5 Corners',  prob: corners.pHT55,     odds: odds.htCornO55,  },
    { cat:'CORNERS',  market:'Home Gets More Corners',prob:corners.pHomeMore,  odds: odds.homeMoreC,  },
    { cat:'CORNERS',  market:'Away Gets More Corners',prob:corners.pAwayMore,  odds: odds.awayMoreC,  },
    // ── CARDS ─────────────────────────────────────────────────────────────────
    { cat:'CARDS',    market:'Over 2.5 Cards',       prob: cards.pOver25C,    odds: odds.cardsO25,   },
    { cat:'CARDS',    market:'Over 3.5 Cards',       prob: cards.pOver35C,    odds: odds.cardsO35,   },
    { cat:'CARDS',    market:'Over 4.5 Cards',       prob: cards.pOver45C,    odds: odds.cardsO45,   },
    { cat:'CARDS',    market:'Over 5.5 Cards',       prob: cards.pOver55C,    odds: odds.cardsO55,   },
    { cat:'CARDS',    market:'Red Card in Match',    prob: cards.pRedCard,    odds: odds.redCard,    },
    { cat:'CARDS',    market:'Both Teams Get Carded',prob: cards.pBothCard,   odds: odds.bothCarded, },
    { cat:'CARDS',    market:'Booking Pts Over 25',  prob: cards.pOver25Pts,  odds: odds.bkPtsO25,   },
    { cat:'CARDS',    market:'Booking Pts Over 35',  prob: cards.pOver35Pts,  odds: odds.bkPtsO35,   },
    { cat:'CARDS',    market:'Booking Pts Over 50',  prob: cards.pOver50Pts,  odds: odds.bkPtsO50,   },
    // ── SHOTS ─────────────────────────────────────────────────────────────────
    { cat:'SHOTS',    market:'Over 22.5 Total Shots',prob: shots.pO225T,      odds: odds.shotsO225,  },
    { cat:'SHOTS',    market:'Over 24.5 Total Shots',prob: shots.pO245T,      odds: odds.shotsO245,  },
    { cat:'SHOTS',    market:'Over 7.5 Shots on Tgt',prob: shots.pO75SOT,     odds: odds.sotO75,     },
    { cat:'SHOTS',    market:'Over 8.5 Shots on Tgt',prob: shots.pO85SOT,     odds: odds.sotO85,     },
    // ── OFFSIDES ──────────────────────────────────────────────────────────────
    { cat:'OFFSIDES', market:'Over 3.5 Offsides',    prob: offsides.pO35,     odds: odds.offO35,     },
    { cat:'OFFSIDES', market:'Over 4.5 Offsides',    prob: offsides.pO45,     odds: odds.offO45,     },
    { cat:'OFFSIDES', market:'Over 5.5 Offsides',    prob: offsides.pO55,     odds: odds.offO55,     },
    // ── FOULS ─────────────────────────────────────────────────────────────────
    { cat:'FOULS',    market:'Over 20.5 Fouls',      prob: fouls.pO205,       odds: odds.foulsO205,  },
    { cat:'FOULS',    market:'Over 22.5 Fouls',      prob: fouls.pO225,       odds: odds.foulsO225,  },
    { cat:'FOULS',    market:'Over 24.5 Fouls',      prob: fouls.pO245,       odds: odds.foulsO245,  },
    // ── TIMING ────────────────────────────────────────────────────────────────
    { cat:'TIMING',   market:'Goal in 1st Half',     prob: timing.p1stHalf,   odds: odds.goal1stHalf,},
    { cat:'TIMING',   market:'Late Goal (75–90)',     prob: timing.pGoalIn80_90,odds: odds.lateGoal, },
    { cat:'TIMING',   market:'First Goal After 15\''  ,prob:timing.pFirstO15,  odds: odds.firstO15,  },
    // ── PENALTY ───────────────────────────────────────────────────────────────
    { cat:'PENALTY',  market:'Penalty Awarded – Yes', prob: penalty.pYes,     odds: odds.penYes,     },
    { cat:'PENALTY',  market:'Penalty Awarded – No',  prob: penalty.pNo,      odds: odds.penNo,      },
  ]

  // Calculate EV and gap for every pick
  const processed = allPicks.map(pick => {
    const impProb = impl(pick.odds)
    const evVal   = ev(pick.prob, pick.odds)
    const gap     = impProb != null ? pick.prob - impProb : null
    const kellySz = kelly(pick.prob, pick.odds)
    const grade   = valueGrade(evVal, gap)
    return { ...pick, impl: impProb, ev: evVal, gap, kelly: kellySz, grade }
  })

  // Filter to only picks where we have odds and rank by EV
  const ranked = processed
    .filter(p => p.odds != null && p.ev != null)
    .sort((a, b) => (b.ev ?? -99) - (a.ev ?? -99))

  const valuePicks = ranked.filter(p => (p.ev ?? 0) > 0 && (p.gap ?? 0) > 0.02)
  const topPick    = valuePicks[0] ?? ranked[0] ?? null

  return { goals, corners, cards, result, shots, offsides, fouls, timing, penalty, allPicks: processed, ranked, valuePicks, topPick }
}

// Generate sample bookmaker odds for demo fixtures
export function seedOdds(expGoals, expCorners, expCards, homeWin, draw, awayWin) {
  const o = (prob, margin = 0.08) => prob > 0.01 ? parseFloat((1 / (prob * (1 + margin))).toFixed(2)) : null
  const g = expGoals, c = expCorners, k = expCards
  return {
    homeWin: o(homeWin), draw: o(draw), awayWin: o(awayWin),
    dc1x: o(homeWin + draw), dcx2: o(draw + awayWin), dc12: o(homeWin + awayWin),
    dnbHome: o(homeWin / (homeWin + awayWin)), dnbAway: o(awayWin / (homeWin + awayWin)),
    ht1: o(homeWin * 0.68), htX: o(0.46), ht2: o(awayWin * 0.68),
    wtnHome: o(homeWin * 0.30), wtnAway: o(awayWin * 0.22),
    bttsYes: o(0.52), bttsNo: o(0.48),
    over05: o(0.95), over15: o(0.78), over25: o(0.52), over35: o(0.30), over45: o(0.16),
    under25: o(0.48), htOver05: o(0.72), htOver15: o(0.38),
    bttsWinH: o(homeWin * 0.50), bttsWinA: o(awayWin * 0.50),
    cornersO85: o(0.72), cornersO95: o(0.58), cornersO105: o(0.44),
    cornersO115: o(0.30), cornersO125: o(0.18), cornersU95: o(0.42),
    htCornO45: o(0.60), htCornO55: o(0.42),
    homeMoreC: o(0.44), awayMoreC: o(0.38),
    cardsO25: o(0.78), cardsO35: o(0.55), cardsO45: o(0.32), cardsO55: o(0.18),
    redCard: o(0.22), bothCarded: o(0.60),
    bkPtsO25: o(0.80), bkPtsO35: o(0.60), bkPtsO50: o(0.35),
    shotsO225: o(0.60), shotsO245: o(0.44), sotO75: o(0.58), sotO85: o(0.40),
    offO35: o(0.55), offO45: o(0.38), offO55: o(0.24),
    foulsO205: o(0.62), foulsO225: o(0.44), foulsO245: o(0.28),
    goal1stHalf: o(0.58), lateGoal: o(0.42), firstO15: o(0.72),
    penYes: o(0.28), penNo: o(0.72),
  }
}

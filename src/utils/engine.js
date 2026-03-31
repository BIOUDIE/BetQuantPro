// ─── Quant Engine ─────────────────────────────────────────────────────────────
// All the statistical formulas from the blueprint

/**
 * xG Luck Score
 * Positive = home team over-performed their underlying quality (fluky win)
 */
export function calcLuckScore(homeGoals, awayGoals, homeXG, awayXG) {
  return (homeGoals - homeXG) - (awayGoals - awayXG)
}

/**
 * Pressure Index  ∈ [0,1]
 * possession_pct ∈ [0,100], shotsOnTarget ∈ raw count, corners ∈ raw count
 */
export function calcPressureIndex(possessionPct, shotsOnTarget, corners) {
  return (
    0.4  * (possessionPct / 100) +
    0.35 * (shotsOnTarget / 10) +
    0.25 * (corners / 12)
  )
}

/**
 * Volatility Score — normalised per minute
 * yellowCards, redCards, fouls, minutesPlayed
 */
export function calcVolatilityScore(yellowCards, redCards, fouls, minutesPlayed = 90) {
  return (yellowCards * 10 + redCards * 25 + fouls * 1.5) / minutesPlayed
}

/**
 * Implied probability from decimal odds (margin-adjusted)
 * margin default 0.05 (5% bookmaker vig)
 */
export function impliedProbability(decimalOdds, margin = 0.05) {
  return (1 / decimalOdds) / (1 + margin)
}

/**
 * Value Gap — the edge your model has over the bookmaker
 */
export function calcValueGap(calcProb, impliedProb) {
  return calcProb - impliedProb
}

/**
 * Expected Value per unit stake
 * EV > 0 → positive edge, place bet
 */
export function calcEV(calcProb, decimalOdds) {
  return calcProb * decimalOdds - 1
}

/**
 * Kelly Criterion — optimal fraction of bankroll to stake
 * Use fractional Kelly (multiply by 0.25–0.5) for safety
 */
export function calcKelly(calcProb, decimalOdds, fraction = 0.5) {
  const b = decimalOdds - 1
  const q = 1 - calcProb
  const full = (calcProb * b - q) / b
  return Math.max(0, full * fraction)
}

/**
 * Composite Fluke Score ∈ [0,1]
 * Higher = team is overvalued by the market → FADE signal
 */
export function calcFlukeScore(luckScore, pressureIndex, xgSelf, xgOpp, volatilityScore) {
  const normLuck    = Math.min(Math.max((luckScore + 2) / 4, 0), 1)   // normalise [-2,+2] → [0,1]
  const antiPress   = 1 - Math.min(pressureIndex, 1)
  const xgRatio     = xgSelf > 0 ? Math.min(xgOpp / xgSelf, 2) / 2 : 0.5
  const normVol     = Math.min(volatilityScore / 5, 1)
  return (
    0.40 * normLuck +
    0.25 * antiPress +
    0.25 * xgRatio +
    0.10 * normVol
  )
}

/**
 * Sharpe Ratio of a returns series
 */
export function calcSharpe(returns) {
  if (returns.length < 2) return 0
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length
  const std = Math.sqrt(variance)
  return std === 0 ? 0 : mean / std
}

/**
 * Max Drawdown from a bankroll array
 */
export function calcMaxDrawdown(bankrollSeries) {
  let peak = -Infinity, maxDD = 0
  for (const v of bankrollSeries) {
    if (v > peak) peak = v
    const dd = (peak - v) / peak
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

/**
 * Parse a strategy string into condition tokens
 * Returns array of { field, operator, value, atMinute? }
 */
export function parseStrategy(strategyString) {
  const clauses = strategyString.split(/\bAND\b/i).map(s => s.trim()).filter(Boolean)
  return clauses.map(clause => {
    const atMatch = clause.match(/AT\s+min\s*=\s*(\d+)/i)
    const atMinute = atMatch ? parseInt(atMatch[1]) : null
    const clean = clause.replace(/AT\s+min\s*=\s*\d+/i, '').trim()
    const match = clean.match(/^(\w+)\s*([><=!]+)\s*(.+)$/)
    if (!match) return { raw: clause, atMinute }
    return {
      field:    match[1],
      operator: match[2],
      value:    match[3].replace(/['"]/g, ''),
      atMinute,
      raw:      clause,
    }
  })
}

/**
 * Simulate backtest over an array of match objects
 * Returns { bets, roi, maxDrawdown, sharpe, winRate }
 */
export function runBacktest(matches, parsedConditions, threshold = 0.05, stakeMode = 'kelly', initialBankroll = 1000) {
  let bankroll = initialBankroll
  const bets   = []
  const returns = []

  for (const match of matches) {
    // Check each condition (simplified field lookup)
    const allPass = parsedConditions.every(cond => {
      const val = match[cond.field]
      if (val === undefined) return true   // can't evaluate → pass through
      const num = parseFloat(val)
      switch (cond.operator) {
        case '>':  return num > parseFloat(cond.value)
        case '<':  return num < parseFloat(cond.value)
        case '>=': return num >= parseFloat(cond.value)
        case '<=': return num <= parseFloat(cond.value)
        case '=':
        case '==': return String(val) === String(cond.value)
        default:   return true
      }
    })
    if (!allPass) continue

    const gap  = match.gap   ?? Math.random() * 0.12 - 0.02
    const ev   = match.ev    ?? gap * 2
    if (gap < threshold) continue

    const kelly  = match.kelly ?? calcKelly(match.calc ?? 0.55, match.odds ?? 2.1)
    const stake  = stakeMode === 'kelly' ? bankroll * kelly
                 : stakeMode === 'flat'  ? 10
                 : bankroll * 0.02

    const won    = match.result === 'WIN' || Math.random() < (match.calc ?? 0.5)
    const profit = won ? stake * ((match.odds ?? 2.0) - 1) : -stake
    bankroll    += profit
    returns.push(profit / (bankroll - profit))

    bets.push({ ...match, stake: +stake.toFixed(2), profit: +profit.toFixed(2), bankroll: +bankroll.toFixed(2), won })
  }

  const roi         = ((bankroll - initialBankroll) / initialBankroll) * 100
  const maxDrawdown = calcMaxDrawdown(bets.map(b => b.bankroll))
  const sharpe      = calcSharpe(returns)
  const winRate     = bets.length > 0 ? bets.filter(b => b.won).length / bets.length : 0

  return { bets, roi, maxDrawdown, sharpe, winRate, finalBankroll: bankroll }
}

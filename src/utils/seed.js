// ─── Seed / Demo Data ────────────────────────────────────────────────────────

export function seedROI() {
  const data = []
  let bankroll = 1000
  let baseline = 1000
  for (let i = 0; i < 52; i++) {
    const week  = `W${String(i + 1).padStart(2, '0')}`
    const delta = (Math.random() - 0.38) * 60 + i * 0.4
    bankroll    = Math.max(bankroll + delta, 400)
    baseline   += 8
    data.push({
      week,
      bankroll: parseFloat(bankroll.toFixed(2)),
      baseline: parseFloat(baseline.toFixed(2)),
      ev:       parseFloat((Math.random() * 0.18 - 0.04).toFixed(3)),
    })
  }
  return data
}

const MARKETS = ['Home Win', 'BTTS Yes', 'Over 2.5', 'Draw', 'Away Win', 'Booking O4.5']
const FIXTURES = [
  ['Arsenal', 'Chelsea'],     ['Man City', 'Liverpool'],
  ['Napoli', 'Inter'],        ['PSG', 'Lyon'],
  ['Dortmund', 'Bayern'],     ['Real Madrid', 'Atletico'],
  ['Porto', 'Benfica'],       ['Ajax', 'PSV'],
  ['Tottenham', 'West Ham'],  ['Juventus', 'Milan'],
]

export function seedBets() {
  return Array.from({ length: 20 }, (_, i) => {
    const [h, a] = FIXTURES[i % FIXTURES.length]
    const odds   = +(1.6 + Math.random() * 3).toFixed(2)
    const calc   = +(0.25 + Math.random() * 0.55).toFixed(3)
    const impl   = +(1 / odds).toFixed(3)
    const gap    = +(calc - impl).toFixed(3)
    const ev     = +(calc * odds - 1).toFixed(3)
    const won    = Math.random() > 0.48
    return {
      id:      i + 1,
      match:   `${h} v ${a}`,
      market:  MARKETS[i % MARKETS.length],
      odds,
      calc,
      impl,
      gap,
      ev,
      kelly:   +(Math.max(0, gap / (odds - 1)) * 0.5).toFixed(3),
      result:  won ? 'WIN' : 'LOSS',
      profit:  won ? +(odds - 1).toFixed(2) : -1,
    }
  })
}

export const FLUKE_TEAMS = [
  { name: 'Arsenal',   luck:  1.4, pressure: 0.72, vol: 0.31, fluke: 0.81 },
  { name: 'Napoli',    luck:  1.1, pressure: 0.68, vol: 0.28, fluke: 0.74 },
  { name: 'PSG',       luck:  0.6, pressure: 0.75, vol: 0.22, fluke: 0.55 },
  { name: 'Dortmund',  luck: -0.3, pressure: 0.58, vol: 0.45, fluke: 0.32 },
  { name: 'Liverpool', luck: -0.8, pressure: 0.61, vol: 0.38, fluke: 0.22 },
  { name: 'Inter',     luck: -1.2, pressure: 0.52, vol: 0.55, fluke: 0.11 },
]

export const STRATEGY_TEMPLATES = [
  `home_possession > 60 AND score = "0-0" AT min = 60`,
  `xg_diff > 0.8 AND home_pressure_index > 0.65`,
  `away_luck_score < -0.5 AND odds_home_win > 2.1`,
  `volatility_score > 0.7 AND yellow_cards < 2 AT min = 45`,
]

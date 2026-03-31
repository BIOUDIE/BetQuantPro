import { useState, useMemo } from 'react'
import { C, fmt } from '../theme.js'
import Tag from './Tag.jsx'

// ─── Booking Points Formula ───────────────────────────────────────────────────
// Yellow = 10pts, Red = 25pts, 2nd Yellow (YR) = 35pts total
const calcBookingPoints = (yellows, reds, doubleYellows = 0) =>
  yellows * 10 + reds * 25 + doubleYellows * 35

const bookingRating = (pts) =>
  pts >= 60 ? { label: 'EXPLOSIVE',   color: '#FF3B3B' } :
  pts >= 45 ? { label: 'HIGH',         color: C.red    } :
  pts >= 30 ? { label: 'MODERATE',     color: C.amber  } :
              { label: 'LOW',           color: C.green  }

// ─── League-level discipline data (per match averages) ───────────────────────
const LEAGUE_STATS = [
  { league: 'La Liga',            avgYellow: 4.8, avgRed: 0.18, avgFouls: 26.4, avgBookPts: 52.5, over35Cards: 72, over45Cards: 48, leagueId: 564  },
  { league: 'Serie A',            avgYellow: 4.6, avgRed: 0.16, avgFouls: 24.8, avgBookPts: 50.0, over35Cards: 68, over45Cards: 44, leagueId: 384  },
  { league: 'Bundesliga',         avgYellow: 3.9, avgRed: 0.12, avgFouls: 22.1, avgBookPts: 42.0, over35Cards: 58, over45Cards: 32, leagueId: 82   },
  { league: 'Belgian Pro League', avgYellow: 3.7, avgRed: 0.14, avgFouls: 23.6, avgBookPts: 40.5, over35Cards: 54, over45Cards: 30, leagueId: 4    },
  { league: 'Ligue 1',            avgYellow: 3.6, avgRed: 0.11, avgFouls: 21.8, avgBookPts: 38.8, over35Cards: 52, over45Cards: 28, leagueId: 301  },
  { league: 'Championship',       avgYellow: 3.5, avgRed: 0.10, avgFouls: 24.2, avgBookPts: 37.5, over35Cards: 50, over45Cards: 26, leagueId: 9    },
  { league: 'EPL',                avgYellow: 3.2, avgRed: 0.08, avgFouls: 20.4, avgBookPts: 34.0, over35Cards: 44, over45Cards: 22, leagueId: 8    },
]

// ─── Referee profiles across 7 leagues ───────────────────────────────────────
const REFEREES = [
  // EPL
  { name: 'Anthony Taylor',    league: 'EPL',                avgYellow: 3.82, avgRed: 0.18, strictness: 88, matches: 22, style: 'Strict'   },
  { name: 'Michael Oliver',    league: 'EPL',                avgYellow: 3.65, avgRed: 0.14, strictness: 78, matches: 19, style: 'Firm'      },
  { name: 'Craig Pawson',      league: 'EPL',                avgYellow: 3.40, avgRed: 0.10, strictness: 65, matches: 18, style: 'Moderate'  },
  { name: 'Stuart Attwell',    league: 'EPL',                avgYellow: 3.15, avgRed: 0.08, strictness: 52, matches: 16, style: 'Lenient'   },
  { name: 'Simon Hooper',      league: 'EPL',                avgYellow: 3.60, avgRed: 0.12, strictness: 72, matches: 15, style: 'Firm'      },
  // La Liga
  { name: 'Ricardo De Burgos', league: 'La Liga',            avgYellow: 5.20, avgRed: 0.22, strictness: 92, matches: 20, style: 'Very Strict'},
  { name: 'Mateu Lahoz',       league: 'La Liga',            avgYellow: 5.80, avgRed: 0.28, strictness: 98, matches: 18, style: 'Extreme'   },
  { name: 'Gil Manzano',       league: 'La Liga',            avgYellow: 4.90, avgRed: 0.18, strictness: 85, matches: 21, style: 'Strict'    },
  // Bundesliga
  { name: 'Felix Zwayer',      league: 'Bundesliga',         avgYellow: 4.10, avgRed: 0.14, strictness: 72, matches: 20, style: 'Firm'      },
  { name: 'Daniel Siebert',    league: 'Bundesliga',         avgYellow: 4.40, avgRed: 0.16, strictness: 80, matches: 18, style: 'Strict'    },
  { name: 'Tobias Stieler',    league: 'Bundesliga',         avgYellow: 3.70, avgRed: 0.10, strictness: 62, matches: 17, style: 'Moderate'  },
  // Serie A
  { name: 'Maurizio Mariani',  league: 'Serie A',            avgYellow: 5.10, avgRed: 0.20, strictness: 90, matches: 19, style: 'Very Strict'},
  { name: 'Marco Guida',       league: 'Serie A',            avgYellow: 4.60, avgRed: 0.16, strictness: 78, matches: 21, style: 'Strict'    },
  { name: 'Paolo Valeri',      league: 'Serie A',            avgYellow: 4.30, avgRed: 0.14, strictness: 70, matches: 18, style: 'Firm'      },
  // Ligue 1
  { name: 'Clement Turpin',    league: 'Ligue 1',            avgYellow: 3.80, avgRed: 0.12, strictness: 68, matches: 22, style: 'Moderate'  },
  { name: 'Francois Letexier', league: 'Ligue 1',            avgYellow: 3.50, avgRed: 0.10, strictness: 58, matches: 20, style: 'Lenient'   },
  // Belgian Pro League
  { name: 'Lawrence Visser',   league: 'Belgian Pro League', avgYellow: 3.90, avgRed: 0.16, strictness: 74, matches: 19, style: 'Firm'      },
  { name: 'Bram Van Driessche',league: 'Belgian Pro League', avgYellow: 3.60, avgRed: 0.12, strictness: 62, matches: 18, style: 'Moderate'  },
  // Championship
  { name: 'Tim Robinson',      league: 'Championship',       avgYellow: 3.70, avgRed: 0.12, strictness: 66, matches: 21, style: 'Moderate'  },
  { name: 'Jarred Gillett',    league: 'Championship',       avgYellow: 3.40, avgRed: 0.10, strictness: 55, matches: 19, style: 'Lenient'   },
]

// ─── Today's fixture samples with full booking model data ────────────────────
const generateFixtures = () => [
  {
    id: 'b1', match: 'Arsenal v Chelsea',        league: 'EPL',                referee: 'Anthony Taylor',
    homeTeam: { name: 'Arsenal',    avgYellow: 1.8, avgFouls: 10.2, lastFiveCards: [2,3,1,4,2], isDerby: false },
    awayTeam: { name: 'Chelsea',    avgYellow: 2.4, avgFouls: 12.8, lastFiveCards: [3,4,2,3,5], isDerby: false },
    isDerby: false, matchImportance: 'Title Race', kickoff: '15:00',
    odds: { over35: 1.72, under35: 2.05, over45: 2.80, under45: 1.42, homeMoreCards: 2.60, awayMoreCards: 1.55 },
  },
  {
    id: 'b2', match: 'Real Madrid v Atletico',   league: 'La Liga',            referee: 'Mateu Lahoz',
    homeTeam: { name: 'Real Madrid', avgYellow: 2.1, avgFouls: 11.4, lastFiveCards: [3,2,4,2,3], isDerby: true  },
    awayTeam: { name: 'Atletico',    avgYellow: 3.2, avgFouls: 15.6, lastFiveCards: [4,5,3,6,4], isDerby: true  },
    isDerby: true, matchImportance: 'Derby',     kickoff: '20:00',
    odds: { over35: 1.55, under35: 2.45, over45: 2.10, under45: 1.68, homeMoreCards: 3.20, awayMoreCards: 1.38 },
  },
  {
    id: 'b3', match: 'Bayern v Dortmund',        league: 'Bundesliga',         referee: 'Felix Zwayer',
    homeTeam: { name: 'Bayern',     avgYellow: 1.6, avgFouls: 9.8,  lastFiveCards: [1,2,2,1,3], isDerby: true  },
    awayTeam: { name: 'Dortmund',   avgYellow: 2.2, avgFouls: 12.2, lastFiveCards: [2,3,2,4,2], isDerby: true  },
    isDerby: true, matchImportance: 'Derby',     kickoff: '17:30',
    odds: { over35: 1.88, under35: 1.90, over45: 3.10, under45: 1.33, homeMoreCards: 2.80, awayMoreCards: 1.48 },
  },
  {
    id: 'b4', match: 'Napoli v Inter',           league: 'Serie A',            referee: 'Maurizio Mariani',
    homeTeam: { name: 'Napoli',     avgYellow: 2.4, avgFouls: 13.2, lastFiveCards: [3,4,2,5,3], isDerby: false },
    awayTeam: { name: 'Inter',      avgYellow: 2.0, avgFouls: 11.8, lastFiveCards: [2,3,3,2,4], isDerby: false },
    isDerby: false, matchImportance: 'Top 4 Clash', kickoff: '19:45',
    odds: { over35: 1.62, under35: 2.25, over45: 2.40, under45: 1.55, homeMoreCards: 1.90, awayMoreCards: 1.92 },
  },
  {
    id: 'b5', match: 'PSG v Lyon',               league: 'Ligue 1',            referee: 'Clement Turpin',
    homeTeam: { name: 'PSG',        avgYellow: 1.9, avgFouls: 10.6, lastFiveCards: [2,2,3,1,2], isDerby: false },
    awayTeam: { name: 'Lyon',       avgYellow: 2.1, avgFouls: 11.4, lastFiveCards: [2,3,2,3,2], isDerby: false },
    isDerby: false, matchImportance: 'Regular',   kickoff: '20:00',
    odds: { over35: 2.05, under35: 1.75, over45: 3.40, under45: 1.28, homeMoreCards: 2.20, awayMoreCards: 1.68 },
  },
  {
    id: 'b6', match: 'Club Brugge v Anderlecht', league: 'Belgian Pro League', referee: 'Lawrence Visser',
    homeTeam: { name: 'Club Brugge',avgYellow: 2.2, avgFouls: 12.4, lastFiveCards: [3,2,4,3,3], isDerby: true  },
    awayTeam: { name: 'Anderlecht', avgYellow: 2.6, avgFouls: 13.8, lastFiveCards: [4,3,3,5,4], isDerby: true  },
    isDerby: true, matchImportance: 'Derby',      kickoff: '18:00',
    odds: { over35: 1.68, under35: 2.15, over45: 2.60, under45: 1.48, homeMoreCards: 2.10, awayMoreCards: 1.74 },
  },
  {
    id: 'b7', match: 'Leeds v Sunderland',       league: 'Championship',       referee: 'Tim Robinson',
    homeTeam: { name: 'Leeds',      avgYellow: 2.3, avgFouls: 13.6, lastFiveCards: [3,4,2,3,4], isDerby: false },
    awayTeam: { name: 'Sunderland', avgYellow: 2.0, avgFouls: 12.4, lastFiveCards: [2,3,3,2,3], isDerby: false },
    isDerby: false, matchImportance: 'Promotion Push', kickoff: '15:00',
    odds: { over35: 1.75, under35: 2.05, over45: 2.90, under45: 1.38, homeMoreCards: 1.85, awayMoreCards: 1.98 },
  },
  {
    id: 'b8', match: 'Man City v Liverpool',     league: 'EPL',                referee: 'Michael Oliver',
    homeTeam: { name: 'Man City',   avgYellow: 1.6, avgFouls: 10.0, lastFiveCards: [2,1,2,2,1], isDerby: false },
    awayTeam: { name: 'Liverpool',  avgYellow: 1.8, avgFouls: 10.8, lastFiveCards: [2,2,1,3,2], isDerby: false },
    isDerby: false, matchImportance: 'Title Decider', kickoff: '16:30',
    odds: { over35: 2.20, under35: 1.65, over45: 3.60, under45: 1.22, homeMoreCards: 2.40, awayMoreCards: 1.62 },
  },
]

// ─── Booking model: compute expected booking points for a fixture ─────────────
function modelBookings(fixture) {
  const ref       = REFEREES.find(r => r.name === fixture.referee) ?? { avgYellow: 3.5, avgRed: 0.12, strictness: 65 }
  const leagueSt  = LEAGUE_STATS.find(l => l.league === fixture.league) ?? LEAGUE_STATS[6]

  const homeAvg   = fixture.homeTeam.avgYellow
  const awayAvg   = fixture.awayTeam.avgYellow
  const homeFouls = fixture.homeTeam.avgFouls
  const awayFouls = fixture.awayTeam.avgFouls

  // Base expected yellows — weighted blend of team averages and ref tendency
  const baseYellows = (
    (homeAvg + awayAvg) * 0.50 +
    ref.avgYellow        * 0.30 +
    leagueSt.avgYellow   * 0.20
  )

  // Modifiers
  const derbyMod      = fixture.isDerby      ? 1.18 : 1.00
  const importanceMod =
    fixture.matchImportance === 'Derby'        ? 1.15 :
    fixture.matchImportance === 'Title Race'   ? 1.10 :
    fixture.matchImportance === 'Title Decider'? 1.12 :
    fixture.matchImportance === 'Promotion Push'? 1.08 :
    fixture.matchImportance === 'Top 4 Clash'  ? 1.06 : 1.00
  const foulMod       = ((homeFouls + awayFouls) / leagueSt.avgFouls) * 0.85 + 0.15
  const strictMod     = (ref.strictness / 65) * 0.40 + 0.60

  const expectedYellows = baseYellows * derbyMod * importanceMod * foulMod * strictMod
  const expectedReds    = ref.avgRed * derbyMod * importanceMod

  const expectedBookPts = calcBookingPoints(expectedYellows, expectedReds)

  // Probability estimates
  const over35Prob = Math.min(0.95, Math.max(0.05, (expectedYellows - 2.5) / 3.5))
  const over45Prob = Math.min(0.90, Math.max(0.05, (expectedYellows - 3.5) / 3.5))
  const over25Prob = Math.min(0.98, Math.max(0.05, (expectedYellows - 1.5) / 3.5))

  // Value gaps (model vs implied)
  const margin     = 0.05
  const implOver35 = fixture.odds?.over35 ? (1 / fixture.odds.over35) / (1 + margin) : null
  const implOver45 = fixture.odds?.over45 ? (1 / fixture.odds.over45) / (1 + margin) : null
  const gap35      = implOver35 != null ? over35Prob - implOver35 : null
  const gap45      = implOver45 != null ? over45Prob - implOver45 : null
  const ev35       = implOver35 != null && fixture.odds?.over35
    ? over35Prob * fixture.odds.over35 - 1 : null
  const ev45       = implOver45 != null && fixture.odds?.over45
    ? over45Prob * fixture.odds.over45 - 1 : null

  // Best pick
  const picks = [
    { market: 'Over 3.5 Cards', prob: over35Prob, odds: fixture.odds?.over35, ev: ev35, gap: gap35 },
    { market: 'Over 4.5 Cards', prob: over45Prob, odds: fixture.odds?.over45, ev: ev45, gap: gap45 },
    { market: 'Over 2.5 Cards', prob: over25Prob, odds: fixture.odds?.over35 ? fixture.odds.over35 * 0.55 : null, ev: null, gap: null },
  ].filter(p => p.ev != null).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))

  const bestPick = picks[0] ?? null
  const confidence =
    bestPick?.ev > 0.08 && bestPick?.gap > 0.06 ? 'HIGH' :
    bestPick?.ev > 0.03 && bestPick?.gap > 0.03 ? 'MEDIUM' : 'LOW'

  // Last 5 trend
  const last5 = fixture.homeTeam.lastFiveCards.map((h, i) => h + fixture.awayTeam.lastFiveCards[i])
  const last5Avg = last5.reduce((a, b) => a + b, 0) / 5

  return {
    expectedYellows:  parseFloat(expectedYellows.toFixed(2)),
    expectedReds:     parseFloat(expectedReds.toFixed(2)),
    expectedBookPts:  parseFloat(expectedBookPts.toFixed(1)),
    over35Prob:       parseFloat(over35Prob.toFixed(3)),
    over45Prob:       parseFloat(over45Prob.toFixed(3)),
    over25Prob:       parseFloat(over25Prob.toFixed(3)),
    gap35, gap45, ev35, ev45,
    bestPick, confidence,
    last5, last5Avg:  parseFloat(last5Avg.toFixed(1)),
    refereeProfile:   ref,
    modifiers: { derby: derbyMod, importance: importanceMod, foul: foulMod, strict: strictMod },
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────
const CONF_COLOR = { HIGH: C.green, MEDIUM: C.amber, LOW: C.muted }

function MiniBar({ value, max, color }) {
  return (
    <div style={{ height: 4, background: C.bg3, borderRadius: 1, overflow: 'hidden', marginTop: 3 }}>
      <div style={{
        width: `${Math.min((value / max) * 100, 100)}%`,
        height: '100%', background: color, borderRadius: 1,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

function StrictnessGauge({ value }) {
  const color = value >= 85 ? C.red : value >= 70 ? C.amber : C.green
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: C.bg3, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: 10, color, fontWeight: 700, minWidth: 24 }}>{value}</span>
    </div>
  )
}

function SparkLine({ values, color }) {
  const max  = Math.max(...values, 1)
  const w    = 60, h = 22
  const pts  = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={(i / (values.length - 1)) * w} cy={h - (v / max) * h} r={1.8} fill={color} />
      ))}
    </svg>
  )
}

// ─── Fixture booking card ────────────────────────────────────────────────────
function BookingCard({ fixture, model }) {
  const [open, setOpen] = useState(false)
  const rating = bookingRating(model.expectedBookPts)
  const ref    = model.refereeProfile

  return (
    <div style={{
      background:   C.bg1,
      border:       `1px solid ${model.confidence === 'HIGH' ? C.green + '44' : C.border}`,
      borderLeft:   `3px solid ${CONF_COLOR[model.confidence] ?? C.border}`,
      borderRadius:  2,
      marginBottom:  8,
      overflow:     'hidden',
    }}>
      {/* Header */}
      <div onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', background: C.bg2, cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.white }}>{fixture.match}</span>
            <Tag color={C.blue}>{fixture.league}</Tag>
            {fixture.isDerby && <Tag color={C.red}>DERBY</Tag>}
            <span style={{ fontSize: 9, color: C.textD }}>{fixture.kickoff}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 9, color: C.textDD }}>Ref: {fixture.referee}</span>
            <span style={{ fontSize: 9, color: C.textDD }}>·</span>
            <span style={{ fontSize: 9, color: C.textDD }}>{fixture.matchImportance}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Expected cards pill */}
          <div style={{
            background: rating.color + '22', border: `1px solid ${rating.color}55`,
            borderRadius: 2, padding: '4px 10px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 8, color: C.muted }}>EXP CARDS</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: rating.color }}>
              {model.expectedYellows}
            </div>
          </div>
          {/* Booking pts pill */}
          <div style={{
            background: C.amber + '18', border: `1px solid ${C.amber}44`,
            borderRadius: 2, padding: '4px 10px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 8, color: C.muted }}>BOOK PTS</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.amberL }}>
              {model.expectedBookPts}
            </div>
          </div>

          {/* Best pick odds */}
          {model.bestPick && (
            <div style={{
              background: model.bestPick.ev > 0 ? C.green + '18' : C.bg3,
              border: `1px solid ${model.bestPick.ev > 0 ? C.green + '44' : C.border}`,
              borderRadius: 2, padding: '4px 10px', textAlign: 'center', minWidth: 60,
            }}>
              <div style={{ fontSize: 8, color: C.muted, whiteSpace: 'nowrap' }}>
                {model.bestPick.market.replace('Cards', '')}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: model.bestPick.ev > 0 ? C.green : C.white }}>
                {model.bestPick.odds?.toFixed(2)}
              </div>
            </div>
          )}

          <Tag color={CONF_COLOR[model.confidence] ?? C.muted}>{model.confidence}</Tag>
          <span style={{ fontSize: 14, color: C.textD }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 3-column stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>

            {/* Home team discipline */}
            <div style={{ background: C.bg0, border: `1px solid ${C.border}`, borderRadius: 2, padding: 12 }}>
              <div style={{ fontSize: 9, color: C.amber, letterSpacing: '0.1em', marginBottom: 8 }}>
                {fixture.homeTeam.name.toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: C.white, marginBottom: 2 }}>
                Avg yellow: <strong>{fixture.homeTeam.avgYellow}</strong>
              </div>
              <div style={{ fontSize: 11, color: C.textD, marginBottom: 8 }}>
                Avg fouls: {fixture.homeTeam.avgFouls}
              </div>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>LAST 5 CARD TREND</div>
              <SparkLine values={fixture.homeTeam.lastFiveCards} color={C.amber} />
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {fixture.homeTeam.lastFiveCards.map((c, i) => (
                  <span key={i} style={{ fontSize: 9, color: c >= 4 ? C.red : c >= 3 ? C.amber : C.green }}>{c}</span>
                ))}
              </div>
            </div>

            {/* Referee profile */}
            <div style={{ background: C.bg0, border: `1px solid ${C.blue}33`, borderRadius: 2, padding: 12 }}>
              <div style={{ fontSize: 9, color: C.blue, letterSpacing: '0.1em', marginBottom: 8 }}>
                REFEREE PROFILE
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.white, marginBottom: 6 }}>
                {fixture.referee}
              </div>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 3 }}>STRICTNESS</div>
              <StrictnessGauge value={ref.strictness} />
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ fontSize: 10, color: C.textD }}>
                  Avg yellows/game: <span style={{ color: C.white, fontWeight: 700 }}>{ref.avgYellow}</span>
                </div>
                <div style={{ fontSize: 10, color: C.textD }}>
                  Avg reds/game: <span style={{ color: C.white, fontWeight: 700 }}>{ref.avgRed}</span>
                </div>
                <div style={{ fontSize: 10, color: C.textD }}>
                  Style: <Tag color={ref.strictness >= 85 ? C.red : ref.strictness >= 70 ? C.amber : C.green}>
                    {ref.style}
                  </Tag>
                </div>
                <div style={{ fontSize: 9, color: C.textDD }}>
                  {ref.matches} matches this season
                </div>
              </div>
            </div>

            {/* Away team discipline */}
            <div style={{ background: C.bg0, border: `1px solid ${C.border}`, borderRadius: 2, padding: 12 }}>
              <div style={{ fontSize: 9, color: C.blue, letterSpacing: '0.1em', marginBottom: 8 }}>
                {fixture.awayTeam.name.toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: C.white, marginBottom: 2 }}>
                Avg yellow: <strong>{fixture.awayTeam.avgYellow}</strong>
              </div>
              <div style={{ fontSize: 11, color: C.textD, marginBottom: 8 }}>
                Avg fouls: {fixture.awayTeam.avgFouls}
              </div>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>LAST 5 CARD TREND</div>
              <SparkLine values={fixture.awayTeam.lastFiveCards} color={C.blue} />
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {fixture.awayTeam.lastFiveCards.map((c, i) => (
                  <span key={i} style={{ fontSize: 9, color: c >= 4 ? C.red : c >= 3 ? C.amber : C.green }}>{c}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Model output */}
          <div style={{
            background: C.bg0, border: `1px solid ${C.amber}33`,
            borderTop: `2px solid ${C.amber}`, borderRadius: 2, padding: 12,
          }}>
            <div style={{ fontSize: 9, color: C.amber, letterSpacing: '0.1em', marginBottom: 10 }}>
              BOOKING MODEL OUTPUT
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
              {[
                { label: 'EXP YELLOWS',  val: model.expectedYellows, color: C.amberL },
                { label: 'EXP REDS',     val: model.expectedReds,    color: C.red    },
                { label: 'EXP BOOK PTS', val: model.expectedBookPts, color: C.amberL },
                { label: 'LAST 5 AVG',   val: `${model.last5Avg} cards`, color: C.textD },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 2, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, color: C.muted, marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Probability bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Over 2.5 Cards', prob: model.over25Prob, color: C.green  },
                { label: 'Over 3.5 Cards', prob: model.over35Prob, color: C.amber  },
                { label: 'Over 4.5 Cards', prob: model.over45Prob, color: C.red    },
              ].map(({ label, prob, color }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: C.textD }}>{label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color }}>{(prob * 100).toFixed(1)}%</span>
                  </div>
                  <MiniBar value={prob} max={1} color={color} />
                </div>
              ))}
            </div>
          </div>

          {/* Value bets from bookings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em' }}>BOOKINGS MARKETS — VALUE ANALYSIS</div>
            {[
              {
                market: 'Over 3.5 Cards',
                prob: model.over35Prob, odds: fixture.odds?.over35,
                ev: model.ev35, gap: model.gap35,
              },
              {
                market: 'Under 3.5 Cards',
                prob: 1 - model.over35Prob, odds: fixture.odds?.under35,
                ev: fixture.odds?.under35 ? (1 - model.over35Prob) * fixture.odds.under35 - 1 : null,
                gap: fixture.odds?.under35 ? (1 - model.over35Prob) - (1 / fixture.odds.under35) / (1 + 0.05) : null,
              },
              {
                market: 'Over 4.5 Cards',
                prob: model.over45Prob, odds: fixture.odds?.over45,
                ev: model.ev45, gap: model.gap45,
              },
              {
                market: 'Away Gets More Cards',
                prob: null, odds: fixture.odds?.awayMoreCards,
                ev: null, gap: null, note: 'Derby / high-pressure game context',
              },
            ].map((pick, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                background: (pick.ev ?? 0) > 0.05 ? C.green + '0D' : C.bg2,
                border: `1px solid ${(pick.ev ?? 0) > 0.05 ? C.green + '33' : C.border}`,
                borderRadius: 2,
              }}>
                {(pick.ev ?? 0) > 0.05 && <span style={{ fontSize: 11 }}>⭐</span>}
                <span style={{ flex: 1, fontSize: 11, color: C.white, fontWeight: (pick.ev ?? 0) > 0.05 ? 700 : 400 }}>
                  {pick.market}
                </span>
                {pick.prob != null && (
                  <span style={{ fontSize: 10, color: C.textD }}>
                    p={((pick.prob ?? 0) * 100).toFixed(1)}%
                  </span>
                )}
                {pick.odds && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.amberL }}>{pick.odds.toFixed(2)}</span>
                )}
                {pick.ev != null && (
                  <span style={{ fontSize: 10, color: pick.ev > 0 ? C.green : C.red }}>
                    EV {pick.ev > 0 ? '+' : ''}{pick.ev.toFixed(3)}
                  </span>
                )}
                {pick.gap != null && (
                  <span style={{ fontSize: 10, color: (pick.gap ?? 0) > 0 ? C.green : C.muted }}>
                    gap {pick.gap > 0 ? '+' : ''}{((pick.gap ?? 0) * 100).toFixed(1)}%
                  </span>
                )}
                {pick.note && <span style={{ fontSize: 9, color: C.textDD }}>{pick.note}</span>}
              </div>
            ))}
          </div>

          {/* Modifier breakdown */}
          <div style={{
            display: 'flex', gap: 8, flexWrap: 'wrap',
            padding: '8px 12px', background: C.bg0, border: `1px solid ${C.border}`, borderRadius: 2,
          }}>
            <span style={{ fontSize: 9, color: C.muted, letterSpacing: '0.08em', marginRight: 4 }}>MODIFIERS:</span>
            {[
              { label: 'Derby boost',    val: model.modifiers.derby,      active: model.modifiers.derby > 1 },
              { label: 'Stakes boost',   val: model.modifiers.importance, active: model.modifiers.importance > 1 },
              { label: 'Foul intensity', val: model.modifiers.foul,       active: model.modifiers.foul > 1 },
              { label: 'Ref strictness', val: model.modifiers.strict,     active: model.modifiers.strict > 1 },
            ].map(({ label, val, active }) => (
              <span key={label} style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 1,
                background: active ? C.amber + '22' : C.bg2,
                border: `1px solid ${active ? C.amber + '55' : C.border}`,
                color: active ? C.amberL : C.textDD,
              }}>
                {label}: ×{val.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── League overview table ────────────────────────────────────────────────────
function LeagueOverview() {
  const sorted = [...LEAGUE_STATS].sort((a, b) => b.avgBookPts - a.avgBookPts)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: C.bg2 }}>
            {['LEAGUE', 'AVG YELLOWS', 'AVG REDS', 'AVG FOULS', 'AVG BOOK PTS', 'OVER 3.5 %', 'OVER 4.5 %'].map(h => (
              <th key={h} style={{
                fontSize: 8, color: C.muted, letterSpacing: '0.1em', textAlign: h === 'LEAGUE' ? 'left' : 'right',
                padding: '7px 10px', borderBottom: `1px solid ${C.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((l, i) => {
            const pts = bookingRating(l.avgBookPts)
            return (
              <tr key={l.league} style={{ background: i % 2 === 0 ? C.bg1 : C.bg2, borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: C.white, fontWeight: 600 }}>{l.league}</span>
                    <Tag color={pts.color}>{pts.label}</Tag>
                  </div>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: C.amberL, fontWeight: 700 }}>{l.avgYellow}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: C.red }}>{l.avgRed}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: C.textD }}>{l.avgFouls}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                    <span style={{ color: pts.color, fontWeight: 700 }}>{l.avgBookPts}</span>
                  </div>
                  <MiniBar value={l.avgBookPts} max={60} color={pts.color} />
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: l.over35Cards >= 65 ? C.green : C.textD, fontWeight: l.over35Cards >= 65 ? 700 : 400 }}>{l.over35Cards}%</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: l.over45Cards >= 40 ? C.amber : C.textD }}>{l.over45Cards}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Referee table ────────────────────────────────────────────────────────────
function RefereeTable({ leagueFilter }) {
  const refs = leagueFilter === 'All'
    ? REFEREES
    : REFEREES.filter(r => r.league === leagueFilter)
  const sorted = [...refs].sort((a, b) => b.avgYellow - a.avgYellow)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: C.bg2 }}>
            {['REFEREE', 'LEAGUE', 'AVG YELLOWS', 'AVG REDS', 'STRICTNESS', 'MATCHES', 'STYLE'].map(h => (
              <th key={h} style={{
                fontSize: 8, color: C.muted, letterSpacing: '0.1em',
                textAlign: ['REFEREE', 'LEAGUE', 'STYLE'].includes(h) ? 'left' : 'right',
                padding: '7px 10px', borderBottom: `1px solid ${C.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const strictColor = r.strictness >= 85 ? C.red : r.strictness >= 70 ? C.amber : C.green
            return (
              <tr key={r.name} style={{ background: i % 2 === 0 ? C.bg1 : C.bg2, borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '8px 10px', color: C.white, fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: '8px 10px' }}><Tag color={C.blue}>{r.league}</Tag></td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: r.avgYellow >= 4.5 ? C.red : r.avgYellow >= 3.5 ? C.amber : C.green, fontWeight: 700 }}>{r.avgYellow}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: C.red }}>{r.avgRed}</td>
                <td style={{ padding: '8px 10px' }}>
                  <StrictnessGauge value={r.strictness} />
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: C.textD }}>{r.matches}</td>
                <td style={{ padding: '8px 10px' }}>
                  <Tag color={strictColor}>{r.style}</Tag>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
const LEAGUES_LIST = ['All', 'EPL', 'La Liga', 'Bundesliga', 'Belgian Pro League', 'Championship', 'Ligue 1', 'Serie A']

export default function BookingsAnalyzer() {
  const [activeTab,  setActiveTab]  = useState('fixtures')  // fixtures | leagues | referees
  const [leagueFlt,  setLeagueFlt]  = useState('All')
  const [confFlt,    setConfFlt]    = useState('All')
  const [sortBy,     setSortBy]     = useState('confidence')

  const fixtures = useMemo(() => generateFixtures(), [])

  const modelled = useMemo(() =>
    fixtures.map(f => ({ fixture: f, model: modelBookings(f) })),
    [fixtures]
  )

  const filtered = useMemo(() => {
    let out = modelled
    if (leagueFlt !== 'All') out = out.filter(m => m.fixture.league === leagueFlt)
    if (confFlt   !== 'All') out = out.filter(m => m.model.confidence === confFlt)
    if (sortBy === 'confidence') {
      const ord = { HIGH: 0, MEDIUM: 1, LOW: 2 }
      out = [...out].sort((a, b) => ord[a.model.confidence] - ord[b.model.confidence])
    } else if (sortBy === 'bookPts') {
      out = [...out].sort((a, b) => b.model.expectedBookPts - a.model.expectedBookPts)
    } else if (sortBy === 'ev') {
      out = [...out].sort((a, b) => (b.model.bestPick?.ev ?? -99) - (a.model.bestPick?.ev ?? -99))
    }
    return out
  }, [modelled, leagueFlt, confFlt, sortBy])

  // Summary stats
  const highCount   = modelled.filter(m => m.model.confidence === 'HIGH').length
  const avgBookPts  = (modelled.reduce((s, m) => s + m.model.expectedBookPts, 0) / modelled.length).toFixed(1)
  const topRef      = [...REFEREES].sort((a, b) => b.strictness - a.strictness)[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── KPI strip ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'FIXTURES TODAY', val: modelled.length,      color: C.white  },
          { label: 'HIGH CONF PICKS',val: highCount,             color: C.green  },
          { label: 'AVG BOOK PTS',   val: avgBookPts,            color: C.amberL },
          { label: 'STRICTEST REF',  val: topRef.name.split(' ')[1], color: C.red },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: C.bg1, border: `1px solid ${C.border}`,
            borderRadius: 2, padding: '12px 14px',
          }}>
            <div style={{ fontSize: 8, color: C.muted, letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* ── Main card ──────────────────────────────────────────────────────── */}
      <div style={{
        background: C.bg1, border: `1px solid ${C.border}`,
        borderTop: `2px solid ${C.red}`, borderRadius: 2, overflow: 'hidden',
      }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>
          {[
            ['fixtures',  '📋 TODAY\'S BOOKINGS'],
            ['leagues',   '🌍 LEAGUE OVERVIEW'],
            ['referees',  '👤 REFEREE PROFILES'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              background:    'none',
              border:        'none',
              borderBottom:  `2px solid ${activeTab === key ? C.red : 'transparent'}`,
              color:          activeTab === key ? C.red : C.muted,
              fontSize:       9,
              fontWeight:     600,
              letterSpacing: '0.1em',
              padding:       '10px 16px',
              cursor:        'pointer',
            }}>{label}</button>
          ))}
        </div>

        {/* ── TODAY'S BOOKINGS tab ─────────────────────────────────────────── */}
        {activeTab === 'fixtures' && (
          <div style={{ padding: 14 }}>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {LEAGUES_LIST.map(l => (
                  <button key={l} onClick={() => setLeagueFlt(l)} style={{
                    fontSize: 8, background: leagueFlt === l ? C.blue + '22' : 'none',
                    border: `1px solid ${leagueFlt === l ? C.blue : C.border}`,
                    color: leagueFlt === l ? C.blue : C.textDD,
                    padding: '3px 8px', borderRadius: 1, cursor: 'pointer',
                  }}>{l}</button>
                ))}
              </div>
              <div style={{ width: 1, height: 16, background: C.border }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {['All', 'HIGH', 'MEDIUM', 'LOW'].map(c => (
                  <button key={c} onClick={() => setConfFlt(c)} style={{
                    fontSize: 8, background: confFlt === c ? C.red + '22' : 'none',
                    border: `1px solid ${confFlt === c ? C.red : C.border}`,
                    color: confFlt === c ? C.red : C.textDD,
                    padding: '3px 8px', borderRadius: 1, cursor: 'pointer',
                  }}>{c}</button>
                ))}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: C.muted }}>SORT:</span>
                {[['confidence','CONF'], ['bookPts','BOOK PTS'], ['ev','EV']].map(([k, l]) => (
                  <button key={k} onClick={() => setSortBy(k)} style={{
                    fontSize: 8, background: sortBy === k ? C.amber + '22' : 'none',
                    border: `1px solid ${sortBy === k ? C.amber : C.border}`,
                    color: sortBy === k ? C.amber : C.textDD,
                    padding: '3px 8px', borderRadius: 1, cursor: 'pointer',
                  }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Booking formula reminder */}
            <div style={{
              fontSize: 10, color: C.textDD, padding: '6px 12px',
              background: C.bg2, border: `1px solid ${C.border}`,
              borderRadius: 2, marginBottom: 12,
              display: 'flex', gap: 16, flexWrap: 'wrap',
            }}>
              <span>📋 Booking Points Formula:</span>
              <span style={{ color: C.amberL }}>Yellow = 10 pts</span>
              <span style={{ color: C.red }}>Red = 25 pts</span>
              <span style={{ color: '#FF8C00' }}>2nd Yellow = 35 pts total</span>
              <span style={{ color: C.green }}>Over 35pts ≈ Over 3.5 cards</span>
            </div>

            {filtered.map(({ fixture, model }) => (
              <BookingCard key={fixture.id} fixture={fixture} model={model} />
            ))}

            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: C.textDD, fontSize: 11 }}>
                No fixtures match the current filters
              </div>
            )}
          </div>
        )}

        {/* ── LEAGUE OVERVIEW tab ──────────────────────────────────────────── */}
        {activeTab === 'leagues' && (
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: C.textD, lineHeight: 1.8, marginBottom: 14 }}>
              Average bookings per match across your 7 selected leagues. La Liga and Serie A consistently
              produce the most cards — ideal leagues for Over 3.5 and booking points markets.
            </div>
            <LeagueOverview />
            {/* Punter tips */}
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em', marginBottom: 2 }}>PUNTER TIPS BY LEAGUE</div>
              {[
                { league: 'La Liga',            tip: 'Highest card rate in Europe. Over 3.5 lands 72% of the time. Strong default for booking bets.', color: C.red    },
                { league: 'Serie A',            tip: 'Second highest booking pts average. Referees are strict — especially in top-4 clashes.',        color: C.red    },
                { league: 'Bundesliga',         tip: 'Moderate bookings but derbies (Bayern/Dortmund) spike heavily. Target Over 3.5 selectively.',   color: C.amber  },
                { league: 'Belgian Pro League', tip: 'Derby-heavy league. Physical play drives fouls. Over 3.5 hits ~54% — better than EPL.',         color: C.amber  },
                { league: 'Championship',       tip: 'Long-ball physical football. High fouls but refs lenient. Focus on both teams to get a card.',   color: C.amber  },
                { league: 'Ligue 1',            tip: 'Average bookings — value in Under markets when lenient refs like Letexier are appointed.',       color: C.green  },
                { league: 'EPL',                tip: 'Lowest card rate. Refs prefer to let games flow. Favour Under 3.5 unless derby or relegation.', color: C.green  },
              ].map(({ league, tip, color }) => (
                <div key={league} style={{
                  display: 'flex', gap: 12, padding: '8px 12px',
                  background: C.bg2, border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${color}`, borderRadius: 2,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color, minWidth: 120 }}>{league}</span>
                  <span style={{ fontSize: 10, color: C.textD, lineHeight: 1.6 }}>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── REFEREE PROFILES tab ─────────────────────────────────────────── */}
        {activeTab === 'referees' && (
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: C.textD, lineHeight: 1.8, marginBottom: 14 }}>
              Referee strictness is one of the most important factors in the bookings market — a strict referee combined with a high-foul game is a goldmine for Over card bets.
              {' '}Sorted by average yellows per game.
            </div>

            {/* League filter for refs */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
              {LEAGUES_LIST.map(l => (
                <button key={l} onClick={() => setLeagueFlt(l)} style={{
                  fontSize: 8, background: leagueFlt === l ? C.red + '22' : 'none',
                  border: `1px solid ${leagueFlt === l ? C.red : C.border}`,
                  color: leagueFlt === l ? C.red : C.textDD,
                  padding: '3px 8px', borderRadius: 1, cursor: 'pointer',
                }}>{l}</button>
              ))}
            </div>

            <RefereeTable leagueFilter={leagueFlt} />

            <div style={{ marginTop: 14, padding: '10px 14px', background: C.bg0, border: `1px solid ${C.border}`, borderRadius: 2 }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em', marginBottom: 6 }}>HOW TO USE REFEREE DATA</div>
              <div style={{ fontSize: 10, color: C.textD, lineHeight: 1.9 }}>
                {[
                  'Strictness 85+ = automatically lean Over 3.5 cards regardless of teams',
                  'Strictness below 60 = consider Under markets or look for specific foul-heavy matchups',
                  'Ref avg yellows × match importance modifier = your base expected yellow card count',
                  'Combine with team discipline profile: both teams averaging 2+ yellows + strict ref = high-confidence Over',
                  'Derby + Strict Ref + Relegation Battle = maximum volatility, extreme Over value',
                ].map((tip, i) => (
                  <div key={i} style={{ marginBottom: 3 }}>→ {tip}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

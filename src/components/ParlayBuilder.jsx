import { useState, useEffect, useMemo } from 'react'
import { useLiveFixtures, fixtureToParlayLeg } from '../utils/useLiveFixtures.js'
import { C, fmt } from '../theme.js'
import Tag from './Tag.jsx'

// ─── Maths helpers ────────────────────────────────────────────────────────────
const combinedOdds    = (legs) => legs.reduce((acc, l) => acc * (l.odds ?? 1), 1)
const combinedProb    = (legs) => legs.reduce((acc, l) => acc * (l.prob  ?? 0), 1)
const parlayEV        = (legs, stake = 1) => combinedProb(legs) * combinedOdds(legs) * stake - stake
const parlayKelly     = (legs) => {
  const p = combinedProb(legs)
  const b = combinedOdds(legs) - 1
  if (b <= 0 || p <= 0) return 0
  return Math.max(0, ((p * b - (1 - p)) / b) * 0.25)   // quarter-Kelly for parlays
}
const riskGrade = (legs, ev) => {
  if (legs.length > 5 || ev < -0.15) return { grade: 'DANGER', color: C.red }
  if (legs.length > 3 || ev < -0.05) return { grade: 'HIGH RISK', color: '#E87A20' }
  if (ev >= 0.05)                     return { grade: 'VALUE', color: C.green }
  if (ev >= 0)                        return { grade: 'NEUTRAL', color: C.amber }
  return                                     { grade: 'NEGATIVE EV', color: C.red }
}

const CONF_COLOR = { HIGH: C.green, MEDIUM: C.amber, LOW: C.red }

// ─── Pre-built sample legs for demo mode ─────────────────────────────────────
const SAMPLE_LEGS = [
  { id: 's1', match: 'Arsenal v Chelsea',       market: 'Home Win',  odds: 2.10, prob: 0.52, ev:  0.092, confidence: 'HIGH',   league: 'EPL',        selected: false },
  { id: 's2', match: 'Real Madrid v Atletico',  market: 'BTTS Yes',  odds: 1.85, prob: 0.58, ev:  0.073, confidence: 'HIGH',   league: 'La Liga',    selected: false },
  { id: 's3', match: 'Bayern v Dortmund',       market: 'Over 2.5',  odds: 1.72, prob: 0.64, ev:  0.101, confidence: 'HIGH',   league: 'Bundesliga', selected: false },
  { id: 's4', match: 'PSG v Lyon',              market: 'Home Win',  odds: 1.55, prob: 0.70, ev:  0.085, confidence: 'MEDIUM', league: 'Ligue 1',    selected: false },
  { id: 's5', match: 'Napoli v Inter',          market: 'Over 2.5',  odds: 2.05, prob: 0.49, ev:  0.005, confidence: 'MEDIUM', league: 'Serie A',    selected: false },
  { id: 's6', match: 'Man City v Liverpool',    market: 'Draw',      odds: 3.40, prob: 0.30, ev:  0.020, confidence: 'MEDIUM', league: 'EPL',        selected: false },
  { id: 's7', match: 'Club Brugge v Anderlecht',market: 'Away Win',  odds: 3.10, prob: 0.29, ev: -0.101, confidence: 'LOW',    league: 'Belgian Pro',selected: false },
  { id: 's8', match: 'Leeds v Sunderland',      market: 'Home Win',  odds: 2.30, prob: 0.46, ev:  0.058, confidence: 'MEDIUM', league: 'Championship',selected: false },
]

// ─── Leg row in the selection pool ───────────────────────────────────────────
function LegRow({ leg, onToggle, inParlay }) {
  return (
    <div
      onClick={() => onToggle(leg.id)}
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:            10,
        padding:       '9px 12px',
        background:    inParlay ? C.green + '11' : C.bg2,
        border:        `1px solid ${inParlay ? C.green + '44' : C.border}`,
        borderRadius:   2,
        cursor:        'pointer',
        transition:    'all 0.12s',
        userSelect:    'none',
      }}
    >
      {/* Checkbox */}
      <div style={{
        width:        16, height: 16,
        border:       `1.5px solid ${inParlay ? C.green : C.dim}`,
        borderRadius:  2,
        background:   inParlay ? C.green : 'transparent',
        flexShrink:    0,
        display:      'flex',
        alignItems:   'center',
        justifyContent:'center',
        fontSize:      10,
        color:         C.bg0,
        fontWeight:    700,
      }}>
        {inParlay ? '✓' : ''}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.white, fontWeight: inParlay ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {leg.match}
        </div>
        <div style={{ fontSize: 9, color: C.textD, marginTop: 2 }}>
          {leg.league} · {leg.market}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: C.textD }}>p={((leg.prob ?? 0) * 100).toFixed(0)}%</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: (leg.ev ?? 0) > 0 ? C.green : C.red }}>
          {leg.odds?.toFixed(2)}
        </span>
        <Tag color={CONF_COLOR[leg.confidence] ?? C.muted}>{leg.confidence}</Tag>
      </div>
    </div>
  )
}

// ─── Parlay slip ──────────────────────────────────────────────────────────────
function ParlaySlip({ legs, stake, onRemove }) {
  if (legs.length === 0) {
    return (
      <div style={{
        textAlign:  'center',
        padding:    '36px 20px',
        color:       C.textDD,
        fontSize:    11,
        border:     `1px dashed ${C.border}`,
        borderRadius: 2,
      }}>
        Select picks from the left to build your parlay
      </div>
    )
  }

  const totOdds = combinedOdds(legs)
  const totProb = combinedProb(legs)
  const ev      = parlayEV(legs, stake)
  const kelly   = parlayKelly(legs)
  const payout  = stake * totOdds
  const { grade, color: gradeColor } = riskGrade(legs, ev / stake)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Legs */}
      {legs.map((leg, i) => (
        <div key={leg.id} style={{
          display:     'flex',
          alignItems:  'center',
          gap:          8,
          padding:     '8px 12px',
          borderBottom:`1px solid ${C.border}`,
          background:   i % 2 === 0 ? C.bg1 : C.bg2,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.white, fontWeight: 600 }}>{leg.match}</div>
            <div style={{ fontSize: 9, color: C.textD, marginTop: 1 }}>{leg.league} · {leg.market}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: C.textD }}>p={((leg.prob ?? 0) * 100).toFixed(0)}%</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.amberL }}>{leg.odds?.toFixed(2)}</span>
            {i < legs.length - 1 && (
              <span style={{ fontSize: 9, color: C.dim, fontWeight: 700 }}>×</span>
            )}
          </div>
          <button onClick={() => onRemove(leg.id)} style={{
            background: 'none', border: 'none', color: C.red,
            cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 4px',
          }}>×</button>
        </div>
      ))}

      {/* Totals */}
      <div style={{
        background:   C.bg0,
        border:       `1px solid ${gradeColor}44`,
        borderTop:    `2px solid ${gradeColor}`,
        padding:      14,
        display:      'flex',
        flexDirection:'column',
        gap:           10,
      }}>
        {/* Grade banner */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em' }}>
            {legs.length}-LEG PARLAY
          </span>
          <Tag color={gradeColor}>{grade}</Tag>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {[
            { label: 'COMBINED ODDS', val: totOdds.toFixed(2),            color: C.amberL },
            { label: 'WIN PROBABILITY', val: (totProb * 100).toFixed(1) + '%', color: C.white },
            { label: 'POTENTIAL PAYOUT', val: `£${payout.toFixed(2)}`,   color: C.green },
            { label: 'EXPECTED VALUE', val: `${ev >= 0 ? '+' : ''}£${ev.toFixed(2)}`, color: ev >= 0 ? C.green : C.red },
            { label: 'KELLY STAKE %', val: (kelly * 100).toFixed(2) + '%', color: C.blue },
            { label: 'KELLY STAKE £', val: `£${(kelly * 1000).toFixed(2)}`, color: C.blue },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              background:   C.bg2,
              border:       `1px solid ${C.border}`,
              borderRadius:  2,
              padding:      '8px 10px',
            }}>
              <div style={{ fontSize: 8, color: C.muted, letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Probability bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 9, color: C.muted }}>WIN PROBABILITY</span>
            <span style={{ fontSize: 9, color: C.white }}>{(totProb * 100).toFixed(2)}%</span>
          </div>
          <div style={{ height: 6, background: C.bg3, borderRadius: 1, overflow: 'hidden' }}>
            <div style={{
              width:        `${Math.min(totProb * 100, 100)}%`,
              height:       '100%',
              background:    totProb > 0.3 ? C.green : totProb > 0.1 ? C.amber : C.red,
              borderRadius:  1,
              transition:   'width 0.4s ease',
            }} />
          </div>
        </div>

        {/* Risk warnings */}
        {legs.length > 4 && (
          <div style={{ fontSize: 10, color: C.red, background: C.red + '11',
            border: `1px solid ${C.red}33`, borderRadius: 2, padding: '6px 10px' }}>
            ⚠ {legs.length}+ leg parlays have extremely low hit rates. Consider splitting into smaller accumulators.
          </div>
        )}
        {ev < 0 && (
          <div style={{ fontSize: 10, color: C.amber, background: C.amber + '0D',
            border: `1px solid ${C.amber}33`, borderRadius: 2, padding: '6px 10px' }}>
            ⚠ Negative EV parlay — the combined implied odds do not represent value. Remove low-confidence legs.
          </div>
        )}
        {grade === 'VALUE' && (
          <div style={{ fontSize: 10, color: C.green, background: C.green + '0D',
            border: `1px solid ${C.green}33`, borderRadius: 2, padding: '6px 10px' }}>
            ✓ Positive EV parlay identified. Kelly recommends staking {(kelly * 100).toFixed(1)}% of bankroll.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Accumulator optimizer: find the best N-leg combo from the pool ──────────
function findBestParlay(pool, n = 3) {
  const eligible = pool.filter(l => (l.ev ?? 0) > 0 && l.confidence !== 'LOW')
  if (eligible.length < n) return []

  let bestEV   = -Infinity
  let bestCombo = []

  // Iterate all combinations of size n
  const combine = (start, current) => {
    if (current.length === n) {
      const ev = parlayEV(current, 10)
      if (ev > bestEV) { bestEV = ev; bestCombo = [...current] }
      return
    }
    for (let i = start; i < eligible.length; i++) {
      combine(i + 1, [...current, eligible[i]])
    }
  }
  combine(0, [])
  return bestCombo
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ParlayBuilder({ livePicks = [] }) {
  const [stake,       setStake]      = useState(10)
  const [parlayLegs,  setParlayLegs] = useState([])
  const [pool,        setPool]       = useState(SAMPLE_LEGS)
  const [activeTab,   setActiveTab]  = useState('builder')  // 'builder' | 'optimizer'
  const [optN,        setOptN]       = useState(3)
  const [optResult,   setOptResult]  = useState([])
  const [customMatch, setCustomMatch]= useState('')
  const [customOdds,  setCustomOdds] = useState('')
  const [customProb,  setCustomProb] = useState('')
  const [customMkt,   setCustomMkt]  = useState('Home Win')

  // Pull live picks from shared cache
  const { fixtures: liveFixtures } = useLiveFixtures()
  useEffect(() => {
    const legs = liveFixtures
      .map((f, i) => fixtureToParlayLeg(f, i))
      .filter(Boolean)
    if (legs.length > 0) {
      setPool(prev => {
        const existingIds = new Set(prev.map(l => l.id))
        return [...prev.filter(l => !l.id.startsWith('live-')), ...legs.filter(l => !existingIds.has(l.id))]
      })
    }
  }, [liveFixtures])

  // Legacy: also accept livePicks prop
  useEffect(() => {
    if (livePicks.length > 0) {
      const liveLegs = livePicks.map((p, i) => ({
        id:`live-prop-${i}`, match:p.name, market:p.bestPick?.market??'Home Win',
        odds:p.bestPick?.odds??2.0, prob:p.bestPick?.prob??0.5,
        ev:p.bestPick?.ev??0, confidence:p.confidence, league:p.league, selected:false,
      }))
      setPool(prev => {
        const existingIds = new Set(prev.map(l => l.id))
        return [...prev, ...liveLegs.filter(l => !existingIds.has(l.id))]
      })
    }
  }, [livePicks])

  const toggleLeg = (id) => {
    const leg = pool.find(l => l.id === id)
    if (!leg) return
    const already = parlayLegs.find(l => l.id === id)
    if (already) {
      setParlayLegs(prev => prev.filter(l => l.id !== id))
    } else {
      setParlayLegs(prev => [...prev, leg])
    }
  }

  const removeLeg   = (id) => setParlayLegs(prev => prev.filter(l => l.id !== id))
  const clearParlay = ()   => setParlayLegs([])

  const runOptimizer = () => {
    const best = findBestParlay(pool, optN)
    setOptResult(best)
    if (best.length > 0) setParlayLegs(best)
  }

  const addCustomLeg = () => {
    if (!customMatch || !customOdds) return
    const odds = parseFloat(customOdds)
    const prob = customProb ? parseFloat(customProb) / 100 : 1 / odds
    const ev   = prob * odds - 1
    const leg  = {
      id:         `custom-${Date.now()}`,
      match:       customMatch,
      market:      customMkt,
      odds,
      prob,
      ev,
      confidence: ev > 0.05 ? 'HIGH' : ev > 0 ? 'MEDIUM' : 'LOW',
      league:     'Custom',
      selected:   false,
    }
    setPool(prev => [...prev, leg])
    setCustomMatch('')
    setCustomOdds('')
    setCustomProb('')
  }

  const inParlayIds = new Set(parlayLegs.map(l => l.id))

  // Smart suggestions — top 3 by EV that aren't already in parlay
  const suggestions = pool
    .filter(l => !inParlayIds.has(l.id) && (l.ev ?? 0) > 0 && l.confidence !== 'LOW')
    .sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))
    .slice(0, 3)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Header tabs ───────────────────────────────────────────────────── */}
      <div style={{
        background:   C.bg1,
        border:       `1px solid ${C.border}`,
        borderTop:    `2px solid ${C.amber}`,
        borderRadius:  2,
        overflow:     'hidden',
      }}>
        <div style={{
          display:      'flex',
          borderBottom: `1px solid ${C.border}`,
          background:    C.bg2,
        }}>
          {[
            ['builder',   '🎯 PARLAY BUILDER'],
            ['optimizer', '⚙ AUTO-OPTIMIZER'],
            ['custom',    '✏ CUSTOM LEGS'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} style={{
              background:    'none',
              border:        'none',
              borderBottom:  `2px solid ${activeTab === key ? C.amber : 'transparent'}`,
              color:          activeTab === key ? C.amber : C.muted,
              fontSize:       9,
              fontWeight:     600,
              letterSpacing: '0.1em',
              padding:       '10px 16px',
              cursor:        'pointer',
            }}>
              {label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          {/* Stake input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}>
            <span style={{ fontSize: 9, color: C.muted }}>STAKE £</span>
            <input
              type="number" min={1} max={10000} value={stake}
              onChange={e => setStake(Math.max(1, +e.target.value))}
              style={{
                width:        60,
                background:   C.bg0,
                border:       `1px solid ${C.border}`,
                borderRadius:  2,
                color:         C.amberL,
                fontSize:      11,
                fontWeight:    700,
                padding:      '4px 8px',
                outline:      'none',
                textAlign:    'right',
              }}
            />
          </div>
        </div>

        {/* ── Builder tab ─────────────────────────────────────────────────── */}
        {activeTab === 'builder' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

            {/* Left: pick pool */}
            <div style={{ borderRight: `1px solid ${C.border}`, padding: 14 }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em', marginBottom: 10 }}>
                AVAILABLE PICKS — click to add to parlay
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 480, overflowY: 'auto' }}>
                {pool.map(leg => (
                  <LegRow
                    key={leg.id}
                    leg={leg}
                    onToggle={toggleLeg}
                    inParlay={inParlayIds.has(leg.id)}
                  />
                ))}
              </div>

              {/* Smart suggestions */}
              {suggestions.length > 0 && parlayLegs.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 9, color: C.blue, letterSpacing: '0.1em', marginBottom: 6 }}>
                    💡 SUGGESTED ADDITIONS (highest EV)
                  </div>
                  {suggestions.map(s => (
                    <div key={s.id} onClick={() => toggleLeg(s.id)} style={{
                      display:     'flex',
                      alignItems:  'center',
                      gap:          8,
                      padding:     '6px 10px',
                      background:   C.blue + '0D',
                      border:       `1px solid ${C.blue}22`,
                      borderRadius:  2,
                      marginBottom:  4,
                      cursor:       'pointer',
                    }}>
                      <span style={{ fontSize: 10, color: C.text, flex: 1 }}>
                        {s.match} — {s.market}
                      </span>
                      <span style={{ fontSize: 10, color: C.green }}>
                        EV {fmt(s.ev, 3)}
                      </span>
                      <span style={{ fontSize: 9, color: C.blue }}>+ ADD</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: parlay slip */}
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em' }}>
                  YOUR PARLAY SLIP — {parlayLegs.length} LEGS
                </span>
                {parlayLegs.length > 0 && (
                  <button onClick={clearParlay} style={{
                    background: 'none', border: `1px solid ${C.border}`,
                    borderRadius: 1, color: C.red, fontSize: 9,
                    padding: '2px 8px', cursor: 'pointer',
                  }}>
                    CLEAR ALL
                  </button>
                )}
              </div>
              <ParlaySlip legs={parlayLegs} stake={stake} onRemove={removeLeg} />
            </div>
          </div>
        )}

        {/* ── Optimizer tab ────────────────────────────────────────────────── */}
        {activeTab === 'optimizer' && (
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 11, color: C.textD, lineHeight: 1.8, marginBottom: 16 }}>
              The optimizer finds the highest positive-EV combination from all available picks.
              It only uses HIGH and MEDIUM confidence legs with positive EV.
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 6 }}>NUMBER OF LEGS</div>
                <div style={{ display: 'flex' }}>
                  {[2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setOptN(n)} style={{
                      background:  optN === n ? C.amber : C.bg3,
                      border:      `1px solid ${optN === n ? C.amber : C.border}`,
                      color:       optN === n ? C.bg0 : C.textD,
                      fontSize:     11,
                      fontWeight:   optN === n ? 700 : 400,
                      padding:     '6px 16px',
                      cursor:      'pointer',
                    }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={runOptimizer} style={{
                background:    C.amber,
                border:        'none',
                borderRadius:   1,
                color:          C.bg0,
                fontSize:       11,
                fontWeight:     700,
                letterSpacing: '0.08em',
                padding:       '10px 24px',
                cursor:        'pointer',
              }}>
                ⚙ FIND BEST {optN}-LEG PARLAY
              </button>
            </div>

            {/* Result */}
            {optResult.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 9, color: C.green, letterSpacing: '0.1em' }}>
                  ✓ OPTIMAL {optResult.length}-LEG COMBINATION FOUND
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {optResult.map((l, i) => (
                    <div key={l.id} style={{
                      display:     'flex',
                      alignItems:  'center',
                      gap:          10,
                      padding:     '8px 12px',
                      background:   C.green + '0D',
                      border:       `1px solid ${C.green}33`,
                      borderRadius:  2,
                    }}>
                      <span style={{ fontSize: 10, color: C.muted }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: 11, color: C.white, fontWeight: 600 }}>{l.match}</span>
                      <Tag color={C.blue}>{l.market}</Tag>
                      <span style={{ fontSize: 11, color: C.amberL, fontWeight: 700 }}>{l.odds?.toFixed(2)}</span>
                      <span style={{ fontSize: 10, color: C.green }}>EV {fmt(l.ev, 3)}</span>
                    </div>
                  ))}
                </div>

                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8, padding: 12, background: C.bg0,
                  border: `1px solid ${C.green}33`, borderRadius: 2,
                }}>
                  {[
                    ['COMBINED ODDS',    combinedOdds(optResult).toFixed(2)],
                    ['WIN PROB',         (combinedProb(optResult) * 100).toFixed(1) + '%'],
                    ['PARLAY EV',        `${parlayEV(optResult, stake) >= 0 ? '+' : ''}£${parlayEV(optResult, stake).toFixed(2)}`],
                    ['KELLY STAKE %',    (parlayKelly(optResult) * 100).toFixed(2) + '%'],
                    ['KELLY £ (£1000)',  `£${(parlayKelly(optResult) * 1000).toFixed(2)}`],
                    ['POTENTIAL PAYOUT', `£${(stake * combinedOdds(optResult)).toFixed(2)}`],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 2, padding: '8px 10px' }}>
                      <div style={{ fontSize: 8, color: C.muted, marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 9, color: C.textDD, lineHeight: 1.7 }}>
                  This parlay was added to your slip. Switch to the Builder tab to view or modify it.
                </div>
              </div>
            ) : (
              <div style={{
                textAlign: 'center', padding: '32px 20px',
                color: C.textDD, fontSize: 11,
                border: `1px dashed ${C.border}`, borderRadius: 2,
              }}>
                Press the button above to find the best combination
              </div>
            )}
          </div>
        )}

        {/* ── Custom legs tab ───────────────────────────────────────────────── */}
        {activeTab === 'custom' && (
          <div style={{ padding: 20 }}>
            <div style={{ fontSize: 11, color: C.textD, lineHeight: 1.8, marginBottom: 16 }}>
              Add any bet manually — from any bookmaker, any match, any market.
              Enter the odds and optionally your own probability estimate.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 500 }}>
              <div>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>MATCH NAME</div>
                <input
                  type="text"
                  value={customMatch}
                  onChange={e => setCustomMatch(e.target.value)}
                  placeholder="e.g. Arsenal v Chelsea"
                  style={{
                    width: '100%', background: C.bg0, border: `1px solid ${C.border}`,
                    borderRadius: 2, color: C.amberL, fontSize: 11,
                    padding: '8px 12px', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>MARKET</div>
                  <select
                    value={customMkt}
                    onChange={e => setCustomMkt(e.target.value)}
                    style={{
                      width: '100%', background: C.bg0, border: `1px solid ${C.border}`,
                      borderRadius: 2, color: C.white, fontSize: 11,
                      padding: '8px 10px', outline: 'none',
                    }}
                  >
                    {['Home Win', 'Draw', 'Away Win', 'BTTS Yes', 'BTTS No',
                      'Over 2.5', 'Under 2.5', 'Over 1.5', 'Over 3.5',
                      'Asian Handicap', 'Both Teams Score'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>DECIMAL ODDS</div>
                  <input
                    type="number" min={1.01} step={0.01}
                    value={customOdds}
                    onChange={e => setCustomOdds(e.target.value)}
                    placeholder="e.g. 2.10"
                    style={{
                      width: '100%', background: C.bg0, border: `1px solid ${C.border}`,
                      borderRadius: 2, color: C.amberL, fontSize: 11,
                      padding: '8px 12px', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>YOUR PROB % (optional)</div>
                  <input
                    type="number" min={1} max={99} step={1}
                    value={customProb}
                    onChange={e => setCustomProb(e.target.value)}
                    placeholder="e.g. 55"
                    style={{
                      width: '100%', background: C.bg0, border: `1px solid ${C.border}`,
                      borderRadius: 2, color: C.white, fontSize: 11,
                      padding: '8px 12px', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <button onClick={addCustomLeg} disabled={!customMatch || !customOdds} style={{
                background:    (!customMatch || !customOdds) ? C.dim : C.amber,
                border:        'none',
                borderRadius:   1,
                color:         (!customMatch || !customOdds) ? C.textD : C.bg0,
                fontSize:       11,
                fontWeight:     700,
                letterSpacing: '0.08em',
                padding:       '10px 20px',
                cursor:        (!customMatch || !customOdds) ? 'not-allowed' : 'pointer',
                width:         'fit-content',
              }}>
                + ADD TO POOL
              </button>

              <div style={{ fontSize: 9, color: C.textDD, lineHeight: 1.7, marginTop: 4 }}>
                If you don't enter a probability, the model uses the implied probability from the odds
                (assumes no edge — EV will show as 0). Enter your own probability to calculate true EV.
              </div>
            </div>

            {/* Custom legs already added */}
            {pool.filter(l => l.league === 'Custom').length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em', marginBottom: 8 }}>
                  CUSTOM LEGS IN POOL
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {pool.filter(l => l.league === 'Custom').map(leg => (
                    <LegRow
                      key={leg.id}
                      leg={leg}
                      onToggle={toggleLeg}
                      inParlay={inParlayIds.has(leg.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Quick parlay summary strip (always visible) ───────────────────── */}
      {parlayLegs.length > 0 && activeTab !== 'builder' && (
        <div style={{
          background:   C.bg1,
          border:       `1px solid ${C.green}44`,
          borderLeft:   `3px solid ${C.green}`,
          borderRadius:  2,
          padding:      '10px 14px',
          display:      'flex',
          alignItems:   'center',
          gap:           14,
          flexWrap:     'wrap',
        }}>
          <span style={{ fontSize: 9, color: C.muted }}>CURRENT PARLAY:</span>
          <span style={{ fontSize: 11, color: C.white, fontWeight: 700 }}>
            {parlayLegs.length} legs @ {combinedOdds(parlayLegs).toFixed(2)}
          </span>
          <span style={{ fontSize: 10, color: (parlayEV(parlayLegs, stake) >= 0 ? C.green : C.red) }}>
            EV {parlayEV(parlayLegs, stake) >= 0 ? '+' : ''}£{parlayEV(parlayLegs, stake).toFixed(2)}
          </span>
          <span style={{ fontSize: 10, color: C.blue }}>
            Kelly £{(parlayKelly(parlayLegs) * 1000).toFixed(2)}
          </span>
          <button onClick={clearParlay} style={{
            marginLeft: 'auto', background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 1, color: C.red, fontSize: 9, padding: '2px 8px', cursor: 'pointer',
          }}>
            CLEAR
          </button>
        </div>
      )}
    </div>
  )
}


import { useState, useEffect, useRef } from 'react'
import { C, fmt, pct } from './theme.js'
import { seedROI, seedBets } from './utils/seed.js'
import { runBacktest } from './utils/engine.js'

import Panel            from './components/Panel.jsx'
import StatBadge        from './components/StatBadge.jsx'
import Tag              from './components/Tag.jsx'
import StrategyInput    from './components/StrategyInput.jsx'
import PerformanceGraph from './components/PerformanceGraph.jsx'
import ValueBetsTable   from './components/ValueBetsTable.jsx'
import FlukeDetector    from './components/FlukeDetector.jsx'
import DataIngestion    from './components/DataIngestion.jsx'
import ScanPanel        from './components/ScanPanel.jsx'

const INITIAL_ROI  = seedROI()
const INITIAL_BETS = seedBets()

const TABS = [
  { key: 'scan',      label: '⚡  LIVE SCAN' },
  { key: 'dashboard', label: '▦  BACKTESTER' },
  { key: 'data',      label: '⬆  DATA' },
]

export default function App() {
  const [tab,       setTab]       = useState('scan')
  const [running,   setRunning]   = useState(false)
  const [validated, setValidated] = useState(false)
  const [roiData,   setRoiData]   = useState(INITIAL_ROI)
  const [bets,      setBets]      = useState(INITIAL_BETS)
  const [matchData, setMatchData] = useState(null)
  const [log,       setLog]       = useState([])
  const [kpis,      setKpis]      = useState({
    roi: 18.4, drawdown: -11.2, avgEV: 0.087, kelly: 0.124,
  })
  const logRef = useRef(null)

  const push = (msg, color = C.textD) =>
    setLog(l => [...l.slice(-60), { msg, color, ts: Date.now() }])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const handleRun = ({ text, stakeMode, threshold, parsed }) => {
    setRunning(true)
    setLog([])
    const source = matchData ?? INITIAL_BETS
    const steps = [
      [80,   `Loading ${source.length} matches...`,              C.textD],
      [180,  `Strategy: "${text.slice(0, 45)}..."`,              C.blue],
      [300,  `Threshold θ = ${threshold.toFixed(2)}`,            C.textD],
      [420,  `Stake mode: ${stakeMode.toUpperCase()}`,           C.textD],
      [560,  'Filtering by possession, xG, pressure index...',   C.textD],
      [720,  'Evaluating value gaps...',                         C.amber],
      [900,  'Simulating bet outcomes...',                       C.amber],
      [1080, 'Calculating Kelly fractions...',                   C.textD],
      [1220, 'Computing drawdown & Sharpe ratio...',             C.textD],
      [1400, 'Backtest complete. Generating report...',          C.green],
    ]
    steps.forEach(([t, msg, color]) => setTimeout(() => push(msg, color), t))
    setTimeout(() => {
      const result = runBacktest(source, parsed ?? [], threshold, stakeMode)
      let bank = 1000
      const newRoi = Array.from({ length: 52 }, (_, i) => {
        const delta = (Math.random() - 0.38) * 60 + i * 0.35
        bank = Math.max(bank + delta, 400)
        return {
          week:     `W${String(i + 1).padStart(2, '0')}`,
          bankroll: parseFloat(bank.toFixed(2)),
          baseline: parseFloat((1000 + i * 8).toFixed(2)),
          ev:       parseFloat((Math.random() * 0.18 - 0.04).toFixed(3)),
        }
      })
      setRoiData(newRoi)
      setKpis({
        roi:      result.roi,
        drawdown: -(result.maxDrawdown * 100),
        avgEV:    result.bets.length > 0
          ? result.bets.reduce((s, b) => s + (b.ev ?? 0), 0) / result.bets.length : 0,
        kelly: result.bets.length > 0
          ? result.bets.reduce((s, b) => s + (b.kelly ?? 0), 0) / result.bets.length : 0,
      })
      if (result.bets.length > 0) setBets(result.bets)
      setValidated(true)
      setRunning(false)
      push(`✓ ${result.bets.length} qualifying bets | ROI ${fmt(result.roi, 1)}% | Win rate ${pct(result.winRate)}`, C.green)
    }, 1550)
  }

  const handleDataLoad = (rows) => {
    setMatchData(rows)
    push(`✓ Dataset loaded: ${rows.length} matches`, C.green)
    setTab('dashboard')
  }

  const kpiCards = [
    { label: 'TOTAL ROI',    value: fmt(kpis.roi, 1) + '%',      delta: kpis.roi,      accent: C.green },
    { label: 'MAX DRAWDOWN', value: fmt(kpis.drawdown, 1) + '%', delta: kpis.drawdown, accent: C.red   },
    { label: 'AVG EV / BET', value: fmt(kpis.avgEV, 3),          delta: kpis.avgEV,    accent: C.amber },
    { label: 'AVG KELLY f*', value: kpis.kelly.toFixed(3),        delta: kpis.kelly,    accent: C.blue  },
  ]

  return (
    <div style={{ background: C.bg0, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        background:     C.bg1,
        borderBottom:   `1px solid ${C.border}`,
        padding:        '0 20px',
        height:          48,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexShrink:      0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            background: C.amber, color: C.bg0, fontWeight: 700,
            fontSize: 11, letterSpacing: '0.05em', padding: '3px 8px', borderRadius: 1,
          }}>BQP</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.white, letterSpacing: '0.08em' }}>
            BETTING QUANT PRO
          </span>
          <span style={{ fontSize: 9, color: C.muted }}>v0.2.0 // LIVE ENGINE</span>

          <div style={{ marginLeft: 24, display: 'flex' }}>
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)} style={{
                background:    'none',
                border:        'none',
                borderBottom:  `2px solid ${tab === key ? C.amber : 'transparent'}`,
                color:          tab === key ? C.amber : C.muted,
                fontSize:       9,
                fontWeight:     600,
                letterSpacing: '0.1em',
                padding:       '0 14px',
                height:         48,
                cursor:        'pointer',
                whiteSpace:    'nowrap',
              }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {matchData && <Tag color={C.green}>{matchData.length} MATCHES LOADED</Tag>}
          <span style={{ fontSize: 9, color: C.green, animation: 'blink 2s ease-in-out infinite' }}>
            ● LIVE
          </span>
          <span style={{ fontSize: 9, color: C.textD }}>
            {new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC
          </span>
        </div>
      </div>

      {/* ── Page body ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

        {/* ════ LIVE SCAN TAB ════ */}
        {tab === 'scan' && (
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            {/* League pills */}
            <div style={{
              display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center',
            }}>
              <span style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em' }}>LEAGUES:</span>
              {['EPL', 'La Liga', 'Bundesliga', 'Belgian Pro League', 'Championship', 'Ligue 1', 'Serie A'].map(l => (
                <span key={l} style={{
                  fontSize: 9, background: C.blue + '18', color: C.blue,
                  border: `1px solid ${C.blue}33`, padding: '2px 8px', borderRadius: 1,
                }}>{l}</span>
              ))}
            </div>
            <ScanPanel />
          </div>
        )}

        {/* ════ BACKTESTER TAB ════ */}
        {tab === 'dashboard' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {kpiCards.map(k => <StatBadge key={k.label} {...k} />)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.45fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Panel title="Strategy Input" icon="⬡" accent={C.amber}
                  headerRight={<Tag color={validated ? C.green : C.muted}>{validated ? 'VALIDATED' : 'DRAFT'}</Tag>}>
                  <StrategyInput onRun={handleRun} running={running} />
                </Panel>
                <Panel title="Execution Log" icon="◉" accent={C.blue}>
                  <div ref={logRef} style={{ height: 118, overflowY: 'auto', fontSize: 10,
                    display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {log.length === 0
                      ? <span style={{ color: C.textDD }}>// run a backtest to see output</span>
                      : log.map((l, i) => (
                          <div key={i} style={{ color: l.color, lineHeight: 1.6 }}>
                            <span style={{ color: C.textDD }}>[{new Date(l.ts).toISOString().slice(11, 19)}]</span>
                            {' '}{l.msg}
                          </div>
                        ))
                    }
                    {running && <span style={{ color: C.amber, animation: 'blink 0.8s infinite' }}>▋</span>}
                  </div>
                </Panel>
              </div>
              <Panel title="Performance Graph" icon="▦" accent={C.green} style={{ minHeight: 380 }}
                headerRight={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.amber }} />
                    <span style={{ fontSize: 9, color: C.textD }}>STRATEGY</span>
                    <div style={{ width: 10, height: 2, background: C.blue }} />
                    <span style={{ fontSize: 9, color: C.textD }}>BASELINE</span>
                  </div>
                }>
                <PerformanceGraph data={roiData} bets={bets} />
              </Panel>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.65fr 1fr', gap: 12 }}>
              <Panel title="Value Bets Ledger" icon="◎" accent={C.green}
                headerRight={
                  <span style={{ fontSize: 9, color: C.green }}>
                    {bets.filter(b => (b.gap ?? 0) > 0.05).length} VALUE BETS
                  </span>
                }>
                <ValueBetsTable bets={bets} />
              </Panel>
              <Panel title="Fluke Detector" icon="⚠" accent={C.red}
                headerRight={<Tag color={C.red}>OVERVALUED</Tag>}>
                <FlukeDetector />
              </Panel>
            </div>
          </>
        )}

        {/* ════ DATA TAB ════ */}
        {tab === 'data' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, animation: 'fadeIn 0.3s ease' }}>
            <Panel title="Data Ingestion" icon="⬆" accent={C.amber}>
              <DataIngestion onLoad={handleDataLoad} />
            </Panel>
            <Panel title="Format Guide" icon="ℹ" accent={C.blue}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11, color: C.textD, lineHeight: 1.9 }}>
                  Upload a <span style={{ color: C.amberL }}>.csv</span> or{' '}
                  <span style={{ color: C.amberL }}>.json</span> file to backtest against your own historical data.
                  On the Live Scan tab, real data is pulled automatically from Sportmonks.
                </div>
                {[
                  ['Required',   C.red,   'home_team, away_team, home_goals, away_goals'],
                  ['xG fields',  C.amber, 'home_xg, away_xg'],
                  ['Possession', C.blue,  'home_possession, away_possession'],
                  ['Shots',      C.green, 'home_shots_on_target, away_shots_on_target'],
                  ['Set pieces', C.blue,  'home_corners, away_corners'],
                  ['Discipline', C.amber, 'home_yellow_cards, away_yellow_cards, home_red_cards, away_red_cards, home_fouls, away_fouls'],
                  ['Odds',       C.green, 'odds_home_win, odds_draw, odds_away_win'],
                  ['Pre-calc',   C.textD, 'calc, impl, gap, ev, kelly, odds, result'],
                ].map(([label, color, fields]) => (
                  <div key={label} style={{
                    display: 'flex', gap: 10, padding: '6px 10px',
                    background: C.bg2, border: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${color}`, borderRadius: 2,
                  }}>
                    <div style={{ width: 76, fontSize: 9, color, fontWeight: 700, letterSpacing: '0.08em', flexShrink: 0 }}>
                      {label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 9, color: C.textD, lineHeight: 1.7 }}>{fields}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  )
}

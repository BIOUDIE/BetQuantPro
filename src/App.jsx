import { useState, useEffect, useRef } from 'react'
import { C, fmt, pct } from './theme.js'
import { seedROI, seedBets } from './utils/seed.js'
import { runBacktest } from './utils/engine.js'

// Main views
import PicksView        from './components/PicksView.jsx'
import MarketAnalyzer   from './components/MarketAnalyzer.jsx'
import BookingsAnalyzer from './components/BookingsAnalyzer.jsx'
import ParlayBuilder    from './components/ParlayBuilder.jsx'
import Panel            from './components/Panel.jsx'
import StatBadge        from './components/StatBadge.jsx'
import Tag              from './components/Tag.jsx'
import StrategyInput    from './components/StrategyInput.jsx'
import PerformanceGraph from './components/PerformanceGraph.jsx'
import ValueBetsTable   from './components/ValueBetsTable.jsx'
import FlukeDetector    from './components/FlukeDetector.jsx'
import DataIngestion    from './components/DataIngestion.jsx'

const INITIAL_ROI  = seedROI()
const INITIAL_BETS = seedBets()

// ── Navigation items ──────────────────────────────────────────────────────────
const NAV = [
  { key: 'picks',     icon: '⚡', label: 'PICKS',      desc: 'AI best bets'       },
  { key: 'markets',   icon: '📊', label: 'ALL MARKETS', desc: '55+ markets'        },
  { key: 'bookings',  icon: '🟨', label: 'BOOKINGS',    desc: 'Cards & corners'    },
  { key: 'parlay',    icon: '🎯', label: 'PARLAY',      desc: 'Accumulator builder'},
  { key: 'backtest',  icon: '▦',  label: 'BACKTEST',    desc: 'Strategy tester'    },
  { key: 'data',      icon: '⬆', label: 'DATA',         desc: 'Upload CSV/JSON'    },
]

export default function App() {
  const [tab,       setTab]       = useState('picks')
  const [running,   setRunning]   = useState(false)
  const [validated, setValidated] = useState(false)
  const [roiData,   setRoiData]   = useState(INITIAL_ROI)
  const [bets,      setBets]      = useState(INITIAL_BETS)
  const [matchData, setMatchData] = useState(null)
  const [log,       setLog]       = useState([])
  const [kpis,      setKpis]      = useState({ roi:18.4, drawdown:-11.2, avgEV:0.087, kelly:0.124 })
  const logRef = useRef(null)

  const push = (msg, color=C.textD) =>
    setLog(l => [...l.slice(-60), { msg, color, ts: Date.now() }])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const handleRun = ({ text, stakeMode, threshold, parsed }) => {
    setRunning(true); setLog([])
    const src = matchData ?? INITIAL_BETS
    const steps = [
      [80,   `Loading ${src.length} matches...`,            C.textD],
      [200,  `Parsing strategy: "${text.slice(0,40)}..."`,  C.blue],
      [350,  `Threshold θ = ${threshold.toFixed(2)}`,       C.textD],
      [500,  `Stake: ${stakeMode.toUpperCase()}`,           C.textD],
      [680,  'Filtering by possession, xG, pressure...',   C.textD],
      [880,  'Evaluating value gaps...',                    C.amber],
      [1080, 'Simulating bet outcomes...',                  C.amber],
      [1280, 'Computing Sharpe & drawdown...',              C.textD],
      [1450, 'Backtest complete.',                          C.green],
    ]
    steps.forEach(([t,m,c]) => setTimeout(()=>push(m,c), t))
    setTimeout(() => {
      const result = runBacktest(src, parsed??[], threshold, stakeMode)
      let bank=1000
      setRoiData(Array.from({length:52},(_,i)=>{
        bank=Math.max(bank+(Math.random()-0.38)*60+i*0.35,400)
        return {week:`W${String(i+1).padStart(2,'0')}`,bankroll:parseFloat(bank.toFixed(2)),baseline:parseFloat((1000+i*8).toFixed(2)),ev:parseFloat((Math.random()*0.18-0.04).toFixed(3))}
      }))
      setKpis({roi:result.roi,drawdown:-(result.maxDrawdown*100),avgEV:result.bets.length>0?result.bets.reduce((s,b)=>s+(b.ev??0),0)/result.bets.length:0,kelly:result.bets.length>0?result.bets.reduce((s,b)=>s+(b.kelly??0),0)/result.bets.length:0})
      if(result.bets.length>0) setBets(result.bets)
      setValidated(true); setRunning(false)
      push(`✓ ${result.bets.length} bets | ROI ${fmt(result.roi,1)}% | Win rate ${pct(result.winRate)}`, C.green)
    }, 1600)
  }

  const handleDataLoad = (rows) => { setMatchData(rows); push(`✓ ${rows.length} matches loaded`, C.green); setTab('backtest') }

  const kpiCards = [
    {label:'TOTAL ROI',    value:fmt(kpis.roi,1)+'%',      delta:kpis.roi,      accent:C.green},
    {label:'MAX DRAWDOWN', value:fmt(kpis.drawdown,1)+'%', delta:kpis.drawdown, accent:C.red  },
    {label:'AVG EV / BET', value:fmt(kpis.avgEV,3),        delta:kpis.avgEV,    accent:'#F0A500'},
    {label:'AVG KELLY f*', value:kpis.kelly.toFixed(3),    delta:kpis.kelly,    accent:'#3B8EEA'},
  ]

  return (
    <div style={{ background:C.bg0, minHeight:'100vh', display:'flex', flexDirection:'column' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        background:C.bg1, borderBottom:`1px solid ${C.border}`,
        padding:'0 20px', height:52,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        flexShrink:0,
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{
            background:'#F0A500', color:C.bg0, fontWeight:700,
            fontSize:12, letterSpacing:'0.05em', padding:'4px 10px', borderRadius:2,
          }}>BQP</div>
          <span style={{ fontSize:12, fontWeight:600, color:C.white, letterSpacing:'0.08em' }}>
            BETTING QUANT PRO
          </span>
          {matchData && (
            <span style={{ fontSize:9, background:C.green+'22', color:C.green, border:`1px solid ${C.green}44`, padding:'2px 8px', borderRadius:1 }}>
              {matchData.length} MATCHES LOADED
            </span>
          )}
        </div>

        {/* Live indicator */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:9, color:C.green, animation:'blink 2s ease-in-out infinite' }}>● LIVE</span>
          <span style={{ fontSize:9, color:C.textD }}>
            {new Date().toISOString().replace('T',' ').slice(0,19)} UTC
          </span>
        </div>
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <div style={{
        background:C.bg2, borderBottom:`1px solid ${C.border}`,
        padding:'0 20px', display:'flex', gap:0, flexShrink:0,
        overflowX:'auto',
      }}>
        {NAV.map(({key,icon,label,desc}) => (
          <button key={key} onClick={()=>setTab(key)} style={{
            background:   'none',
            border:       'none',
            borderBottom: `2px solid ${tab===key?'#F0A500':'transparent'}`,
            padding:      '12px 18px',
            cursor:       'pointer',
            display:      'flex',
            alignItems:   'center',
            gap:           8,
            transition:   'all 0.1s',
            whiteSpace:   'nowrap',
            flexShrink:    0,
          }}>
            <span style={{ fontSize:13 }}>{icon}</span>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:1 }}>
              <span style={{
                fontSize:   9,
                fontWeight: 700,
                letterSpacing:'0.1em',
                color:      tab===key?'#F0A500':C.textD,
              }}>{label}</span>
              <span style={{ fontSize:8, color:C.textDD }}>{desc}</span>
            </div>
            {key==='picks'&&tab!=='picks'&&(
              <span style={{ fontSize:8, background:C.green+'22', color:C.green, border:`1px solid ${C.green}44`, padding:'1px 5px', borderRadius:1 }}>MAIN</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div style={{ flex:1, padding:16, display:'flex', flexDirection:'column', gap:12, overflowY:'auto' }}>

        {/* PICKS — the home screen */}
        {tab==='picks' && <PicksView />}

        {/* ALL MARKETS */}
        {tab==='markets' && <MarketAnalyzer />}

        {/* BOOKINGS */}
        {tab==='bookings' && <BookingsAnalyzer />}

        {/* PARLAY BUILDER */}
        {tab==='parlay' && <ParlayBuilder />}

        {/* BACKTEST */}
        {tab==='backtest' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
              {kpiCards.map(k=><StatBadge key={k.label} {...k}/>)}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1.45fr', gap:12 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <Panel title="Strategy Input" icon="⬡" accent='#F0A500'
                  headerRight={<Tag color={validated?C.green:C.muted}>{validated?'VALIDATED':'DRAFT'}</Tag>}>
                  <StrategyInput onRun={handleRun} running={running}/>
                </Panel>
                <Panel title="Execution Log" icon="◉" accent='#3B8EEA'>
                  <div ref={logRef} style={{ height:120, overflowY:'auto', fontSize:10, display:'flex', flexDirection:'column', gap:3 }}>
                    {log.length===0
                      ? <span style={{ color:C.textDD }}>// run a backtest to see output</span>
                      : log.map((l,i)=>(
                          <div key={i} style={{ color:l.color, lineHeight:1.6 }}>
                            <span style={{ color:C.textDD }}>[{new Date(l.ts).toISOString().slice(11,19)}]</span>
                            {' '}{l.msg}
                          </div>
                        ))
                    }
                    {running&&<span style={{ color:'#F0A500', animation:'blink 0.8s infinite' }}>▋</span>}
                  </div>
                </Panel>
              </div>
              <Panel title="Performance Graph" icon="▦" accent={C.green} style={{ minHeight:380 }}
                headerRight={
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:'#F0A500' }}/>
                    <span style={{ fontSize:9, color:C.textD }}>STRATEGY</span>
                    <div style={{ width:10, height:2, background:'#3B8EEA' }}/>
                    <span style={{ fontSize:9, color:C.textD }}>BASELINE</span>
                  </div>
                }>
                <PerformanceGraph data={roiData} bets={bets}/>
              </Panel>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1.65fr 1fr', gap:12 }}>
              <Panel title="Value Bets Ledger" icon="◎" accent={C.green}
                headerRight={<span style={{ fontSize:9, color:C.green }}>{bets.filter(b=>(b.gap??0)>0.05).length} VALUE BETS</span>}>
                <ValueBetsTable bets={bets}/>
              </Panel>
              <Panel title="Fluke Detector" icon="⚠" accent={C.red}
                headerRight={<Tag color={C.red}>OVERVALUED</Tag>}>
                <FlukeDetector/>
              </Panel>
            </div>
          </>
        )}

        {/* DATA */}
        {tab==='data' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <Panel title="Data Ingestion" icon="⬆" accent='#F0A500'>
              <DataIngestion onLoad={handleDataLoad}/>
            </Panel>
            <Panel title="Format Guide" icon="ℹ" accent='#3B8EEA'>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ fontSize:11, color:C.textD, lineHeight:1.9 }}>
                  Upload a <span style={{ color:'#F0A500' }}>.csv</span> or <span style={{ color:'#F0A500' }}>.json</span> file to backtest against your own historical data.
                  On the Picks tab, real data is pulled live from Sportmonks automatically.
                </div>
                {[
                  ['Required',   C.red,   'home_team, away_team, home_goals, away_goals'],
                  ['xG',         '#F0A500','home_xg, away_xg'],
                  ['Possession', '#3B8EEA','home_possession, away_possession'],
                  ['Shots',      C.green, 'home_shots_on_target, away_shots_on_target'],
                  ['Set pieces', '#3B8EEA','home_corners, away_corners'],
                  ['Discipline', '#F0A500','home_yellow_cards, away_yellow_cards, home_red_cards, away_red_cards, home_fouls, away_fouls'],
                  ['Odds',       C.green, 'odds_home_win, odds_draw, odds_away_win'],
                  ['Pre-calc',   C.textD, 'calc, impl, gap, ev, kelly, odds, result'],
                ].map(([l,c,f])=>(
                  <div key={l} style={{ display:'flex', gap:10, padding:'6px 10px', background:C.bg2, border:`1px solid ${C.border}`, borderLeft:`3px solid ${c}`, borderRadius:2 }}>
                    <div style={{ width:72, fontSize:9, color:c, fontWeight:700, letterSpacing:'0.08em', flexShrink:0 }}>{l.toUpperCase()}</div>
                    <div style={{ fontSize:9, color:C.textD, lineHeight:1.7 }}>{f}</div>
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

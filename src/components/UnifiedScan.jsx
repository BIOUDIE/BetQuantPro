import { useState, useCallback } from 'react'
import { C, fmt } from '../theme.js'
import Tag from './Tag.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────
const CAT_META = {
  RESULT:   { color:'#3B8EEA', icon:'🏆', label:'Result'    },
  GOALS:    { color:'#00C896', icon:'⚽', label:'Goals'     },
  CORNERS:  { color:'#F0A500', icon:'🚩', label:'Corners'   },
  CARDS:    { color:'#E8445A', icon:'🟨', label:'Cards'     },
  SHOTS:    { color:'#A78BFA', icon:'🎯', label:'Shots'     },
  OFFSIDES: { color:'#22D3EE', icon:'🚫', label:'Offsides'  },
  FOULS:    { color:'#FB923C', icon:'🦵', label:'Fouls'     },
  TIMING:   { color:'#F472B6', icon:'⏱', label:'Timing'    },
  PENALTY:  { color:'#818CF8', icon:'🥅', label:'Penalty'   },
}
const CONF_COLOR = { HIGH:C.green, MEDIUM:C.amber, LOW:C.muted }

// ── Helpers ───────────────────────────────────────────────────────────────────
const pct  = n => n != null ? ((n)*100).toFixed(1)+'%' : '—'
const fmtN = (n,d=2) => n != null ? (n>=0?'+':'')+n.toFixed(d) : '—'

function GradeTag({ grade }) {
  if (!grade?.label||grade.label==='—') return null
  return (
    <span style={{
      fontSize:8, fontWeight:700, letterSpacing:'0.08em',
      padding:'2px 7px', borderRadius:1,
      background: grade.color+'22', color: grade.color,
      border:`1px solid ${grade.color}44`,
    }}>{grade.label}</span>
  )
}

// ── Parlay Slip ───────────────────────────────────────────────────────────────
function ParlaySlip({ parlay }) {
  if (!parlay?.legs?.length) return (
    <div style={{ padding:14, fontSize:10, color:C.textDD }}>
      No qualifying parlay found — need more HIGH/MEDIUM confidence fixtures with positive EV.
    </div>
  )
  const { legs, totOdds, totProb, ev, kelly } = parlay
  const evColor = (ev??0) > 0 ? C.green : C.red
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
      {legs.map((leg,i)=>(
        <div key={i} style={{
          display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
          background: i%2===0?C.bg1:C.bg2,
          borderBottom:`1px solid ${C.border}`,
        }}>
          <span style={{ fontSize:11 }}>{CAT_META[leg.cat]?.icon??'•'}</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:C.white, fontWeight:600 }}>{leg.match}</div>
            <div style={{ fontSize:9, color:C.textD }}>
              {leg.league} · <span style={{ color:CAT_META[leg.cat]?.color??C.amberL }}>{leg.market}</span>
            </div>
          </div>
          <span style={{ fontSize:10, color:C.textD }}>{pct(leg.prob)}</span>
          <span style={{ fontSize:13, fontWeight:700, color:C.amberL }}>{leg.odds?.toFixed(2)}</span>
          <span style={{ fontSize:10, color:(leg.ev??0)>0?C.green:C.red }}>{fmtN(leg.ev,3)}</span>
          {i < legs.length-1 && (
            <span style={{ fontSize:10, color:C.dim, fontWeight:700 }}>×</span>
          )}
        </div>
      ))}

      {/* Parlay totals */}
      <div style={{
        background:C.bg0, borderTop:`2px solid ${evColor}`,
        padding:14, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8,
      }}>
        {[
          {l:'COMBINED ODDS',  v:totOdds?.toFixed(2),        c:C.amberL},
          {l:'WIN PROBABILITY',v:pct(totProb),               c:C.white},
          {l:'PARLAY EV',      v:fmtN(ev,3),                 c:evColor},
          {l:'KELLY STAKE',    v:kelly!=null?pct(kelly):'—', c:C.blue},
          {l:'KELLY (£1000)',  v:kelly!=null?`£${(kelly*1000).toFixed(2)}`:'—',c:C.blue},
          {l:'PAYOUT (£10)',   v:totOdds!=null?`£${(totOdds*10).toFixed(2)}`:'—',c:C.green},
        ].map(({l,v,c})=>(
          <div key={l} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:2, padding:'8px 10px' }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
            <div style={{ fontSize:14, fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Win probability bar */}
      <div style={{ padding:'0 14px 14px', background:C.bg0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ fontSize:9, color:C.muted }}>WIN PROBABILITY</span>
          <span style={{ fontSize:9, color:C.white }}>{pct(totProb)}</span>
        </div>
        <div style={{ height:5, background:C.bg3, borderRadius:1, overflow:'hidden' }}>
          <div style={{
            width:`${Math.min((totProb??0)*100,100)}%`, height:'100%',
            background:(totProb??0)>0.3?C.green:(totProb??0)>0.1?C.amber:C.red,
            borderRadius:1, transition:'width 0.5s ease',
          }}/>
        </div>
      </div>
    </div>
  )
}

// ── Single Fixture Full Card ───────────────────────────────────────────────────
function FixtureCard({ fix, onAIPredict }) {
  const [open,    setOpen]    = useState(false)
  const [catFlt,  setCatFlt]  = useState('ALL')
  const [viewAll, setViewAll] = useState(false)
  const [aip,     setAip]     = useState(null)
  const [aiLoading,setAiLoad] = useState(false)

  const { markets, quant, state, score, referee } = fix
  const stateLabel = state==='NS'?'UPCOMING':state==='FT'?'FT':state==='LIVE'?'LIVE':state
  const stateColor = state==='LIVE'?C.green:state==='FT'?C.muted:C.textD

  const displayPicks = (() => {
    let p = viewAll ? markets.allPicks : markets.valuePicks
    if (catFlt!=='ALL') p = p.filter(x=>x.cat===catFlt)
    return p.slice(0, viewAll?50:20)
  })()

  const handleAI = async () => {
    setAiLoad(true)
    try {
      const r = await onAIPredict(fix)
      setAip(r?.prediction)
    } catch(e) {
      setAip({ verdict:`Error: ${e.message}`, confidence:'LOW' })
    }
    setAiLoad(false)
  }

  return (
    <div style={{
      background:C.bg1,
      border:`1px solid ${fix.confidence==='HIGH'?C.green+'44':C.border}`,
      borderLeft:`3px solid ${CONF_COLOR[fix.confidence]??C.border}`,
      borderRadius:2, marginBottom:8, overflow:'hidden',
    }}>
      {/* Header row */}
      <div onClick={()=>setOpen(o=>!o)} style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'10px 14px', background:C.bg2, cursor:'pointer',
      }}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:C.white }}>{fix.name}</span>
            <Tag color={C.blue}>{fix.league}</Tag>
            <span style={{ fontSize:9, color:stateColor }}>{stateLabel}</span>
            {state!=='NS' && (
              <span style={{ fontSize:10, fontWeight:700, color:C.white }}>
                {score?.home}–{score?.away}
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <span style={{ fontSize:9, color:C.textDD }}>
              {new Date(fix.kickoff).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
            </span>
            <span style={{ fontSize:9, color:C.textDD }}>· Ref: {referee||'TBC'}</span>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Mini odds */}
          {fix.odds?.home && (
            <div style={{ display:'flex', gap:3 }}>
              {[{l:'1',v:fix.odds.home},{l:'X',v:fix.odds.draw},{l:'2',v:fix.odds.away}].map(({l,v})=>(
                <div key={l} style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:2, padding:'3px 8px', textAlign:'center', minWidth:40 }}>
                  <div style={{ fontSize:8, color:C.muted }}>{l}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:C.white }}>{v?.toFixed(2)??'—'}</div>
                </div>
              ))}
            </div>
          )}

          {/* Value picks count */}
          <div style={{ background:C.green+'18', border:`1px solid ${C.green}44`, borderRadius:2, padding:'4px 10px', textAlign:'center' }}>
            <div style={{ fontSize:8, color:C.muted }}>VALUE</div>
            <div style={{ fontSize:16, fontWeight:700, color:C.green }}>{markets.valuePicks.length}</div>
          </div>

          <Tag color={CONF_COLOR[fix.confidence]??C.muted}>{fix.confidence}</Tag>
          <span style={{ fontSize:14, color:C.textD }}>{open?'▲':'▼'}</span>
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ padding:14, display:'flex', flexDirection:'column', gap:12 }}>

          {/* Quick stats strip */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
            {[
              {l:'EXP GOALS',  v:`${markets.goals.expHome}–${markets.goals.expAway}`, c:C.green},
              {l:'BTTS %',     v:pct(markets.goals.pBTTS),                            c:C.green},
              {l:'O2.5 GOALS', v:pct(markets.goals.pOver25),                          c:C.amberL},
              {l:'EXP CORNERS',v:markets.expCorners,                                  c:C.amber},
              {l:'EXP CARDS',  v:markets.expCards,                                    c:C.red},
              {l:'BOOK PTS',   v:markets.expBkPts,                                    c:C.amberL},
            ].map(({l,v,c})=>(
              <div key={l} style={{ background:C.bg0, border:`1px solid ${C.border}`, borderRadius:2, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
                <div style={{ fontSize:15, fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Quant signals */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
            {[
              {l:'LUCK SCORE',   v:(quant.luckScore??0).toFixed(2),   c:(quant.luckScore??0)>0.5?C.red:C.green},
              {l:'FLUKE SCORE',  v:(quant.flukeScore??0).toFixed(2),  c:(quant.flukeScore??0)>0.65?C.red:C.green},
              {l:'PRESSURE IDX', v:(quant.pressure??0).toFixed(2),    c:C.blue},
              {l:'VOLATILITY',   v:(quant.volatility??0).toFixed(2),  c:(quant.volatility??0)>0.5?C.amber:C.textD},
            ].map(({l,v,c})=>(
              <div key={l} style={{ background:C.bg0, border:`1px solid ${C.border}`, borderRadius:2, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
                <div style={{ fontSize:18, fontWeight:700, color:c, lineHeight:1 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Top pick spotlight */}
          {markets.topPick && (
            <div style={{ background:C.bg0, border:`1px solid ${C.green}55`, borderTop:`2px solid ${C.green}`, borderRadius:2, padding:12 }}>
              <div style={{ fontSize:9, color:C.green, letterSpacing:'0.1em', marginBottom:6 }}>⭐ TOP PICK</div>
              <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <span style={{ fontSize:14, fontWeight:700, color:C.white }}>{markets.topPick.market}</span>
                <Tag color={CAT_META[markets.topPick.cat]?.color??C.blue}>{markets.topPick.cat}</Tag>
                <span style={{ fontSize:12, color:C.amberL }}>@ {markets.topPick.odds?.toFixed(2)}</span>
                <span style={{ fontSize:11, color:C.green }}>EV {fmtN(markets.topPick.ev,3)}</span>
                <span style={{ fontSize:10, color:C.blue }}>Kelly {pct(markets.topPick.kelly)}</span>
                <span style={{ fontSize:10, color:C.textD }}>
                  Model {pct(markets.topPick.prob)} vs Implied {pct(markets.topPick.impl)}
                </span>
                <div style={{ marginLeft:'auto' }}>
                  <GradeTag grade={markets.topPick.grade}/>
                </div>
              </div>
            </div>
          )}

          {/* Category filter */}
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
            <button onClick={()=>setCatFlt('ALL')} style={{ fontSize:8, background:catFlt==='ALL'?C.white+'22':'none', border:`1px solid ${catFlt==='ALL'?C.white:C.border}`, color:catFlt==='ALL'?C.white:C.textDD, padding:'3px 8px', borderRadius:1, cursor:'pointer' }}>ALL</button>
            {Object.entries(CAT_META).map(([cat,cm])=>{
              const n=(viewAll?markets.allPicks:markets.valuePicks).filter(p=>p.cat===cat).length
              return <button key={cat} onClick={()=>setCatFlt(cat)} style={{ fontSize:8, background:catFlt===cat?cm.color+'22':'none', border:`1px solid ${catFlt===cat?cm.color:C.border}`, color:catFlt===cat?cm.color:C.textDD, padding:'3px 8px', borderRadius:1, cursor:'pointer' }}>{cm.icon} {cat} ({n})</button>
            })}
            <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
              <button onClick={()=>setViewAll(v=>!v)} style={{ fontSize:8, background:viewAll?C.amber+'22':'none', border:`1px solid ${viewAll?C.amber:C.border}`, color:viewAll?C.amber:C.textDD, padding:'3px 8px', borderRadius:1, cursor:'pointer' }}>
                {viewAll?'VALUE ONLY':'ALL MARKETS'}
              </button>
            </div>
          </div>

          {/* Picks table */}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {displayPicks.map((p,i)=>(
              <div key={`${p.cat}-${p.market}`} style={{
                display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                background:i===0?C.green+'0D':i===1?C.amber+'0A':C.bg2,
                border:`1px solid ${i===0?C.green+'44':i===1?C.amber+'33':C.border}`,
                borderRadius:2,
              }}>
                <span style={{ fontSize:9, color:C.muted, width:18, textAlign:'center', fontWeight:700 }}>{i+1}</span>
                <span style={{ fontSize:11 }}>{CAT_META[p.cat]?.icon??'•'}</span>
                <Tag color={CAT_META[p.cat]?.color??C.blue}>{p.cat}</Tag>
                <span style={{ flex:1, fontSize:11, color:C.white, fontWeight:i<3?700:400 }}>{p.market}</span>
                <span style={{ fontSize:10, color:C.textD }}>{pct(p.prob)}</span>
                <span style={{ fontSize:12, fontWeight:700, color:C.amberL }}>{p.odds?.toFixed(2)??'—'}</span>
                <span style={{ fontSize:10, color:(p.ev??0)>0?C.green:C.red, minWidth:56, textAlign:'right' }}>EV {fmtN(p.ev,3)}</span>
                <span style={{ fontSize:10, color:C.blue, minWidth:48, textAlign:'right' }}>{p.kelly!=null?pct(p.kelly):'—'}</span>
                <GradeTag grade={p.grade}/>
              </div>
            ))}
            {displayPicks.length===0 && (
              <div style={{ textAlign:'center', padding:20, color:C.textDD, fontSize:11 }}>
                No {viewAll?'markets':'value picks'} in this category
              </div>
            )}
          </div>

          {/* AI Prediction */}
          {!aip ? (
            <button onClick={handleAI} disabled={aiLoading} style={{
              background:aiLoading?C.dim:C.amber, border:'none', borderRadius:1,
              color:aiLoading?C.textD:C.bg0, fontSize:11, fontWeight:700,
              letterSpacing:'0.08em', padding:'10px 20px', cursor:aiLoading?'wait':'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            }}>
              {aiLoading?'⟳  AI ANALYSING...':'⚡  GET AI DEEP-DIVE PREDICTION'}
            </button>
          ) : (
            <div style={{ background:C.bg0, border:`1px solid ${C.amber}55`, borderTop:`2px solid ${C.amber}`, borderRadius:2, padding:14, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                <span style={{ fontSize:16 }}>🧠</span>
                <div>
                  <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.1em', marginBottom:4 }}>AI VERDICT</div>
                  <div style={{ fontSize:12, color:C.white, lineHeight:1.7 }}>{aip.verdict}</div>
                </div>
              </div>
              {aip.primaryBet && (
                <div style={{ background:C.green+'11', border:`1px solid ${C.green}33`, borderRadius:2, padding:'10px 14px' }}>
                  <div style={{ fontSize:9, color:C.green, letterSpacing:'0.1em', marginBottom:6 }}>⭐ PRIMARY BET — {aip.primaryBet.market}</div>
                  <div style={{ fontSize:11, color:C.text, lineHeight:1.7 }}>{aip.primaryBet.reasoning}</div>
                </div>
              )}
              {aip.secondaryBet && (
                <div style={{ background:C.amber+'0D', border:`1px solid ${C.amber}33`, borderRadius:2, padding:'10px 14px' }}>
                  <div style={{ fontSize:9, color:C.amber, letterSpacing:'0.1em', marginBottom:4 }}>SECONDARY — {aip.secondaryBet.market}</div>
                  <div style={{ fontSize:11, color:C.text, lineHeight:1.7 }}>{aip.secondaryBet.reasoning}</div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                {[{l:'BTTS',v:aip.btts},{l:'OVER 2.5',v:aip.over25},{l:'PRED SCORE',v:aip.predictedScore},{l:'CONFIDENCE',v:aip.confidence}].map(({l,v})=>(
                  <div key={l} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:2, padding:'7px 10px', textAlign:'center' }}>
                    <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:C.amberL }}>{v??'—'}</div>
                  </div>
                ))}
              </div>
              {aip.bookingsBet && (
                <div style={{ fontSize:10, color:C.textD, padding:'6px 10px', background:C.bg2, border:`1px solid ${C.border}`, borderRadius:2 }}>
                  📋 BOOKINGS: {aip.bookingsBet}
                </div>
              )}
              {aip.flukeAlert && (
                <div style={{ fontSize:10, color:C.red, padding:'6px 10px', background:C.red+'11', border:`1px solid ${C.red}33`, borderRadius:2 }}>
                  ⚠ FLUKE ALERT: {aip.flukeAlert}
                </div>
              )}
              <button onClick={()=>setAip(null)} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:1, color:C.textDD, fontSize:9, padding:'3px 10px', cursor:'pointer', width:'fit-content' }}>REFRESH</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main UnifiedScan component ────────────────────────────────────────────────
const LEAGUES_LIST = ['All','EPL','La Liga','Bundesliga','Belgian Pro League','Championship','Ligue 1','Serie A']
const CONF_LIST    = ['All','HIGH','MEDIUM','LOW']

export default function UnifiedScan() {
  const [scanning,   setScanning]   = useState(false)
  const [scanData,   setScanData]   = useState(null)
  const [error,      setError]      = useState(null)
  const [log,        setLog]        = useState([])
  const [activeTab,  setActiveTab]  = useState('summary') // summary | fixtures | parlay
  const [leagueFlt,  setLeagueFlt]  = useState('All')
  const [confFlt,    setConfFlt]    = useState('All')

  const push = (msg, color=C.textD) =>
    setLog(l => [...l.slice(-30), { msg, color }])

  const handleScan = async () => {
    setScanning(true)
    setError(null)
    setScanData(null)
    setLog([])

    push('Connecting to Sportmonks API...', C.textD)
    push('Fetching today\'s fixtures for all 7 leagues...', C.blue)
    push('Loading team season stats: goals, corners, cards, fouls, shots, offsides...', C.textD)
    push('Fetching xG data, predictions, live odds...', C.textD)

    try {
      const res = await fetch('/api/scan')
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? `API error ${res.status}`)
      }
      const data = await res.json()

      push(`✓ ${data.total} fixtures loaded`, C.green)
      push(`Running 55+ market models: Goals, Corners, Cards, Shots, Offsides, Fouls, Timing, Penalty...`, C.amber)
      push(`✓ ${data.totalValuePicks} value picks identified across all markets`, C.green)
      push(`✓ ${data.highConf} HIGH confidence fixtures`, C.green)

      if (data.marketBreakdown) {
        const top = Object.entries(data.marketBreakdown).sort((a,b)=>b[1]-a[1]).slice(0,3)
        push(`Top markets today: ${top.map(([k,v])=>`${k}(${v})`).join(' · ')}`, C.textD)
      }

      if (data.parlay?.legs?.length) {
        const pl = data.parlay
        push(`✓ Optimal ${pl.legs.length}-leg parlay built @ ${pl.totOdds} — EV ${fmtN(pl.ev,3)}`, C.green)
      }

      push('Deep analysis complete. Expand any fixture for full market breakdown + AI prediction.', C.green)
      setScanData(data)
      setActiveTab('summary')
    } catch(e) {
      setError(e.message)
      push(`✕ ${e.message}`, C.red)
    } finally {
      setScanning(false)
    }
  }

  const handleAIPredict = useCallback(async (fix) => {
    const res = await fetch('/api/predict', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(fix),
    })
    if (!res.ok) throw new Error(`AI prediction failed: ${res.status}`)
    return res.json()
  }, [])

  // Filtered fixtures
  const fixtures = (scanData?.fixtures ?? [])
    .filter(f => leagueFlt==='All' || f.league===leagueFlt)
    .filter(f => confFlt==='All'   || f.confidence===confFlt)

  // All value picks for summary
  const allValuePicks = (scanData?.fixtures ?? [])
    .flatMap(f => f.markets.valuePicks.map(p => ({ ...p, match:f.name, league:f.league })))

  const top10 = [...allValuePicks].sort((a,b)=>(b.ev??0)-(a.ev??0)).slice(0,10)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* ── Scan button ──────────────────────────────────────────────────── */}
      <div style={{
        background:C.bg1, border:`1px solid ${C.border}`, borderTop:`2px solid ${C.amber}`,
        borderRadius:2, padding:16, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap',
      }}>
        <button onClick={handleScan} disabled={scanning} style={{
          background:scanning?C.dim:C.amber, border:'none', borderRadius:1,
          color:scanning?C.textD:C.bg0, fontSize:13, fontWeight:700,
          letterSpacing:'0.08em', padding:'12px 28px', cursor:scanning?'wait':'pointer',
          display:'flex', alignItems:'center', gap:10, whiteSpace:'nowrap',
          transition:'all 0.15s',
        }}>
          {scanning ? '⟳  SCANNING ALL LEAGUES...' : '⚡  SCAN TODAY\'S MATCHES'}
        </button>

        {scanData && (
          <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
            {[
              {l:'DATE',           v:scanData.date,              c:C.white},
              {l:'FIXTURES',       v:scanData.total,             c:C.white},
              {l:'HIGH CONF',      v:scanData.highConf,          c:C.green},
              {l:'TOTAL VALUE BETS',v:scanData.totalValuePicks,  c:C.green},
            ].map(({l,v,c})=>(
              <div key={l}>
                <div style={{ fontSize:8, color:C.muted }}>{l}</div>
                <div style={{ fontSize:14, fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* League pills */}
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginLeft:'auto' }}>
          {['EPL','La Liga','Bundesliga','Belgian Pro League','Championship','Ligue 1','Serie A'].map(l=>(
            <span key={l} style={{ fontSize:8, background:C.blue+'18', color:C.blue, border:`1px solid ${C.blue}33`, padding:'2px 7px', borderRadius:1 }}>{l}</span>
          ))}
        </div>
      </div>

      {/* ── Execution log ─────────────────────────────────────────────────── */}
      {log.length > 0 && (
        <div style={{ background:C.bg0, border:`1px solid ${C.border}`, borderRadius:2, padding:'10px 14px', display:'flex', flexDirection:'column', gap:3 }}>
          {log.map((l,i) => (
            <div key={i} style={{ fontSize:10, color:l.color, lineHeight:1.6 }}>{l.msg}</div>
          ))}
          {scanning && <span style={{ color:C.amber, animation:'blink 0.8s infinite' }}>▋</span>}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background:C.red+'11', border:`1px solid ${C.red}33`, borderRadius:2, padding:'12px 14px', fontSize:11, color:C.red }}>
          ✕ {error}
          {error.includes('SPORTMONKS') && (
            <div style={{ marginTop:6, fontSize:10, color:C.textD }}>
              → Vercel → Project → Settings → Environment Variables → add SPORTMONKS_API_KEY
            </div>
          )}
        </div>
      )}

      {/* ── Main tabs (only show after scan) ─────────────────────────────── */}
      {scanData && (
        <div style={{ background:C.bg1, border:`1px solid ${C.border}`, borderTop:`2px solid ${C.green}`, borderRadius:2, overflow:'hidden' }}>

          {/* Tab bar */}
          <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, background:C.bg2, flexWrap:'wrap' }}>
            {[
              ['summary',  '📊 SUMMARY & TOP PICKS'],
              ['parlay',   `🎯 OPTIMAL PARLAY (${scanData.parlay?.legs?.length??0} legs)`],
              ['fixtures', `📋 ALL FIXTURES (${scanData.total})`],
            ].map(([k,l])=>(
              <button key={k} onClick={()=>setActiveTab(k)} style={{
                background:'none', border:'none',
                borderBottom:`2px solid ${activeTab===k?C.green:'transparent'}`,
                color:activeTab===k?C.green:C.muted,
                fontSize:9, fontWeight:600, letterSpacing:'0.1em',
                padding:'10px 16px', cursor:'pointer',
              }}>{l}</button>
            ))}
          </div>

          <div style={{ padding:14 }}>

            {/* ── SUMMARY TAB ─────────────────────────────────────────── */}
            {activeTab==='summary' && (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

                {/* Market breakdown */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {Object.entries(CAT_META).map(([cat,cm])=>{
                    const n = (scanData.marketBreakdown?.[cat]??0)
                    const topEV = n>0?Math.max(...allValuePicks.filter(p=>p.cat===cat).map(p=>p.ev??0)):0
                    return (
                      <div key={cat} style={{
                        background:C.bg1, border:`1px solid ${n>0?cm.color+'44':C.border}`,
                        borderTop:`2px solid ${n>0?cm.color:C.border}`, borderRadius:2, padding:'12px 14px',
                      }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                          <span style={{ fontSize:14 }}>{cm.icon}</span>
                          <Tag color={cm.color}>{cm.label}</Tag>
                        </div>
                        <div style={{ fontSize:26, fontWeight:700, color:n>0?C.white:C.textDD, lineHeight:1, marginBottom:3 }}>{n}</div>
                        <div style={{ fontSize:9, color:C.muted, marginBottom:n>0?4:0 }}>value picks</div>
                        {n>0&&<div style={{ fontSize:10, color:C.green }}>Best EV: {fmtN(topEV,3)}</div>}
                      </div>
                    )
                  })}
                </div>

                {/* Top 10 global value bets */}
                <div style={{ background:C.bg1, border:`1px solid ${C.border}`, borderTop:`2px solid ${C.amber}`, borderRadius:2 }}>
                  <div style={{ padding:'10px 14px', background:C.bg2, borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:10, fontWeight:600, color:C.textD, letterSpacing:'0.12em' }}>
                      ⭐ TOP 10 VALUE BETS — ALL MARKETS — TODAY
                    </span>
                  </div>
                  <div style={{ padding:14, display:'flex', flexDirection:'column', gap:5 }}>
                    {top10.length===0 && (
                      <div style={{ textAlign:'center', padding:24, color:C.textDD, fontSize:11 }}>
                        No value picks found — market prices may be efficient today
                      </div>
                    )}
                    {top10.map((p,i)=>(
                      <div key={i} style={{
                        display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                        background:i<3?C.green+'0D':C.bg2,
                        border:`1px solid ${i<3?C.green+'33':C.border}`, borderRadius:2,
                      }}>
                        <div style={{ width:24, height:24, borderRadius:2, background:i===0?C.amber:i<3?C.green+'44':C.bg3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:i===0?C.bg0:C.textD, flexShrink:0 }}>{i+1}</div>
                        <span style={{ fontSize:11 }}>{CAT_META[p.cat]?.icon??'•'}</span>
                        <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0 }}>
                          <span style={{ fontSize:11, color:C.white, fontWeight:i<3?700:400 }}>{p.market}</span>
                          <span style={{ fontSize:9, color:C.textDD }}>{p.match} · {p.league}</span>
                        </div>
                        <Tag color={CAT_META[p.cat]?.color??C.blue}>{p.cat}</Tag>
                        <span style={{ fontSize:12, fontWeight:700, color:C.amberL }}>{p.odds?.toFixed(2)??'—'}</span>
                        <span style={{ fontSize:10, color:C.green }}>{fmtN(p.ev,3)}</span>
                        <span style={{ fontSize:10, color:C.blue }}>{pct(p.kelly)}</span>
                        <GradeTag grade={p.grade}/>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick parlay teaser */}
                {scanData.parlay?.legs?.length > 0 && (
                  <div style={{ background:C.bg1, border:`1px solid ${C.green}44`, borderTop:`2px solid ${C.green}`, borderRadius:2, overflow:'hidden' }}>
                    <div style={{ padding:'10px 14px', background:C.bg2, borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:10, fontWeight:600, color:C.textD, letterSpacing:'0.12em' }}>
                        🎯 TODAY'S OPTIMAL PARLAY
                      </span>
                      <button onClick={()=>setActiveTab('parlay')} style={{ fontSize:9, background:'none', border:`1px solid ${C.green}`, color:C.green, padding:'3px 10px', borderRadius:1, cursor:'pointer' }}>
                        VIEW FULL SLIP →
                      </button>
                    </div>
                    <div style={{ padding:'10px 14px', display:'flex', gap:14, flexWrap:'wrap', alignItems:'center' }}>
                      <span style={{ fontSize:12, color:C.white, fontWeight:700 }}>
                        {scanData.parlay.legs.length}-Leg Parlay
                      </span>
                      <span style={{ fontSize:13, color:C.amberL, fontWeight:700 }}>
                        @ {scanData.parlay.totOdds}
                      </span>
                      <span style={{ fontSize:11, color:scanData.parlay.ev>0?C.green:C.red }}>
                        EV {fmtN(scanData.parlay.ev,3)}
                      </span>
                      <div style={{ flex:1, display:'flex', gap:6, flexWrap:'wrap' }}>
                        {scanData.parlay.legs.map((leg,i)=>(
                          <span key={i} style={{ fontSize:9, background:C.green+'18', color:C.green, border:`1px solid ${C.green}33`, padding:'2px 8px', borderRadius:1 }}>
                            {leg.match?.split(' v ')[0]} – {leg.market}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── PARLAY TAB ───────────────────────────────────────────── */}
            {activeTab==='parlay' && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ fontSize:11, color:C.textD, lineHeight:1.8 }}>
                  This parlay is auto-selected from today's highest positive-EV picks, one per fixture,
                  maximising combined EV using quarter-Kelly staking. All legs have model probability
                  greater than bookmaker implied probability.
                </div>
                <ParlaySlip parlay={scanData.parlay}/>
              </div>
            )}

            {/* ── FIXTURES TAB ─────────────────────────────────────────── */}
            {activeTab==='fixtures' && (
              <div>
                {/* Filters */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
                  <div style={{ display:'flex', gap:3 }}>
                    {LEAGUES_LIST.map(l=>(
                      <button key={l} onClick={()=>setLeagueFlt(l)} style={{ fontSize:8, background:leagueFlt===l?C.blue+'22':'none', border:`1px solid ${leagueFlt===l?C.blue:C.border}`, color:leagueFlt===l?C.blue:C.textDD, padding:'3px 7px', borderRadius:1, cursor:'pointer' }}>{l}</button>
                    ))}
                  </div>
                  <div style={{ width:1, height:16, background:C.border }}/>
                  <div style={{ display:'flex', gap:3 }}>
                    {CONF_LIST.map(c=>(
                      <button key={c} onClick={()=>setConfFlt(c)} style={{ fontSize:8, background:confFlt===c?C.green+'22':'none', border:`1px solid ${confFlt===c?C.green:C.border}`, color:confFlt===c?C.green:C.textDD, padding:'3px 7px', borderRadius:1, cursor:'pointer' }}>{c}</button>
                    ))}
                  </div>
                  <span style={{ marginLeft:'auto', fontSize:9, color:C.textDD }}>
                    {fixtures.length} of {scanData.total} fixtures
                  </span>
                </div>

                {fixtures.map(fix => (
                  <FixtureCard key={fix.id} fix={fix} onAIPredict={handleAIPredict}/>
                ))}

                {fixtures.length===0 && (
                  <div style={{ textAlign:'center', padding:32, color:C.textDD, fontSize:11 }}>
                    No fixtures match current filters
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!scanData && !scanning && log.length===0 && (
        <div style={{ textAlign:'center', padding:'48px 20px', color:C.textDD, fontSize:11, border:`1px dashed ${C.border}`, borderRadius:2 }}>
          Press ⚡ SCAN TODAY'S MATCHES to fetch real live data and run all 55+ market models<br/>
          <span style={{ fontSize:9, marginTop:6, display:'block' }}>
            Covers EPL · La Liga · Bundesliga · Belgian Pro League · Championship · Ligue 1 · Serie A
          </span>
        </div>
      )}
    </div>
  )
}

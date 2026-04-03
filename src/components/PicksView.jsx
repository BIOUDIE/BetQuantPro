import { useState } from 'react'
import { C } from '../theme.js'

// ─── Design tokens ────────────────────────────────────────────────────────────
const CONF = { HIGH: { color:'#00C896', bg:'#00C89618', border:'#00C89644' },
               MEDIUM:{ color:'#F0A500', bg:'#F0A50015', border:'#F0A50044' },
               LOW:   { color:'#7A9AB8', bg:'#7A9AB815', border:'#7A9AB844' } }
const CAT_COLOR = { RESULT:'#3B8EEA',GOALS:'#00C896',CORNERS:'#F0A500',CARDS:'#E8445A',SHOTS:'#A78BFA',OFFSIDES:'#22D3EE',FOULS:'#FB923C',TIMING:'#F472B6',PENALTY:'#818CF8' }
const CAT_ICON  = { RESULT:'🏆',GOALS:'⚽',CORNERS:'🚩',CARDS:'🟨',SHOTS:'🎯',OFFSIDES:'🚫',FOULS:'🦵',TIMING:'⏱',PENALTY:'🥅' }

const fmt = (n,d=2) => n!=null?(n>=0?'+':'')+n.toFixed(d):'—'
const pct  = n => n!=null?((n)*100).toFixed(0)+'%':'—'

// ─── Single pick chip ─────────────────────────────────────────────────────────
function PickChip({ pick, index, isTop }) {
  const conf = CONF[pick.confidence] ?? CONF.MEDIUM
  return (
    <div style={{
      background:   isTop ? conf.bg : C.bg2,
      border:       `1px solid ${isTop ? conf.border : C.border}`,
      borderLeft:   `3px solid ${conf.color}`,
      borderRadius:  2,
      padding:      '12px 16px',
      display:      'flex',
      flexDirection:'column',
      gap:           6,
      position:     'relative',
      transition:   'all 0.15s',
    }}>
      {/* Rank badge */}
      {isTop && (
        <div style={{
          position:'absolute', top:-1, right:10,
          background:conf.color, color:C.bg0,
          fontSize:8, fontWeight:700, letterSpacing:'0.1em',
          padding:'2px 8px', borderRadius:'0 0 4px 4px',
        }}>BEST PICK</div>
      )}

      {/* Market + category */}
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:14 }}>{CAT_ICON[pick.cat??'RESULT']??'•'}</span>
        <span style={{ fontSize:13, fontWeight:700, color:C.white }}>{pick.market}</span>
        <span style={{
          fontSize:8, fontWeight:700, letterSpacing:'0.08em',
          padding:'2px 7px', borderRadius:1,
          background:conf.bg, color:conf.color, border:`1px solid ${conf.border}`,
          marginLeft:'auto',
        }}>{pick.confidence}</span>
      </div>

      {/* Odds + stake */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div>
          <div style={{ fontSize:8, color:C.muted }}>ODDS</div>
          <div style={{ fontSize:22, fontWeight:700, color:C.amberL, lineHeight:1 }}>
            {pick.odds?.toFixed(2)??'—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize:8, color:C.muted }}>STAKE</div>
          <div style={{ fontSize:16, fontWeight:700, color:C.blue, lineHeight:1 }}>
            {pick.stake??'2%'}
          </div>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:8, color:C.muted }}>REASONING</div>
          <div style={{ fontSize:10, color:C.text, lineHeight:1.6, marginTop:2 }}>
            {pick.reasoning}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Analysis drawer (all the numbers, hidden by default) ─────────────────────
function AnalysisDrawer({ fix }) {
  const { markets, exp, result } = fix
  const [catFlt, setCatFlt] = useState('ALL')

  const displayPicks = catFlt==='ALL'
    ? markets.valuePicks.slice(0,20)
    : markets.valuePicks.filter(p=>p.cat===catFlt).slice(0,20)

  return (
    <div style={{ borderTop:`1px solid ${C.border}`, padding:14, display:'flex', flexDirection:'column', gap:12, background:C.bg0 }}>

      {/* Stat grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:6 }}>
        {[
          {l:'EXP GOALS',   v:`${exp.homeGoals}–${exp.awayGoals}`, c:C.green},
          {l:'BTTS',        v:pct(exp.pBTTS),                       c:C.green},
          {l:'OVER 2.5',    v:pct(exp.pOver25),                     c:'#F0A500'},
          {l:'EXP CORNERS', v:exp.corners,                          c:'#F0A500'},
          {l:'EXP CARDS',   v:exp.cards,                            c:C.red},
          {l:'BOOK PTS',    v:exp.bookPts,                          c:'#F0A500'},
        ].map(({l,v,c})=>(
          <div key={l} style={{ background:C.bg1, border:`1px solid ${C.border}`, borderRadius:2, padding:'8px 10px', textAlign:'center' }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
            <div style={{ fontSize:14, fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Result probabilities */}
      <div style={{ display:'flex', gap:4 }}>
        {[{l:'HOME WIN',v:result.p1,c:C.green},{l:'DRAW',v:result.px,c:C.amber},{l:'AWAY WIN',v:result.p2,c:C.red}].map(({l,v,c})=>(
          <div key={l} style={{ flex:1, background:C.bg1, border:`1px solid ${C.border}`, borderRadius:2, padding:'8px', textAlign:'center' }}>
            <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
            <div style={{ fontSize:16, fontWeight:700, color:c }}>{pct(v)}</div>
            <div style={{ height:3, background:C.bg3, borderRadius:1, overflow:'hidden', marginTop:4 }}>
              <div style={{ width:pct(v), height:'100%', background:c, borderRadius:1 }}/>
            </div>
          </div>
        ))}
      </div>

      {/* All value picks */}
      <div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8, alignItems:'center' }}>
          <span style={{ fontSize:9, color:C.muted, letterSpacing:'0.1em' }}>ALL VALUE PICKS:</span>
          <button onClick={()=>setCatFlt('ALL')} style={{ fontSize:8, background:catFlt==='ALL'?C.white+'22':'none', border:`1px solid ${catFlt==='ALL'?C.white:C.border}`, color:catFlt==='ALL'?C.white:C.textDD, padding:'2px 7px', borderRadius:1, cursor:'pointer' }}>ALL ({markets.valuePicks.length})</button>
          {['RESULT','GOALS','CORNERS','CARDS','SHOTS','TIMING','PENALTY'].map(cat=>{
            const n=markets.valuePicks.filter(p=>p.cat===cat).length
            if(!n) return null
            return <button key={cat} onClick={()=>setCatFlt(cat)} style={{ fontSize:8, background:catFlt===cat?CAT_COLOR[cat]+'22':'none', border:`1px solid ${catFlt===cat?CAT_COLOR[cat]:C.border}`, color:catFlt===cat?CAT_COLOR[cat]:C.textDD, padding:'2px 7px', borderRadius:1, cursor:'pointer' }}>{CAT_ICON[cat]} {cat} ({n})</button>
          })}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          {displayPicks.map((p,i)=>(
            <div key={`${p.cat}-${p.market}`} style={{
              display:'flex', alignItems:'center', gap:8, padding:'7px 10px',
              background:i===0?C.green+'0D':C.bg1,
              border:`1px solid ${i===0?C.green+'33':C.border}`, borderRadius:2,
            }}>
              <span style={{ fontSize:10 }}>{CAT_ICON[p.cat]??'•'}</span>
              <span style={{ flex:1, fontSize:10, color:C.text }}>{p.market}</span>
              <span style={{ fontSize:8, padding:'1px 6px', borderRadius:1, background:CAT_COLOR[p.cat]+'22', color:CAT_COLOR[p.cat], border:`1px solid ${CAT_COLOR[p.cat]}44` }}>{p.cat}</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#F0A500' }}>{p.odds?.toFixed(2)}</span>
              <span style={{ fontSize:10, color:(p.ev||0)>0?C.green:C.red, minWidth:52, textAlign:'right' }}>{fmt(p.ev,3)}</span>
              <span style={{ fontSize:10, color:'#3B8EEA', minWidth:38, textAlign:'right' }}>{p.kelly!=null?pct(p.kelly):' —'}</span>
            </div>
          ))}
          {displayPicks.length===0 && <div style={{ fontSize:10, color:C.textDD, padding:12, textAlign:'center' }}>No value picks in this category</div>}
        </div>
      </div>
    </div>
  )
}

// ─── Single fixture card ───────────────────────────────────────────────────────
function FixturePickCard({ fix, index }) {
  const [showAnalysis, setShowAnalysis] = useState(false)
  const ai = fix.ai
  const stateLabel = fix.state==='NS'?'UPCOMING':fix.state==='FT'?'FT':fix.state==='LIVE'?'● LIVE':fix.state
  const stateColor = fix.state==='LIVE'?C.green:fix.state==='FT'?C.muted:C.textD

  // If AI says SKIP
  const isSkip = ai?.skip===true

  return (
    <div style={{
      background:   C.bg1,
      border:       `1px solid ${isSkip?C.border:C.green+'33'}`,
      borderRadius:  4,
      overflow:     'hidden',
      animationDelay:`${index*0.06}s`,
      animation:    'fadeSlideIn 0.4s ease both',
    }}>
      {/* Match header */}
      <div style={{ padding:'14px 18px', background:C.bg2, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:14, fontWeight:700, color:C.white }}>{fix.name}</span>
            <span style={{ fontSize:9, background:C.blue+'22', color:'#3B8EEA', border:'1px solid #3B8EEA44', padding:'2px 7px', borderRadius:1 }}>{fix.league}</span>
            <span style={{ fontSize:9, color:stateColor }}>
              {stateLabel}
              {fix.state!=='NS'&&` ${fix.score?.home??0}–${fix.score?.away??0}`}
            </span>
          </div>
          <div style={{ fontSize:9, color:C.textDD }}>
            {new Date(fix.kickoff).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
            {fix.referee&&fix.referee!=='TBC'&&` · Ref: ${fix.referee}`}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {!isSkip && (
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <span style={{ fontSize:9, color:C.muted }}>
                {fix.valuePicks?.length??0} value picks ·
              </span>
              <span style={{ fontSize:9, color:fix.ai?.picks?.length>0?C.green:C.muted }}>
                {fix.ai?.picks?.length??0} AI picks
              </span>
            </div>
          )}
          {isSkip && <span style={{ fontSize:9, color:C.muted, fontStyle:'italic' }}>No value today</span>}
        </div>
      </div>

      {/* AI verdict */}
      {ai?.verdict && (
        <div style={{ padding:'10px 18px', borderBottom:`1px solid ${C.border}`, display:'flex', gap:8, alignItems:'flex-start' }}>
          <span style={{ fontSize:12, flexShrink:0 }}>🧠</span>
          <span style={{ fontSize:11, color:C.textD, lineHeight:1.7, fontStyle:'italic' }}>{ai.verdict}</span>
        </div>
      )}

      {/* SKIP state */}
      {isSkip && (
        <div style={{ padding:'14px 18px', display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:11, color:C.muted }}>⊘</span>
          <span style={{ fontSize:11, color:C.muted }}>{ai.skipReason??'No statistical value found in this fixture — model recommends passing.'}</span>
        </div>
      )}

      {/* AI Picks */}
      {!isSkip && ai?.picks?.length > 0 && (
        <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:8 }}>
          {ai.picks.map((pick,i) => (
            <PickChip key={i} pick={pick} index={i} isTop={i===0} />
          ))}
        </div>
      )}

      {/* No AI picks fallback — show top quant pick */}
      {!isSkip && (!ai?.picks||ai.picks.length===0) && fix.topPick && (
        <div style={{ padding:'14px 18px' }}>
          <div style={{ fontSize:9, color:C.textDD, marginBottom:8, letterSpacing:'0.08em' }}>QUANT MODEL PICK</div>
          <div style={{
            background:C.green+'0D', border:`1px solid ${C.green}33`, borderLeft:`3px solid ${C.green}`,
            borderRadius:2, padding:'12px 16px', display:'flex', flexDirection:'column', gap:6,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13 }}>{CAT_ICON[fix.topPick.cat]??'•'}</span>
              <span style={{ fontSize:13, fontWeight:700, color:C.white }}>{fix.topPick.market}</span>
              <span style={{ fontSize:22, fontWeight:700, color:'#F0A500', marginLeft:'auto' }}>{fix.topPick.odds?.toFixed(2)}</span>
            </div>
            <div style={{ fontSize:10, color:C.textD }}>
              Model probability {pct(fix.topPick.prob)} vs implied {pct(fix.topPick.impl)} · EV {fmt(fix.topPick.ev,3)}
            </div>
          </div>
        </div>
      )}

      {/* Analysis toggle */}
      <div style={{ borderTop:`1px solid ${C.border}`, background:C.bg2 }}>
        <button
          onClick={() => setShowAnalysis(v=>!v)}
          style={{
            width:'100%', padding:'9px 18px', background:'none', border:'none',
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between',
            color:C.textD, fontSize:9, letterSpacing:'0.1em', fontFamily:'inherit',
          }}
        >
          <span>📊 {showAnalysis?'HIDE':'SHOW'} FULL ANALYSIS — {fix.valuePicks?.length??0} VALUE PICKS ACROSS ALL MARKETS</span>
          <span>{showAnalysis?'▲':'▼'}</span>
        </button>
        {showAnalysis && <AnalysisDrawer fix={fix} />}
      </div>
    </div>
  )
}

// ─── Parlay card ──────────────────────────────────────────────────────────────
function ParlayCard({ parlay, aiParlay }) {
  const [open, setOpen] = useState(false)
  if (!parlay?.legs?.length) return null
  const evColor = (parlay.ev||0)>0?C.green:C.red

  return (
    <div style={{
      background:C.bg1, border:`2px solid ${C.green}55`,
      borderRadius:4, overflow:'hidden',
    }}>
      <div onClick={()=>setOpen(v=>!v)} style={{
        padding:'14px 18px', background:C.green+'0D', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:18 }}>🎯</span>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:C.white }}>TODAY'S OPTIMAL PARLAY</div>
            <div style={{ fontSize:9, color:C.textD, marginTop:2 }}>{parlay.legs.length} legs · auto-selected by the model</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:14, alignItems:'center' }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:8, color:C.muted }}>COMBINED ODDS</div>
            <div style={{ fontSize:22, fontWeight:700, color:'#F0A500' }}>{parlay.totOdds}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:8, color:C.muted }}>PARLAY EV</div>
            <div style={{ fontSize:16, fontWeight:700, color:evColor }}>{fmt(parlay.ev,3)}</div>
          </div>
          <span style={{ fontSize:14, color:C.textD }}>{open?'▲':'▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
          {/* Legs */}
          {parlay.legs.map((leg,i)=>(
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
              background:C.bg0, border:`1px solid ${C.border}`, borderRadius:2,
            }}>
              <span style={{ fontSize:11 }}>{CAT_ICON[leg.cat]??'•'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, fontWeight:600, color:C.white }}>{leg.match}</div>
                <div style={{ fontSize:9, color:C.textD }}>{leg.league} · <span style={{ color:CAT_COLOR[leg.cat]??'#F0A500' }}>{leg.market}</span></div>
              </div>
              <span style={{ fontSize:10, color:C.textD }}>{pct(leg.prob)}</span>
              <span style={{ fontSize:14, fontWeight:700, color:'#F0A500' }}>{leg.odds?.toFixed(2)}</span>
              {i<parlay.legs.length-1 && <span style={{ fontSize:10, color:C.dim, fontWeight:700 }}>×</span>}
            </div>
          ))}

          {/* Totals */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {[
              {l:'WIN PROBABILITY',  v:pct(parlay.totProb),                    c:C.white},
              {l:'PARLAY EV',        v:fmt(parlay.ev,3),                        c:evColor},
              {l:'KELLY STAKE',      v:`${(parlay.kelly*100).toFixed(1)}% of bank`, c:'#3B8EEA'},
              {l:'PAYOUT (£10)',     v:`£${(parlay.totOdds*10).toFixed(2)}`,    c:C.green},
              {l:'PAYOUT (£50)',     v:`£${(parlay.totOdds*50).toFixed(2)}`,    c:C.green},
              {l:'PAYOUT (£100)',    v:`£${(parlay.totOdds*100).toFixed(2)}`,   c:C.green},
            ].map(({l,v,c})=>(
              <div key={l} style={{ background:C.bg0, border:`1px solid ${C.border}`, borderRadius:2, padding:'8px 10px' }}>
                <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
                <div style={{ fontSize:13, fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Prob bar */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:9, color:C.muted }}>WIN PROBABILITY</span>
              <span style={{ fontSize:9, color:C.white }}>{pct(parlay.totProb)}</span>
            </div>
            <div style={{ height:5, background:C.bg2, borderRadius:1, overflow:'hidden' }}>
              <div style={{ width:pct(parlay.totProb), height:'100%', background:(parlay.totProb||0)>0.3?C.green:(parlay.totProb||0)>0.1?C.amber:C.red, borderRadius:1 }}/>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main PicksView ────────────────────────────────────────────────────────────
export default function PicksView() {
  const [scanning,  setScanning]  = useState(false)
  const [data,      setData]      = useState(null)
  const [error,     setError]     = useState(null)
  const [log,       setLog]       = useState([])
  const [leagueFlt, setLeagueFlt] = useState('All')
  const [showSkips, setShowSkips] = useState(false)
  const [dateMode,  setDateMode]  = useState('today')  // 'today' | 'tomorrow'

  const push = (msg,color=C.textD) => setLog(l=>[...l.slice(-20),{msg,color}])

  const handleScan = async (dm) => {
    const mode = dm ?? dateMode
    setScanning(true)
    setError(null)
    setData(null)
    setLog([])
    push(`Fetching ${mode==='tomorrow'?"tomorrow's":"today's"} fixtures across 7 leagues...`, C.textD)
    push('Detecting correct seasons (cross-year leagues handled automatically)...', C.textD)
    push('Running 55+ market models: Goals, Corners, Cards, Shots, Timing...', C.amber)
    push('AI analysing all markets and selecting best picks...', C.amber)
    try {
      const res = await fetch(`/api/picks?date=${mode}`)
      const d   = await res.json().catch(()=>({error:true,errorMessage:res.statusText}))

      if (d.error && d.errorType) { setError(d); push(`✕ ${d.errorMessage}`, C.red); return }
      if (!res.ok) { const msg=d.errorMessage||`Server error ${res.status}`; setError({errorMessage:msg}); push(`✕ ${msg}`, C.red); return }
      if (d.planWarning) push(`⚠ ${d.planWarning}`, C.amber)

      if (!d.total) {
        push(d.dayVerdict||`No fixtures ${mode==='tomorrow'?'tomorrow':'today'}.`, C.textD)
        setData(d); return
      }
      const validPicks = (d.fixtures||[]).filter(f=>f.ai?.picks?.length>0||f.topPick)
      const skips      = (d.fixtures||[]).filter(f=>f.ai?.skip)
      push(`✓ ${d.total} fixtures analysed (${d.dateLabel})`, C.green)
      push(`✓ ${validPicks.length} with picks · ${skips.length} skipped (no value)`, C.green)
      if (d.parlay) push(`✓ Optimal ${d.parlay.legs?.length}-leg parlay @ ${d.parlay.totOdds}`, C.green)
      push('Done. Picks are ready.', C.green)
      setData(d)
    } catch(e) {
      setError({errorMessage:e.message,errorFix:'Check your connection and try again.'})
      push(`✕ ${e.message}`, C.red)
    } finally {
      setScanning(false)
    }
  }

  const LEAGUES = ['All','EPL','La Liga','Bundesliga','Belgian Pro League','Championship','Ligue 1','Serie A']

  const fixtures = (data?.fixtures??[])
    .filter(f => leagueFlt==='All'||f.league===leagueFlt)
    .filter(f => showSkips||!f.ai?.skip)

  const totalPicks = (data?.fixtures??[]).reduce((s,f)=>s+(f.ai?.picks?.length??0),0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <style>{`
        @keyframes fadeSlideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>

      {/* ── Scan button ──────────────────────────────────────────────────── */}
      <div style={{
        background:C.bg1, border:`1px solid ${C.border}`,
        borderTop:`2px solid ${C.amber}`, borderRadius:4,
        padding:'18px 20px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap',
      }}>
        {/* Today / Tomorrow toggle */}
        <div style={{ display:'flex', background:C.bg0, border:`1px solid ${C.border}`, borderRadius:2, overflow:'hidden' }}>
          {[['today','TODAY'],['tomorrow','TOMORROW']].map(([dm,label])=>(
            <button key={dm} onClick={()=>{ setDateMode(dm); if(!scanning) handleScan(dm) }} disabled={scanning} style={{
              background:dateMode===dm?C.amber:'none', border:'none',
              color:dateMode===dm?C.bg0:C.textDD,
              fontSize:10, fontWeight:700, letterSpacing:'0.08em',
              padding:'10px 18px', cursor:scanning?'wait':'pointer',
            }}>{label}</button>
          ))}
        </div>

        <button onClick={()=>handleScan()} disabled={scanning} style={{
          background:scanning?C.dim:C.amber, border:'none', borderRadius:2,
          color:scanning?C.textD:C.bg0, fontSize:14, fontWeight:700,
          letterSpacing:'0.08em', padding:'13px 30px',
          cursor:scanning?'wait':'pointer',
          display:'flex', alignItems:'center', gap:10,
          transition:'all 0.15s', whiteSpace:'nowrap',
          boxShadow:scanning?'none':'0 2px 12px #F0A50033',
        }}>
          {scanning
            ? <><span style={{animation:'pulse 1s infinite'}}>⟳</span> ANALYSING...</>
            : `⚡  GET ${dateMode==='tomorrow'?"TOMORROW'S":"TODAY'S"} PICKS`
          }
        </button>

        {data && (
          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:8, color:C.muted }}>DATE</div>
              <div style={{ fontSize:13, color:C.white, fontWeight:600 }}>{data.date}</div>
            </div>
            <div>
              <div style={{ fontSize:8, color:C.muted }}>FIXTURES</div>
              <div style={{ fontSize:13, color:C.white, fontWeight:600 }}>{data.total}</div>
            </div>
            <div>
              <div style={{ fontSize:8, color:C.muted }}>AI PICKS</div>
              <div style={{ fontSize:13, color:C.green, fontWeight:700 }}>{totalPicks}</div>
            </div>
            {data.parlay && (
              <div>
                <div style={{ fontSize:8, color:C.muted }}>BEST PARLAY</div>
                <div style={{ fontSize:13, color:'#F0A500', fontWeight:700 }}>@ {data.parlay.totOdds}</div>
              </div>
            )}
          </div>
        )}

        {/* League filter */}
        <div style={{ marginLeft:'auto', display:'flex', gap:4, flexWrap:'wrap' }}>
          {LEAGUES.map(l=>(
            <button key={l} onClick={()=>setLeagueFlt(l)} style={{
              fontSize:8, background:leagueFlt===l?C.blue+'22':'none',
              border:`1px solid ${leagueFlt===l?C.blue:C.border}`,
              color:leagueFlt===l?C.blue:C.textDD,
              padding:'3px 8px', borderRadius:1, cursor:'pointer',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── Log ──────────────────────────────────────────────────────────── */}
      {log.length>0 && (
        <div style={{ background:C.bg0, border:`1px solid ${C.border}`, borderRadius:2, padding:'10px 14px' }}>
          {log.map((l,i)=>(
            <div key={i} style={{ fontSize:10, color:l.color, lineHeight:1.7 }}>
              {scanning&&i===log.length-1?<span style={{animation:'pulse 0.8s infinite'}}>▋</span>:null} {l.msg}
            </div>
          ))}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background:C.red+'11', border:`1px solid ${C.red}33`, borderRadius:2, padding:'12px 16px', fontSize:11, color:C.red }}>
          ✕ {error}
          {error.includes('KEY')&&<div style={{ fontSize:10, color:C.textD, marginTop:6 }}>→ Add SPORTMONKS_API_KEY and ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables</div>}
        </div>
      )}

      {/* ── Day verdict ───────────────────────────────────────────────────── */}
      {data?.dayVerdict && (
        <div style={{
          background:C.green+'0D', border:`1px solid ${C.green}33`,
          borderRadius:4, padding:'14px 18px',
          display:'flex', gap:12, alignItems:'center',
        }}>
          <span style={{ fontSize:18 }}>📈</span>
          <div>
            <div style={{ fontSize:9, color:C.green, letterSpacing:'0.1em', marginBottom:4 }}>TODAY'S MARKET OVERVIEW</div>
            <div style={{ fontSize:12, color:C.white, lineHeight:1.7 }}>{data.dayVerdict}</div>
          </div>
        </div>
      )}

      {/* ── Optimal Parlay ────────────────────────────────────────────────── */}
      {data?.parlay && <ParlayCard parlay={data.parlay} aiParlay={data.aiParlay} />}

      {/* ── Fixture picks ─────────────────────────────────────────────────── */}
      {fixtures.length>0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:10, color:C.muted, letterSpacing:'0.1em' }}>
              TODAY'S PICKS — {fixtures.filter(f=>!f.ai?.skip).length} MATCHES WITH VALUE
            </span>
            <button onClick={()=>setShowSkips(v=>!v)} style={{
              fontSize:9, background:'none', border:`1px solid ${C.border}`,
              color:C.textDD, padding:'3px 10px', borderRadius:1, cursor:'pointer',
            }}>
              {showSkips?'HIDE':'SHOW'} SKIPPED ({(data?.fixtures??[]).filter(f=>f.ai?.skip).length})
            </button>
          </div>
          {fixtures.map((fix,i)=>(
            <FixturePickCard key={fix.id} fix={fix} index={i} />
          ))}
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!data && !scanning && log.length===0 && (
        <div style={{
          textAlign:'center', padding:'60px 20px',
          color:C.textDD, fontSize:12,
          border:`1px dashed ${C.border}`, borderRadius:4,
        }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⚡</div>
          <div style={{ fontWeight:600, color:C.textD, marginBottom:8 }}>Ready when you are</div>
          <div style={{ fontSize:10 }}>
            Press the button above. The AI will analyse every fixture across<br/>
            EPL · La Liga · Bundesliga · Belgian Pro League · Championship · Ligue 1 · Serie A<br/>
            and give you the best bets for today — with full reasoning.
          </div>
        </div>
      )}
    </div>
  )
}

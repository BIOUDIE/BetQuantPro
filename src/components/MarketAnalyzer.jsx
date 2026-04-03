import { useState, useMemo, useEffect } from 'react'
import { C, fmt } from '../theme.js'
import Tag from './Tag.jsx'
import { analyzeFixture, seedOdds } from '../utils/marketEngine.js'
import { useLiveFixtures, fixtureToMarketData } from '../utils/useLiveFixtures.js'

const CAT_META = {
  RESULT:   { color: C.blue,   icon: '🏆', label: 'Match Result'   },
  GOALS:    { color: C.green,  icon: '⚽', label: 'Goals'          },
  CORNERS:  { color: C.amber,  icon: '🚩', label: 'Corners'        },
  CARDS:    { color: C.red,    icon: '🟨', label: 'Cards/Bookings' },
  SHOTS:    { color: '#A78BFA',icon: '🎯', label: 'Shots'          },
  OFFSIDES: { color: '#22D3EE',icon: '🚫', label: 'Offsides'       },
  FOULS:    { color: '#FB923C',icon: '🦵', label: 'Fouls'          },
  TIMING:   { color: '#F472B6',icon: '⏱',  label: 'Goal Timing'    },
  PENALTY:  { color: '#818CF8',icon: '🥅', label: 'Penalties'      },
}
const ALL_CATS = Object.keys(CAT_META)

// Demo fallback fixtures (used only when no live data)
const DEMO_FIXTURES = [
  { id:'f1',match:'Arsenal v Chelsea',league:'EPL',kickoff:'15:00',homeTeam:'Arsenal',awayTeam:'Chelsea',isDerby:false,matchImportance:'Title Race',referee:'Anthony Taylor',refStrictness:88,homeXG:1.82,awayXG:1.14,homeGoalsAvg:2.1,awayGoalsAvg:1.4,homeGoalsConcAvg:1.0,awayGoalsConcAvg:1.3,homeWinProb:0.50,drawProb:0.25,awayWinProb:0.25,homeCorners:6.2,awayCorners:4.8,homeAttacking:1.1,awayAttacking:0.9,homeYellow:1.8,awayYellow:2.4,homeRed:0.05,awayRed:0.08,homeFouls:10.2,awayFouls:12.8,homeShotsAvg:15.2,awayShotsAvg:11.8,homeShotsOnTgt:5.4,awayShotsOnTgt:4.2,homeOffsides:2.8,awayOffsides:1.9,homePressure:0.68,leagueAvgPens:0.28,leagueAvgCorners:10.1 },
  { id:'f2',match:'Real Madrid v Atletico',league:'La Liga',kickoff:'20:00',homeTeam:'Real Madrid',awayTeam:'Atletico',isDerby:true,matchImportance:'Derby',referee:'Mateu Lahoz',refStrictness:98,homeXG:1.96,awayXG:0.98,homeGoalsAvg:2.4,awayGoalsAvg:1.2,homeGoalsConcAvg:0.8,awayGoalsConcAvg:1.1,homeWinProb:0.55,drawProb:0.24,awayWinProb:0.21,homeCorners:7.1,awayCorners:4.2,homeAttacking:1.2,awayAttacking:0.85,homeYellow:2.1,awayYellow:3.2,homeRed:0.08,awayRed:0.12,homeFouls:11.4,awayFouls:15.6,homeShotsAvg:16.8,awayShotsAvg:10.2,homeShotsOnTgt:6.2,awayShotsOnTgt:3.8,homeOffsides:3.4,awayOffsides:1.8,homePressure:0.72,leagueAvgPens:0.32,leagueAvgCorners:10.8 },
  { id:'f3',match:'Bayern v Dortmund',league:'Bundesliga',kickoff:'17:30',homeTeam:'Bayern',awayTeam:'Dortmund',isDerby:true,matchImportance:'Derby',referee:'Felix Zwayer',refStrictness:72,homeXG:2.40,awayXG:1.20,homeGoalsAvg:2.8,awayGoalsAvg:1.8,homeGoalsConcAvg:0.9,awayGoalsConcAvg:1.5,homeWinProb:0.58,drawProb:0.22,awayWinProb:0.20,homeCorners:6.8,awayCorners:5.2,homeAttacking:1.3,awayAttacking:1.1,homeYellow:1.6,awayYellow:2.2,homeRed:0.06,awayRed:0.08,homeFouls:9.8,awayFouls:12.2,homeShotsAvg:18.2,awayShotsAvg:12.4,homeShotsOnTgt:7.2,awayShotsOnTgt:4.8,homeOffsides:3.2,awayOffsides:2.6,homePressure:0.75,leagueAvgPens:0.26,leagueAvgCorners:10.4 },
  { id:'f4',match:'Napoli v Inter',league:'Serie A',kickoff:'19:45',homeTeam:'Napoli',awayTeam:'Inter',isDerby:false,matchImportance:'Top 4 Clash',referee:'Maurizio Mariani',refStrictness:90,homeXG:1.60,awayXG:1.40,homeGoalsAvg:1.9,awayGoalsAvg:1.7,homeGoalsConcAvg:1.1,awayGoalsConcAvg:1.0,homeWinProb:0.42,drawProb:0.30,awayWinProb:0.28,homeCorners:5.6,awayCorners:5.4,homeAttacking:1.0,awayAttacking:1.0,homeYellow:2.4,awayYellow:2.0,homeRed:0.07,awayRed:0.06,homeFouls:13.2,awayFouls:11.8,homeShotsAvg:13.8,awayShotsAvg:13.2,homeShotsOnTgt:4.8,awayShotsOnTgt:5.0,homeOffsides:2.2,awayOffsides:2.8,homePressure:0.52,leagueAvgPens:0.30,leagueAvgCorners:10.6 },
]

function PickRow({ pick, rank }) {
  const isTop = rank < 3
  const cm = CAT_META[pick.cat] ?? { color:C.textD, icon:'•' }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:rank===0?C.green+'0D':rank===1?C.amber+'0A':C.bg2, border:`1px solid ${rank===0?C.green+'44':rank===1?C.amber+'33':C.border}`, borderRadius:2 }}>
      <div style={{ width:22, fontSize:10, color:isTop?C.white:C.muted, textAlign:'center', fontWeight:700, background:rank===0?C.amber:rank===1?C.green+'44':C.bg3, borderRadius:2, padding:'2px 0' }}>{rank+1}</div>
      <span style={{ fontSize:11 }}>{cm.icon}</span>
      <Tag color={cm.color}>{pick.cat}</Tag>
      <span style={{ flex:1, fontSize:11, color:C.white, fontWeight:isTop?700:400 }}>{pick.market}</span>
      <span style={{ fontSize:10, color:C.textD, minWidth:52 }}>p={((pick.prob??0)*100).toFixed(1)}%</span>
      <span style={{ fontSize:12, fontWeight:700, color:C.amberL, minWidth:38 }}>{pick.odds?.toFixed(2)??'—'}</span>
      <span style={{ fontSize:10, color:(pick.ev??0)>0?C.green:C.red, minWidth:60, textAlign:'right' }}>EV {pick.ev!=null?fmt(pick.ev,3):'—'}</span>
      <span style={{ fontSize:10, color:C.blue, minWidth:52, textAlign:'right' }}>{pick.kelly!=null?((pick.kelly)*100).toFixed(1)+'%':'—'}</span>
      <div style={{ minWidth:90 }}>
        <span style={{ fontSize:8, fontWeight:700, letterSpacing:'0.08em', padding:'2px 6px', borderRadius:1, background:pick.grade.color+'22', color:pick.grade.color, border:`1px solid ${pick.grade.color}44` }}>{pick.grade.label}</span>
      </div>
    </div>
  )
}

function FixtureCard({ fixRaw }) {
  const [open, setOpen]         = useState(false)
  const [activeCat, setActiveCat] = useState('ALL')
  const [viewMode, setViewMode]  = useState('value')

  const fix = useMemo(() => {
    const odds = seedOdds(fixRaw.homeXG+fixRaw.awayXG,fixRaw.homeCorners+fixRaw.awayCorners,fixRaw.homeYellow+fixRaw.awayYellow,fixRaw.homeWinProb,fixRaw.drawProb,fixRaw.awayWinProb)
    return {...fixRaw, odds}
  }, [fixRaw])

  const A = useMemo(() => analyzeFixture(fix), [fix])
  const {valuePicks, ranked, topPick, goals, corners, cards} = A

  const display = useMemo(() => {
    let p = viewMode==='value'?valuePicks:ranked
    if (activeCat!=='ALL') p=p.filter(x=>x.cat===activeCat)
    return p.slice(0, viewMode==='all'?50:25)
  }, [valuePicks, ranked, activeCat, viewMode])

  const catCounts = useMemo(() => {
    const c={}; valuePicks.forEach(p=>{c[p.cat]=(c[p.cat]||0)+1}); return c
  }, [valuePicks])

  return (
    <div style={{ background:C.bg1, border:`1px solid ${valuePicks.length>3?C.green+'44':C.border}`, borderLeft:`3px solid ${valuePicks.length>3?C.green:valuePicks.length>0?C.amber:C.border}`, borderRadius:2, marginBottom:10, overflow:'hidden' }}>
      <div onClick={()=>setOpen(o=>!o)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', background:C.bg2, cursor:'pointer' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, fontWeight:700, color:C.white }}>{fix.match}</span>
            <Tag color={C.blue}>{fix.league}</Tag>
            {fix.isDerby&&<Tag color={C.red}>DERBY</Tag>}
            <span style={{ fontSize:9, color:C.textD }}>{fix.kickoff}</span>
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <span style={{ fontSize:9, color:C.textDD }}>Ref: {fix.referee}</span>
            <span style={{ fontSize:9, color:C.textDD }}>· {fix.matchImportance}</span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', gap:3, flexWrap:'wrap', justifyContent:'flex-end', maxWidth:220 }}>
            {Object.entries(catCounts).map(([cat,n])=>(
              <span key={cat} style={{ fontSize:8, padding:'2px 6px', borderRadius:1, background:CAT_META[cat]?.color+'22', color:CAT_META[cat]?.color, border:`1px solid ${CAT_META[cat]?.color}44` }}>{CAT_META[cat]?.icon} {n}</span>
            ))}
          </div>
          <div style={{ background:C.green+'18', border:`1px solid ${C.green}44`, borderRadius:2, padding:'4px 10px', textAlign:'center' }}>
            <div style={{ fontSize:8, color:C.muted }}>VALUE BETS</div>
            <div style={{ fontSize:16, fontWeight:700, color:C.green }}>{valuePicks.length}</div>
          </div>
          <span style={{ fontSize:14, color:C.textD }}>{open?'▲':'▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding:14, display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
            {[
              {l:'EXP GOALS', v:`${goals.expHome}–${goals.expAway}`, c:C.green},
              {l:'BTTS %',    v:`${(goals.pBTTS*100).toFixed(0)}%`,  c:C.green},
              {l:'O2.5 %',    v:`${(goals.pOver25*100).toFixed(0)}%`,c:C.amberL},
              {l:'EXP CORS',  v:corners.expTotal,                     c:C.amber},
              {l:'EXP CARDS', v:cards.expYellows,                     c:C.red},
              {l:'BOOK PTS',  v:cards.expBookPts,                     c:C.amberL},
            ].map(({l,v,c})=>(
              <div key={l} style={{ background:C.bg0, border:`1px solid ${C.border}`, borderRadius:2, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:8, color:C.muted, marginBottom:3 }}>{l}</div>
                <div style={{ fontSize:15, fontWeight:700, color:c }}>{v}</div>
              </div>
            ))}
          </div>

          {topPick && (
            <div style={{ background:C.bg0, border:`1px solid ${C.green}55`, borderTop:`2px solid ${C.green}`, borderRadius:2, padding:12 }}>
              <div style={{ fontSize:9, color:C.green, letterSpacing:'0.1em', marginBottom:6 }}>⭐ TOP PICK</div>
              <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <span style={{ fontSize:14, fontWeight:700, color:C.white }}>{topPick.market}</span>
                <Tag color={CAT_META[topPick.cat]?.color??C.blue}>{topPick.cat}</Tag>
                <span style={{ fontSize:12, color:C.amberL }}>@ {topPick.odds?.toFixed(2)}</span>
                <span style={{ fontSize:11, color:C.green }}>EV {fmt(topPick.ev,3)}</span>
                <span style={{ fontSize:11, color:C.blue }}>Kelly {((topPick.kelly??0)*100).toFixed(1)}%</span>
                <div style={{ marginLeft:'auto' }}>
                  <span style={{ fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:1, background:topPick.grade.color+'22', color:topPick.grade.color, border:`1px solid ${topPick.grade.color}44`, letterSpacing:'0.08em' }}>{topPick.grade.label}</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }}>
            <button onClick={()=>setActiveCat('ALL')} style={{ fontSize:8, background:activeCat==='ALL'?C.white+'22':'none', border:`1px solid ${activeCat==='ALL'?C.white:C.border}`, color:activeCat==='ALL'?C.white:C.textDD, padding:'3px 8px', borderRadius:1, cursor:'pointer' }}>ALL</button>
            {ALL_CATS.map(cat=>{
              const cm=CAT_META[cat]; const count=(viewMode==='value'?valuePicks:ranked).filter(p=>p.cat===cat).length
              return <button key={cat} onClick={()=>setActiveCat(cat)} style={{ fontSize:8, background:activeCat===cat?cm.color+'22':'none', border:`1px solid ${activeCat===cat?cm.color:C.border}`, color:activeCat===cat?cm.color:C.textDD, padding:'3px 8px', borderRadius:1, cursor:'pointer' }}>{cm.icon} {cat} ({count})</button>
            })}
            <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
              {[['value','VALUE ONLY'],['all','ALL MARKETS']].map(([k,l])=>(
                <button key={k} onClick={()=>setViewMode(k)} style={{ fontSize:8, background:viewMode===k?C.amber+'22':'none', border:`1px solid ${viewMode===k?C.amber:C.border}`, color:viewMode===k?C.amber:C.textDD, padding:'3px 8px', borderRadius:1, cursor:'pointer' }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {display.map((p,i)=><PickRow key={`${p.cat}-${p.market}`} pick={p} rank={i}/>)}
            {display.length===0&&<div style={{ textAlign:'center', padding:24, color:C.textDD, fontSize:11 }}>No {viewMode==='value'?'value picks':'markets'} in this category</div>}
          </div>
        </div>
      )}
    </div>
  )
}

const LEAGUE_FILTER=['All','EPL','La Liga','Bundesliga','Serie A','Belgian Pro League','Championship','Ligue 1']

export default function MarketAnalyzer() {
  const [tab, setTab]           = useState('fixtures')
  const [leagueFlt, setLeagueFlt] = useState('All')

  const { fixtures: liveFixtures, loading, error, meta, fetchFixtures } = useLiveFixtures()

  // Convert live fixtures to market format, or fall back to demo
  const allFixtures = useMemo(() => {
    if (liveFixtures && liveFixtures.length > 0) {
      return liveFixtures.map(f => fixtureToMarketData(f))
    }
    return DEMO_FIXTURES
  }, [liveFixtures])

  const isLive = liveFixtures && liveFixtures.length > 0

  // Analyse all fixtures
  const allAnalysis = useMemo(() =>
    allFixtures.map(f => {
      const odds = seedOdds(
        (f.homeXG||1.4)+(f.awayXG||1.1),
        (f.homeCorners||5.2)+(f.awayCorners||4.8),
        (f.homeYellow||1.8)+(f.awayYellow||1.8),
        f.homeWinProb||0.42, f.drawProb||0.28, f.awayWinProb||0.30
      )
      return { fix:{...f,odds}, analysis:analyzeFixture({...f,odds}) }
    }), [allFixtures])

  const filtered = allAnalysis.filter(a => leagueFlt==='All' || a.fix.league===leagueFlt)
  const totalValue = allAnalysis.reduce((s,a)=>s+a.analysis.valuePicks.length,0)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Header */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
        {[
          {label:'FIXTURES',         val:allFixtures.length,  color:C.white},
          {label:'TOTAL VALUE BETS', val:totalValue,           color:C.green},
          {label:'MARKETS TRACKED',  val:'55+',                color:C.amberL},
          {label:'DATA SOURCE',      val:isLive?'LIVE API':'DEMO', color:isLive?C.green:C.amber},
        ].map(({label,val,color})=>(
          <div key={label} style={{ background:C.bg1, border:`1px solid ${C.border}`, borderRadius:2, padding:'12px 14px' }}>
            <div style={{ fontSize:8, color:C.muted, letterSpacing:'0.1em', marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:700, color, lineHeight:1 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Load live data banner */}
      {!isLive && (
        <div style={{ background:C.amber+'0D', border:`1px solid ${C.amber}33`, borderRadius:2, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div>
            <div style={{ fontSize:11, color:C.amber, fontWeight:700, marginBottom:3 }}>
              {loading ? '⟳ Loading live fixtures...' : '📊 Showing demo data'}
            </div>
            <div style={{ fontSize:9, color:C.textD }}>
              {loading ? 'Fetching from API-Football...' : 'Go to PICKS tab and press ⚡ GET TODAY\'S PICKS first, then return here for live market analysis.'}
            </div>
          </div>
          {!loading && (
            <button onClick={()=>fetchFixtures('today')} style={{
              background:C.amber, border:'none', borderRadius:2, color:C.bg0,
              fontSize:10, fontWeight:700, padding:'8px 16px', cursor:'pointer', whiteSpace:'nowrap',
            }}>LOAD LIVE DATA</button>
          )}
        </div>
      )}

      {isLive && meta && (
        <div style={{ background:C.green+'0D', border:`1px solid ${C.green}33`, borderRadius:2, padding:'8px 14px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:11 }}>✓</span>
          <span style={{ fontSize:10, color:C.green }}>Live data loaded — {meta.total} fixtures for {meta.dateLabel ?? meta.date}</span>
          <button onClick={()=>fetchFixtures('today')} style={{ marginLeft:'auto', background:'none', border:`1px solid ${C.green}44`, borderRadius:1, color:C.green, fontSize:9, padding:'3px 10px', cursor:'pointer' }}>REFRESH</button>
        </div>
      )}

      {/* Main */}
      <div style={{ background:C.bg1, border:`1px solid ${C.border}`, borderTop:`2px solid ${C.green}`, borderRadius:2, overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'stretch', borderBottom:`1px solid ${C.border}`, background:C.bg2, flexWrap:'wrap' }}>
          {[['fixtures','📋 ALL FIXTURES']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={{ background:'none', border:'none', borderBottom:`2px solid ${tab===k?C.green:'transparent'}`, color:tab===k?C.green:C.muted, fontSize:9, fontWeight:600, letterSpacing:'0.1em', padding:'10px 16px', cursor:'pointer' }}>{l}</button>
          ))}
          <div style={{ flex:1 }}/>
          <div style={{ display:'flex', gap:4, alignItems:'center', padding:'0 10px', flexWrap:'wrap' }}>
            {LEAGUE_FILTER.map(l=>(
              <button key={l} onClick={()=>setLeagueFlt(l)} style={{ fontSize:7, background:leagueFlt===l?C.blue+'22':'none', border:`1px solid ${leagueFlt===l?C.blue:C.border}`, color:leagueFlt===l?C.blue:C.textDD, padding:'2px 6px', borderRadius:1, cursor:'pointer' }}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ padding:14 }}>
          {filtered.map(({fix})=><FixtureCard key={fix.id} fixRaw={fix}/>)}
          {filtered.length===0&&<div style={{ textAlign:'center', padding:32, color:C.textDD, fontSize:11 }}>No fixtures match current filter</div>}
        </div>
      </div>
    </div>
  )
}

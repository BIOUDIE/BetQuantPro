import { useState, useMemo } from 'react'
import { C, fmt } from '../theme.js'
import Tag from './Tag.jsx'
import { analyzeFixture, seedOdds } from '../utils/marketEngine.js'

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

const FIXTURES_RAW = [
  { id:'f1',match:'Arsenal v Chelsea',league:'EPL',kickoff:'15:00',homeTeam:'Arsenal',awayTeam:'Chelsea',isDerby:false,matchImportance:'Title Race',referee:'Anthony Taylor',refStrictness:88,homeXG:1.82,awayXG:1.14,homeGoalsAvg:2.1,awayGoalsAvg:1.4,homeGoalsConcAvg:1.0,awayGoalsConcAvg:1.3,homeWinProb:0.50,drawProb:0.25,awayWinProb:0.25,homeCorners:6.2,awayCorners:4.8,homeAttacking:1.1,awayAttacking:0.9,homeYellow:1.8,awayYellow:2.4,homeRed:0.05,awayRed:0.08,homeFouls:10.2,awayFouls:12.8,homeShotsAvg:15.2,awayShotsAvg:11.8,homeShotsOnTgt:5.4,awayShotsOnTgt:4.2,homeOffsides:2.8,awayOffsides:1.9,homePressure:0.68,leagueAvgPens:0.28,leagueAvgCorners:10.1 },
  { id:'f2',match:'Real Madrid v Atletico',league:'La Liga',kickoff:'20:00',homeTeam:'Real Madrid',awayTeam:'Atletico',isDerby:true,matchImportance:'Derby',referee:'Mateu Lahoz',refStrictness:98,homeXG:1.96,awayXG:0.98,homeGoalsAvg:2.4,awayGoalsAvg:1.2,homeGoalsConcAvg:0.8,awayGoalsConcAvg:1.1,homeWinProb:0.55,drawProb:0.24,awayWinProb:0.21,homeCorners:7.1,awayCorners:4.2,homeAttacking:1.2,awayAttacking:0.85,homeYellow:2.1,awayYellow:3.2,homeRed:0.08,awayRed:0.12,homeFouls:11.4,awayFouls:15.6,homeShotsAvg:16.8,awayShotsAvg:10.2,homeShotsOnTgt:6.2,awayShotsOnTgt:3.8,homeOffsides:3.4,awayOffsides:1.8,homePressure:0.72,leagueAvgPens:0.32,leagueAvgCorners:10.8 },
  { id:'f3',match:'Bayern v Dortmund',league:'Bundesliga',kickoff:'17:30',homeTeam:'Bayern',awayTeam:'Dortmund',isDerby:true,matchImportance:'Derby',referee:'Felix Zwayer',refStrictness:72,homeXG:2.40,awayXG:1.20,homeGoalsAvg:2.8,awayGoalsAvg:1.8,homeGoalsConcAvg:0.9,awayGoalsConcAvg:1.5,homeWinProb:0.58,drawProb:0.22,awayWinProb:0.20,homeCorners:6.8,awayCorners:5.2,homeAttacking:1.3,awayAttacking:1.1,homeYellow:1.6,awayYellow:2.2,homeRed:0.06,awayRed:0.08,homeFouls:9.8,awayFouls:12.2,homeShotsAvg:18.2,awayShotsAvg:12.4,homeShotsOnTgt:7.2,awayShotsOnTgt:4.8,homeOffsides:3.2,awayOffsides:2.6,homePressure:0.75,leagueAvgPens:0.26,leagueAvgCorners:10.4 },
  { id:'f4',match:'Napoli v Inter',league:'Serie A',kickoff:'19:45',homeTeam:'Napoli',awayTeam:'Inter',isDerby:false,matchImportance:'Top 4 Clash',referee:'Maurizio Mariani',refStrictness:90,homeXG:1.60,awayXG:1.40,homeGoalsAvg:1.9,awayGoalsAvg:1.7,homeGoalsConcAvg:1.1,awayGoalsConcAvg:1.0,homeWinProb:0.42,drawProb:0.30,awayWinProb:0.28,homeCorners:5.6,awayCorners:5.4,homeAttacking:1.0,awayAttacking:1.0,homeYellow:2.4,awayYellow:2.0,homeRed:0.07,awayRed:0.06,homeFouls:13.2,awayFouls:11.8,homeShotsAvg:13.8,awayShotsAvg:13.2,homeShotsOnTgt:4.8,awayShotsOnTgt:5.0,homeOffsides:2.2,awayOffsides:2.8,homePressure:0.52,leagueAvgPens:0.30,leagueAvgCorners:10.6 },
  { id:'f5',match:'PSG v Lyon',league:'Ligue 1',kickoff:'20:00',homeTeam:'PSG',awayTeam:'Lyon',isDerby:false,matchImportance:'Regular',referee:'Clement Turpin',refStrictness:68,homeXG:2.10,awayXG:0.90,homeGoalsAvg:2.5,awayGoalsAvg:1.2,homeGoalsConcAvg:0.7,awayGoalsConcAvg:1.4,homeWinProb:0.62,drawProb:0.22,awayWinProb:0.16,homeCorners:7.4,awayCorners:3.8,homeAttacking:1.25,awayAttacking:0.75,homeYellow:1.9,awayYellow:2.1,homeRed:0.04,awayRed:0.07,homeFouls:10.6,awayFouls:11.4,homeShotsAvg:17.4,awayShotsAvg:9.6,homeShotsOnTgt:6.4,awayShotsOnTgt:3.4,homeOffsides:3.8,awayOffsides:1.6,homePressure:0.78,leagueAvgPens:0.24,leagueAvgCorners:10.0 },
  { id:'f6',match:'Club Brugge v Anderlecht',league:'Belgian Pro League',kickoff:'18:00',homeTeam:'Club Brugge',awayTeam:'Anderlecht',isDerby:true,matchImportance:'Derby',referee:'Lawrence Visser',refStrictness:74,homeXG:1.50,awayXG:1.30,homeGoalsAvg:1.8,awayGoalsAvg:1.6,homeGoalsConcAvg:1.2,awayGoalsConcAvg:1.3,homeWinProb:0.46,drawProb:0.28,awayWinProb:0.26,homeCorners:5.8,awayCorners:5.2,homeAttacking:0.95,awayAttacking:0.95,homeYellow:2.2,awayYellow:2.6,homeRed:0.06,awayRed:0.08,homeFouls:12.4,awayFouls:13.8,homeShotsAvg:12.6,awayShotsAvg:11.8,homeShotsOnTgt:4.4,awayShotsOnTgt:4.6,homeOffsides:2.0,awayOffsides:2.2,homePressure:0.50,leagueAvgPens:0.26,leagueAvgCorners:10.3 },
  { id:'f7',match:'Leeds v Sunderland',league:'Championship',kickoff:'15:00',homeTeam:'Leeds',awayTeam:'Sunderland',isDerby:false,matchImportance:'Promotion Push',referee:'Tim Robinson',refStrictness:66,homeXG:1.70,awayXG:1.10,homeGoalsAvg:1.9,awayGoalsAvg:1.3,homeGoalsConcAvg:1.1,awayGoalsConcAvg:1.4,homeWinProb:0.48,drawProb:0.28,awayWinProb:0.24,homeCorners:5.4,awayCorners:4.6,homeAttacking:1.0,awayAttacking:0.85,homeYellow:2.3,awayYellow:2.0,homeRed:0.05,awayRed:0.05,homeFouls:13.6,awayFouls:12.4,homeShotsAvg:13.0,awayShotsAvg:10.8,homeShotsOnTgt:4.6,awayShotsOnTgt:3.8,homeOffsides:2.2,awayOffsides:1.8,homePressure:0.55,leagueAvgPens:0.22,leagueAvgCorners:9.8 },
  { id:'f8',match:'Man City v Liverpool',league:'EPL',kickoff:'16:30',homeTeam:'Man City',awayTeam:'Liverpool',isDerby:false,matchImportance:'Title Decider',referee:'Michael Oliver',refStrictness:78,homeXG:1.88,awayXG:1.62,homeGoalsAvg:2.3,awayGoalsAvg:2.1,homeGoalsConcAvg:0.9,awayGoalsConcAvg:1.0,homeWinProb:0.44,drawProb:0.26,awayWinProb:0.30,homeCorners:6.4,awayCorners:6.2,homeAttacking:1.15,awayAttacking:1.1,homeYellow:1.6,awayYellow:1.8,homeRed:0.04,awayRed:0.04,homeFouls:10.0,awayFouls:10.8,homeShotsAvg:16.2,awayShotsAvg:15.4,homeShotsOnTgt:5.8,awayShotsOnTgt:5.6,homeOffsides:2.6,awayOffsides:2.8,homePressure:0.60,leagueAvgPens:0.28,leagueAvgCorners:10.1 },
]

const pBar = (prob, color) => (
  <div style={{ height:4, background:C.bg3, borderRadius:1, overflow:'hidden', marginTop:3 }}>
    <div style={{ width:`${Math.min(prob*100,100)}%`, height:'100%', background:color, borderRadius:1, transition:'width 0.4s ease' }} />
  </div>
)

function PickRow({ pick, rank }) {
  const isTop = rank < 3
  const cm = CAT_META[pick.cat] ?? { color:C.textD, icon:'•' }
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
      background: rank===0?C.green+'0D':rank===1?C.amber+'0A':C.bg2,
      border:`1px solid ${rank===0?C.green+'44':rank===1?C.amber+'33':C.border}`,
      borderRadius:2,
    }}>
      <div style={{ width:22, fontSize:10, color:isTop?C.white:C.muted, textAlign:'center', fontWeight:700, background:rank===0?C.amber:rank===1?C.green+'44':C.bg3, borderRadius:2, padding:'2px 0' }}>{rank+1}</div>
      <span style={{ fontSize:11 }}>{cm.icon}</span>
      <Tag color={cm.color}>{pick.cat}</Tag>
      <span style={{ flex:1, fontSize:11, color:C.white, fontWeight:isTop?700:400 }}>{pick.market}</span>
      <span style={{ fontSize:10, color:C.textD, minWidth:52 }}>p={(( pick.prob??0)*100).toFixed(1)}%</span>
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
  const [open,     setOpen]     = useState(false)
  const [activeCat,setActiveCat]= useState('ALL')
  const [viewMode, setViewMode] = useState('value')

  const fix = useMemo(()=>{
    const odds = seedOdds(fixRaw.homeXG+fixRaw.awayXG,fixRaw.homeCorners+fixRaw.awayCorners,fixRaw.homeYellow+fixRaw.awayYellow,fixRaw.homeWinProb,fixRaw.drawProb,fixRaw.awayWinProb)
    return {...fixRaw,odds}
  },[fixRaw])

  const A = useMemo(()=>analyzeFixture(fix),[fix])
  const {valuePicks,ranked,topPick,goals,corners,cards} = A

  const display = useMemo(()=>{
    let p = viewMode==='value'?valuePicks:ranked
    if(activeCat!=='ALL') p=p.filter(x=>x.cat===activeCat)
    return p.slice(0,viewMode==='all'?50:25)
  },[valuePicks,ranked,activeCat,viewMode])

  const catCounts = useMemo(()=>{
    const c={}; valuePicks.forEach(p=>{c[p.cat]=(c[p.cat]||0)+1}); return c
  },[valuePicks])

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

      {open&&(
        <div style={{ padding:14, display:'flex', flexDirection:'column', gap:12 }}>
          {/* Quick stats */}
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

          {/* Top pick */}
          {topPick&&(
            <div style={{ background:C.bg0, border:`1px solid ${C.green}55`, borderTop:`2px solid ${C.green}`, borderRadius:2, padding:12 }}>
              <div style={{ fontSize:9, color:C.green, letterSpacing:'0.1em', marginBottom:6 }}>⭐ TOP PICK — {fix.match}</div>
              <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <span style={{ fontSize:14, fontWeight:700, color:C.white }}>{topPick.market}</span>
                <Tag color={CAT_META[topPick.cat]?.color??C.blue}>{topPick.cat}</Tag>
                <span style={{ fontSize:12, color:C.amberL }}>@ {topPick.odds?.toFixed(2)}</span>
                <span style={{ fontSize:11, color:C.green }}>EV {fmt(topPick.ev,3)}</span>
                <span style={{ fontSize:11, color:C.blue }}>Kelly {((topPick.kelly??0)*100).toFixed(1)}%</span>
                <span style={{ fontSize:10, color:C.textD }}>Model {((topPick.prob??0)*100).toFixed(1)}% vs Implied {((topPick.impl??0)*100).toFixed(1)}%</span>
                <div style={{ marginLeft:'auto' }}>
                  <span style={{ fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:1, background:topPick.grade.color+'22', color:topPick.grade.color, border:`1px solid ${topPick.grade.color}44`, letterSpacing:'0.08em' }}>{topPick.grade.label}</span>
                </div>
              </div>
            </div>
          )}

          {/* Category + view filters */}
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

          {/* Column headers */}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 12px', background:C.bg0, border:`1px solid ${C.border}`, borderRadius:2 }}>
            <span style={{ width:22 }} /><span style={{ width:20 }} /><span style={{ width:64 }} />
            <span style={{ flex:1, fontSize:8, color:C.muted, letterSpacing:'0.1em' }}>MARKET</span>
            <span style={{ fontSize:8, color:C.muted, minWidth:52 }}>PROB</span>
            <span style={{ fontSize:8, color:C.muted, minWidth:38 }}>ODDS</span>
            <span style={{ fontSize:8, color:C.muted, minWidth:60, textAlign:'right' }}>EV</span>
            <span style={{ fontSize:8, color:C.muted, minWidth:52, textAlign:'right' }}>KELLY</span>
            <span style={{ fontSize:8, color:C.muted, minWidth:90 }}>GRADE</span>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {display.map((p,i)=><PickRow key={`${p.cat}-${p.market}`} pick={p} rank={i}/>)}
            {display.length===0&&<div style={{ textAlign:'center', padding:24, color:C.textDD, fontSize:11 }}>No {viewMode==='value'?'value picks':'markets'} in this category</div>}
          </div>

          {/* Heatmap */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, padding:12, background:C.bg0, border:`1px solid ${C.border}`, borderRadius:2 }}>
            <div style={{ gridColumn:'1/-1', fontSize:9, color:C.muted, letterSpacing:'0.1em', marginBottom:4 }}>VALUE PICKS BY CATEGORY</div>
            {ALL_CATS.map(cat=>{
              const cm=CAT_META[cat]; const n=valuePicks.filter(p=>p.cat===cat).length; const topEV=n>0?Math.max(...valuePicks.filter(p=>p.cat===cat).map(p=>p.ev??0)):0
              return (
                <div key={cat} style={{ background:n>0?cm.color+'18':C.bg2, border:`1px solid ${n>0?cm.color+'44':C.border}`, borderRadius:2, padding:'8px 10px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:10, color:n>0?cm.color:C.textDD }}>{cm.icon} {cm.label}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:n>0?C.white:C.textDD }}>{n}</span>
                  </div>
                  {n>0&&<div style={{ fontSize:9, color:C.green }}>Top EV: {fmt(topEV,3)}</div>}
                  <div style={{ height:3, background:C.bg3, borderRadius:1, overflow:'hidden', marginTop:4 }}>
                    <div style={{ width:`${Math.min(n/3*100,100)}%`, height:'100%', background:cm.color, borderRadius:1 }}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function MatchdaySummary({ allAnalysis }) {
  const allValuePicks = allAnalysis.flatMap(a=>a.analysis.valuePicks.map(p=>({...p,match:a.fix.match,league:a.fix.league})))
  const byCat={}; ALL_CATS.forEach(c=>{byCat[c]=allValuePicks.filter(p=>p.cat===c)})
  const top10=[...allValuePicks].sort((a,b)=>(b.ev??0)-(a.ev??0)).slice(0,10)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
        {ALL_CATS.map(cat=>{
          const cm=CAT_META[cat]; const picks=byCat[cat]; const topEV=picks.length>0?Math.max(...picks.map(p=>p.ev??0)):0
          return (
            <div key={cat} style={{ background:C.bg1, border:`1px solid ${picks.length>0?cm.color+'44':C.border}`, borderTop:`2px solid ${picks.length>0?cm.color:C.border}`, borderRadius:2, padding:'12px 14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:14 }}>{cm.icon}</span><Tag color={cm.color}>{cm.label}</Tag>
              </div>
              <div style={{ fontSize:28, fontWeight:700, color:picks.length>0?C.white:C.textDD, lineHeight:1, marginBottom:4 }}>{picks.length}</div>
              <div style={{ fontSize:9, color:C.muted, marginBottom:6 }}>value picks today</div>
              {picks.length>0&&<div style={{ fontSize:10, color:C.green }}>Best EV: {fmt(topEV,3)}</div>}
            </div>
          )
        })}
      </div>

      <div style={{ background:C.bg1, border:`1px solid ${C.border}`, borderTop:`2px solid ${C.amber}`, borderRadius:2 }}>
        <div style={{ padding:'10px 14px', background:C.bg2, borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:10, fontWeight:600, color:C.textD, letterSpacing:'0.12em' }}>⭐ TOP 10 VALUE BETS ACROSS ALL MARKETS TODAY</span>
        </div>
        <div style={{ padding:14, display:'flex', flexDirection:'column', gap:5 }}>
          {top10.map((pick,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:i<3?C.green+'0D':C.bg2, border:`1px solid ${i<3?C.green+'33':C.border}`, borderRadius:2 }}>
              <div style={{ width:24, height:24, borderRadius:2, background:i===0?C.amber:i<3?C.green+'33':C.bg3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:i===0?C.bg0:C.textD, flexShrink:0 }}>{i+1}</div>
              <span style={{ fontSize:11 }}>{CAT_META[pick.cat]?.icon}</span>
              <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0 }}>
                <span style={{ fontSize:11, color:C.white, fontWeight:i<3?700:400 }}>{pick.market}</span>
                <span style={{ fontSize:9, color:C.textDD }}>{pick.match} · {pick.league}</span>
              </div>
              <Tag color={CAT_META[pick.cat]?.color??C.blue}>{pick.cat}</Tag>
              <span style={{ fontSize:12, fontWeight:700, color:C.amberL }}>{pick.odds?.toFixed(2)}</span>
              <span style={{ fontSize:10, color:C.green }}>{fmt(pick.ev,3)}</span>
              <span style={{ fontSize:10, color:C.blue }}>{((pick.kelly??0)*100).toFixed(1)}%</span>
              <span style={{ fontSize:8, fontWeight:700, padding:'2px 6px', borderRadius:1, background:pick.grade.color+'22', color:pick.grade.color, border:`1px solid ${pick.grade.color}44`, letterSpacing:'0.08em' }}>{pick.grade.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background:C.bg1, border:`1px solid ${C.border}`, borderRadius:2, padding:14 }}>
        <div style={{ fontSize:9, color:C.muted, letterSpacing:'0.1em', marginBottom:10 }}>COMPLETE MARKET COVERAGE — 55+ MARKETS ACROSS 9 CATEGORIES</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          {[
            {cat:'RESULT',  markets:['1X2','Double Chance','Draw No Bet','HT Result','Win to Nil','Asian Handicap','BTTS & Win']},
            {cat:'GOALS',   markets:['Over/Under 0.5 to 4.5','BTTS Yes/No','HT Goals Over/Under','Exact Goals Range','First/Last Goalscorer']},
            {cat:'CORNERS', markets:['Over/Under 8.5 to 12.5','HT Corners Over/Under','Team More Corners','Corner Handicap','First Corner']},
            {cat:'CARDS',   markets:['Over/Under 2.5 to 5.5 Cards','Red Card Yes/No','Both Teams Carded','Booking Points 25/35/50','First Card']},
            {cat:'SHOTS',   markets:['Total Shots 22.5/24.5','Shots on Target 7.5/8.5','Team Shots Over/Under','Player Shots Prop']},
            {cat:'OFFSIDES',markets:['Over/Under 3.5 to 5.5 Offsides','Team Offsides Over/Under','First Offside']},
            {cat:'FOULS',   markets:['Over/Under 20.5 to 24.5 Fouls','Team Fouls Over/Under','Foul Handicap']},
            {cat:'TIMING',  markets:["Goal Before/After 15'","First Half Goal","Late Goal 75-90'","Score at 60'","Brace or Hat-trick"]},
            {cat:'PENALTY', markets:['Penalty Awarded Yes/No','Penalty Scored','Team to Score Penalty','2+ Penalties Taken']},
          ].map(({cat,markets})=>{
            const cm=CAT_META[cat]
            return (
              <div key={cat} style={{ background:C.bg0, border:`1px solid ${cm.color}33`, borderRadius:2, padding:'10px 12px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <span style={{ fontSize:12 }}>{cm.icon}</span>
                  <span style={{ fontSize:9, fontWeight:700, color:cm.color, letterSpacing:'0.08em' }}>{cm.label.toUpperCase()}</span>
                </div>
                {markets.map(m=><div key={m} style={{ fontSize:9, color:C.textD, lineHeight:1.8 }}>→ {m}</div>)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const LEAGUE_FILTER=['All','EPL','La Liga','Bundesliga','Serie A','Belgian Pro League','Championship','Ligue 1']

export default function MarketAnalyzer() {
  const [tab,       setTab]      = useState('summary')
  const [leagueFlt, setLeagueFlt]= useState('All')

  const allAnalysis = useMemo(()=>
    FIXTURES_RAW.map(f=>{
      const odds=seedOdds(f.homeXG+f.awayXG,f.homeCorners+f.awayCorners,f.homeYellow+f.awayYellow,f.homeWinProb,f.drawProb,f.awayWinProb)
      return {fix:{...f,odds},analysis:analyzeFixture({...f,odds})}
    }),[])

  const filtered=allAnalysis.filter(a=>leagueFlt==='All'||a.fix.league===leagueFlt)
  const totalValue=allAnalysis.reduce((s,a)=>s+a.analysis.valuePicks.length,0)
  const topFix=[...allAnalysis].sort((a,b)=>b.analysis.valuePicks.length-a.analysis.valuePicks.length)[0]

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
        {[
          {label:'FIXTURES',        val:FIXTURES_RAW.length,  color:C.white},
          {label:'TOTAL VALUE BETS',val:totalValue,            color:C.green},
          {label:'MARKETS TRACKED', val:'55+',                 color:C.amberL},
          {label:'BEST FIXTURE',    val:topFix?.fix.homeTeam,  color:C.amber},
        ].map(({label,val,color})=>(
          <div key={label} style={{ background:C.bg1, border:`1px solid ${C.border}`, borderRadius:2, padding:'12px 14px' }}>
            <div style={{ fontSize:8, color:C.muted, letterSpacing:'0.1em', marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:700, color, lineHeight:1 }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ background:C.bg1, border:`1px solid ${C.border}`, borderTop:`2px solid ${C.green}`, borderRadius:2, overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'stretch', borderBottom:`1px solid ${C.border}`, background:C.bg2, flexWrap:'wrap' }}>
          {[['summary','📊 MATCHDAY SUMMARY'],['fixtures','📋 ALL FIXTURES']].map(([k,l])=>(
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
          {tab==='summary'&&<MatchdaySummary allAnalysis={filtered}/>}
          {tab==='fixtures'&&<div>{filtered.map(({fix})=><FixtureCard key={fix.id} fixRaw={fix}/>)}</div>}
        </div>
      </div>
    </div>
  )
}

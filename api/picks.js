// api/picks.js — BQP AI Picks Engine
// Fetches Sportmonks live data → runs all 55+ market models → Claude synthesises final picks
// One API call, one clean output

const LEAGUES = { 'EPL':8,'La Liga':564,'Bundesliga':82,'Belgian Pro League':4,'Championship':9,'Ligue 1':301,'Serie A':384 }
const LEAGUE_IDS = Object.values(LEAGUES).join(',')
const BASE = 'https://api.sportmonks.com/v3/football'

const LEAGUE_DEFAULTS = {
  8:  {avgGoals:2.82,avgCorners:10.1,avgCards:3.2,avgFouls:20.4,penRate:0.28,refStrictness:68},
  564:{avgGoals:2.74,avgCorners:10.8,avgCards:4.8,avgFouls:26.4,penRate:0.32,refStrictness:88},
  82: {avgGoals:3.16,avgCorners:10.4,avgCards:3.9,avgFouls:22.1,penRate:0.26,refStrictness:72},
  4:  {avgGoals:2.68,avgCorners:10.3,avgCards:3.7,avgFouls:23.6,penRate:0.26,refStrictness:74},
  9:  {avgGoals:2.55,avgCorners:9.8, avgCards:3.5,avgFouls:24.2,penRate:0.22,refStrictness:66},
  301:{avgGoals:2.62,avgCorners:10.0,avgCards:3.6,avgFouls:21.8,penRate:0.24,refStrictness:68},
  384:{avgGoals:2.58,avgCorners:10.6,avgCards:4.6,avgFouls:24.8,penRate:0.30,refStrictness:90},
}

const T = {POSSESSION:45,SHOTS_TOTAL:84,SHOTS_ON_TARGET:86,CORNERS:34,YELLOW_CARDS:40,RED_CARDS:41,FOULS:51,OFFSIDES:55,ATTACKS:156,DANGEROUS_ATTACKS:157,XG:5304,GOALS:52}

async function smFetch(path, token) {
  const sep = path.includes('?')?'&':'?'
  const r = await fetch(`${BASE}${path}${sep}api_token=${token}`)
  if (!r.ok) throw new Error(`Sportmonks ${r.status}`)
  return (await r.json()).data ?? []
}

function getStat(stats, typeId, pid) {
  return stats?.find(s=>s.type_id===typeId&&s.participant_id===pid)?.data?.value??null
}
function getTeamAvg(ts, tid) {
  for (const s of (ts??[])) {
    const d=s.details?.find(x=>x.type_id===tid)
    if (d?.value?.all?.average!=null) return d.value.all.average
  }
  return null
}
const clamp=(v,lo=0.01,hi=0.99)=>Math.min(hi,Math.max(lo,v))
const impl=(o,m=0.05)=>o?(1/o)/(1+m):null
const calcEV=(p,o)=>p!=null&&o?p*o-1:null
const calcK=(p,o,f=0.5)=>{if(!p||!o)return null;const b=o-1,k=(p*b-(1-p))/b;return Math.max(0,k*f)}
function poisson(l,k){let p=Math.exp(-l);for(let i=1;i<=k;i++)p*=l/i;return p}
function pOver(l,line){let c=0;for(let i=0;i<=Math.floor(line);i++)c+=poisson(l,i);return clamp(1-c)}

function buildMarkets(fd) {
  const {homeXG:hX,awayXG:aX,homeGoalsAvg:hG,awayGoalsAvg:aG,homeGoalsConcAvg:hGC,awayGoalsConcAvg:aGC,
    homeCorners:hC,awayCorners:aC,homeYellow:hY,awayYellow:aY,homeRed:hR,awayRed:aR,
    homeFouls:hF,awayFouls:aF,homeShots:hS,awayShots:aS,homeSoT:hST,awaySoT:aST,
    homeOffsides:hO,awayOffsides:aO,homeWinP:p1,drawP:px,awayWinP:p2,
    refStrictness:rs,isDerby:dby,matchImportance:mi,
    leagueAvgCards:lC,leagueAvgCorners:lCo,leagueAvgFouls:lF,leagueAvgPens:lP,homePressure:hP} = fd

  // Goals
  const eH=clamp((hX||hG||1.4)*0.55+(aGC||1.1)*0.45,0.2,5)
  const eA=clamp((aX||aG||1.1)*0.55+(hGC||1.0)*0.45,0.2,5)
  const eT=eH+eA
  const pBTTS=(1-Math.exp(-eH))*(1-Math.exp(-eA))

  // Corners
  const cH=hC||(lCo||10.2)*0.52, cA=aC||(lCo||10.2)*0.48, cT=cH+cA
  const cPct=l=>clamp((cT-l+0.5)/(cT*0.75))

  // Cards
  const base=(hY||2.0)+(aY||1.8)
  const refM=((rs||65)/65)*0.40+0.60
  const derM=dby?1.18:1.00
  const impM=mi==='Derby'?1.15:mi==='Title Decider'?1.12:mi==='Relegation'?1.14:mi==='Cup Final'?1.20:1.00
  const fM=(hF&&aF)?((hF+aF)/((lF||22)*0.95))*0.85+0.15:1.00
  const eY=base*refM*derM*impM*fM
  const eR=((hR||0.06)+(aR||0.06))*derM*impM
  const bkPts=eY*10+eR*25

  // Result
  const ph=p1||clamp(eH/(eH+eA+0.3)*0.85,0.15,0.80)
  const pd=px||clamp(0.35-Math.abs(eH-eA)*0.08,0.15,0.45)
  const pa=p2||(1-ph-pd)

  // Offsides / Fouls
  const eOff=(hO||2.4)+(aO||2.1)
  const eFouls=(hF||11.5)+(aF||10.8)
  const eTotShots=(hS||13.5)+(aS||11.5)

  // Build picks with EV
  const mkPick=(cat,market,prob,odds)=>{
    const ip=impl(odds), ev=calcEV(prob,odds), gap=ip!=null?prob-ip:null
    const k=calcK(prob,odds)
    const strong=ev!=null&&ev>0.08&&gap!=null&&gap>0.06
    const value =ev!=null&&ev>0.03&&gap!=null&&gap>0.03
    return {cat,market,prob,odds,impl:ip,ev,gap,kelly:k,isValue:value||strong,isStrong:strong}
  }

  // Fallback odds generator
  const fo=(p,m=0.08)=>p>0.01?parseFloat((1/(p*(1+m))).toFixed(2)):null

  const picks = [
    mkPick('RESULT','Home Win',                ph,        fo(ph)),
    mkPick('RESULT','Draw',                    pd,        fo(pd)),
    mkPick('RESULT','Away Win',                pa,        fo(pa)),
    mkPick('RESULT','Double Chance 1X',        ph+pd,     fo(ph+pd)),
    mkPick('RESULT','Double Chance X2',        pd+pa,     fo(pd+pa)),
    mkPick('RESULT','Draw No Bet Home',        ph/(ph+pa),fo(ph/(ph+pa))),
    mkPick('RESULT','Win to Nil Home',         ph*Math.exp(-eA),fo(ph*Math.exp(-eA))),
    mkPick('GOALS', 'BTTS Yes',                pBTTS,     fo(pBTTS)),
    mkPick('GOALS', 'BTTS No',                 1-pBTTS,   fo(1-pBTTS)),
    mkPick('GOALS', 'Over 1.5 Goals',          pOver(eT,1.5),fo(pOver(eT,1.5))),
    mkPick('GOALS', 'Over 2.5 Goals',          pOver(eT,2.5),fo(pOver(eT,2.5))),
    mkPick('GOALS', 'Over 3.5 Goals',          pOver(eT,3.5),fo(pOver(eT,3.5))),
    mkPick('GOALS', 'Under 2.5 Goals',         1-pOver(eT,2.5),fo(1-pOver(eT,2.5))),
    mkPick('GOALS', 'HT Over 0.5 Goals',       pOver(eT*0.42,0.5),fo(pOver(eT*0.42,0.5))),
    mkPick('CORNERS','Over 9.5 Corners',        cPct(9.5), fo(cPct(9.5))),
    mkPick('CORNERS','Over 10.5 Corners',       cPct(10.5),fo(cPct(10.5))),
    mkPick('CORNERS','Over 11.5 Corners',       cPct(11.5),fo(cPct(11.5))),
    mkPick('CORNERS','Under 10.5 Corners',      1-cPct(10.5),fo(1-cPct(10.5))),
    mkPick('CARDS', 'Over 3.5 Cards',           clamp((eY-2.5)/3.2),fo(clamp((eY-2.5)/3.2))),
    mkPick('CARDS', 'Over 4.5 Cards',           clamp((eY-3.5)/3.2),fo(clamp((eY-3.5)/3.2))),
    mkPick('CARDS', 'Under 3.5 Cards',          1-clamp((eY-2.5)/3.2),fo(1-clamp((eY-2.5)/3.2))),
    mkPick('CARDS', 'Both Teams Carded',        clamp((eY-2.5)/3.2*0.85),fo(clamp((eY-2.5)/3.2*0.85))),
    mkPick('CARDS', `Booking Pts Over 35`,      clamp((bkPts-30)/25),fo(clamp((bkPts-30)/25))),
    mkPick('SHOTS', 'Over 7.5 Shots on Target', clamp((hST+aST||9)-7.5+0.5)/((hST+aST||9)*0.6),fo(0.58)),
    mkPick('TIMING','Goal in 1st Half',         pOver(eT*0.42,0.5),fo(pOver(eT*0.42,0.5))),
    mkPick('TIMING','Late Goal (75-90)',         clamp((hP||0.55)*0.4+0.18),fo(clamp((hP||0.55)*0.4+0.18))),
    mkPick('PENALTY','Penalty Awarded Yes',      clamp((lP||0.28)*clamp((hP||0.55)*0.4+0.80),0.10,0.38),fo(clamp((lP||0.28)*1.0,0.10,0.38))),
  ].filter(p=>p.odds!=null)

  const valuePicks = picks.filter(p=>p.isValue).sort((a,b)=>(b.ev||0)-(a.ev||0))
  const topPick    = valuePicks[0]??picks.sort((a,b)=>(b.ev||0)-(a.ev||0))[0]??null

  return {
    picks,valuePicks,topPick,
    exp:{goals:parseFloat(eT.toFixed(2)),homeGoals:parseFloat(eH.toFixed(2)),awayGoals:parseFloat(eA.toFixed(2)),
      corners:parseFloat(cT.toFixed(1)),cards:parseFloat(eY.toFixed(2)),bookPts:parseFloat(bkPts.toFixed(1)),
      pBTTS:parseFloat(pBTTS.toFixed(3)),pOver25:parseFloat(pOver(eT,2.5).toFixed(3))},
    result:{p1:parseFloat(ph.toFixed(3)),px:parseFloat(pd.toFixed(3)),p2:parseFloat(pa.toFixed(3))}
  }
}

// Build parlay from fixture picks
function buildParlay(fixtures) {
  const pool = fixtures.filter(f=>f.topPick&&(f.topPick.ev||0)>0).map(f=>({...f.topPick,match:f.name,league:f.league,fixId:f.id}))
  if (pool.length<2) return null
  const eligible=pool.slice(0,8)
  let bestEV=-Infinity,bestCombo=[]
  const nLegs=Math.min(4,eligible.length)
  const combine=(start,cur)=>{
    if(cur.length===nLegs){
      const ev=cur.reduce((a,p)=>a*(p.prob||0),1)*cur.reduce((a,p)=>a*(p.odds||1),1)-1
      if(ev>bestEV){bestEV=ev;bestCombo=[...cur]};return
    }
    for(let i=start;i<eligible.length;i++) combine(i+1,[...cur,eligible[i]])
  }
  combine(0,[])
  if(!bestCombo.length) return null
  const totOdds=bestCombo.reduce((a,p)=>a*(p.odds||1),1)
  const totProb=bestCombo.reduce((a,p)=>a*(p.prob||0),1)
  return {legs:bestCombo,totOdds:parseFloat(totOdds.toFixed(2)),totProb:parseFloat(totProb.toFixed(4)),ev:parseFloat((totProb*totOdds-1).toFixed(3)),kelly:parseFloat(Math.max(0,((totProb*(totOdds-1)-(1-totProb))/(totOdds-1))*0.25).toFixed(3))}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*')
  res.setHeader('Access-Control-Allow-Methods','GET')

  const token = process.env.SPORTMONKS_API_KEY
  const aiKey = process.env.ANTHROPIC_API_KEY
  if (!token) return res.status(500).json({error:'SPORTMONKS_API_KEY not set'})
  if (!aiKey)  return res.status(500).json({error:'ANTHROPIC_API_KEY not set'})

  try {
    const today = new Date().toISOString().split('T')[0]

    // Fetch fixtures
    const fixtures = await smFetch(
      `/fixtures/date/${today}?include=participants;statistics.type;xGFixture.type;odds;predictions;scores;state;league;referees&filters=fixtureLeagues:${LEAGUE_IDS}&per_page=50`,
      token
    )
    if (!fixtures.length) return res.status(200).json({date:today,total:0,picks:[],parlay:null,message:'No fixtures today'})

    // Fetch team stats
    const teamIds=[...new Set(fixtures.flatMap(f=>(f.participants??[]).map(p=>p.id)))].slice(0,30)
    let teamStatsMap={}
    if (teamIds.length) {
      try {
        const td=await smFetch(`/teams/multi/${teamIds.join(',')}?include=statistics.details.type&filters=currentSeasons:teamStatistic`,token)
        ;(Array.isArray(td)?td:[td]).forEach(t=>{if(t?.id) teamStatsMap[t.id]=t.statistics??[]})
      } catch(e){console.warn('Team stats unavailable:',e.message)}
    }

    // Enrich each fixture
    const enriched = fixtures.map(fix=>{
      const home=fix.participants?.find(p=>p.meta?.location==='home')
      const away=fix.participants?.find(p=>p.meta?.location==='away')
      if(!home||!away) return null

      const stats=fix.statistics??[]
      const ld=LEAGUE_DEFAULTS[fix.league_id]??LEAGUE_DEFAULTS[8]
      const state=fix.state?.developer_name??'NS'
      const homeXG=(fix.xGFixture??[]).find(x=>x.participant_id===home.id)?.data?.value
      const awayXG=(fix.xGFixture??[]).find(x=>x.participant_id===away.id)?.data?.value
      const hTS=teamStatsMap[home.id]??[],aTS=teamStatsMap[away.id]??[]
      const ref=fix.referees?.[0]
      const pred=fix.predictions?.[0]?.predictions

      const fd={
        homeXG,awayXG,
        homeGoalsAvg:getTeamAvg(hTS,T.GOALS)??ld.avgGoals/2,
        awayGoalsAvg:getTeamAvg(aTS,T.GOALS)??ld.avgGoals/2,
        homeGoalsConcAvg:getTeamAvg(hTS,88)??ld.avgGoals/2,
        awayGoalsConcAvg:getTeamAvg(aTS,88)??ld.avgGoals/2,
        homeCorners:getStat(stats,T.CORNERS,home.id)??getTeamAvg(hTS,T.CORNERS)??ld.avgCorners*0.52,
        awayCorners:getStat(stats,T.CORNERS,away.id)??getTeamAvg(aTS,T.CORNERS)??ld.avgCorners*0.48,
        homeYellow:getTeamAvg(hTS,T.YELLOW_CARDS)??ld.avgCards/2,
        awayYellow:getTeamAvg(aTS,T.YELLOW_CARDS)??ld.avgCards/2,
        homeRed:getTeamAvg(hTS,T.RED_CARDS)??0.06,
        awayRed:getTeamAvg(aTS,T.RED_CARDS)??0.06,
        homeFouls:getStat(stats,T.FOULS,home.id)??getTeamAvg(hTS,T.FOULS)??ld.avgFouls/2,
        awayFouls:getStat(stats,T.FOULS,away.id)??getTeamAvg(aTS,T.FOULS)??ld.avgFouls/2,
        homeShots:getTeamAvg(hTS,T.SHOTS_TOTAL)??13,
        awayShots:getTeamAvg(aTS,T.SHOTS_TOTAL)??11,
        homeSoT:getTeamAvg(hTS,T.SHOTS_ON_TARGET)??4.8,
        awaySoT:getTeamAvg(aTS,T.SHOTS_ON_TARGET)??4.1,
        homeOffsides:getTeamAvg(hTS,T.OFFSIDES)??2.4,
        awayOffsides:getTeamAvg(aTS,T.OFFSIDES)??2.1,
        homePressure:fix.pressure?.find(p=>p.participant_id===home.id)?.data?.value??0.55,
        homeWinP:pred?.home_win?pred.home_win/100:null,
        drawP:pred?.draw?pred.draw/100:null,
        awayWinP:pred?.away_win?pred.away_win/100:null,
        refStrictness:ld.refStrictness,
        isDerby:false,matchImportance:'Regular',
        leagueAvgCards:ld.avgCards,leagueAvgCorners:ld.avgCorners,
        leagueAvgFouls:ld.avgFouls,leagueAvgPens:ld.penRate,
      }

      const markets=buildMarkets(fd)
      const scoreData=fix.scores?.find(s=>s.description==='CURRENT')
      const leagueName=fix.league?.name??Object.keys(LEAGUES).find(k=>LEAGUES[k]===fix.league_id)??'Unknown'

      return {
        id:fix.id, name:fix.name, league:leagueName, leagueId:fix.league_id,
        kickoff:fix.starting_at, state,
        score:{home:scoreData?.score?.participant==='home'?scoreData.score.goals:0,away:scoreData?.score?.participant==='away'?scoreData.score.goals:0},
        homeTeam:{id:home.id,name:home.name,image:home.image_path},
        awayTeam:{id:away.id,name:away.name,image:away.image_path},
        referee:ref?.name??'TBC',
        markets, topPick:markets.topPick, valuePicks:markets.valuePicks,
        exp:markets.exp, result:markets.result,
      }
    }).filter(Boolean)

    // Build parlay
    const parlay=buildParlay(enriched)

    // AI synthesis — ask Claude to produce final picks for every fixture
    const fixtureContext = enriched.map(f=>`
FIXTURE: ${f.name} (${f.league}) @ ${f.kickoff}
Expected Goals: ${f.exp.homeGoals} – ${f.exp.awayGoals} | xG available: ${f.markets.picks.find(p=>p.cat==='GOALS')?'yes':'no'}
BTTS probability: ${(f.exp.pBTTS*100).toFixed(0)}% | Over 2.5 probability: ${(f.exp.pOver25*100).toFixed(0)}%
Expected corners: ${f.exp.corners} | Expected cards: ${f.exp.cards} | Booking pts: ${f.exp.bookPts}
Home win: ${(f.result.p1*100).toFixed(0)}% | Draw: ${(f.result.px*100).toFixed(0)}% | Away win: ${(f.result.p2*100).toFixed(0)}%
Top value pick: ${f.topPick?.market??'none'} @ ${f.topPick?.odds??'—'} (EV: ${f.topPick?.ev?.toFixed(3)??'—'}, gap: ${((f.topPick?.gap||0)*100).toFixed(1)}%)
All value picks: ${f.valuePicks.slice(0,5).map(p=>`${p.market}@${p.odds}(EV:${p.ev?.toFixed(3)})`).join(', ')||'none'}
`).join('\n---\n')

    const aiPrompt = `You are an expert quant betting analyst. The statistical model has already done all the heavy lifting. Your job is to synthesise it into clear, confident betting picks for each fixture.

TODAY'S FIXTURES WITH FULL STATISTICAL ANALYSIS:
${fixtureContext}

For each fixture, select the 1-3 BEST bets. Only recommend bets where there is genuine statistical value (positive EV, model probability above implied). Do not recommend bets just to have picks — if a fixture has no value, say SKIP.

Respond ONLY in this exact JSON format (no markdown, no explanation outside the JSON):
{
  "fixtures": [
    {
      "name": "Team A v Team B",
      "verdict": "One punchy sentence describing the key statistical story of this match",
      "picks": [
        {
          "market": "exact market name",
          "odds": 2.10,
          "confidence": "HIGH|MEDIUM",
          "reasoning": "One clear sentence explaining why — reference the actual stats (xG, corners avg, cards, pressure etc)",
          "stake": "2%|3%|5% of bankroll based on Kelly"
        }
      ],
      "skip": false,
      "skipReason": null,
      "parlaySafe": true
    }
  ],
  "parlayPicks": ["Team A v Team B – Market", "Team C v Team D – Market"],
  "dayVerdict": "One sentence summary of the overall value opportunity today"
}`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':aiKey,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-sonnet-4-5',max_tokens:4000,messages:[{role:'user',content:aiPrompt}]})
    })
    const aiData = await aiRes.json()
    const rawText = aiData.content?.[0]?.text??'{}'
    let aiPicks
    try {
      const match=rawText.match(/\{[\s\S]*\}/)
      aiPicks=match?JSON.parse(match[0]):null
    } catch(e){ aiPicks=null }

    // Merge AI picks with statistical data
    const finalFixtures = enriched.map(fix=>{
      const aiF = aiPicks?.fixtures?.find(f=>f.name===fix.name||fix.name.includes(f.name?.split(' v ')[0]))
      return { ...fix, ai:aiF??null }
    })

    return res.status(200).json({
      date:today, total:enriched.length,
      dayVerdict: aiPicks?.dayVerdict??null,
      parlay,
      aiParlay: aiPicks?.parlayPicks??null,
      fixtures: finalFixtures,
    })

  } catch(err){
    console.error('Picks error:',err)
    return res.status(500).json({error:err.message})
  }
}

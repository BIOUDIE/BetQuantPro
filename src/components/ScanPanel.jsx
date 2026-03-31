import { useState } from 'react'
import { C, fmt, pct } from '../theme.js'
import Tag from './Tag.jsx'
import { scanToday, getAIPrediction } from '../utils/liveData.js'

const LEAGUES = ['All', 'EPL', 'La Liga', 'Bundesliga', 'Belgian Pro League', 'Championship', 'Ligue 1', 'Serie A']

const CONF_COLOR = { HIGH: C.green, MEDIUM: C.amber, LOW: C.red }

// ── Confidence badge ──────────────────────────────────────────────────────────
function ConfBadge({ level }) {
  return <Tag color={CONF_COLOR[level] ?? C.muted}>{level}</Tag>
}

// ── Single fixture card ───────────────────────────────────────────────────────
function FixtureCard({ fix, onPredict }) {
  const [expanded, setExpanded] = useState(false)
  const [predicting, setPredicting] = useState(false)
  const [prediction, setPrediction] = useState(null)
  const [predError, setPredError] = useState(null)

  const handlePredict = async () => {
    setPredicting(true)
    setPredError(null)
    try {
      const result = await onPredict(fix)
      setPrediction(result.prediction)
      setExpanded(true)
    } catch (e) {
      setPredError(e.message)
    } finally {
      setPredicting(false)
    }
  }

  const stateColor = fix.state === 'FT' ? C.muted : fix.state === 'LIVE' ? C.green : C.textD
  const stateLabel = fix.state === 'NS' ? 'UPCOMING' : fix.state

  return (
    <div style={{
      background:   C.bg1,
      border:       `1px solid ${fix.confidence === 'HIGH' ? C.green + '44' : C.border}`,
      borderLeft:   `3px solid ${CONF_COLOR[fix.confidence] ?? C.border}`,
      borderRadius:  2,
      marginBottom:  8,
      overflow:     'hidden',
    }}>
      {/* ── Card header ── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '10px 14px',
        background:      C.bg2,
        cursor:         'pointer',
      }} onClick={() => setExpanded(e => !e)}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.white }}>{fix.name}</span>
            <Tag color={C.blue}>{fix.league}</Tag>
            <span style={{ fontSize: 9, color: stateColor }}>{stateLabel}</span>
          </div>
          <span style={{ fontSize: 9, color: C.textDD }}>
            {new Date(fix.kickoff).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {fix.state !== 'NS' && ` · ${fix.score?.home ?? 0} – ${fix.score?.away ?? 0}`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Odds strip */}
          {fix.odds?.home && (
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { label: '1', val: fix.odds.home, gap: fix.gap?.home },
                { label: 'X', val: fix.odds.draw, gap: fix.gap?.draw },
                { label: '2', val: fix.odds.away, gap: fix.gap?.away },
              ].map(({ label, val, gap }) => (
                <div key={label} style={{
                  background:  gap > 0.05 ? C.green + '22' : C.bg3,
                  border:      `1px solid ${gap > 0.05 ? C.green + '55' : C.border}`,
                  borderRadius: 2,
                  padding:    '3px 8px',
                  textAlign:  'center',
                  minWidth:    42,
                }}>
                  <div style={{ fontSize: 8, color: C.muted }}>{label}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: gap > 0.05 ? C.green : C.white }}>
                    {val?.toFixed(2) ?? '—'}
                  </div>
                  {gap != null && (
                    <div style={{ fontSize: 8, color: gap > 0 ? C.green : C.red }}>
                      {gap > 0 ? '+' : ''}{(gap * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <ConfBadge level={fix.confidence} />
          <span style={{ fontSize: 14, color: C.textD }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Stats comparison */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['POSSESSION', `${fix.stats?.home?.possession ?? '—'}%`, `${fix.stats?.away?.possession ?? '—'}%`],
              ['xG', fix.stats?.home?.xg?.toFixed(2) ?? '—', fix.stats?.away?.xg?.toFixed(2) ?? '—'],
              ['SHOTS ON TGT', fix.stats?.home?.shotsOnTarget ?? '—', fix.stats?.away?.shotsOnTarget ?? '—'],
              ['CORNERS', fix.stats?.home?.corners ?? '—', fix.stats?.away?.corners ?? '—'],
              ['YELLOW CARDS', fix.stats?.home?.yellowCards ?? '—', fix.stats?.away?.yellowCards ?? '—'],
              ['FOULS', fix.stats?.home?.fouls ?? '—', fix.stats?.away?.fouls ?? '—'],
              ['DANGEROUS ATT', fix.stats?.home?.dangerousAttacks ?? '—', fix.stats?.away?.dangerousAttacks ?? '—'],
              ['PRESSURE IDX', fix.quant?.homePressure?.toFixed(2) ?? '—', fix.quant?.awayPressure?.toFixed(2) ?? '—'],
            ].map(([label, h, a]) => (
              <div key={label} style={{
                display:   'flex',
                gap:        8,
                alignItems:'center',
                padding:   '6px 10px',
                background: C.bg2,
                border:    `1px solid ${C.border}`,
                borderRadius: 2,
              }}>
                <span style={{ flex: 1, fontSize: 9, color: C.muted, letterSpacing: '0.08em' }}>{label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.amberL, minWidth: 40, textAlign: 'right' }}>{h}</span>
                <span style={{ fontSize: 9, color: C.textDD }}>vs</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, minWidth: 40, textAlign: 'left' }}>{a}</span>
              </div>
            ))}
          </div>

          {/* Quant signals */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
            padding: '10px 12px',
            background: C.bg0,
            border: `1px solid ${C.border}`,
            borderRadius: 2,
          }}>
            {[
              { label: 'LUCK SCORE', val: fix.quant?.luckScore?.toFixed(2), color: (fix.quant?.luckScore ?? 0) > 0.5 ? C.red : C.green },
              { label: 'VOLATILITY', val: fix.quant?.volatility?.toFixed(2), color: (fix.quant?.volatility ?? 0) > 0.5 ? C.amber : C.textD },
              { label: 'FLUKE SCORE', val: fix.quant?.flukeScore?.toFixed(2), color: (fix.quant?.flukeScore ?? 0) > 0.65 ? C.red : C.green },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 8, color: C.muted, letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color }}>{val ?? '—'}</div>
              </div>
            ))}
          </div>

          {/* Best picks strip */}
          {fix.picks?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em' }}>VALUE PICKS (sorted by EV)</div>
              {fix.picks.map((pick, i) => (
                <div key={i} style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:          10,
                  padding:     '8px 12px',
                  background:   i === 0 ? C.green + '11' : C.bg2,
                  border:       `1px solid ${i === 0 ? C.green + '33' : C.border}`,
                  borderRadius:  2,
                }}>
                  {i === 0 && <span style={{ fontSize: 10 }}>⭐</span>}
                  <span style={{ fontSize: 11, color: C.white, fontWeight: i === 0 ? 700 : 400, flex: 1 }}>
                    {pick.market}
                  </span>
                  <span style={{ fontSize: 10, color: C.amberL }}>Odds {pick.odds?.toFixed(2)}</span>
                  <span style={{ fontSize: 10, color: C.green }}>EV {pick.ev > 0 ? '+' : ''}{pick.ev?.toFixed(3)}</span>
                  <span style={{ fontSize: 10, color: C.blue }}>Kelly {((pick.kelly ?? 0) * 100).toFixed(1)}%</span>
                  <span style={{ fontSize: 10, color: C.textD }}>p={((pick.prob ?? 0) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}

          {/* AI Prediction section */}
          {!prediction && (
            <button onClick={handlePredict} disabled={predicting} style={{
              background:    predicting ? C.dim : C.amber,
              border:        'none',
              borderRadius:   1,
              color:         predicting ? C.textD : C.bg0,
              fontSize:       11,
              fontWeight:     700,
              letterSpacing: '0.08em',
              padding:       '10px 20px',
              cursor:        predicting ? 'wait' : 'pointer',
              display:       'flex',
              alignItems:    'center',
              justifyContent:'center',
              gap:            8,
            }}>
              {predicting
                ? '⟳  AI ANALYSING...'
                : '⚡  GET AI DEEP-DIVE PREDICTION'}
            </button>
          )}

          {predError && (
            <div style={{ fontSize: 10, color: C.red, padding: '8px 12px', background: C.red + '11', borderRadius: 2 }}>
              ✕ {predError}
            </div>
          )}

          {/* AI Prediction result */}
          {prediction && (
            <div style={{
              background:   C.bg0,
              border:       `1px solid ${CONF_COLOR[prediction.confidence] ?? C.border}`,
              borderTop:    `2px solid ${CONF_COLOR[prediction.confidence] ?? C.amber}`,
              borderRadius:  2,
              padding:       14,
              display:      'flex',
              flexDirection:'column',
              gap:           12,
            }}>
              {/* Verdict */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 16 }}>🧠</span>
                <div>
                  <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em', marginBottom: 4 }}>AI VERDICT</div>
                  <div style={{ fontSize: 12, color: C.white, lineHeight: 1.7 }}>{prediction.verdict}</div>
                </div>
              </div>

              {/* Primary bet */}
              {prediction.primaryBet && (
                <div style={{
                  background:   C.green + '11',
                  border:       `1px solid ${C.green}33`,
                  borderRadius:  2,
                  padding:      '10px 14px',
                }}>
                  <div style={{ fontSize: 9, color: C.green, letterSpacing: '0.1em', marginBottom: 6 }}>
                    ⭐ PRIMARY BET — {prediction.primaryBet.market}
                  </div>
                  <div style={{ fontSize: 11, color: C.text, lineHeight: 1.7, marginBottom: 8 }}>
                    {prediction.primaryBet.reasoning}
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {[
                      ['ODDS',  prediction.primaryBet.odds],
                      ['EV',    prediction.primaryBet.ev ? fmt(parseFloat(prediction.primaryBet.ev), 3) : '—'],
                      ['KELLY', prediction.primaryBet.kelly ? (parseFloat(prediction.primaryBet.kelly) * 100).toFixed(1) + '%' : '—'],
                    ].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize: 8, color: C.muted }}>{l}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.green }}>{v}</div>
                      </div>
                    ))}
                    <ConfBadge level={prediction.primaryBet.confidence} />
                  </div>
                </div>
              )}

              {/* Secondary bet */}
              {prediction.secondaryBet && (
                <div style={{
                  background:   C.amber + '0D',
                  border:       `1px solid ${C.amber}33`,
                  borderRadius:  2,
                  padding:      '10px 14px',
                }}>
                  <div style={{ fontSize: 9, color: C.amber, letterSpacing: '0.1em', marginBottom: 4 }}>
                    SECONDARY BET — {prediction.secondaryBet.market}
                  </div>
                  <div style={{ fontSize: 11, color: C.text, lineHeight: 1.7 }}>
                    {prediction.secondaryBet.reasoning}
                  </div>
                </div>
              )}

              {/* Key stats + risks */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {prediction.keyStats?.length > 0 && (
                  <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 2, padding: 10 }}>
                    <div style={{ fontSize: 9, color: C.blue, letterSpacing: '0.1em', marginBottom: 6 }}>KEY INSIGHTS</div>
                    {prediction.keyStats.map((s, i) => (
                      <div key={i} style={{ fontSize: 10, color: C.text, lineHeight: 1.7, marginBottom: 3 }}>→ {s}</div>
                    ))}
                  </div>
                )}
                {prediction.risks?.length > 0 && (
                  <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 2, padding: 10 }}>
                    <div style={{ fontSize: 9, color: C.red, letterSpacing: '0.1em', marginBottom: 6 }}>RISKS</div>
                    {prediction.risks.map((r, i) => (
                      <div key={i} style={{ fontSize: 10, color: C.text, lineHeight: 1.7, marginBottom: 3 }}>⚠ {r}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Market signals */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {[
                  { label: 'BTTS', val: prediction.btts },
                  { label: 'OVER 2.5', val: prediction.over25 },
                  { label: 'PRED SCORE', val: prediction.predictedScore },
                  { label: 'BOOKINGS', val: prediction.bookingsBet ? 'See note' : '—' },
                ].map(({ label, val }) => (
                  <div key={label} style={{
                    background: C.bg2, border: `1px solid ${C.border}`,
                    borderRadius: 2, padding: '8px 10px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 8, color: C.muted, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.amberL }}>{val ?? '—'}</div>
                  </div>
                ))}
              </div>

              {prediction.bookingsBet && (
                <div style={{ fontSize: 10, color: C.textD, lineHeight: 1.7, padding: '6px 10px',
                  background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 2 }}>
                  📋 BOOKINGS: {prediction.bookingsBet}
                </div>
              )}

              {prediction.flukeAlert && (
                <div style={{ fontSize: 10, color: C.red, padding: '6px 10px',
                  background: C.red + '11', border: `1px solid ${C.red}33`, borderRadius: 2 }}>
                  ⚠ FLUKE ALERT: {prediction.flukeAlert}
                </div>
              )}

              <button onClick={() => setPrediction(null)} style={{
                background: 'none', border: `1px solid ${C.border}`, borderRadius: 1,
                color: C.textDD, fontSize: 9, padding: '4px 12px', cursor: 'pointer',
                width: 'fit-content',
              }}>
                REFRESH PREDICTION
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Scan Panel ───────────────────────────────────────────────────────────
export default function ScanPanel({ onHighConfPicks }) {
  const [scanning,  setScanning]  = useState(false)
  const [fixtures,  setFixtures]  = useState([])
  const [scanMeta,  setScanMeta]  = useState(null)
  const [error,     setError]     = useState(null)
  const [league,    setLeague]    = useState('All')
  const [confFilter,setConfFilter]= useState('All')
  const [log,       setLog]       = useState([])

  const push = (msg, color = C.textD) =>
    setLog(l => [...l.slice(-20), { msg, color }])

  const handleScan = async () => {
    setScanning(true)
    setError(null)
    setFixtures([])
    setLog([])

    push('Connecting to Sportmonks API...', C.textD)
    push('Fetching today\'s fixtures for EPL, La Liga, Bundesliga, Belgian Pro League, Championship, Ligue 1, Serie A...', C.blue)

    try {
      const data = await scanToday()
      push(`✓ ${data.total} fixtures found for ${new Date(data.date).toDateString()}`, C.green)

      const high = data.fixtures.filter(f => f.confidence === 'HIGH').length
      const med  = data.fixtures.filter(f => f.confidence === 'MEDIUM').length
      push(`→ ${high} HIGH confidence · ${med} MEDIUM confidence value bets identified`, C.amber)
      push('Running quant engine: xG · Pressure Index · Fluke Score · Kelly...', C.textD)
      push('Deep-dive complete. Click any fixture to expand · Click ⚡ for AI prediction', C.green)

      setFixtures(data.fixtures)
      setScanMeta(data)

      // Pass HIGH-confidence picks up to Parlay Builder
      if (onHighConfPicks) {
        onHighConfPicks(data.fixtures.filter(f => f.confidence === 'HIGH'))
      }
    } catch (e) {
      setError(e.message)
      push(`✕ Error: ${e.message}`, C.red)
    } finally {
      setScanning(false)
    }
  }

  const handlePredict = async (fixture) => {
    push(`⚡ AI analysing ${fixture.name}...`, C.amber)
    const result = await getAIPrediction(fixture)
    push(`✓ AI prediction ready for ${fixture.name}`, C.green)
    return result
  }

  const filtered = fixtures
    .filter(f => league === 'All' || f.league === league)
    .filter(f => confFilter === 'All' || f.confidence === confFilter)

  const highCount = fixtures.filter(f => f.confidence === 'HIGH').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Scan button + meta */}
      <div style={{
        background:  C.bg1,
        border:      `1px solid ${C.border}`,
        borderTop:   `2px solid ${C.amber}`,
        borderRadius: 2,
        padding:      16,
        display:     'flex',
        alignItems:  'center',
        gap:          16,
        flexWrap:    'wrap',
      }}>
        <button onClick={handleScan} disabled={scanning} style={{
          background:    scanning ? C.dim : C.amber,
          border:        'none',
          borderRadius:   1,
          color:         scanning ? C.textD : C.bg0,
          fontSize:       13,
          fontWeight:     700,
          letterSpacing: '0.08em',
          padding:       '12px 28px',
          cursor:        scanning ? 'wait' : 'pointer',
          display:       'flex',
          alignItems:    'center',
          gap:            10,
          whiteSpace:    'nowrap',
        }}>
          {scanning ? '⟳  SCANNING ALL LEAGUES...' : '⚡  SCAN TODAY\'S MATCHES'}
        </button>

        {scanMeta && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 8, color: C.muted }}>DATE</div>
              <div style={{ fontSize: 12, color: C.white }}>{scanMeta.date}</div>
            </div>
            <div>
              <div style={{ fontSize: 8, color: C.muted }}>FIXTURES</div>
              <div style={{ fontSize: 12, color: C.white }}>{scanMeta.total}</div>
            </div>
            <div>
              <div style={{ fontSize: 8, color: C.muted }}>HIGH CONF</div>
              <div style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>{highCount}</div>
            </div>
          </div>
        )}

        {scanMeta && (
          <div style={{ fontSize: 9, color: C.textDD, marginLeft: 'auto' }}>
            Auto-refreshes every 5 min during live matches
          </div>
        )}
      </div>

      {/* Execution log */}
      {log.length > 0 && (
        <div style={{
          background: C.bg0, border: `1px solid ${C.border}`,
          borderRadius: 2, padding: '10px 14px',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize: 10, color: l.color, lineHeight: 1.6 }}>
              {l.msg}
            </div>
          ))}
          {scanning && <span style={{ color: C.amber, animation: 'blink 0.8s infinite' }}>▋</span>}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: C.red + '11', border: `1px solid ${C.red}33`,
          borderRadius: 2, padding: '12px 14px', fontSize: 11, color: C.red,
        }}>
          ✕ {error}
          {error.includes('SPORTMONKS_API_KEY') && (
            <div style={{ marginTop: 8, color: C.textD }}>
              → Go to Vercel → Your Project → Settings → Environment Variables → Add SPORTMONKS_API_KEY
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      {fixtures.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {LEAGUES.map(l => (
              <button key={l} onClick={() => setLeague(l)} style={{
                fontSize: 8, fontFamily: "'IBM Plex Mono', monospace",
                background: league === l ? C.blue + '22' : 'none',
                border: `1px solid ${league === l ? C.blue : C.border}`,
                color: league === l ? C.blue : C.textDD,
                padding: '3px 8px', borderRadius: 1, cursor: 'pointer',
              }}>{l}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 16, background: C.border }} />
          <div style={{ display: 'flex', gap: 4 }}>
            {['All', 'HIGH', 'MEDIUM', 'LOW'].map(c => (
              <button key={c} onClick={() => setConfFilter(c)} style={{
                fontSize: 8, fontFamily: "'IBM Plex Mono', monospace",
                background: confFilter === c ? (CONF_COLOR[c] ?? C.amber) + '22' : 'none',
                border: `1px solid ${confFilter === c ? (CONF_COLOR[c] ?? C.amber) : C.border}`,
                color: confFilter === c ? (CONF_COLOR[c] ?? C.amber) : C.textDD,
                padding: '3px 8px', borderRadius: 1, cursor: 'pointer',
              }}>{c}</button>
            ))}
          </div>
          <span style={{ fontSize: 9, color: C.textDD, marginLeft: 'auto' }}>
            {filtered.length} of {fixtures.length} fixtures shown
          </span>
        </div>
      )}

      {/* Fixture cards */}
      {filtered.length === 0 && !scanning && fixtures.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '48px 20px',
          color: C.textDD, fontSize: 11,
          border: `1px dashed ${C.border}`, borderRadius: 2,
        }}>
          Press ⚡ SCAN TODAY'S MATCHES to fetch all fixtures and deep-dive stats
          <div style={{ marginTop: 8, fontSize: 9, color: C.textDD }}>
            Covers EPL · La Liga · Bundesliga · Belgian Pro League · Championship · Ligue 1 · Serie A
          </div>
        </div>
      )}

      {filtered.map(fix => (
        <FixtureCard key={fix.id} fix={fix} onPredict={handlePredict} />
      ))}
    </div>
  )
}

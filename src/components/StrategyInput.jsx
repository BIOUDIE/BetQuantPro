import { useState, useEffect } from 'react'
import { C } from '../theme.js'
import { STRATEGY_TEMPLATES } from '../utils/seed.js'
import { parseStrategy } from '../utils/engine.js'

export default function StrategyInput({ onRun, running }) {
  const [text,       setText]       = useState(STRATEGY_TEMPLATES[0])
  const [stakeMode,  setStakeMode]  = useState('kelly')
  const [threshold,  setThreshold]  = useState(0.05)
  const [parsed,     setParsed]     = useState([])

  useEffect(() => {
    setParsed(parseStrategy(text))
  }, [text])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Template quick-load pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STRATEGY_TEMPLATES.map((t, i) => (
          <button key={i} onClick={() => setText(t)} style={{
            fontSize:   9,
            background: text === t ? C.amber + '22' : C.bg3,
            border:     `1px solid ${text === t ? C.amber : C.border}`,
            color:      text === t ? C.amberL : C.textD,
            padding:    '3px 9px',
            borderRadius: 1,
            cursor:     'pointer',
          }}>
            TPL-{i + 1}
          </button>
        ))}
      </div>

      {/* Strategy textarea */}
      <div style={{ position: 'relative' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          spellCheck={false}
          style={{
            width:       '100%',
            boxSizing:   'border-box',
            background:  C.bg0,
            border:      `1px solid ${C.borderB}`,
            borderRadius: 2,
            color:       C.amberL,
            fontSize:    12,
            padding:     '10px 12px',
            resize:      'vertical',
            outline:     'none',
            lineHeight:  1.8,
          }}
        />
        <span style={{
          position:  'absolute',
          top:        8,
          right:      10,
          fontSize:   9,
          color:      C.textDD,
        }}>
          STRATEGY_STRING
        </span>
      </div>

      {/* Parsed condition tokens */}
      {parsed.length > 0 && (
        <div style={{
          background:  C.bg0,
          border:      `1px dashed ${C.dim}`,
          borderRadius: 2,
          padding:     '8px 12px',
          display:     'flex',
          flexWrap:    'wrap',
          gap:          6,
          alignItems:  'center',
        }}>
          <span style={{ fontSize: 9, color: C.textDD, marginRight: 4 }}>PARSED:</span>
          {parsed.map((c, i) => (
            <span key={i} style={{
              fontSize:    10,
              background:  C.blue + '18',
              color:       C.blue,
              border:      `1px solid ${C.blue}33`,
              padding:     '2px 8px',
              borderRadius: 1,
            }}>
              {c.field
                ? `${c.field} ${c.operator} ${c.value}${c.atMinute ? ` @${c.atMinute}'` : ''}`
                : c.raw}
            </span>
          ))}
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>

        {/* Stake mode toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em' }}>STAKE MODE</label>
          <div style={{ display: 'flex' }}>
            {['kelly', 'flat', '2%'].map(m => (
              <button key={m} onClick={() => setStakeMode(m)} style={{
                fontSize:    9,
                background:  stakeMode === m ? C.amber : C.bg3,
                border:      `1px solid ${stakeMode === m ? C.amber : C.border}`,
                color:       stakeMode === m ? C.bg0 : C.textD,
                padding:     '4px 10px',
                cursor:      'pointer',
                fontWeight:  stakeMode === m ? 700 : 400,
              }}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Threshold slider */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 130 }}>
          <label style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em' }}>
            VALUE THRESHOLD θ = {threshold.toFixed(2)}
          </label>
          <input
            type="range" min={0.01} max={0.15} step={0.01}
            value={threshold}
            onChange={e => setThreshold(+e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {/* Run button */}
        <button
          onClick={() => onRun({ text, stakeMode, threshold, parsed })}
          disabled={running}
          style={{
            background:    running ? C.dim : C.amber,
            border:        'none',
            borderRadius:  1,
            color:         running ? C.textD : C.bg0,
            fontSize:      11,
            fontWeight:    700,
            letterSpacing: '0.08em',
            padding:       '8px 20px',
            cursor:        running ? 'wait' : 'pointer',
            display:       'flex',
            alignItems:    'center',
            gap:            8,
            transition:    'all 0.15s',
            whiteSpace:    'nowrap',
          }}
        >
          {running ? '⟳  RUNNING...' : '▶  RUN BACKTEST'}
        </button>
      </div>
    </div>
  )
}

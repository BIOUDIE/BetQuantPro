import { useState, useRef } from 'react'
import { C } from '../theme.js'
import Tag from './Tag.jsx'
import { parseCSV, parseJSON, validateData, generateSampleCSV } from '../utils/csv.js'

export default function DataIngestion({ onLoad }) {
  const [status,   setStatus]   = useState(null)   // null | 'loading' | 'ok' | 'error'
  const [issues,   setIssues]   = useState([])
  const [rowCount, setRowCount] = useState(0)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const process = async (file) => {
    setStatus('loading')
    setIssues([])
    const text = await file.text()
    let parsed

    if (file.name.endsWith('.json')) {
      parsed = parseJSON(text)
    } else {
      parsed = parseCSV(text)
    }

    const validation = validateData(parsed.data)
    setIssues(validation.issues)
    setRowCount(validation.rowCount ?? 0)

    if (validation.valid) {
      setStatus('ok')
      onLoad(parsed.data)
    } else {
      setStatus('error')
    }
  }

  const onDrop = e => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) process(file)
  }

  const onFile = e => {
    const file = e.target.files[0]
    if (file) process(file)
  }

  const downloadSample = () => {
    const blob = new Blob([generateSampleCSV()], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = 'bqp_sample_data.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const issueColor = type =>
    type === 'error' ? C.red : type === 'warning' ? C.amber : C.textD

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current.click()}
        style={{
          border:        `1px dashed ${dragging ? C.amber : C.borderB}`,
          borderRadius:   2,
          background:    dragging ? C.amber + '0A' : C.bg0,
          padding:       '28px 20px',
          textAlign:     'center',
          cursor:        'pointer',
          transition:    'all 0.15s',
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 8 }}>⬆</div>
        <div style={{ fontSize: 11, color: C.textD, marginBottom: 4 }}>
          Drop CSV or JSON file here
        </div>
        <div style={{ fontSize: 9, color: C.textDD }}>
          or click to browse
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json"
          onChange={onFile}
          style={{ display: 'none' }}
        />
      </div>

      {/* Status indicators */}
      {status === 'loading' && (
        <div style={{ fontSize: 10, color: C.amber, display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          Parsing file...
        </div>
      )}

      {issues.map((iss, i) => (
        <div key={i} style={{
          fontSize:    10,
          color:       issueColor(iss.type),
          background:  issueColor(iss.type) + '11',
          border:      `1px solid ${issueColor(iss.type)}33`,
          borderRadius: 2,
          padding:     '6px 10px',
          lineHeight:  1.6,
        }}>
          {iss.type === 'error' ? '✕ ' : iss.type === 'warning' ? '⚠ ' : 'ℹ '}
          {iss.msg}
        </div>
      ))}

      {status === 'ok' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tag color={C.green}>LOADED</Tag>
          <span style={{ fontSize: 10, color: C.textD }}>{rowCount} matches ready for backtest</span>
        </div>
      )}

      {/* Sample download */}
      <button onClick={downloadSample} style={{
        background:    'none',
        border:        `1px solid ${C.border}`,
        borderRadius:   1,
        color:         C.textD,
        fontSize:      9,
        padding:       '6px 12px',
        cursor:        'pointer',
        letterSpacing: '0.08em',
        display:       'flex',
        alignItems:    'center',
        gap:            6,
        width:         'fit-content',
      }}>
        ⬇  DOWNLOAD SAMPLE CSV TEMPLATE
      </button>

      {/* Expected columns hint */}
      <details style={{ fontSize: 9, color: C.textDD, cursor: 'pointer' }}>
        <summary style={{ color: C.muted, letterSpacing: '0.06em', userSelect: 'none' }}>
          EXPECTED CSV COLUMNS
        </summary>
        <div style={{
          marginTop:  8,
          lineHeight: 2,
          background: C.bg0,
          padding:    '8px 10px',
          borderRadius: 2,
          border:     `1px solid ${C.border}`,
        }}>
          <span style={{ color: C.red }}>home_team, away_team, home_goals, away_goals</span>
          {' '}(required)<br />
          home_xg, away_xg, home_possession, away_possession,<br />
          home_shots_on_target, away_shots_on_target,<br />
          home_corners, away_corners, home_yellow_cards, away_yellow_cards,<br />
          home_red_cards, away_red_cards, home_fouls, away_fouls,<br />
          odds_home_win, odds_draw, odds_away_win, calc, impl, gap, ev, kelly, result
        </div>
      </details>
    </div>
  )
}

import { useState } from 'react'
import { C, clr, fmt, pct } from '../theme.js'
import Tag from './Tag.jsx'

export default function ValueBetsTable({ bets }) {
  const [sort,   setSort]   = useState({ key: 'gap', dir: -1 })
  const [filter, setFilter] = useState('ALL')

  const markets = ['ALL', ...new Set(bets.map(b => b.market))]

  const sorted = [...bets]
    .filter(b => filter === 'ALL' || b.market === filter)
    .sort((a, b) => sort.dir * ((b[sort.key] ?? 0) - (a[sort.key] ?? 0)))

  const toggle = key =>
    setSort(s => s.key === key ? { key, dir: -s.dir } : { key, dir: -1 })

  const TH = ({ label, k }) => (
    <th onClick={() => toggle(k)} style={{
      fontSize:      8,
      color:         sort.key === k ? C.amber : C.muted,
      letterSpacing: '0.1em',
      textAlign:     'right',
      padding:       '6px 8px',
      cursor:        'pointer',
      userSelect:    'none',
      whiteSpace:    'nowrap',
      borderBottom:  `1px solid ${C.border}`,
    }}>
      {label}{sort.key === k ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
    </th>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Market filters */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {markets.map(m => (
          <button key={m} onClick={() => setFilter(m)} style={{
            fontSize:    8,
            background:  filter === m ? C.green + '22' : 'none',
            border:      `1px solid ${filter === m ? C.green : C.border}`,
            color:       filter === m ? C.green : C.textDD,
            padding:     '2px 8px',
            borderRadius: 1,
            cursor:      'pointer',
          }}>
            {m}
          </button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.bg2 }}>
              {[['MATCH', 'left'], ['MARKET', 'left']].map(([l, a]) => (
                <th key={l} style={{
                  fontSize: 8, color: C.muted, letterSpacing: '0.1em',
                  textAlign: a, padding: '6px 8px',
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  {l}
                </th>
              ))}
              <TH label="ODDS"    k="odds"  />
              <TH label="p(CALC)" k="calc"  />
              <TH label="p(IMP)"  k="impl"  />
              <TH label="GAP"     k="gap"   />
              <TH label="EV"      k="ev"    />
              <TH label="KELLY"   k="kelly" />
              <th style={{
                fontSize: 8, color: C.muted, letterSpacing: '0.1em',
                textAlign: 'center', padding: '6px 8px',
                borderBottom: `1px solid ${C.border}`,
              }}>RESULT</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((b, i) => (
              <tr key={b.id ?? i} style={{
                background:   i % 2 === 0 ? C.bg1 : C.bg2,
                borderBottom: `1px solid ${C.border}`,
              }}>
                <td style={{ padding: '6px 8px', color: C.text, fontSize: 10, whiteSpace: 'nowrap' }}>
                  {b.match}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <Tag color={C.blue}>{b.market}</Tag>
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: C.white, fontSize: 10 }}>
                  {b.odds?.toFixed(2) ?? '—'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: C.amberL, fontSize: 10 }}>
                  {b.calc != null ? pct(b.calc) : '—'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: C.textD, fontSize: 10 }}>
                  {b.impl != null ? pct(b.impl) : '—'}
                </td>
                <td style={{
                  padding: '6px 8px', textAlign: 'right', fontSize: 10,
                  color: (b.gap ?? 0) > 0.05 ? C.green : (b.gap ?? 0) > 0 ? C.amberL : C.red,
                  fontWeight: (b.gap ?? 0) > 0.05 ? 700 : 400,
                }}>
                  {b.gap != null ? fmt(b.gap, 3) : '—'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', fontSize: 10, color: clr(b.ev ?? 0) }}>
                  {b.ev != null ? fmt(b.ev, 3) : '—'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'right', color: C.blue, fontSize: 10 }}>
                  {b.kelly != null ? (b.kelly * 100).toFixed(1) + '%' : '—'}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  <Tag color={b.result === 'WIN' ? C.green : C.red}>
                    {b.result ?? '?'}
                  </Tag>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} style={{
                  padding: '24px', textAlign: 'center',
                  color: C.textDD, fontSize: 11,
                }}>
                  No bets match the current filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

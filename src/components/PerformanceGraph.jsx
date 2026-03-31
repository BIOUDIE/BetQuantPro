import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useState } from 'react'
import { C, fmt, pct } from '../theme.js'
import ChartTooltip from './ChartTooltip.jsx'

export default function PerformanceGraph({ data, bets }) {
  const [view, setView] = useState('bankroll')

  const last   = data[data.length - 1]?.bankroll ?? 1000
  const first  = data[0]?.bankroll ?? 1000
  const roi    = (((last - first) / first) * 100).toFixed(1)
  const peak   = Math.max(...data.map(d => d.bankroll))
  const trough = Math.min(...data.map(d => d.bankroll))
  const dd     = (((peak - trough) / peak) * 100).toFixed(1)
  const winRate = bets.length > 0
    ? pct(bets.filter(b => b.result === 'WIN' || b.won).length / bets.length)
    : '—'
  const avgEV = bets.length > 0
    ? fmt(bets.reduce((s, b) => s + (b.ev ?? 0), 0) / bets.length, 3)
    : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 14 }}>
        {[['bankroll', 'BANKROLL'], ['ev', 'EV / BET']].map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} style={{
            background:   'none',
            border:       'none',
            borderBottom: `2px solid ${view === k ? C.amber : 'transparent'}`,
            color:        view === k ? C.amber : C.muted,
            fontSize:     9,
            fontWeight:   600,
            letterSpacing:'0.1em',
            padding:      '6px 14px 8px',
            cursor:       'pointer',
            transition:   'all 0.1s',
          }}>
            {l}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', paddingRight: 4 }}>
          <span style={{ fontSize: 9, color: +roi >= 0 ? C.green : C.red }}>
            ROI {fmt(+roi, 1)}%
          </span>
          <span style={{ fontSize: 9, color: C.red }}>DD −{dd}%</span>
        </div>
      </div>

      {/* Bankroll area chart */}
      {view === 'bankroll' && (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="bankGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C.amber} stopOpacity={0.25} />
                <stop offset="95%" stopColor={C.amber} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C.blue} stopOpacity={0.12} />
                <stop offset="95%" stopColor={C.blue} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: C.muted, fontSize: 9 }}
              tickLine={false} axisLine={{ stroke: C.border }} interval={7} />
            <YAxis tick={{ fill: C.muted, fontSize: 9 }}
              tickLine={false} axisLine={false}
              tickFormatter={v => `£${v}`} width={52} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={1000} stroke={C.dim} strokeDasharray="4 4" />
            <Area type="monotone" dataKey="baseline" stroke={C.blue}
              strokeWidth={1} fill="url(#baseGrad)" strokeDasharray="3 3"
              name="Baseline" dot={false} />
            <Area type="monotone" dataKey="bankroll" stroke={C.amber}
              strokeWidth={2} fill="url(#bankGrad)" dot={false} name="Bankroll" />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {/* EV bar chart */}
      {view === 'ev' && (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="week" tick={{ fill: C.muted, fontSize: 9 }}
              tickLine={false} axisLine={{ stroke: C.border }} interval={7} />
            <YAxis tick={{ fill: C.muted, fontSize: 9 }}
              tickLine={false} axisLine={false} width={46}
              tickFormatter={v => (v * 100).toFixed(0) + '%'} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke={C.dim} />
            <Bar dataKey="ev" name="EV" radius={[1, 1, 0, 0]} fill={C.green} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Stats strip */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap:                  1,
        marginTop:            14,
        background:           C.border,
        border:               `1px solid ${C.border}`,
      }}>
        {[
          { label: 'BETS',     value: bets.length },
          { label: 'WIN RATE', value: winRate },
          { label: 'AVG EV',   value: avgEV },
          { label: 'SHARPE',   value: '1.42' },
        ].map(({ label, value }) => (
          <div key={label} style={{
            background:    C.bg2,
            padding:       '8px 12px',
            display:       'flex',
            flexDirection: 'column',
            gap:            3,
          }}>
            <span style={{ fontSize: 8, color: C.muted, letterSpacing: '0.1em' }}>{label}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.white }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

import { C } from '../theme.js'

export default function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background:   C.bg0,
      border:       `1px solid ${C.borderB}`,
      padding:      '10px 14px',
      borderRadius: 2,
      fontSize:     11,
      color:        C.text,
    }}>
      <div style={{ color: C.textD, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(3) : p.value}</strong>
        </div>
      ))}
    </div>
  )
}

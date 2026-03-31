import { C, clr, fmt } from '../theme.js'

export default function StatBadge({ label, value, delta, accent }) {
  return (
    <div style={{
      background:  C.bg2,
      border:      `1px solid ${C.border}`,
      borderLeft:  `3px solid ${accent}`,
      borderRadius: 2,
      padding:     '10px 14px',
      display:     'flex',
      flexDirection:'column',
      gap:          4,
    }}>
      <span style={{
        fontSize:      9,
        color:         C.muted,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <span style={{
        fontSize:   22,
        fontWeight: 700,
        color:      C.white,
        lineHeight: 1,
      }}>
        {value}
      </span>
      {delta !== undefined && (
        <span style={{ fontSize: 10, color: clr(delta) }}>
          {fmt(delta)}
        </span>
      )}
    </div>
  )
}

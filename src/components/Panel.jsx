import { C } from '../theme.js'

export default function Panel({ title, icon, accent, children, style = {}, headerRight }) {
  return (
    <div style={{
      background:   C.bg1,
      border:       `1px solid ${C.border}`,
      borderTop:    `2px solid ${accent || C.border}`,
      borderRadius: 2,
      display:      'flex',
      flexDirection:'column',
      ...style,
    }}>
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '10px 14px',
        borderBottom:   `1px solid ${C.border}`,
        background:     C.bg2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon && <span style={{ fontSize: 13, color: accent || C.textD }}>{icon}</span>}
          <span style={{
            fontSize:      10,
            fontWeight:    600,
            letterSpacing: '0.12em',
            color:         C.textD,
            textTransform: 'uppercase',
          }}>
            {title}
          </span>
        </div>
        {headerRight}
      </div>
      <div style={{ flex: 1, padding: 14 }}>
        {children}
      </div>
    </div>
  )
}

import { C } from '../theme.js'
import { FLUKE_TEAMS } from '../utils/seed.js'
import Tag from './Tag.jsx'

export default function FlukeDetector({ teams = FLUKE_TEAMS }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {teams.map(t => (
        <div key={t.name} style={{
          display:     'flex',
          alignItems:  'center',
          gap:          10,
          padding:     '8px 10px',
          background:  t.fluke > 0.7 ? C.red + '0D' : t.fluke < 0.3 ? C.green + '0D' : 'transparent',
          border:      `1px solid ${t.fluke > 0.7 ? C.red + '33' : t.fluke < 0.3 ? C.green + '22' : C.border}`,
          borderRadius: 2,
        }}>
          <div style={{ width: 76, fontSize: 10, color: C.text, fontWeight: 600 }}>
            {t.name}
          </div>

          {/* Progress bar */}
          <div style={{ flex: 1, height: 6, background: C.bg3, borderRadius: 1, overflow: 'hidden' }}>
            <div style={{
              width:        `${t.fluke * 100}%`,
              height:       '100%',
              background:   t.fluke > 0.7 ? C.red : t.fluke > 0.4 ? C.amber : C.green,
              borderRadius:  1,
              transition:   'width 0.6s ease',
            }} />
          </div>

          {/* Score */}
          <div style={{
            width:      32,
            textAlign: 'right',
            fontSize:   10,
            color:      t.fluke > 0.7 ? C.red : t.fluke < 0.3 ? C.green : C.amberL,
            fontWeight: 700,
          }}>
            {(t.fluke * 100).toFixed(0)}
          </div>

          <Tag color={t.fluke > 0.7 ? C.red : t.fluke < 0.3 ? C.green : C.amber}>
            {t.fluke > 0.7 ? 'FADE' : t.fluke < 0.3 ? 'BACK' : 'WATCH'}
          </Tag>

          <div style={{ fontSize: 9, color: C.muted, minWidth: 72, textAlign: 'right' }}>
            xG {t.luck >= 0 ? '+' : ''}{t.luck.toFixed(1)}
          </div>
        </div>
      ))}

      {/* Formula footnote */}
      <div style={{
        fontSize:   9,
        color:      C.textDD,
        marginTop:  4,
        lineHeight: 1.7,
        borderTop:  `1px solid ${C.border}`,
        paddingTop:  8,
      }}>
        FLUKE = 0.4·LUCK + 0.25·(1−P_INDEX) + 0.25·xG_RATIO + 0.10·VOL
      </div>
    </div>
  )
}

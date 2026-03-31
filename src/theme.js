// ─── Design Tokens ────────────────────────────────────────────────────────────
export const C = {
  bg0:    '#080B0F',   // deepest background
  bg1:    '#0D1117',   // panel background
  bg2:    '#131920',   // panel header / alt rows
  bg3:    '#1A2230',   // input background
  border: '#1E2D3D',
  borderB:'#243447',

  amber:  '#F0A500',
  amberD: '#C07800',
  amberL: '#FFD166',

  green:  '#00C896',
  greenD: '#009970',

  red:    '#E8445A',
  blue:   '#3B8EEA',

  muted:  '#4A6080',
  dim:    '#2A3F55',

  text:   '#C8D8E8',
  textD:  '#7A9AB8',
  textDD: '#3A5570',
  white:  '#EEF4FA',
}

export const clr = (n) => n > 0 ? C.green : n === 0 ? C.textD : C.red
export const fmt  = (n, d = 2) => (n >= 0 ? '+' : '') + Number(n).toFixed(d)
export const pct  = (n) => (n * 100).toFixed(1) + '%'

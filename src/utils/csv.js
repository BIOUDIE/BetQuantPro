import Papa from 'papaparse'

// Required fields for full analysis
export const REQUIRED_FIELDS = ['home_team', 'away_team', 'home_goals', 'away_goals']

// Optional but scored fields
export const SCORED_FIELDS = [
  'home_xg', 'away_xg',
  'home_possession', 'away_possession',
  'home_shots_on_target', 'away_shots_on_target',
  'home_corners', 'away_corners',
  'home_yellow_cards', 'away_yellow_cards',
  'home_red_cards', 'away_red_cards',
  'home_fouls', 'away_fouls',
  'odds_home_win', 'odds_draw', 'odds_away_win',
  'result', 'calc', 'impl', 'gap', 'ev', 'kelly', 'odds',
]

/**
 * Parse CSV text → array of match objects
 */
export function parseCSV(text) {
  const result = Papa.parse(text, {
    header:        true,
    skipEmptyLines: true,
    dynamicTyping: true,
    transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })
  return { data: result.data, errors: result.errors, fields: result.meta.fields }
}

/**
 * Parse JSON text → array of match objects
 */
export function parseJSON(text) {
  try {
    const raw = JSON.parse(text)
    const data = Array.isArray(raw) ? raw : raw.matches ?? raw.data ?? []
    return { data, errors: [] }
  } catch (e) {
    return { data: [], errors: [{ message: e.message }] }
  }
}

/**
 * Validate parsed rows — returns { valid, issues }
 */
export function validateData(rows) {
  const issues = []
  if (!rows || rows.length === 0) {
    issues.push({ type: 'error', msg: 'No data rows found' })
    return { valid: false, issues }
  }

  const keys = Object.keys(rows[0]).map(k => k.toLowerCase())
  const missing = REQUIRED_FIELDS.filter(f => !keys.includes(f))
  if (missing.length > 0) {
    issues.push({ type: 'error', msg: `Missing required columns: ${missing.join(', ')}` })
  }

  const optional = SCORED_FIELDS.filter(f => keys.includes(f))
  const coverage = Math.round((optional.length / SCORED_FIELDS.length) * 100)
  issues.push({ type: 'info', msg: `${rows.length} rows loaded • ${optional.length}/${SCORED_FIELDS.length} analysis fields detected (${coverage}% coverage)` })

  if (coverage < 30) {
    issues.push({ type: 'warning', msg: 'Low field coverage — xG, possession and odds columns recommended for full analysis' })
  }

  return { valid: missing.length === 0, issues, coverage, rowCount: rows.length }
}

/**
 * Generate a sample CSV the user can download as a template
 */
export function generateSampleCSV() {
  const header = [
    'home_team','away_team','home_goals','away_goals',
    'home_xg','away_xg','home_possession','away_possession',
    'home_shots_on_target','away_shots_on_target',
    'home_corners','away_corners',
    'home_yellow_cards','away_yellow_cards',
    'home_red_cards','away_red_cards',
    'home_fouls','away_fouls',
    'odds_home_win','odds_draw','odds_away_win',
    'calc','impl','gap','ev','kelly','odds','result'
  ]
  const rows = [
    ['Arsenal','Chelsea',2,1,1.8,0.9,58,42,7,3,8,4,2,3,0,0,11,14,2.10,3.40,3.80,0.52,0.48,0.04,0.09,0.045,2.10,'WIN'],
    ['Man City','Liverpool',1,1,2.2,1.4,62,38,9,5,10,3,1,2,0,0,9,12,1.75,3.60,4.50,0.61,0.57,0.04,0.07,0.040,1.75,'LOSS'],
    ['Napoli','Inter',3,0,2.6,0.7,55,45,8,2,9,5,3,1,0,1,13,10,2.30,3.20,3.10,0.48,0.43,0.05,0.10,0.050,2.30,'WIN'],
    ['PSG','Lyon',2,2,1.9,1.6,65,35,6,4,7,3,2,4,0,0,10,16,1.60,3.80,5.50,0.66,0.63,0.03,0.05,0.030,1.60,'LOSS'],
    ['Dortmund','Bayern',0,2,1.1,2.4,44,56,4,9,5,8,3,1,1,0,15,9,3.40,3.30,2.10,0.32,0.29,0.03,0.06,0.030,2.10,'LOSS'],
  ]
  return [header, ...rows].map(r => r.join(',')).join('\n')
}

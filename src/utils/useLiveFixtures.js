// src/utils/useLiveFixtures.js
// Shared hook — fetches live fixtures once and caches them
// Used by MarketAnalyzer, BookingsAnalyzer, ParlayBuilder, PicksView

import { useState, useCallback } from 'react'

// Global cache so multiple tabs don't re-fetch
const cache = { data: null, date: null, ts: 0 }
const CACHE_TTL = 5 * 60 * 1000  // 5 minutes

export function useLiveFixtures() {
  const [fixtures,  setFixtures]  = useState(cache.data?.fixtures ?? [])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [meta,      setMeta]      = useState(cache.data ? { date:cache.data.date, total:cache.data.total, dateLabel:cache.data.dateLabel } : null)

  const fetchFixtures = useCallback(async (dateParam = 'today') => {
    // Return cached data if fresh and same date
    const now = Date.now()
    if (cache.data && cache.date === dateParam && now - cache.ts < CACHE_TTL) {
      setFixtures(cache.data.fixtures)
      setMeta({ date:cache.data.date, total:cache.data.total, dateLabel:cache.data.dateLabel })
      return cache.data
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/picks?date=${dateParam}`)
      const d   = await res.json().catch(() => ({ error: true, errorMessage: res.statusText }))

      if (d.error) {
        setError(d)
        setLoading(false)
        return null
      }

      // Cache it
      cache.data = d
      cache.date = dateParam
      cache.ts   = Date.now()

      setFixtures(d.fixtures ?? [])
      setMeta({ date:d.date, total:d.total, dateLabel:d.dateLabel })
      setLoading(false)
      return d
    } catch(e) {
      setError({ errorMessage: e.message })
      setLoading(false)
      return null
    }
  }, [])

  return { fixtures, loading, error, meta, fetchFixtures }
}

// ── Transform live fixture data for MarketAnalyzer format ────────────────────
export function fixtureToMarketData(fix) {
  return {
    id:              fix.id,
    match:           fix.name,
    league:          fix.league,
    kickoff:         new Date(fix.kickoff).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
    homeTeam:        fix.homeTeam?.name,
    awayTeam:        fix.awayTeam?.name,
    isDerby:         false,
    matchImportance: 'Regular',
    referee:         fix.referee ?? 'TBC',
    refStrictness:   68,
    // Use live exp data from picks engine
    homeXG:          fix.exp?.homeGoals ?? 1.4,
    awayXG:          fix.exp?.awayGoals ?? 1.1,
    homeGoalsAvg:    fix.exp?.homeGoals ?? 1.4,
    awayGoalsAvg:    fix.exp?.awayGoals ?? 1.1,
    homeGoalsConcAvg:fix.exp?.awayGoals ?? 1.1,
    awayGoalsConcAvg:fix.exp?.homeGoals ?? 1.4,
    homeWinProb:     fix.result?.p1 ?? 0.42,
    drawProb:        fix.result?.px ?? 0.28,
    awayWinProb:     fix.result?.p2 ?? 0.30,
    homeCorners:     (fix.exp?.corners ?? 10.2) * 0.52,
    awayCorners:     (fix.exp?.corners ?? 10.2) * 0.48,
    homeAttacking:   1.0,
    awayAttacking:   0.9,
    homeYellow:      (fix.exp?.cards ?? 3.5) / 2,
    awayYellow:      (fix.exp?.cards ?? 3.5) / 2,
    homeRed:         0.06,
    awayRed:         0.06,
    homeFouls:       11.0,
    awayFouls:       10.5,
    homeShotsAvg:    13.0,
    awayShotsAvg:    11.0,
    homeShotsOnTgt:  4.8,
    awayShotsOnTgt:  4.1,
    homeOffsides:    2.4,
    awayOffsides:    2.1,
    homePressure:    0.55,
    leagueAvgPens:   0.28,
    leagueAvgCorners:fix.exp?.corners ?? 10.2,
  }
}

// ── Transform live fixture data for BookingsAnalyzer format ─────────────────
export function fixtureToBookingData(fix) {
  const expCards = fix.exp?.cards ?? 3.5
  return {
    id:              `live-${fix.id}`,
    match:           fix.name,
    league:          fix.league,
    referee:         fix.referee ?? 'TBC',
    isDerby:         false,
    matchImportance: 'Regular',
    kickoff:         new Date(fix.kickoff).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
    homeTeam: {
      name:           fix.homeTeam?.name ?? 'Home',
      avgYellow:      parseFloat((expCards/2).toFixed(1)),
      avgFouls:       11.0,
      lastFiveCards:  [Math.round(expCards/2), Math.round(expCards/2), Math.round(expCards/2+0.5), Math.round(expCards/2), Math.round(expCards/2)],
    },
    awayTeam: {
      name:           fix.awayTeam?.name ?? 'Away',
      avgYellow:      parseFloat((expCards/2).toFixed(1)),
      avgFouls:       10.5,
      lastFiveCards:  [Math.round(expCards/2), Math.round(expCards/2+0.5), Math.round(expCards/2), Math.round(expCards/2), Math.round(expCards/2+0.5)],
    },
    odds: {
      over35:  1.80, under35: 1.95,
      over45:  2.80, under45: 1.42,
      homeMoreCards: 2.20, awayMoreCards: 1.65,
    },
  }
}

// ── Transform for ParlayBuilder format ───────────────────────────────────────
export function fixtureToParlayLeg(fix, index) {
  const top = fix.topPick
  if (!top) return null
  return {
    id:         `live-${fix.id}`,
    match:       fix.name,
    market:      top.market,
    odds:        top.odds,
    prob:        top.prob,
    ev:          top.ev,
    confidence:  (top.ev||0)>0.08?'HIGH':(top.ev||0)>0.03?'MEDIUM':'LOW',
    league:      fix.league,
    selected:    false,
  }
}

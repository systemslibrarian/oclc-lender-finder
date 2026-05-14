// Scoring engine, ported verbatim from the vanilla app. Pure functions.

import type { MergedLender, MonthReport, Subscores, Weights } from './types';

export const DEFAULT_WEIGHTS: Weights = { speed: 25, fill: 30, volume: 15, consistency: 20, local: 10 };

export const PRESETS: Record<string, Weights> = {
  balanced:  { speed: 25, fill: 30, volume: 15, consistency: 20, local: 10 },
  speed:     { speed: 45, fill: 25, volume: 10, consistency: 15, local: 5 },
  trusted:   { speed: 15, fill: 30, volume: 20, consistency: 30, local: 5 },
  samestate: { speed: 25, fill: 15, volume: 5,  consistency: 5,  local: 50 },
  workhorses:{ speed: 5,  fill: 20, volume: 40, consistency: 30, local: 5 },
  newcomers: { speed: 30, fill: 40, volume: 10, consistency: 5,  local: 15 }
};

export const PRESET_LABELS: Record<string, { label: string; description: string }> = {
  balanced:   { label: 'Balanced',     description: 'Even weights across speed, fill, volume, consistency, local — the safe default.' },
  speed:      { label: 'Speed first',  description: 'Fast turnaround matters most — good for rush articles and time-sensitive ILL.' },
  trusted:    { label: 'Trusted',      description: 'Track record over time — prioritizes lenders with high fill rate and consistent monthly presence.' },
  samestate:  { label: 'Same-state',   description: 'Maximizes the same-state boost — useful when you want regional partners first.' },
  workhorses: { label: 'Workhorses',   description: 'Volume and consistency — surfaces the big, dependable lenders that handle most of your traffic.' },
  newcomers:  { label: 'Newcomers OK', description: "Fill rate over consistency — won't penalize lenders you've only used a few months." }
};

export function fillRate(l: Pick<MergedLender, 'filled' | 'requested'>): number {
  if (l.requested === 0) return 0;
  return Math.min(100, (l.filled / l.requested) * 100);
}

export function avgDays(l: Pick<MergedLender, 'avgHours'>): number {
  return l.avgHours / 24;
}

export function consistencyPct(l: Pick<MergedLender, 'monthsPresent' | 'monthsSpan'>): number {
  return l.monthsSpan > 0 ? (l.monthsPresent / l.monthsSpan) * 100 : 0;
}

export function subscores(l: MergedLender, homeState: string): Subscores {
  const days = avgDays(l);
  return {
    speed: l.filled > 0 && days > 0 ? Math.max(0, Math.min(100, Math.round(100 - (days - 1) * 18))) : 0,
    fill: Math.round(fillRate(l)),
    volume: Math.min(100, Math.round((l.filled / 30) * 100)),
    consistency: Math.round(consistencyPct(l)),
    local: l.state === homeState ? 100 : 0
  };
}

export function normalizedWeights(weights: Weights): Weights {
  const total = (Object.values(weights).reduce((a, b) => a + b, 0) as number) || 1;
  return {
    speed: weights.speed / total,
    fill: weights.fill / total,
    volume: weights.volume / total,
    consistency: weights.consistency / total,
    local: weights.local / total
  };
}

export function totalScore(l: MergedLender, weights: Weights, homeState: string): number {
  const s = subscores(l, homeState);
  const w = normalizedWeights(weights);
  return Math.round(
    s.speed * w.speed +
      s.fill * w.fill +
      s.volume * w.volume +
      s.consistency * w.consistency +
      s.local * w.local
  );
}

export function mergeMonths(months: MonthReport[]): MergedLender[] {
  const bySym = new Map<string, MergedLender>();
  months.forEach((m, monthIdx) => {
    m.rows.forEach(r => {
      let agg = bySym.get(r.symbol);
      if (!agg) {
        agg = {
          name: r.name,
          symbol: r.symbol,
          state: r.state,
          type: r.type,
          requested: 0,
          filled: 0,
          unfilled: 0,
          weightedHours: 0,
          hoursFilledCount: 0,
          monthsPresent: 0,
          filledMonths: [],
          requestedMonths: [],
          avgHours: 0,
          monthsSpan: months.length
        };
        bySym.set(r.symbol, agg);
      }
      agg.requested += r.requested;
      agg.filled += r.filled;
      agg.unfilled += r.unfilled;
      if (r.avgHours > 0 && r.filled > 0) {
        agg.weightedHours += r.avgHours * r.filled;
        agg.hoursFilledCount += r.filled;
      }
      agg.monthsPresent += 1;
      agg.filledMonths[monthIdx] = r.filled;
      agg.requestedMonths[monthIdx] = r.requested;
    });
  });
  const out: MergedLender[] = [];
  bySym.forEach(l => {
    l.avgHours = l.hoursFilledCount > 0 ? l.weightedHours / l.hoursFilledCount : 0;
    out.push(l);
  });
  return out;
}

export function haversineKm(lat1: number | null, lng1: number | null, lat2: number | null, lng2: number | null): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function kmToMiles(km: number): number {
  return km * 0.621371;
}

export interface RangeAggregate {
  name: string;
  state: string;
  type: string;
  requested: number;
  filled: number;
  unfilled: number;
  weightedHours: number;
  hoursFilledCount: number;
  avgHours: number;
}

// Aggregate a subset of months into a per-symbol Map. Used by the
// Compare-periods modal — separate from mergeMonths because it operates
// on an arbitrary subset rather than the full loaded set.
export function aggregateRangeStats(
  months: MonthReport[],
  monthIndices: number[]
): Map<string, RangeAggregate> {
  const bySym = new Map<string, RangeAggregate>();
  monthIndices.forEach((idx) => {
    const m = months[idx];
    if (!m) return;
    m.rows.forEach((r) => {
      let agg = bySym.get(r.symbol);
      if (!agg) {
        agg = {
          name: r.name,
          state: r.state,
          type: r.type,
          requested: 0,
          filled: 0,
          unfilled: 0,
          weightedHours: 0,
          hoursFilledCount: 0,
          avgHours: 0
        };
        bySym.set(r.symbol, agg);
      }
      agg.requested += r.requested;
      agg.filled += r.filled;
      agg.unfilled += r.unfilled;
      if (r.avgHours > 0 && r.filled > 0) {
        agg.weightedHours += r.avgHours * r.filled;
        agg.hoursFilledCount += r.filled;
      }
    });
  });
  bySym.forEach((agg) => {
    agg.avgHours = agg.hoursFilledCount > 0 ? agg.weightedHours / agg.hoursFilledCount : 0;
  });
  return bySym;
}

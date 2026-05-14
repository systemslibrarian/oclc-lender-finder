// Synthetic Borrower-report data for the empty-state "Try sample data"
// button. Three months of plausible numbers across a curated set of
// well-known lenders so users can play with the app without uploading
// real OCLC data.

import type { MonthReport } from './types';

interface SampleLender {
  name: string;
  symbol: string;
  state: string;
  type: string;
  // base monthly numbers — we'll jitter per month
  baseRequested: number;
  baseFilled: number;
  baseHours: number; // avg turnaround hours when filled
}

const SAMPLE: SampleLender[] = [
  { name: 'University of Florida',                    symbol: 'FUG', state: 'FL', type: 'Academic',   baseRequested: 18, baseFilled: 15, baseHours: 36 },
  { name: 'Florida State University',                 symbol: 'FDA', state: 'FL', type: 'Academic',   baseRequested: 14, baseFilled: 12, baseHours: 42 },
  { name: 'University of South Florida',              symbol: 'SFU', state: 'FL', type: 'Academic',   baseRequested: 9,  baseFilled: 7,  baseHours: 60 },
  { name: 'Orange County Library System',             symbol: 'FOC', state: 'FL', type: 'Public',     baseRequested: 6,  baseFilled: 5,  baseHours: 30 },
  { name: 'Jacksonville Public Library',              symbol: 'FJV', state: 'FL', type: 'Public',     baseRequested: 5,  baseFilled: 4,  baseHours: 48 },
  { name: 'University of Georgia Libraries',          symbol: 'GUA', state: 'GA', type: 'Academic',   baseRequested: 12, baseFilled: 11, baseHours: 38 },
  { name: 'Emory University',                         symbol: 'EMU', state: 'GA', type: 'Academic',   baseRequested: 8,  baseFilled: 6,  baseHours: 72 },
  { name: 'University of Tennessee, Knoxville',       symbol: 'TKN', state: 'TN', type: 'Academic',   baseRequested: 10, baseFilled: 8,  baseHours: 50 },
  { name: 'Vanderbilt University',                    symbol: 'TJC', state: 'TN', type: 'Academic',   baseRequested: 7,  baseFilled: 5,  baseHours: 90 },
  { name: 'University of Virginia',                   symbol: 'VA@', state: 'VA', type: 'Academic',   baseRequested: 9,  baseFilled: 7,  baseHours: 64 },
  { name: 'University of North Carolina, Chapel Hill', symbol: 'NOC', state: 'NC', type: 'Academic',   baseRequested: 11, baseFilled: 9,  baseHours: 44 },
  { name: 'New York Public Library',                  symbol: 'NYP', state: 'NY', type: 'Public',     baseRequested: 4,  baseFilled: 3,  baseHours: 96 },
  { name: 'Library of Congress',                      symbol: 'DLC', state: 'DC', type: 'Government', baseRequested: 3,  baseFilled: 2,  baseHours: 120 },
  { name: 'Linda Hall Library',                       symbol: 'LHL', state: 'MO', type: 'Special',    baseRequested: 5,  baseFilled: 5,  baseHours: 32 },
  { name: 'Center for Research Libraries',            symbol: 'CRL', state: 'IL', type: 'Consortium', baseRequested: 6,  baseFilled: 5,  baseHours: 28 }
];

// Deterministic jitter so each "load sample" call produces the same numbers.
function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function loadSampleMonths(): MonthReport[] {
  const periods = ['2026-01', '2026-02', '2026-03'];
  const rnd = seededRandom(42);
  return periods.map((period, periodIdx) => ({
    period,
    institution: 'Sample Institution',
    rows: SAMPLE.map((s) => {
      // Per-month jitter: ±25% on volume, ±15% on speed
      const reqJitter = 0.75 + rnd() * 0.5;
      const fillJitter = 0.75 + rnd() * 0.5;
      const speedJitter = 0.85 + rnd() * 0.3;
      const requested = Math.max(0, Math.round(s.baseRequested * reqJitter));
      const filled = Math.min(requested, Math.max(0, Math.round(s.baseFilled * fillJitter)));
      const avgHours = filled > 0 ? Math.round(s.baseHours * speedJitter) : 0;
      // Slight upward trend over time so Compare-periods shows movement
      const trend = 1 + (periodIdx - 1) * 0.06;
      return {
        name: s.name,
        symbol: s.symbol,
        state: s.state,
        type: s.type,
        requested: Math.round(requested * trend),
        filled: Math.round(filled * trend),
        unfilled: Math.max(0, Math.round(requested * trend) - Math.round(filled * trend)),
        avgHours
      };
    })
  }));
}

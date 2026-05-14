// Audit-tab specific helpers.

import type { AuditTier } from './types';

export const HIST_LABELS: Record<string, string> = {
  filled: 'Filled ≥ 1',
  multi: 'Filled ≥ 5',
  fast: 'Avg < 3 days',
  reliable: 'Fill > 75%',
  consistent: '3+ months'
};

export const TIER_META: Record<AuditTier, { label: string; description: string }> = {
  top:    { label: 'Top',    description: 'Composite score ≥ 70 — keep.' },
  strong: { label: 'Strong', description: '50–69 — solid contributor.' },
  weak:   { label: 'Weak',   description: '1–49 — consider replacing.' },
  unused: { label: 'Unused', description: 'Not in your loaded reports — never borrowed from.' }
};

export function auditTierForScore(score: number, inReport: boolean): AuditTier {
  if (!inReport) return 'unused';
  if (score >= 70) return 'top';
  if (score >= 50) return 'strong';
  return 'weak';
}

export function parseAuditInput(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  text.split(/[\s,;]+/).forEach(t => {
    const sym = t.trim().toUpperCase();
    if (!sym || seen.has(sym)) return;
    seen.add(sym);
    out.push(sym);
  });
  return out;
}

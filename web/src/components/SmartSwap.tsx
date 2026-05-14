// Smart Swap: analyzes the audit holdings against loaded reports + the
// directory and surfaces Keep / Drop / Add suggestions. Lives as a view
// mode on the Audit tab — see web/src/tabs/Audit.tsx for wiring.

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, ArrowRight } from 'lucide-react';
import type { DirectoryEntry, MergedLender, Weights } from '@/lib/types';
import { avgDays, fillRate, mergeMonths, subscores, totalScore } from '@/lib/scoring';
import type { MonthReport } from '@/lib/types';
import { mergeDirectory } from '@/lib/directory';
import { ALLOWED_GROUPS } from '@/lib/directory';

interface Props {
  holdings: string[];
  months: MonthReport[];
  directorySources: {
    bundled: DirectoryEntry[];
    imported: DirectoryEntry[];
    policies: Record<string, Map<string, import('@/lib/types').PolicyEntry>>;
  };
  weights: Weights;
  homeState: string;
  onAdd: (sym: string) => void;
  onDrop: (sym: string) => void;
}

interface Profile {
  count: number;
  withReports: number;
  topType: string;
  states: Set<string>;
  groups: Set<string>;
  avgFillRate: number | null;
  avgDays: number | null;
}

interface DropSuggestion {
  symbol: string;
  name: string;
  state: string;
  type: string;
  score: number;
  fillRate: number | null;
  days: number | null;
  reason: string;
  groupAvgDaysAfter: number | null;
  groupAvgFillAfter: number | null;
}

interface AddSuggestion {
  symbol: string;
  name: string;
  state: string;
  type: string;
  matchScore: number;
  matchReasons: string[];
  reportScore: number | null;
  fillRate: number | null;
  days: number | null;
  loansDays: number | null;
}

function buildProfile(holdings: string[], reportBySym: Map<string, MergedLender>, dirBySym: Map<string, DirectoryEntry>): Profile {
  const states = new Set<string>();
  const groups = new Set<string>();
  const typeCounts: Record<string, number> = {};
  let withReports = 0;
  let fillSum = 0;
  let fillCount = 0;
  let daysSum = 0;
  let daysCount = 0;

  holdings.forEach((sym) => {
    const r = reportBySym.get(sym);
    const d = dirBySym.get(sym);
    const st = r?.state || d?.state;
    if (st) states.add(st);
    (d?.groups || []).forEach((g) => { if (ALLOWED_GROUPS.has(g)) groups.add(g); });
    const t = r?.type || d?.type;
    if (t) typeCounts[t] = (typeCounts[t] || 0) + 1;
    if (r) {
      withReports += 1;
      if (r.requested > 0) { fillSum += fillRate(r); fillCount += 1; }
      if (r.filled > 0) { daysSum += avgDays(r); daysCount += 1; }
    }
  });
  let topType = 'Other';
  let topN = 0;
  Object.entries(typeCounts).forEach(([t, n]) => { if (n > topN) { topType = t; topN = n; } });
  return {
    count: holdings.length,
    withReports,
    topType,
    states,
    groups,
    avgFillRate: fillCount > 0 ? fillSum / fillCount : null,
    avgDays: daysCount > 0 ? daysSum / daysCount : null
  };
}

export function SmartSwap({
  holdings,
  months,
  directorySources,
  weights,
  homeState,
  onAdd,
  onDrop
}: Props) {
  const merged = useMemo(() => mergeMonths(months), [months]);
  const reportBySym = useMemo(() => new Map(merged.map((l) => [l.symbol, l])), [merged]);
  const directory = useMemo(() => mergeDirectory(directorySources), [directorySources]);
  const dirBySym = useMemo(() => new Map(directory.map((l) => [l.symbol, l])), [directory]);
  const holdingsSet = useMemo(() => new Set(holdings), [holdings]);

  const profile = useMemo(
    () => buildProfile(holdings, reportBySym, dirBySym),
    [holdings, reportBySym, dirBySym]
  );

  // Bucket current holdings into Keep (Top) / Drop (Weak + Unused / never filled)
  const { keepRows, dropRows } = useMemo(() => {
    const keepRows: { symbol: string; name: string; state: string; type: string; score: number; fillRate: number | null; days: number | null }[] = [];
    const dropRows: DropSuggestion[] = [];

    holdings.forEach((sym) => {
      const r = reportBySym.get(sym);
      const d = dirBySym.get(sym);
      const inReport = !!r;
      const score = inReport ? totalScore(r, weights, homeState) : 0;
      const name = r?.name || d?.name || sym;
      const state = r?.state || d?.state || '—';
      const type = r?.type || d?.type || '—';
      const fr = r && r.requested > 0 ? fillRate(r) : null;
      const dv = r && r.filled > 0 ? avgDays(r) : null;

      if (inReport && score >= 70) {
        keepRows.push({ symbol: sym, name, state, type, score, fillRate: fr, days: dv });
      } else if (!inReport) {
        dropRows.push({
          symbol: sym, name, state, type, score, fillRate: fr, days: dv,
          reason: 'Never appears in your reports — never borrowed from',
          groupAvgDaysAfter: null,
          groupAvgFillAfter: null
        });
      } else if (score < 50) {
        // Estimate group average if we drop this lender
        const groupAvgDaysAfter = recomputeGroupAvg(holdings, sym, reportBySym, 'days');
        const groupAvgFillAfter = recomputeGroupAvg(holdings, sym, reportBySym, 'fill');
        const dropReasonParts: string[] = [];
        if (fr != null && fr < 50) dropReasonParts.push(`fill rate ${fr.toFixed(0)}%`);
        if (dv != null && dv > 5) dropReasonParts.push(`avg ${dv.toFixed(1)}d turnaround`);
        if (dropReasonParts.length === 0) dropReasonParts.push(`composite score ${score}`);
        dropRows.push({
          symbol: sym, name, state, type, score, fillRate: fr, days: dv,
          reason: dropReasonParts.join(' · '),
          groupAvgDaysAfter,
          groupAvgFillAfter
        });
      }
    });
    return { keepRows, dropRows };
  }, [holdings, reportBySym, dirBySym, weights, homeState]);

  const addRows = useMemo<AddSuggestion[]>(() => {
    if (profile.count === 0) return [];
    const out: AddSuggestion[] = [];
    directory.forEach((c) => {
      if (holdingsSet.has(c.symbol)) return;
      const matchReasons: string[] = [];
      let matchScore = 0;
      if (c.state && profile.states.has(c.state)) {
        matchScore += 30; matchReasons.push(`same state (${c.state})`);
      }
      if (c.groups && c.groups.some((g) => profile.groups.has(g))) {
        const shared = c.groups.filter((g) => profile.groups.has(g))[0];
        matchScore += 25; matchReasons.push(`shares ${shared}`);
      }
      if (c.type && c.type === profile.topType) {
        matchScore += 15; matchReasons.push(`${profile.topType} like majority`);
      }
      const r = reportBySym.get(c.symbol);
      let reportScore: number | null = null;
      let fr: number | null = null;
      let dv: number | null = null;
      if (r) {
        reportScore = totalScore(r, weights, homeState);
        fr = r.requested > 0 ? fillRate(r) : null;
        dv = r.filled > 0 ? avgDays(r) : null;
        const s = subscores(r, homeState);
        // Bonus for proven performers: high fill + fast
        if (fr != null && fr >= 75) { matchScore += 20; matchReasons.push(`fills ${fr.toFixed(0)}%`); }
        if (s.speed >= 80) { matchScore += 15; matchReasons.push(`fast (${dv != null ? dv.toFixed(1) : '?'}d)`); }
      } else {
        // Untested lender — small handicap, but still a fine pick if profile matches well
        matchScore -= 5;
      }
      // OCLC stated speed as a fallback signal
      if (typeof c.loansDaysToRespond === 'number' && c.loansDaysToRespond <= 3) {
        matchScore += 5; matchReasons.push(`OCLC says ${c.loansDaysToRespond}d loans`);
      }
      if (matchScore <= 0) return;
      out.push({
        symbol: c.symbol,
        name: c.name,
        state: c.state || '—',
        type: c.type || '—',
        matchScore,
        matchReasons,
        reportScore,
        fillRate: fr,
        days: dv,
        loansDays: typeof c.loansDaysToRespond === 'number' ? c.loansDaysToRespond : null
      });
    });
    out.sort((a, b) => b.matchScore - a.matchScore);
    return out.slice(0, 12);
  }, [directory, holdingsSet, profile, reportBySym, weights, homeState]);

  if (profile.count === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Paste a holdings group first.</p>
          <p className="mt-2">Tune mode analyzes your current group against the directory and your loaded Borrower reports.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Group profile</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
            <span><strong className="text-foreground tabular-nums">{profile.count}</strong> members</span>
            <span>Mostly <strong className="text-foreground">{profile.topType}</strong></span>
            <span>
              {profile.states.size > 0 && (
                <>Across <strong className="text-foreground">{profile.states.size}</strong> state{profile.states.size === 1 ? '' : 's'}</>
              )}
            </span>
            {profile.groups.size > 0 && (
              <span>Groups: {[...profile.groups].map((g) => <Badge key={g} variant="outline" className="ml-1 font-normal">{g}</Badge>)}</span>
            )}
            {profile.avgFillRate != null && (
              <span>Avg fill <strong className="text-foreground">{profile.avgFillRate.toFixed(0)}%</strong></span>
            )}
            {profile.avgDays != null && (
              <span>Avg turnaround <strong className="text-foreground">{profile.avgDays.toFixed(1)}d</strong></span>
            )}
            <span className="text-xs">({profile.withReports} of {profile.count} have report data)</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Column title="Keep" count={keepRows.length} tone="positive">
          {keepRows.length === 0 ? (
            <Empty>No Top-tier members yet — they appear here once their composite score ≥ 70.</Empty>
          ) : (
            keepRows.map((r) => (
              <MiniCard key={r.symbol} tone="positive">
                <CardHead name={r.name} symbol={r.symbol} sub={`${r.type} · ${r.state}`} right={<Score v={r.score} />} />
                <StatLine fillRate={r.fillRate} days={r.days} />
              </MiniCard>
            ))
          )}
        </Column>

        <Column title="Drop" count={dropRows.length} tone="negative">
          {dropRows.length === 0 ? (
            <Empty>No weak or unused members detected. 👍</Empty>
          ) : (
            dropRows.map((r) => (
              <MiniCard key={r.symbol} tone="negative">
                <CardHead
                  name={r.name}
                  symbol={r.symbol}
                  sub={`${r.type} · ${r.state}`}
                  right={
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" aria-label={`Drop ${r.symbol}`} onClick={() => onDrop(r.symbol)}>
                      <X className="h-4 w-4" />
                    </Button>
                  }
                />
                <div className="mt-1 text-xs text-muted-foreground">{r.reason}</div>
                <StatLine fillRate={r.fillRate} days={r.days} />
                {(r.groupAvgDaysAfter != null && profile.avgDays != null) && (
                  <ImpactLine label="Group avg days" before={profile.avgDays} after={r.groupAvgDaysAfter} unit="d" improvingDirection="down" />
                )}
                {(r.groupAvgFillAfter != null && profile.avgFillRate != null) && (
                  <ImpactLine label="Group avg fill" before={profile.avgFillRate} after={r.groupAvgFillAfter} unit="%" improvingDirection="up" />
                )}
              </MiniCard>
            ))
          )}
        </Column>

        <Column title="Add" count={addRows.length} tone="neutral">
          {addRows.length === 0 ? (
            <Empty>No strong profile matches in the directory. Try loading more Borrower reports or expanding your group.</Empty>
          ) : (
            addRows.map((r) => (
              <MiniCard key={r.symbol}>
                <CardHead
                  name={r.name}
                  symbol={r.symbol}
                  sub={`${r.type} · ${r.state}`}
                  right={
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-700" aria-label={`Add ${r.symbol}`} onClick={() => onAdd(r.symbol)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  }
                />
                <div className="mt-1 flex flex-wrap gap-1">
                  {r.matchReasons.map((reason, i) => (
                    <Badge key={i} variant="secondary" className="font-normal text-[10px]">{reason}</Badge>
                  ))}
                </div>
                {(r.fillRate != null || r.days != null) && <StatLine fillRate={r.fillRate} days={r.days} />}
              </MiniCard>
            ))
          )}
        </Column>
      </div>
    </div>
  );
}

function recomputeGroupAvg(
  holdings: string[],
  excluding: string,
  reportBySym: Map<string, MergedLender>,
  metric: 'days' | 'fill'
): number | null {
  let sum = 0;
  let count = 0;
  holdings.forEach((sym) => {
    if (sym === excluding) return;
    const r = reportBySym.get(sym);
    if (!r) return;
    if (metric === 'days') {
      if (r.filled > 0) { sum += avgDays(r); count += 1; }
    } else {
      if (r.requested > 0) { sum += fillRate(r); count += 1; }
    }
  });
  return count > 0 ? sum / count : null;
}

// ---------- UI helpers ----------

const TONE: Record<string, string> = {
  positive: 'border-emerald-300 dark:border-emerald-800',
  negative: 'border-amber-300 dark:border-amber-800',
  neutral:  'border-border'
};
const TONE_HEAD: Record<string, string> = {
  positive: 'text-emerald-700 dark:text-emerald-400',
  negative: 'text-amber-700 dark:text-amber-400',
  neutral:  'text-foreground'
};

function Column({ title, count, tone, children }: { title: string; count: number; tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <div className={`rounded-md border ${TONE[tone]} p-3`}>
      <div className={`mb-2 flex items-baseline gap-2 ${TONE_HEAD[tone]}`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide">{title}</h3>
        <span className="text-xs tabular-nums opacity-70">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MiniCard({ tone, children }: { tone?: keyof typeof TONE; children: React.ReactNode }) {
  return <div className={`rounded-md border bg-card p-2.5 text-sm ${tone ? TONE[tone] : ''}`}>{children}</div>;
}

function CardHead({ name, symbol, sub, right }: { name: string; symbol: string; sub: string; right: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{symbol} · {sub}</div>
      </div>
      {right}
    </div>
  );
}

function Score({ v }: { v: number }) {
  const cls =
    v >= 70 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' :
    v >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
    'bg-muted text-muted-foreground';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${cls}`}>{v}</span>;
}

function StatLine({ fillRate, days }: { fillRate: number | null; days: number | null }) {
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {fillRate != null ? `Fill ${fillRate.toFixed(0)}%` : 'Fill —'}
      {' · '}
      {days != null ? `${days.toFixed(1)}d` : '— d'}
    </div>
  );
}

function ImpactLine({
  label,
  before,
  after,
  unit,
  improvingDirection
}: {
  label: string;
  before: number;
  after: number;
  unit: string;
  improvingDirection: 'up' | 'down';
}) {
  const change = after - before;
  const improving = improvingDirection === 'up' ? change > 0 : change < 0;
  const fmt = (n: number) => unit === '%' ? n.toFixed(0) + '%' : n.toFixed(1) + unit;
  const cls = improving ? 'text-emerald-700 dark:text-emerald-400' : change === 0 ? 'text-muted-foreground' : 'text-rose-700 dark:text-rose-400';
  return (
    <div className={`mt-1 flex items-center gap-1 text-xs ${cls}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{fmt(before)}</span>
      <ArrowRight className="h-3 w-3" />
      <span className="tabular-nums font-medium">{fmt(after)}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">{children}</div>;
}

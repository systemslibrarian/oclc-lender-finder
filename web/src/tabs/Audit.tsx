import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Pagination, PageSizeSelect } from '@/components/Pagination';
import { useAppState } from '@/app-state/AppContext';
import { mergeMonths, totalScore } from '@/lib/scoring';
import { mergeDirectory } from '@/lib/directory';
import { parseAuditInput, auditTierForScore, TIER_META } from '@/lib/audit';
import type { AuditTier, MergedLender, DirectoryEntry } from '@/lib/types';

type SortKey = 'score' | 'tier' | 'name' | 'filled' | 'fill' | 'speed';

interface AuditRow {
  symbol: string;
  name: string;
  type: string;
  state: string;
  groups: string[];
  loansDays: number | null;
  copiesDays: number | null;
  requested: number;
  filled: number;
  avgHours: number;
  monthsPresent: number;
  monthsSpan: number;
  score: number;
  tier: AuditTier;
  inReport: boolean;
}

const TIER_STYLES: Record<AuditTier, string> = {
  top:    'bg-green-100 text-green-800 border-transparent dark:bg-green-900/40 dark:text-green-300',
  strong: 'bg-blue-100  text-blue-800  border-transparent dark:bg-blue-900/40  dark:text-blue-300',
  weak:   'bg-amber-100 text-amber-800 border-transparent dark:bg-amber-900/40 dark:text-amber-300',
  unused: 'bg-muted text-muted-foreground border-transparent'
};

const TIER_BORDER: Record<AuditTier, string> = {
  top:    '',
  strong: '',
  weak:   'border-l-4 border-l-amber-500',
  unused: 'border-l-4 border-l-muted-foreground/40'
};

export function AuditTab() {
  const { months, settings, auditHoldings, setAuditHoldings, bundledDirectory, importedDirectory, policies } =
    useAppState();
  const [draft, setDraft] = useState(() => auditHoldings.join(', '));
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(100);
  const listRef = useRef<HTMLDivElement>(null);

  const directory = useMemo(
    () => mergeDirectory({ bundled: bundledDirectory, imported: importedDirectory, policies }),
    [bundledDirectory, importedDirectory, policies]
  );

  const rows = useMemo<AuditRow[]>(() => {
    const merged = mergeMonths(months);
    const reportBySym = new Map<string, MergedLender>(merged.map((l) => [l.symbol, l]));
    const dirBySym = new Map<string, DirectoryEntry>(directory.map((l) => [l.symbol, l]));
    return auditHoldings.map((sym) => {
      const r = reportBySym.get(sym);
      const d = dirBySym.get(sym);
      const inReport = !!r;
      const score = inReport ? totalScore(r, settings.weights, settings.homeState) : 0;
      return {
        symbol: sym,
        name: (r && r.name) || (d && d.name) || sym,
        type: (r && r.type) || (d && d.type) || '—',
        state: (r && r.state) || (d && d.state) || '—',
        groups: (d && d.groups) || [],
        loansDays: d && typeof d.loansDaysToRespond === 'number' ? d.loansDaysToRespond : null,
        copiesDays: d && typeof d.copiesDaysToRespond === 'number' ? d.copiesDaysToRespond : null,
        requested: r ? r.requested : 0,
        filled: r ? r.filled : 0,
        avgHours: r ? r.avgHours : 0,
        monthsPresent: r ? r.monthsPresent : 0,
        monthsSpan: r ? r.monthsSpan : months.length,
        score,
        tier: auditTierForScore(score, inReport),
        inReport
      };
    });
  }, [auditHoldings, months, directory, settings.weights, settings.homeState]);

  const counts = useMemo(() => {
    const c: Record<AuditTier, number> = { top: 0, strong: 0, weak: 0, unused: 0 };
    rows.forEach((r) => c[r.tier]++);
    return c;
  }, [rows]);

  const sorted = useMemo(() => {
    const tierOrder: Record<AuditTier, number> = { top: 0, strong: 1, weak: 2, unused: 3 };
    const fns: Record<SortKey, (a: AuditRow, b: AuditRow) => number> = {
      score: (a, b) => b.score - a.score,
      tier: (a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.score - a.score,
      name: (a, b) => a.name.localeCompare(b.name),
      filled: (a, b) => b.filled - a.filled,
      fill: (a, b) => {
        const fa = a.requested > 0 ? a.filled / a.requested : -1;
        const fb = b.requested > 0 ? b.filled / b.requested : -1;
        return fb - fa;
      },
      speed: (a, b) => (a.filled > 0 ? a.avgHours : 1e9) - (b.filled > 0 ? b.avgHours : 1e9)
    };
    return [...rows].sort(fns[sortBy]);
  }, [rows, sortBy]);

  useEffect(() => setPage(1), [auditHoldings, sortBy, pageSize]);

  const visibleSlice = useMemo(() => {
    if (pageSize === 0) return sorted;
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const draftCount = parseAuditInput(draft).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your current holdings</CardTitle>
            <CardDescription>
              Paste OCLC symbols separated by commas, spaces, or newlines. Each
              one is cross-referenced against your loaded Borrower reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <Textarea
              rows={8}
              placeholder="FUG, FDA, SFU&#10;FOC, FJV, NYP"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="font-mono text-xs"
              aria-label="Holdings symbols"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{draftCount} symbol{draftCount === 1 ? '' : 's'}</span>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setDraft('');
                  setAuditHoldings([]);
                }}
              >
                Clear
              </button>
            </div>
            <Button className="w-full" onClick={() => setAuditHoldings(parseAuditInput(draft))}>
              Audit holdings
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tier thresholds</CardTitle>
            <CardDescription>Uses your Rankings scoring + weights.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <TierExplainer tier="top" />
            <TierExplainer tier="strong" />
            <TierExplainer tier="weak" />
            <TierExplainer tier="unused" />
          </CardContent>
        </Card>
      </aside>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <strong>{rows.length}</strong> member{rows.length === 1 ? '' : 's'}
            <span className="ml-3 text-muted-foreground">
              · <strong className="text-foreground">{counts.top}</strong> top
              · <strong className="text-foreground">{counts.strong}</strong> strong
              · <strong className="text-foreground">{counts.weak}</strong> weak
              · <strong className="text-foreground">{counts.unused}</strong> unused
            </span>
          </div>
          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Sort: best match</SelectItem>
                <SelectItem value="tier">Sort: tier</SelectItem>
                <SelectItem value="name">Sort: name</SelectItem>
                <SelectItem value="filled">Sort: most filled</SelectItem>
                <SelectItem value="fill">Sort: fill rate</SelectItem>
                <SelectItem value="speed">Sort: turnaround</SelectItem>
              </SelectContent>
            </Select>
            <PageSizeSelect value={pageSize} onChange={setPageSize} />
          </div>
        </div>

        {rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Paste your custom holdings group to audit it</p>
              <p className="mt-2">
                Enter OCLC symbols on the left and click <em>Audit holdings</em>. Each member
                will be bucketed based on how it has performed in your loaded reports.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <ScrollArea className="h-[calc(100vh-320px)] pr-3">
              <div className="space-y-3" role="list" ref={listRef}>
                {visibleSlice.map((r) => (
                  <AuditCard key={r.symbol} r={r} />
                ))}
              </div>
            </ScrollArea>
            <Pagination
              total={sorted.length}
              pageSize={pageSize}
              page={page}
              onPage={setPage}
              scrollToRef={listRef}
            />
          </>
        )}
      </section>
    </div>
  );
}

function TierExplainer({ tier }: { tier: AuditTier }) {
  return (
    <div className="flex items-center gap-2">
      <Badge className={TIER_STYLES[tier]}>{TIER_META[tier].label}</Badge>
      <span className="text-xs text-muted-foreground">{TIER_META[tier].description}</span>
    </div>
  );
}

function AuditCard({ r }: { r: AuditRow }) {
  const fr = r.requested > 0 ? Math.min(100, (r.filled / r.requested) * 100) : null;
  const days = r.avgHours > 0 ? r.avgHours / 24 : null;
  return (
    <Card role="listitem" className={TIER_BORDER[r.tier]}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{r.name}</CardTitle>
            <CardDescription className="text-xs">{r.symbol} · {r.type} · {r.state}</CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge className={TIER_STYLES[r.tier]}>{TIER_META[r.tier].label}</Badge>
            <span className="text-sm font-semibold tabular-nums">{r.inReport ? r.score : '—'}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Stat label="Requested" value={r.requested || '—'} muted={r.requested === 0} />
          <Stat label="Filled" value={r.filled || '—'} muted={r.filled === 0} />
          <Stat label="Fill rate" value={fr == null ? '—' : `${fr.toFixed(0)}%`} muted={fr == null} />
          <Stat label="Avg days" value={days == null ? '—' : days.toFixed(1)} muted={days == null} />
          <Stat label="Months" value={r.monthsSpan > 0 ? `${r.monthsPresent}/${r.monthsSpan}` : '—'} muted={r.monthsSpan === 0} />
        </div>
        {(typeof r.loansDays === 'number' || typeof r.copiesDays === 'number' || r.groups.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {typeof r.loansDays === 'number' && <span>OCLC loans: {r.loansDays}d</span>}
            {typeof r.copiesDays === 'number' && <span>· copies: {r.copiesDays}d</span>}
            {r.groups.map((g) => (
              <Badge key={g} variant="outline" className="font-normal">{g}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, muted }: { label: string; value: string | number; muted?: boolean }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium tabular-nums ${muted ? 'text-muted-foreground' : ''}`}>{value}</div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { aggregateRangeStats, type RangeAggregate } from '@/lib/scoring';
import { useAppState } from '@/app-state/AppContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CompareRow {
  symbol: string;
  name: string;
  state: string;
  type: string;
  aFilled: number;
  bFilled: number;
  volumeDelta: number;
  aRequested: number;
  bRequested: number;
  aFillRate: number | null;
  bFillRate: number | null;
  fillRateDelta: number | null;
  aAvgDays: number | null;
  bAvgDays: number | null;
  avgDaysDelta: number | null;
}

function fillRateOf(a: RangeAggregate): number | null {
  return a.requested > 0 ? (a.filled / a.requested) * 100 : null;
}

function avgDaysOf(a: RangeAggregate): number | null {
  return a.filled > 0 ? a.avgHours / 24 : null;
}

export function ComparePeriodsDialog({ open, onOpenChange }: Props) {
  const { months } = useAppState();
  const mid = Math.floor(months.length / 2);
  const [aSet, setASet] = useState<Set<number>>(() => new Set(Array.from({ length: mid }, (_, i) => i)));
  const [bSet, setBSet] = useState<Set<number>>(() =>
    new Set(Array.from({ length: months.length - mid }, (_, i) => mid + i))
  );

  const rows = useMemo<CompareRow[]>(() => {
    const a = aggregateRangeStats(months, [...aSet]);
    const b = aggregateRangeStats(months, [...bSet]);
    const out: CompareRow[] = [];
    const seen = new Set<string>();
    a.forEach((_, sym) => seen.add(sym));
    b.forEach((_, sym) => seen.add(sym));
    seen.forEach((sym) => {
      const av = a.get(sym);
      const bv = b.get(sym);
      const ref = av || bv;
      if (!ref) return;
      const afr = av ? fillRateOf(av) : null;
      const bfr = bv ? fillRateOf(bv) : null;
      const aad = av ? avgDaysOf(av) : null;
      const bad = bv ? avgDaysOf(bv) : null;
      out.push({
        symbol: sym,
        name: ref.name,
        state: ref.state,
        type: ref.type,
        aFilled: av?.filled ?? 0,
        bFilled: bv?.filled ?? 0,
        volumeDelta: (bv?.filled ?? 0) - (av?.filled ?? 0),
        aRequested: av?.requested ?? 0,
        bRequested: bv?.requested ?? 0,
        aFillRate: afr,
        bFillRate: bfr,
        fillRateDelta: afr != null && bfr != null ? bfr - afr : null,
        aAvgDays: aad,
        bAvgDays: bad,
        avgDaysDelta: aad != null && bad != null ? bad - aad : null
      });
    });
    out.sort((x, y) => Math.abs(y.volumeDelta) - Math.abs(x.volumeDelta));
    return out;
  }, [months, aSet, bSet]);

  const toggle = (set: Set<number>, setSet: (s: Set<number>) => void, i: number) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSet(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compare periods</DialogTitle>
          <DialogDescription>
            Pick the months that belong to each period. The table shows the
            delta in filled volume, fill rate, and average turnaround for every
            lender that appears in either period.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <PeriodPicker title="Period A" months={months} selected={aSet} onToggle={(i) => toggle(aSet, setASet, i)} />
          <PeriodPicker title="Period B" months={months} selected={bSet} onToggle={(i) => toggle(bSet, setBSet, i)} />
        </div>
        <ScrollArea className="h-[400px] rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background">
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2">Lender</th>
                <th className="px-3 py-2 text-right">Filled A</th>
                <th className="px-3 py-2 text-right">Filled B</th>
                <th className="px-3 py-2 text-right">Δ vol</th>
                <th className="px-3 py-2 text-right">Fill % A</th>
                <th className="px-3 py-2 text-right">Fill % B</th>
                <th className="px-3 py-2 text-right">Δ fill</th>
                <th className="px-3 py-2 text-right">Days A</th>
                <th className="px-3 py-2 text-right">Days B</th>
                <th className="px-3 py-2 text-right">Δ days</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">Pick at least one month on each side.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.symbol} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.symbol} · {r.type} · {r.state}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.aFilled}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.bFilled}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${deltaCls(r.volumeDelta)}`}>{fmtDelta(r.volumeDelta, '')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.aFillRate != null ? r.aFillRate.toFixed(0) + '%' : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.bFillRate != null ? r.bFillRate.toFixed(0) + '%' : '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${deltaCls(r.fillRateDelta)}`}>{r.fillRateDelta != null ? fmtDelta(r.fillRateDelta, 'pp') : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.aAvgDays != null ? r.aAvgDays.toFixed(1) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.bAvgDays != null ? r.bAvgDays.toFixed(1) : '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${deltaCls(r.avgDaysDelta == null ? null : -r.avgDaysDelta)}`}>
                      {r.avgDaysDelta != null ? fmtDelta(r.avgDaysDelta, 'd') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function fmtDelta(v: number, suffix: string): string {
  const r = suffix === 'pp' ? v.toFixed(0) : suffix === 'd' ? v.toFixed(1) : v.toString();
  const prefix = v > 0 ? '+' : '';
  return `${prefix}${r}${suffix}`;
}

function deltaCls(v: number | null): string {
  if (v == null || v === 0) return 'text-muted-foreground';
  return v > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
}

function PeriodPicker({
  title,
  months,
  selected,
  onToggle
}: {
  title: string;
  months: { period: string }[];
  selected: Set<number>;
  onToggle: (i: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{title}</div>
      <ScrollArea className="h-[180px] rounded-md border p-2">
        <div className="space-y-1.5">
          {months.map((m, i) => (
            <label key={i} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={selected.has(i)} onCheckedChange={() => onToggle(i)} />
              <span>{m.period || `Month ${i + 1}`}</span>
            </label>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

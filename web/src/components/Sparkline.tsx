// Tiny SVG sparkline + month-dot strip for Rankings cards. Mirrors the
// vanilla app's per-month indicator but built with React + Tailwind.

interface Props {
  filledMonths: Array<number | undefined>;
  requestedMonths: Array<number | undefined>;
  monthsSpan: number;
  periods?: Array<string | undefined>;
}

export function MonthDots({ filledMonths, requestedMonths, monthsSpan, periods }: Props) {
  if (monthsSpan < 2) return null;
  return (
    <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
      {Array.from({ length: monthsSpan }).map((_, i) => {
        const filled = (filledMonths[i] ?? 0) > 0;
        const present = filledMonths[i] !== undefined;
        const cls = !present
          ? 'bg-muted'
          : filled
            ? 'bg-emerald-500'
            : 'bg-muted-foreground/40';
        const title = periods?.[i]
          ? `${periods[i]}: ${filledMonths[i] || 0} filled / ${requestedMonths[i] || 0} requested`
          : '';
        return <span key={i} className={`h-2 w-2 rounded-full ${cls}`} title={title} />;
      })}
    </div>
  );
}

export function Sparkline({ filledMonths, monthsSpan }: Props) {
  if (monthsSpan < 3) return null;
  const w = 80;
  const h = 18;
  const values = Array.from({ length: monthsSpan }).map((_, i) => filledMonths[i] || 0);
  const max = Math.max(1, ...values);
  const xStep = w / (monthsSpan - 1);
  const points = values
    .map((v, i) => `${i * xStep},${h - (v / max) * h}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" className="text-primary">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

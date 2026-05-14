// Speed × Fill-rate scatter plot for the Rankings tab. Hand-rolled SVG so
// we don't pull a chart library; each lender is one dot, sized by filled
// volume, colored by tier. Top-right = sweet spot.

import { useMemo, useState } from 'react';
import type { MergedLender, Weights } from '@/lib/types';
import { fillRate, subscores, totalScore } from '@/lib/scoring';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  rows: MergedLender[];
  weights: Weights;
  homeState: string;
  selected: Set<string>;
  onToggle: (sym: string) => void;
}

const PAD = { top: 24, right: 24, bottom: 48, left: 56 };

interface Point {
  l: MergedLender;
  speed: number;       // x: 0-100 (higher = faster turnaround)
  fill: number;        // y: 0-100 (higher = better)
  filled: number;      // volume — drives dot radius
  score: number;
  symbol: string;
  name: string;
}

export function RankingsChart({ rows, weights, homeState, selected, onToggle }: Props) {
  const [hover, setHover] = useState<Point | null>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });

  // Track container width so the chart re-flows. SVG viewBox handles scale,
  // but our text labels look nicer at the natural pixel size.
  const containerRef = (el: HTMLDivElement | null) => {
    if (!el) return;
    const update = () => {
      setSize({ w: el.clientWidth, h: 480 });
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
  };

  const points = useMemo<Point[]>(() => {
    return rows
      .map((l) => {
        const s = subscores(l, homeState);
        return {
          l,
          speed: s.speed,
          fill: fillRate(l),
          filled: l.filled,
          score: totalScore(l, weights, homeState),
          symbol: l.symbol,
          name: l.name
        };
      })
      // Skip lenders with no fills — speed subscore = 0, would clump at origin
      // and crowd the chart without adding insight.
      .filter((p) => p.l.filled > 0 || p.l.requested > 0);
  }, [rows, weights, homeState]);

  const innerW = Math.max(200, size.w - PAD.left - PAD.right);
  const innerH = size.h - PAD.top - PAD.bottom;
  const x = (v: number) => PAD.left + (v / 100) * innerW;
  const y = (v: number) => PAD.top + (1 - v / 100) * innerH;
  const maxFilled = Math.max(1, ...points.map((p) => p.filled));
  const r = (filled: number) => {
    if (filled === 0) return 3;
    const scale = filled / maxFilled;
    return 4 + Math.sqrt(scale) * 10; // 4–14 px
  };
  const dotColor = (score: number) =>
    score >= 70
      ? 'fill-emerald-500/80 stroke-emerald-700'
      : score >= 50
        ? 'fill-amber-500/80 stroke-amber-700'
        : 'fill-rose-500/70 stroke-rose-700';

  if (points.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Load a Borrower report to see the chart.
        </CardContent>
      </Card>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${size.w} ${size.h}`}
        width="100%"
        height={size.h}
        role="img"
        aria-label="Speed vs Fill rate scatter plot"
        className="rounded-md border bg-card"
      >
        {/* Quadrant guides */}
        <line
          x1={x(50)} y1={PAD.top} x2={x(50)} y2={size.h - PAD.bottom}
          className="stroke-border" strokeDasharray="2 3"
        />
        <line
          x1={PAD.left} y1={y(50)} x2={size.w - PAD.right} y2={y(50)}
          className="stroke-border" strokeDasharray="2 3"
        />
        <text x={size.w - PAD.right - 4} y={PAD.top + 14} textAnchor="end" className="fill-emerald-700 dark:fill-emerald-400 text-[11px] font-semibold">
          ★ sweet spot
        </text>
        <text x={PAD.left + 4} y={size.h - PAD.bottom - 6} textAnchor="start" className="fill-muted-foreground text-[11px]">
          slow + low fill
        </text>

        {/* Axes */}
        <line x1={PAD.left} y1={size.h - PAD.bottom} x2={size.w - PAD.right} y2={size.h - PAD.bottom} className="stroke-border" />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={size.h - PAD.bottom} className="stroke-border" />

        {/* Tick labels */}
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={`x${t}`}>
            <line x1={x(t)} y1={size.h - PAD.bottom} x2={x(t)} y2={size.h - PAD.bottom + 4} className="stroke-border" />
            <text x={x(t)} y={size.h - PAD.bottom + 18} textAnchor="middle" className="fill-muted-foreground text-[10px] tabular-nums">{t}</text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.left - 4} y1={y(t)} x2={PAD.left} y2={y(t)} className="stroke-border" />
            <text x={PAD.left - 8} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">{t}%</text>
          </g>
        ))}

        {/* Axis labels */}
        <text x={(PAD.left + size.w - PAD.right) / 2} y={size.h - 12} textAnchor="middle" className="fill-foreground text-xs font-medium">
          Speed score →
        </text>
        <text
          x={-((PAD.top + size.h - PAD.bottom) / 2)}
          y={16}
          transform="rotate(-90)"
          textAnchor="middle"
          className="fill-foreground text-xs font-medium"
        >
          ← Fill rate
        </text>

        {/* Points */}
        {points.map((p) => {
          const isSel = selected.has(p.symbol);
          return (
            <circle
              key={p.symbol}
              cx={x(p.speed)}
              cy={y(p.fill)}
              r={r(p.filled)}
              className={`${dotColor(p.score)} cursor-pointer transition-opacity ${isSel ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
              strokeWidth={isSel ? 3 : 1}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p)}
              onBlur={() => setHover(null)}
              onClick={() => onToggle(p.symbol)}
              tabIndex={0}
              role="button"
              aria-label={`${p.name}, score ${p.score}, ${p.fill.toFixed(0)}% fill rate`}
            >
              <title>{`${p.name} (${p.symbol})  ·  score ${p.score}  ·  ${p.fill.toFixed(0)}% fill  ·  speed ${p.speed}  ·  ${p.filled} filled`}</title>
            </circle>
          );
        })}
      </svg>

      {/* Live tooltip — replaces native title once hover triggers */}
      {hover && (
        <div className="pointer-events-none absolute right-3 top-3 max-w-xs rounded-md border bg-background/95 p-3 text-xs shadow-md backdrop-blur">
          <div className="font-medium">{hover.name}</div>
          <div className="text-muted-foreground">{hover.symbol} · score {hover.score}</div>
          <div className="mt-1">
            Fill <strong>{hover.fill.toFixed(0)}%</strong>
            {' · '}Speed <strong>{hover.speed}</strong>
            {' · '}Filled <strong>{hover.filled}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

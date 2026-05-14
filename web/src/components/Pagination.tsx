import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  total: number;
  pageSize: number; // 0 = "show all"
  page: number;
  onPage: (p: number) => void;
  scrollToRef?: React.RefObject<HTMLElement>;
}

export function Pagination({ total, pageSize, page, onPage, scrollToRef }: PaginationProps) {
  if (pageSize === 0 || total <= pageSize) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  // Windowed page list: 1, current ± 2, last
  const visible = Array.from(
    new Set([1, pages, current, current - 1, current + 1, current - 2, current + 2])
  )
    .filter((p) => p >= 1 && p <= pages)
    .sort((a, b) => a - b);

  const goto = (p: number) => {
    onPage(p);
    if (scrollToRef?.current) {
      scrollToRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  let last = 0;
  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-center gap-1 pt-4 text-sm"
    >
      <span className="mr-2 tabular-nums text-muted-foreground">
        {start}–{end} of {total}
      </span>
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0"
        disabled={current === 1}
        onClick={() => goto(current - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {visible.map((p) => {
        const gap = last && p - last > 1;
        last = p;
        return (
          <span key={p} className="flex items-center gap-1">
            {gap && <span className="px-1 text-muted-foreground">…</span>}
            <Button
              size="sm"
              variant={p === current ? 'default' : 'outline'}
              className={cn('h-8 min-w-8 px-2 tabular-nums', p === current && 'pointer-events-none')}
              aria-current={p === current ? 'page' : undefined}
              aria-label={`Page ${p}`}
              onClick={() => goto(p)}
            >
              {p}
            </Button>
          </span>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0"
        disabled={current === pages}
        onClick={() => goto(current + 1)}
        aria-label="Next page"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}

interface PageSizeProps {
  value: number; // 0 = all
  onChange: (next: number) => void;
}

// Standalone select-like component for page size. Keeps the import surface
// small for tabs that just want the selector + pagination together.
export function PageSizeSelect({ value, onChange }: PageSizeProps) {
  return (
    <select
      value={value === 0 ? 'all' : String(value)}
      onChange={(e) => onChange(e.target.value === 'all' ? 0 : parseInt(e.target.value, 10))}
      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      aria-label="Cards per page"
    >
      <option value="50">50 / page</option>
      <option value="100">100 / page</option>
      <option value="250">250 / page</option>
      <option value="all">Show all</option>
    </select>
  );
}

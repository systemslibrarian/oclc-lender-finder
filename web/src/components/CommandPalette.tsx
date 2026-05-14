// Lightweight command palette — bottom-of-the-stack quick-jump for power
// users. ⌘K (or Ctrl+K) opens it; ↑/↓ navigate, Enter runs, Esc closes.
//
// Hand-rolled (no cmdk dep) to keep the bundle small. The list is short
// enough that linear filtering on every keystroke is fine.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Library, Compass, ClipboardList, HelpCircle, Search, BarChart3, ArrowRight } from 'lucide-react';
import { useAppState } from '@/app-state/AppContext';
import type { TabName } from '@/lib/types';
import { mergeMonths } from '@/lib/scoring';
import { mergeDirectory } from '@/lib/directory';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowHelp: () => void;
}

type Item =
  | { kind: 'action'; id: string; label: string; hint?: string; Icon: typeof Library; run: () => void }
  | { kind: 'lender'; id: string; label: string; sub: string; run: () => void };

export function CommandPalette({ open, onOpenChange, onShowHelp }: Props) {
  const { setActiveTab, months, bundledDirectory, importedDirectory, policies, auditHoldings, setAuditHoldings } = useAppState();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when re-opened.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      // Focus the input once Radix has mounted it.
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Pre-compute the lender index once per render (cheap — small lists).
  const lenderIndex = useMemo(() => {
    const dir = mergeDirectory({ bundled: bundledDirectory, imported: importedDirectory, policies });
    const merged = mergeMonths(months);
    const map = new Map<string, { name: string; symbol: string; sub: string; inReport: boolean }>();
    dir.forEach((l) => map.set(l.symbol, { name: l.name, symbol: l.symbol, sub: `${l.type || 'Other'} · ${l.state || '—'}`, inReport: false }));
    merged.forEach((l) => {
      const cur = map.get(l.symbol);
      map.set(l.symbol, { name: l.name, symbol: l.symbol, sub: `${l.type || 'Other'} · ${l.state || '—'}`, inReport: true });
      if (cur) map.set(l.symbol, { ...map.get(l.symbol)!, inReport: true });
    });
    return Array.from(map.values());
  }, [bundledDirectory, importedDirectory, policies, months]);

  const go = (tab: TabName) => {
    setActiveTab(tab);
    onOpenChange(false);
  };

  const actions: Item[] = useMemo(
    () => [
      { kind: 'action', id: 'tab-audit',    label: 'Switch to Audit',    hint: '1',     Icon: ClipboardList, run: () => go('audit') },
      { kind: 'action', id: 'tab-rankings', label: 'Switch to Rankings', hint: '2',     Icon: BarChart3,     run: () => go('rankings') },
      { kind: 'action', id: 'tab-discover', label: 'Switch to Discover', hint: '3',     Icon: Compass,       run: () => go('discover') },
      { kind: 'action', id: 'help',         label: 'Open Help & shortcuts', hint: '?',  Icon: HelpCircle,    run: () => { onOpenChange(false); onShowHelp(); } }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filteredActions = q
      ? actions.filter((a) => a.label.toLowerCase().includes(q))
      : actions;
    if (!q) return filteredActions;

    // Lender results (up to 8)
    const lenderHits: Item[] = lenderIndex
      .filter((l) => l.symbol.toLowerCase().includes(q) || l.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((l) => ({
        kind: 'lender',
        id: `lender-${l.symbol}`,
        label: l.name,
        sub: `${l.symbol} · ${l.sub}${l.inReport ? ' · in your reports' : ''}`,
        run: () => {
          // If already in audit list, switch to Audit; else add and switch.
          if (!auditHoldings.includes(l.symbol)) setAuditHoldings([...auditHoldings, l.symbol]);
          go('audit');
        }
      }));
    return [...filteredActions, ...lenderHits];
  }, [query, actions, lenderIndex, auditHoldings, setAuditHoldings]);

  // Reset selection when filter changes.
  useEffect(() => setActiveIdx(0), [query]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIdx];
      if (item) item.run();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-xl gap-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Switch tabs, find a lender by name or symbol…"
            className="border-0 shadow-none focus-visible:ring-0 px-1 text-sm h-12"
            aria-label="Command palette search"
          />
        </div>
        <div className="max-h-[420px] overflow-y-auto py-2" role="listbox">
          {items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No matches.</p>
          ) : (
            items.map((item, i) => {
              const active = i === activeIdx;
              const Icon = item.kind === 'action' ? (item as Extract<Item, { kind: 'action' }>).Icon : Library;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={item.run}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${active ? 'bg-accent text-accent-foreground' : ''}`}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{item.label}</div>
                    {item.kind === 'lender' && (
                      <div className="truncate text-xs text-muted-foreground">{(item as Extract<Item, { kind: 'lender' }>).sub}</div>
                    )}
                  </div>
                  {item.kind === 'action' && (item as Extract<Item, { kind: 'action' }>).hint && (
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {(item as Extract<Item, { kind: 'action' }>).hint}
                    </kbd>
                  )}
                  {item.kind === 'lender' && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>
        <div className="border-t bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground">
          <kbd className="rounded border bg-card px-1 font-mono">↑↓</kbd> navigate
          {' · '}
          <kbd className="rounded border bg-card px-1 font-mono">↵</kbd> select
          {' · '}
          <kbd className="rounded border bg-card px-1 font-mono">esc</kbd> close
          {' · '}
          Lender match adds to Audit list
        </div>
      </DialogContent>
    </Dialog>
  );
}

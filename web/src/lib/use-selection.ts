import { useCallback, useMemo, useState } from 'react';

export interface SelectableRow {
  symbol: string;
}

export interface SelectionAPI {
  selected: Set<string>;
  count: number;
  isSelected: (sym: string) => boolean;
  toggle: (sym: string, checked?: boolean) => void;
  selectAll: (rows: SelectableRow[]) => void;
  selectTop: (rows: SelectableRow[], n: number) => void;
  clear: () => void;
  setSelected: (next: Set<string>) => void;
}

export function useSelection(): SelectionAPI {
  const [selected, setSelectedState] = useState<Set<string>>(new Set());
  const isSelected = useCallback((sym: string) => selected.has(sym), [selected]);
  const toggle = useCallback((sym: string, checked?: boolean) => {
    setSelectedState((prev) => {
      const next = new Set(prev);
      const shouldHave = checked ?? !next.has(sym);
      if (shouldHave) next.add(sym);
      else next.delete(sym);
      return next;
    });
  }, []);
  const selectAll = useCallback((rows: SelectableRow[]) => {
    setSelectedState((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => next.add(r.symbol));
      return next;
    });
  }, []);
  const selectTop = useCallback((rows: SelectableRow[], n: number) => {
    setSelectedState((prev) => {
      const next = new Set(prev);
      rows.slice(0, n).forEach((r) => next.add(r.symbol));
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelectedState(new Set()), []);
  const setSelected = useCallback((next: Set<string>) => setSelectedState(new Set(next)), []);
  return useMemo(
    () => ({ selected, count: selected.size, isSelected, toggle, selectAll, selectTop, clear, setSelected }),
    [selected, isSelected, toggle, selectAll, selectTop, clear, setSelected]
  );
}

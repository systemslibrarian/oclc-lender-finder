import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X } from 'lucide-react';
import { useAppState } from '@/app-state/AppContext';
import { mergeDirectory } from '@/lib/directory';
import { haversineKm, kmToMiles, mergeMonths } from '@/lib/scoring';
import { stateLabel } from '@/lib/state-names';
import { ALLOWED_GROUPS, GROUP_NAMES } from '@/lib/directory';
import type { DirectoryEntry } from '@/lib/types';

type SortKey = 'distance' | 'name' | 'state' | 'loans' | 'copies';

interface DiscoverFilters {
  type: Set<string>;
  state: Set<string>;
  group: Set<string>;
  loanDays: Set<string>;
  search: string;
  maxDist: number;
  onlyNew: boolean;
}

export function DiscoverTab() {
  const {
    settings,
    updateSettings,
    bundledDirectory,
    importedDirectory,
    policies,
    isLoadingDirectory,
    months
  } = useAppState();

  const [filters, setFilters] = useState<DiscoverFilters>({
    type: new Set(),
    state: new Set(),
    group: new Set(),
    loanDays: new Set(),
    search: '',
    maxDist: 0,
    onlyNew: true
  });
  const [sortBy, setSortBy] = useState<SortKey>('distance');

  const merged = useMemo(
    () => mergeDirectory({ bundled: bundledDirectory, imported: importedDirectory, policies }),
    [bundledDirectory, importedDirectory, policies]
  );

  const borrowedSyms = useMemo(() => {
    const s = new Set<string>();
    mergeMonths(months).forEach((l) => {
      if (l.filled > 0 || l.requested > 0) s.add(l.symbol);
    });
    return s;
  }, [months]);

  // Compute facet counts on the (almost) full directory, but respect the
  // homeSymbol exclusion and the "only new" toggle so totals match what
  // the user actually sees.
  const facetSource = useMemo(() => {
    const home = (settings.homeSymbol || '').toUpperCase();
    return merged.filter((l) => {
      if (home && l.symbol === home) return false;
      if (filters.onlyNew && borrowedSyms.has(l.symbol)) return false;
      return true;
    });
  }, [merged, settings.homeSymbol, filters.onlyNew, borrowedSyms]);

  const { typeCounts, stateCounts, groupCounts, loanDaysCounts } = useMemo(() => {
    const t: Record<string, number> = {};
    const s: Record<string, number> = {};
    const g: Record<string, number> = {};
    const ld: Record<string, number> = {};
    facetSource.forEach((l) => {
      t[l.type || 'Other'] = (t[l.type || 'Other'] || 0) + 1;
      if (l.state) s[l.state] = (s[l.state] || 0) + 1;
      (l.groups || []).forEach((gr) => {
        if (ALLOWED_GROUPS.has(gr)) g[gr] = (g[gr] || 0) + 1;
      });
      if (typeof l.loansDaysToRespond === 'number') {
        const k = String(l.loansDaysToRespond);
        ld[k] = (ld[k] || 0) + 1;
      }
    });
    return { typeCounts: t, stateCounts: s, groupCounts: g, loanDaysCounts: ld };
  }, [facetSource]);

  const filtered = useMemo(() => {
    const home = (settings.homeSymbol || '').toUpperCase();
    const q = filters.search.trim().toLowerCase();
    const list = merged
      .filter((l) => {
        if (home && l.symbol === home) return false;
        if (filters.onlyNew && borrowedSyms.has(l.symbol)) return false;
        if (filters.type.size && !filters.type.has(l.type || 'Other')) return false;
        if (filters.state.size && !filters.state.has(l.state)) return false;
        if (filters.group.size) {
          if (!(l.groups || []).some((g) => filters.group.has(g))) return false;
        }
        if (filters.loanDays.size) {
          if (typeof l.loansDaysToRespond !== 'number') return false;
          if (!filters.loanDays.has(String(l.loansDaysToRespond))) return false;
        }
        if (q) {
          const hay = `${l.symbol} ${l.name}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .map((l) => {
        const km = haversineKm(settings.homeLat, settings.homeLng, l.lat, l.lng);
        return { ...l, _km: km, _mi: km != null ? kmToMiles(km) : null };
      });

    const final =
      filters.maxDist > 0 ? list.filter((l) => l._mi != null && l._mi <= filters.maxDist) : list;

    const sortFns: Record<SortKey, (a: typeof final[0], b: typeof final[0]) => number> = {
      distance: (a, b) => (a._km ?? 1e9) - (b._km ?? 1e9),
      name: (a, b) => a.name.localeCompare(b.name),
      state: (a, b) => (a.state || '').localeCompare(b.state || ''),
      loans: (a, b) => (a.loansDaysToRespond ?? 1e9) - (b.loansDaysToRespond ?? 1e9),
      copies: (a, b) => (a.copiesDaysToRespond ?? 1e9) - (b.copiesDaysToRespond ?? 1e9)
    };
    return final.sort(sortFns[sortBy]);
  }, [merged, filters, settings.homeSymbol, settings.homeLat, settings.homeLng, sortBy, borrowedSyms]);

  const toggleFilter = (bucket: keyof Pick<DiscoverFilters, 'type' | 'state' | 'group' | 'loanDays'>, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [bucket]: new Set(prev[bucket]) };
      if (next[bucket].has(value)) next[bucket].delete(value);
      else next[bucket].add(value);
      return next;
    });
  };

  const clearAll = () =>
    setFilters({
      type: new Set(),
      state: new Set(),
      group: new Set(),
      loanDays: new Set(),
      search: '',
      maxDist: 0,
      onlyNew: true
    });

  const activeCount =
    filters.type.size + filters.state.size + filters.group.size + filters.loanDays.size +
    (filters.search ? 1 : 0) + (filters.maxDist > 0 ? 1 : 0) + (!filters.onlyNew ? 1 : 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your library</CardTitle>
            <CardDescription>Powers distance + same-state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="dir-home-symbol" className="text-xs">Symbol</Label>
                <Input
                  id="dir-home-symbol"
                  value={settings.homeSymbol}
                  placeholder="FTL"
                  maxLength={10}
                  onChange={(e) => updateSettings({ homeSymbol: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <Label htmlFor="dir-home-state" className="text-xs">State</Label>
                <Input
                  id="dir-home-state"
                  value={settings.homeState}
                  maxLength={2}
                  onChange={(e) => updateSettings({ homeState: e.target.value.toUpperCase() })}
                />
              </div>
              <div>
                <Label htmlFor="dir-home-lat" className="text-xs">Latitude</Label>
                <Input
                  id="dir-home-lat"
                  type="number"
                  step="0.0001"
                  value={settings.homeLat}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) updateSettings({ homeLat: v });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="dir-home-lng" className="text-xs">Longitude</Label>
                <Input
                  id="dir-home-lng"
                  type="number"
                  step="0.0001"
                  value={settings.homeLng}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v)) updateSettings({ homeLng: v });
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Narrow the list</CardTitle>
            {activeCount > 0 && (
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={clearAll}>
                Clear all
              </button>
            )}
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name or symbol"
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                className="pl-8"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters.onlyNew}
                onCheckedChange={(v) => setFilters((prev) => ({ ...prev, onlyNew: Boolean(v) }))}
              />
              Only libraries I haven't borrowed from
            </label>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span>Distance within</span>
                <span className="tabular-nums text-muted-foreground">
                  {filters.maxDist > 0 ? `${filters.maxDist} mi` : 'Any'}
                </span>
              </div>
              <Slider
                min={0}
                max={3000}
                step={50}
                value={[filters.maxDist]}
                onValueChange={([v]) => setFilters((prev) => ({ ...prev, maxDist: v }))}
                aria-label="Max distance in miles"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Filters</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-0">
            {Object.keys(typeCounts).length > 0 && (
              <FacetGroup
                title="Library type"
                options={Object.entries(typeCounts).sort(([a], [b]) => a.localeCompare(b))}
                selected={filters.type}
                onToggle={(v) => toggleFilter('type', v)}
                maxVisible={5}
              />
            )}
            {Object.keys(stateCounts).length > 0 && (
              <FacetGroup
                title="State"
                options={Object.entries(stateCounts).sort(([a], [b]) =>
                  stateLabel(a).localeCompare(stateLabel(b))
                )}
                selected={filters.state}
                onToggle={(v) => toggleFilter('state', v)}
                renderLabel={(s) => stateLabel(s)}
                maxVisible={5}
              />
            )}
            {Object.entries(groupCounts).filter(([g]) => ALLOWED_GROUPS.has(g)).length > 0 && (
              <FacetGroup
                title="Group affiliation"
                options={Object.entries(groupCounts).filter(([g]) => ALLOWED_GROUPS.has(g))}
                selected={filters.group}
                onToggle={(v) => toggleFilter('group', v)}
                renderLabel={(g) => `${g} — ${GROUP_NAMES[g]}`}
              />
            )}
            {Object.keys(loanDaysCounts).length > 0 && (
              <FacetGroup
                title="Days to respond (loans)"
                options={Object.entries(loanDaysCounts).sort(([a], [b]) => Number(a) - Number(b))}
                selected={filters.loanDays}
                onToggle={(v) => toggleFilter('loanDays', v)}
                renderLabel={(d) => (d === '1' ? '1 day' : `${d} days`)}
              />
            )}
          </CardContent>
        </Card>
      </aside>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <strong>{filtered.length}</strong> candidate{filtered.length === 1 ? '' : 's'}
            {isLoadingDirectory && <span className="ml-2 text-muted-foreground">· loading directory…</span>}
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="distance">Sort: distance</SelectItem>
              <SelectItem value="name">Sort: name</SelectItem>
              <SelectItem value="state">Sort: state</SelectItem>
              <SelectItem value="loans">Sort: fastest loans</SelectItem>
              <SelectItem value="copies">Sort: fastest copies</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {activeCount > 0 && (
          <ActiveChips filters={filters} setFilters={setFilters} />
        )}

        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No candidates match these filters.
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[calc(100vh-260px)] pr-3">
            <div className="space-y-3" role="list">
              {filtered.map((l) => (
                <CandidateCard
                  key={l.symbol}
                  l={l}
                  borrowed={borrowedSyms.has(l.symbol)}
                  homeState={settings.homeState}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </section>
    </div>
  );
}

interface FacetGroupProps {
  title: string;
  options: Array<[string, number]>;
  selected: Set<string>;
  onToggle: (v: string) => void;
  renderLabel?: (v: string) => string;
  maxVisible?: number;
}

function FacetGroup({ title, options, selected, onToggle, renderLabel, maxVisible }: FacetGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded || !maxVisible ? options : options.slice(0, maxVisible);
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-1.5">
        {shown.map(([v, c]) => (
          <label key={v} className="flex cursor-pointer items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Checkbox checked={selected.has(v)} onCheckedChange={() => onToggle(v)} />
              <span className="break-words">{renderLabel ? renderLabel(v) : v}</span>
            </span>
            <span className="tabular-nums text-xs text-muted-foreground">{c}</span>
          </label>
        ))}
      </div>
      {maxVisible && options.length > maxVisible && (
        <button
          type="button"
          className="mt-2 text-xs text-primary hover:underline"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Show fewer' : `Show ${options.length - maxVisible} more…`}
        </button>
      )}
    </div>
  );
}

function ActiveChips({
  filters,
  setFilters
}: {
  filters: DiscoverFilters;
  setFilters: React.Dispatch<React.SetStateAction<DiscoverFilters>>;
}) {
  const remove =
    <K extends keyof Pick<DiscoverFilters, 'type' | 'state' | 'group' | 'loanDays'>>(bucket: K, value: string) =>
    () =>
      setFilters((prev) => {
        const next = { ...prev, [bucket]: new Set(prev[bucket]) };
        next[bucket].delete(value);
        return next;
      });
  const chips: Array<{ label: string; onRemove: () => void }> = [];
  filters.type.forEach((t) => chips.push({ label: `Type: ${t}`, onRemove: remove('type', t) }));
  filters.state.forEach((s) =>
    chips.push({ label: `State: ${stateLabel(s)}`, onRemove: remove('state', s) })
  );
  filters.group.forEach((g) => chips.push({ label: `Group: ${g}`, onRemove: remove('group', g) }));
  filters.loanDays.forEach((d) =>
    chips.push({ label: `Loans: ${d === '1' ? '1 day' : d + ' days'}`, onRemove: remove('loanDays', d) })
  );
  if (filters.search)
    chips.push({ label: `"${filters.search}"`, onRemove: () => setFilters((p) => ({ ...p, search: '' })) });
  if (filters.maxDist > 0)
    chips.push({
      label: `Within ${filters.maxDist} mi`,
      onRemove: () => setFilters((p) => ({ ...p, maxDist: 0 }))
    });
  if (!filters.onlyNew)
    chips.push({
      label: 'Including borrowed',
      onRemove: () => setFilters((p) => ({ ...p, onlyNew: true }))
    });
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Filtering by</span>
      {chips.map((c, i) => (
        <Badge key={i} variant="secondary" className="gap-1 pr-1 font-normal">
          {c.label}
          <button type="button" aria-label={`Remove ${c.label}`} className="rounded-full hover:bg-background/50" onClick={c.onRemove}>
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

function CandidateCard({
  l,
  borrowed,
  homeState
}: {
  l: DirectoryEntry & { _mi?: number | null };
  borrowed: boolean;
  homeState: string;
}) {
  const dist = l._mi != null ? `${Math.round(l._mi)} mi` : '—';
  const loans = typeof l.loansDaysToRespond === 'number' ? `${l.loansDaysToRespond} day${l.loansDaysToRespond === 1 ? '' : 's'}` : '—';
  const copies = typeof l.copiesDaysToRespond === 'number' ? `${l.copiesDaysToRespond} day${l.copiesDaysToRespond === 1 ? '' : 's'}` : '—';
  return (
    <Card role="listitem">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{l.name}</CardTitle>
            <CardDescription className="text-xs">
              {l.symbol} · {l.type || 'Other'} · {l.state || '—'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Distance" value={dist} muted={l._mi == null} />
          <Stat label="Loans" value={loans} muted={l.loansDaysToRespond == null} />
          <Stat label="Copies" value={copies} muted={l.copiesDaysToRespond == null} />
          <Stat label="Groups" value={(l.groups || []).length || '—'} muted={(l.groups || []).length === 0} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {borrowed ? <Badge variant="secondary">Borrowed before</Badge> : <Badge>New candidate</Badge>}
          {l.state === homeState && <Badge variant="secondary">Same state</Badge>}
          {(l.groups || []).map((g) => (
            <Badge key={g} variant="outline" className="font-normal">{g}</Badge>
          ))}
        </div>
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

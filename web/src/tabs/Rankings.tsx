import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Pagination, PageSizeSelect } from '@/components/Pagination';
import { SavedGroupsCard } from '@/components/SavedGroupsCard';
import { SaveGroupDialog } from '@/components/SaveGroupDialog';
import { useSelection } from '@/lib/use-selection';
import { StickyNote, Upload, X } from 'lucide-react';
import { useAppState } from '@/app-state/AppContext';
import { NoteEditor } from '@/components/NoteEditor';
import { MonthDots, Sparkline } from '@/components/Sparkline';
import { ComparePeriodsDialog } from '@/components/ComparePeriodsDialog';
import { RankingsChart } from '@/components/RankingsChart';
import { GitCompare, LayoutGrid, ScatterChart } from 'lucide-react';
import { parseOCLCReport } from '@/lib/parsing';
import { mergeMonths, totalScore, subscores, fillRate, avgDays, PRESETS, PRESET_LABELS } from '@/lib/scoring';
import { HIST_LABELS } from '@/lib/audit';
import { stateLabel } from '@/lib/state-names';
import { ALLOWED_GROUPS, GROUP_NAMES } from '@/lib/directory';
import type { MergedLender, MonthReport, Weights } from '@/lib/types';

type SortKey = 'score' | 'speed' | 'fill' | 'volume' | 'consistency';

interface ActiveFilters {
  type: Set<string>;
  state: Set<string>;
  group: Set<string>;
  hist: Set<string>;
}

function passesFilter(l: MergedLender, f: ActiveFilters): boolean {
  if (f.type.size && !f.type.has(l.type || 'Other')) return false;
  if (f.state.size && !f.state.has(l.state)) return false;
  if (f.hist.has('filled') && l.filled < 1) return false;
  if (f.hist.has('multi') && l.filled < 5) return false;
  if (f.hist.has('fast') && (l.filled === 0 || avgDays(l) >= 3)) return false;
  if (f.hist.has('reliable') && (l.requested === 0 || fillRate(l) <= 75)) return false;
  if (f.hist.has('consistent') && l.monthsPresent < 3) return false;
  return true;
}

export function RankingsTab() {
  const { months, setMonths, settings, updateSettings, updateWeights, savedGroups, setSavedGroups, notes } = useAppState();
  const selection = useSelection();
  const [saveOpen, setSaveOpen] = useState(false);
  const [openNoteSym, setOpenNoteSym] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'chart'>('cards');

  const [filters, setFilters] = useState<ActiveFilters>({
    type: new Set(),
    state: new Set(),
    group: new Set(),
    hist: new Set()
  });
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(100);
  const listRef = useRef<HTMLDivElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string>('');

  const merged = useMemo(() => mergeMonths(months), [months]);

  const filtered = useMemo(() => {
    const list = merged.filter(l => passesFilter(l, filters));
    list.forEach(l => {
      (l as MergedLender & { _score?: number })._score = totalScore(l, settings.weights, settings.homeState);
    });
    const sortFns: Record<SortKey, (a: MergedLender, b: MergedLender) => number> = {
      score: (a, b) =>
        totalScore(b, settings.weights, settings.homeState) - totalScore(a, settings.weights, settings.homeState),
      speed: (a, b) => (a.filled > 0 ? a.avgHours : 1e9) - (b.filled > 0 ? b.avgHours : 1e9),
      fill: (a, b) => fillRate(b) - fillRate(a),
      volume: (a, b) => b.filled - a.filled,
      consistency: (a, b) => b.monthsPresent - a.monthsPresent
    };
    return list.sort(sortFns[sortBy]);
  }, [merged, filters, settings.weights, settings.homeState, sortBy]);

  // Reset to page 1 whenever filters / sort / size change.
  useEffect(() => setPage(1), [filters, sortBy, pageSize]);

  const visibleSlice = useMemo(() => {
    if (pageSize === 0) return filtered;
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  // Facet counts come from the unfiltered merged set so they don't shift as
  // the user clicks (well-known UX gotcha for faceted search).
  const { typeCounts, stateCounts, groupCounts } = useMemo(() => {
    const t: Record<string, number> = {};
    const s: Record<string, number> = {};
    const g: Record<string, number> = {};
    merged.forEach(l => {
      t[l.type || 'Other'] = (t[l.type || 'Other'] || 0) + 1;
      if (l.state) s[l.state] = (s[l.state] || 0) + 1;
    });
    // Rankings has no policy/group data on its own — group facet is empty
    // unless the merged set ever gets enriched. (Discover tab does this.)
    return { typeCounts: t, stateCounts: s, groupCounts: g };
  }, [merged]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadError('');
    const next: MonthReport[] = [...months];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const report = parseOCLCReport(text);
        // Replace if a report for the same period is already loaded
        const idx = next.findIndex(m => m.period === report.period && report.period);
        if (idx >= 0) next[idx] = report;
        else next.push(report);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : String(e));
      }
    }
    next.sort((a, b) => (a.period || '').localeCompare(b.period || ''));
    setMonths(next);
  };

  const applyPreset = (key: string) => {
    const p = PRESETS[key];
    if (!p) return;
    updateWeights(p);
    setSortBy('score');
  };

  const onWeightChange = (k: keyof Weights, v: number) => {
    updateWeights({ [k]: v } as Partial<Weights>);
    setSortBy('score');
  };

  const toggleFilter = (bucket: keyof ActiveFilters, value: string) => {
    setFilters(prev => {
      const next = { ...prev, [bucket]: new Set(prev[bucket]) };
      if (next[bucket].has(value)) next[bucket].delete(value);
      else next[bucket].add(value);
      return next;
    });
  };

  const clearFilters = () =>
    setFilters({ type: new Set(), state: new Set(), group: new Set(), hist: new Set() });

  const activeChipCount =
    filters.type.size + filters.state.size + filters.group.size + filters.hist.size;

  return (
    <TooltipProvider>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          {/* Upload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload reports</CardTitle>
              <CardDescription>OCLC Borrower Transaction-Level Detail report (.xls)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  if (e.dataTransfer.files) handleUpload(e.dataTransfer.files);
                }}
                className={`rounded-md border border-dashed p-3 text-center text-xs transition ${
                  dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 text-muted-foreground'
                }`}
              >
                {dragOver ? 'Drop to import' : 'Drag .xls / .tsv files here'}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                Add Borrower report
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xls,.tsv,.csv,.txt"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files)}
              />
              {uploadError && (
                <p className="text-xs text-destructive">{uploadError}</p>
              )}
              {months.length === 0 ? (
                <p className="text-xs text-muted-foreground">No reports loaded yet.</p>
              ) : (
                <ul className="space-y-1">
                  {months.map((m, i) => (
                    <li key={i} className="flex items-center justify-between rounded border bg-muted/50 px-2 py-1 text-xs">
                      <span className="truncate">{m.period || `Month ${i + 1}`}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${m.period}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setMonths(months.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Home library */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your library</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="home-state" className="text-xs">Home state</Label>
                  <Input
                    id="home-state"
                    value={settings.homeState}
                    maxLength={2}
                    onChange={(e) => updateSettings({ homeState: e.target.value.toUpperCase() })}
                  />
                </div>
                <div>
                  <Label htmlFor="home-symbol" className="text-xs">Home symbol</Label>
                  <Input
                    id="home-symbol"
                    value={settings.homeSymbol}
                    maxLength={10}
                    placeholder="e.g. FTL"
                    onChange={(e) => updateSettings({ homeSymbol: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The state powers the same-state boost. Home symbol hides your own
                library from candidate lists.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="-mx-2 mt-1 justify-start"
                onClick={() => {
                  if (!navigator.geolocation) return;
                  navigator.geolocation.getCurrentPosition(
                    (pos) =>
                      updateSettings({
                        homeLat: parseFloat(pos.coords.latitude.toFixed(4)),
                        homeLng: parseFloat(pos.coords.longitude.toFixed(4))
                      }),
                    () => { /* silent on denial */ }
                  );
                }}
              >
                📍 Use my location
              </Button>
            </CardContent>
          </Card>

          {/* Scoring weights */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scoring weights</CardTitle>
              <CardDescription>Pick a preset or tune sliders.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Scoring presets">
                {Object.keys(PRESETS).map((key) => (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyPreset(key)}>
                        {PRESET_LABELS[key].label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{PRESET_LABELS[key].description}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
              {(['speed', 'fill', 'volume', 'consistency', 'local'] as Array<keyof Weights>).map((k) => (
                <div key={k} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="capitalize">{k === 'local' ? 'Same state' : k === 'fill' ? 'Fill rate' : k}</span>
                    <span className="tabular-nums text-muted-foreground">{settings.weights[k]}</span>
                  </div>
                  <Slider
                    min={0}
                    max={50}
                    step={1}
                    value={[settings.weights[k]]}
                    onValueChange={([v]) => onWeightChange(k, v)}
                    aria-label={`${k} weight`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Facets */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Filters</CardTitle>
              {activeChipCount > 0 && (
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={clearFilters}>
                  Clear all
                </button>
              )}
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              {Object.keys(typeCounts).length > 0 && (
                <FacetGroup
                  title="Library type"
                  options={Object.entries(typeCounts).sort(([a], [b]) => a.localeCompare(b))}
                  selected={filters.type}
                  onToggle={(v) => toggleFilter('type', v)}
                />
              )}
              {Object.keys(stateCounts).length > 0 && (
                <FacetGroup
                  title="State"
                  options={Object.entries(stateCounts).sort(([a], [b]) => stateLabel(a).localeCompare(stateLabel(b)))}
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
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Your history
                </h3>
                <div className="space-y-1.5">
                  {Object.entries(HIST_LABELS).map(([k, label]) => (
                    <label key={k} className="flex cursor-pointer items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Checkbox
                          checked={filters.hist.has(k)}
                          onCheckedChange={() => toggleFilter('hist', k)}
                        />
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <SavedGroupsCard source="rankings" onRestore={(syms) => selection.setSelected(new Set(syms))} />
        </aside>

        <section className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <strong>{filtered.length}</strong> match{filtered.length === 1 ? '' : 'es'}
              {selection.count > 0 && (
                <span className="ml-2 text-muted-foreground">· {selection.count} selected</span>
              )}
              {months.length > 0 && (
                <span className="ml-2 text-muted-foreground">
                  · {months.length} month{months.length === 1 ? '' : 's'} loaded
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex rounded-md border bg-background p-0.5" role="group" aria-label="View mode">
                <Button
                  size="sm"
                  variant={viewMode === 'cards' ? 'default' : 'ghost'}
                  className="h-7 px-2"
                  onClick={() => setViewMode('cards')}
                  aria-pressed={viewMode === 'cards'}
                >
                  <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />Cards
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'chart' ? 'default' : 'ghost'}
                  className="h-7 px-2"
                  onClick={() => setViewMode('chart')}
                  aria-pressed={viewMode === 'chart'}
                >
                  <ScatterChart className="mr-1.5 h-3.5 w-3.5" />Chart
                </Button>
              </div>
              <Button size="sm" variant="outline" onClick={() => selection.selectTop(filtered, 10)} disabled={filtered.length === 0}>
                Top 10
              </Button>
              <Button size="sm" variant="outline" onClick={() => selection.selectAll(filtered)} disabled={filtered.length === 0}>
                Select all
              </Button>
              {selection.count > 0 && (
                <Button size="sm" variant="ghost" onClick={selection.clear}>Clear</Button>
              )}
              {months.length >= 2 && (
                <Button size="sm" variant="outline" onClick={() => setCompareOpen(true)}>
                  <GitCompare className="mr-1.5 h-3.5 w-3.5" />Compare periods
                </Button>
              )}
              <Button size="sm" disabled={selection.count === 0} onClick={() => setSaveOpen(true)}>
                Build group ({selection.count})
              </Button>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">Sort: best match</SelectItem>
                  <SelectItem value="speed">Sort: turnaround time</SelectItem>
                  <SelectItem value="fill">Sort: fill rate</SelectItem>
                  <SelectItem value="volume">Sort: volume</SelectItem>
                  <SelectItem value="consistency">Sort: consistency</SelectItem>
                </SelectContent>
              </Select>
              <PageSizeSelect value={pageSize} onChange={setPageSize} />
            </div>
          </div>

          {/* Active filter chips */}
          {activeChipCount > 0 && <ActiveChips filters={filters} setFilters={setFilters} />}

          {/* List */}
          {months.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Upload a Borrower report on the left to populate rankings.
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No lenders match these filters.
              </CardContent>
            </Card>
          ) : viewMode === 'chart' ? (
            <RankingsChart
              rows={filtered}
              weights={settings.weights}
              homeState={settings.homeState}
              selected={selection.selected}
              onToggle={(sym) => selection.toggle(sym)}
            />
          ) : (
            <>
              <ScrollArea className="h-[calc(100vh-320px)] pr-3">
                <div className="space-y-3" role="list" ref={listRef}>
                  {visibleSlice.map((l) => (
                    <LenderCard
                      key={l.symbol}
                      l={l}
                      weights={settings.weights}
                      homeState={settings.homeState}
                      selected={selection.isSelected(l.symbol)}
                      onToggle={() => selection.toggle(l.symbol)}
                      hasNote={!!notes[l.symbol]}
                      noteOpen={openNoteSym === l.symbol}
                      onToggleNote={() => setOpenNoteSym((cur) => (cur === l.symbol ? null : l.symbol))}
                      periods={months.map((m) => m.period)}
                    />
                  ))}
                </div>
              </ScrollArea>
              <Pagination
                total={filtered.length}
                pageSize={pageSize}
                page={page}
                onPage={setPage}
                scrollToRef={listRef}
              />
            </>
          )}
        </section>

        <SaveGroupDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          symbols={Array.from(selection.selected)}
          defaultName={defaultGroupName(filters, false)}
          onSave={(name, symbols) => {
            setSavedGroups([
              { name, symbols, createdAt: new Date().toISOString(), source: 'rankings' },
              ...savedGroups.filter((g) => g.name !== name)
            ]);
          }}
        />

        <ComparePeriodsDialog open={compareOpen} onOpenChange={setCompareOpen} />
      </div>
    </TooltipProvider>
  );
}

function defaultGroupName(filters: ActiveFilters, isDiscover: boolean): string {
  const parts: string[] = [];
  if (isDiscover) parts.push('Discover');
  if (filters.state.size === 1) parts.push(Array.from(filters.state)[0]);
  if (filters.type.size === 1) parts.push(Array.from(filters.type)[0].replace(/[^A-Za-z]/g, ''));
  if (parts.length === (isDiscover ? 1 : 0)) parts.push('TopLenders');
  return parts.join('_').toUpperCase();
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
              <span>{renderLabel ? renderLabel(v) : v}</span>
            </span>
            <span className="tabular-nums text-xs text-muted-foreground">{c}</span>
          </label>
        ))}
      </div>
      {maxVisible && options.length > maxVisible && (
        <button
          type="button"
          className="mt-2 text-xs text-primary hover:underline"
          onClick={() => setExpanded(e => !e)}
        >
          {expanded ? `Show fewer` : `Show ${options.length - maxVisible} more…`}
        </button>
      )}
    </div>
  );
}

function ActiveChips({
  filters,
  setFilters
}: {
  filters: ActiveFilters;
  setFilters: (next: ActiveFilters) => void;
}) {
  const remove = (bucket: keyof ActiveFilters, value: string) => {
    const next = { ...filters, [bucket]: new Set(filters[bucket]) };
    next[bucket].delete(value);
    setFilters(next);
  };
  const chips: Array<{ label: string; onRemove: () => void }> = [];
  filters.type.forEach((t) => chips.push({ label: `Type: ${t}`, onRemove: () => remove('type', t) }));
  filters.state.forEach((s) => chips.push({ label: `State: ${stateLabel(s)}`, onRemove: () => remove('state', s) }));
  filters.group.forEach((g) => chips.push({ label: `Group: ${g}`, onRemove: () => remove('group', g) }));
  filters.hist.forEach((h) => chips.push({ label: HIST_LABELS[h] || h, onRemove: () => remove('hist', h) }));
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Filtering by</span>
      {chips.map((c, i) => (
        <Badge key={i} variant="secondary" className="gap-1 pr-1 font-normal">
          {c.label}
          <button
            type="button"
            aria-label={`Remove ${c.label}`}
            className="rounded-full hover:bg-background/50"
            onClick={c.onRemove}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

function LenderCard({
  l,
  weights,
  homeState,
  selected,
  onToggle,
  hasNote,
  noteOpen,
  onToggleNote,
  periods
}: {
  l: MergedLender;
  weights: Weights;
  homeState: string;
  selected: boolean;
  onToggle: () => void;
  hasNote: boolean;
  noteOpen: boolean;
  onToggleNote: () => void;
  periods: Array<string | undefined>;
}) {
  const score = totalScore(l, weights, homeState);
  const subs = subscores(l, homeState);
  const fr = fillRate(l);
  const days = avgDays(l);
  const scoreColor =
    score >= 70 ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' :
    score >= 50 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
    'bg-muted text-muted-foreground';
  return (
    <Card role="listitem" className={selected ? 'border-primary ring-1 ring-primary' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              className="mt-1"
              aria-label={`Select ${l.name}`}
            />
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{l.name}</CardTitle>
              <CardDescription className="text-xs">
                {l.symbol} · {l.type || 'Other'} · {l.state || '—'}
              </CardDescription>
              <div className="flex items-center gap-3">
                <MonthDots
                  filledMonths={l.filledMonths}
                  requestedMonths={l.requestedMonths}
                  monthsSpan={l.monthsSpan}
                  periods={periods}
                />
                <Sparkline
                  filledMonths={l.filledMonths}
                  requestedMonths={l.requestedMonths}
                  monthsSpan={l.monthsSpan}
                />
              </div>
            </div>
          </div>
          <span
            className={`shrink-0 rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums ${scoreColor}`}
            title="Composite score from weighted subscores"
          >
            {score}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Stat label="Requested" value={l.requested} muted={l.requested === 0} />
          <Stat label="Filled" value={l.filled} muted={l.filled === 0} />
          <Stat label="Fill rate" value={l.requested > 0 ? `${fr.toFixed(0)}%` : '—'} muted={l.requested === 0} />
          <Stat label="Avg days" value={l.filled > 0 ? days.toFixed(1) : '—'} muted={l.filled === 0} />
          <Stat label="Months" value={`${l.monthsPresent}/${l.monthsSpan}`} />
        </div>
        {/* Subscore explain row */}
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-5">
          <Sub label="Speed" v={subs.speed} />
          <Sub label="Fill" v={subs.fill} />
          <Sub label="Volume" v={subs.volume} />
          <Sub label="Consist" v={subs.consistency} />
          <Sub label="Local" v={subs.local} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {l.state === homeState && <Badge variant="secondary">Same state</Badge>}
          {l.monthsPresent === l.monthsSpan && l.monthsSpan > 1 && <Badge variant="secondary">Every month</Badge>}
          {hasNote && <Badge variant="outline" className="gap-1"><StickyNote className="h-3 w-3" />Note</Badge>}
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={onToggleNote}>
            {noteOpen ? 'Hide note' : hasNote ? 'Edit note' : 'Add note'}
          </Button>
        </div>
        {noteOpen && <NoteEditor symbol={l.symbol} onClose={onToggleNote} />}
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

function Sub({ label, v }: { label: string; v: number }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between"><span>{label}</span><span className="tabular-nums">{v}</span></div>
      <div className="h-1 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${v}%` }} /></div>
    </div>
  );
}

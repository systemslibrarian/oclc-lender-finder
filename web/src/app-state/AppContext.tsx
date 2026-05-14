import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_WEIGHTS } from '@/lib/scoring';
import { STORAGE_KEYS, readJSON, writeJSON } from '@/lib/storage';
import type { DirectoryEntry, MonthReport, PolicyEntry, TabName, Weights } from '@/lib/types';
import { POLICY_SOURCES, loadBundledDirectory, loadPolicyFile } from '@/lib/directory';

export interface SettingsState {
  homeState: string;
  homeLat: number;
  homeLng: number;
  homeSymbol: string;
  weights: Weights;
}

export interface SavedGroup {
  name: string;
  symbols: string[];
  createdAt: string;
  source?: 'rankings' | 'discover';
}

interface AppStateValue {
  // Persisted user data
  months: MonthReport[];
  setMonths: (next: MonthReport[]) => void;

  importedDirectory: DirectoryEntry[];
  setImportedDirectory: (next: DirectoryEntry[]) => void;

  settings: SettingsState;
  updateSettings: (patch: Partial<SettingsState>) => void;
  updateWeights: (patch: Partial<Weights>) => void;
  resetWeights: () => void;

  notes: Record<string, string>;
  setNote: (sym: string, text: string) => void;

  savedGroups: SavedGroup[];
  setSavedGroups: (next: SavedGroup[]) => void;

  auditHoldings: string[];
  setAuditHoldings: (next: string[]) => void;

  // UI
  activeTab: TabName;
  setActiveTab: (next: TabName) => void;

  // Async-loaded data
  bundledDirectory: DirectoryEntry[];
  policies: Record<string, Map<string, PolicyEntry>>;
  isLoadingDirectory: boolean;
}

const AppStateContext = createContext<AppStateValue | null>(null);

const DEFAULT_SETTINGS: SettingsState = {
  homeState: 'FL',
  homeLat: 30.4383,
  homeLng: -84.2807,
  homeSymbol: '',
  weights: { ...DEFAULT_WEIGHTS }
};

function loadInitialSettings(): SettingsState {
  const raw = readJSON<Partial<SettingsState> | null>(STORAGE_KEYS.settings, null);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights } };
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    weights: { ...DEFAULT_SETTINGS.weights, ...(raw.weights || {}) }
  };
}

function loadInitialTab(): TabName {
  const raw = readJSON<{ activeTab?: string } | null>(STORAGE_KEYS.ui, null);
  if (raw && raw.activeTab && (['rankings', 'discover', 'audit'] as string[]).includes(raw.activeTab)) {
    return raw.activeTab as TabName;
  }
  return 'rankings';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [months, setMonths] = useState<MonthReport[]>(() => readJSON<MonthReport[]>(STORAGE_KEYS.months, []));
  const [importedDirectory, setImportedDirectory] = useState<DirectoryEntry[]>(() =>
    readJSON<DirectoryEntry[]>(STORAGE_KEYS.importedDir, [])
  );
  const [settings, setSettingsState] = useState<SettingsState>(loadInitialSettings);
  const [notes, setNotes] = useState<Record<string, string>>(() => readJSON(STORAGE_KEYS.notes, {}));
  const [savedGroups, setSavedGroups] = useState<SavedGroup[]>(() => readJSON(STORAGE_KEYS.savedGroups, []));
  const [auditHoldings, setAuditHoldings] = useState<string[]>(() =>
    readJSON<string[]>(STORAGE_KEYS.audit, []).filter(s => typeof s === 'string')
  );
  const [activeTab, setActiveTabState] = useState<TabName>(loadInitialTab);

  const [bundledDirectory, setBundledDirectory] = useState<DirectoryEntry[]>([]);
  const [policies, setPolicies] = useState<Record<string, Map<string, PolicyEntry>>>({});
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(true);

  // Persist on change
  useEffect(() => writeJSON(STORAGE_KEYS.months, months), [months]);
  useEffect(() => writeJSON(STORAGE_KEYS.importedDir, importedDirectory), [importedDirectory]);
  useEffect(() => writeJSON(STORAGE_KEYS.settings, settings), [settings]);
  useEffect(() => writeJSON(STORAGE_KEYS.notes, notes), [notes]);
  useEffect(() => writeJSON(STORAGE_KEYS.savedGroups, savedGroups), [savedGroups]);
  useEffect(() => writeJSON(STORAGE_KEYS.audit, auditHoldings), [auditHoldings]);
  useEffect(() => writeJSON(STORAGE_KEYS.ui, { activeTab }), [activeTab]);

  // Fetch directory + policy rosters once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingDirectory(true);
      const [bundled, ...policyMaps] = await Promise.all([
        loadBundledDirectory(),
        ...POLICY_SOURCES.map(s => loadPolicyFile(s.url))
      ]);
      if (cancelled) return;
      const policiesByGroup: Record<string, Map<string, PolicyEntry>> = {};
      POLICY_SOURCES.forEach((s, i) => {
        policiesByGroup[s.groupCode] = policyMaps[i];
      });
      setBundledDirectory(bundled);
      setPolicies(policiesByGroup);
      setIsLoadingDirectory(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      months,
      setMonths,
      importedDirectory,
      setImportedDirectory,
      settings,
      updateSettings: (patch) => setSettingsState(prev => ({ ...prev, ...patch })),
      updateWeights: (patch) =>
        setSettingsState(prev => ({ ...prev, weights: { ...prev.weights, ...patch } })),
      resetWeights: () =>
        setSettingsState(prev => ({ ...prev, weights: { ...DEFAULT_WEIGHTS } })),
      notes,
      setNote: (sym, text) =>
        setNotes(prev => {
          const v = (text || '').trim();
          const next = { ...prev };
          if (v) next[sym] = v;
          else delete next[sym];
          return next;
        }),
      savedGroups,
      setSavedGroups,
      auditHoldings,
      setAuditHoldings,
      activeTab,
      setActiveTab: setActiveTabState,
      bundledDirectory,
      policies,
      isLoadingDirectory
    }),
    [
      months,
      importedDirectory,
      settings,
      notes,
      savedGroups,
      auditHoldings,
      activeTab,
      bundledDirectory,
      policies,
      isLoadingDirectory
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within an AppProvider');
  return ctx;
}

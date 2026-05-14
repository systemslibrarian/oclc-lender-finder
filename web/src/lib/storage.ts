// localStorage keys preserved from the vanilla app so existing users keep
// their data when the React build goes live.

export const STORAGE_KEYS = {
  months: 'lenderFinder.months.v1',
  settings: 'lenderFinder.settings.v1',
  importedDir: 'lenderFinder.importedDir.v1',
  ui: 'lenderFinder.ui.v1',
  notes: 'lenderFinder.notes.v1',
  savedGroups: 'lenderFinder.savedGroups.v1',
  audit: 'lenderFinder.audit.v1',
  rankingsFilters: 'lenderFinder.rankingsFilters.v1',
  discoverFilters: 'lenderFinder.discoverFilters.v1'
} as const;

// Helper: stringify Sets in filter state so localStorage round-trips cleanly.
export function serializeFilters(filters: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(filters as Record<string, unknown>).forEach(([k, v]) => {
    if (v instanceof Set) out[k] = Array.from(v as Set<string>);
    else out[k] = v;
  });
  return out;
}

export function deserializeFilters<T extends object>(
  raw: Record<string, unknown> | null,
  setKeys: ReadonlyArray<string>,
  defaults: T
): T {
  if (!raw) return defaults;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  Object.entries(raw).forEach(([k, v]) => {
    if (setKeys.includes(k) && Array.isArray(v)) {
      out[k] = new Set(v.filter((x) => typeof x === 'string'));
    } else {
      out[k] = v;
    }
  });
  return out as T;
}

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Could not persist ${key}:`, e);
  }
}

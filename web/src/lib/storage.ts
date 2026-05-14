// localStorage keys preserved from the vanilla app so existing users keep
// their data when the React build goes live.

export const STORAGE_KEYS = {
  months: 'lenderFinder.months.v1',
  settings: 'lenderFinder.settings.v1',
  importedDir: 'lenderFinder.importedDir.v1',
  ui: 'lenderFinder.ui.v1',
  notes: 'lenderFinder.notes.v1',
  savedGroups: 'lenderFinder.savedGroups.v1',
  audit: 'lenderFinder.audit.v1'
} as const;

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

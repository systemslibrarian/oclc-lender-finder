// Whole-session export / import. Captures every localStorage key the app
// owns (months, settings, importedDir, notes, savedGroups, audit, ui) and
// round-trips them through a JSON file the user can carry to another
// browser.

import { STORAGE_KEYS, readJSON, writeJSON } from './storage';

interface SessionPayload {
  _format: 'lender-finder-session';
  _version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

export function exportSession(): void {
  const payload: SessionPayload = {
    _format: 'lender-finder-session',
    _version: 1,
    exportedAt: new Date().toISOString(),
    data: {}
  };
  Object.entries(STORAGE_KEYS).forEach(([k, key]) => {
    const value = readJSON<unknown>(key, null);
    if (value !== null) payload.data[k] = value;
  });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `lender-finder-session-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function importSessionFromFile(file: File): Promise<{ keys: string[] }> {
  const text = await file.text();
  const parsed = JSON.parse(text) as SessionPayload;
  if (!parsed || parsed._format !== 'lender-finder-session') {
    throw new Error('That file does not look like a Lender Finder session export.');
  }
  const written: string[] = [];
  Object.entries(STORAGE_KEYS).forEach(([k, key]) => {
    const v = parsed.data[k];
    if (v !== undefined) {
      writeJSON(key, v);
      written.push(k);
    }
  });
  return { keys: written };
}

// Merges the bundled directory, the user's imports, and the OCLC group rosters
// (LVIS / FILM / FLIN / LYRA / PL@A) into a single deduplicated list. Mirrors
// getMergedDirectory() from the vanilla app, but typed.

import type { DirectoryEntry, PolicyEntry, PolicyFile, BundledDirectoryFile } from './types';

export const GROUP_NAMES: Record<string, string> = {
  LVIS: 'Libraries Very Interested in Sharing',
  FILM: 'Libraries supplying AV materials free of charge',
  FLIN: 'Florida Library Information Network',
  'PL@A': 'Panhandle Library Access Network',
  SIXX: 'So6 Group Access (SOLINET, the Southeastern Library Network)',
  'SL#N': 'Soline (SOLINET, the Southeastern Library Network)',
  LYRA: 'Lyrasis'
};

export const ALLOWED_GROUPS = new Set(Object.keys(GROUP_NAMES));

export interface PolicySource {
  groupCode: string;
  url: string;
}

export const POLICY_SOURCES: PolicySource[] = [
  { groupCode: 'LVIS', url: 'lvis-policies.json' },
  { groupCode: 'FILM', url: 'film-policies.json' },
  { groupCode: 'FLIN', url: 'flin-policies.json' },
  { groupCode: 'LYRA', url: 'lyra-policies.json' },
  { groupCode: 'PL@A', url: 'pla-policies.json' }
];

export async function loadBundledDirectory(): Promise<DirectoryEntry[]> {
  try {
    const r = await fetch('lenders-directory.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data: BundledDirectoryFile = await r.json();
    return data.lenders || [];
  } catch (e) {
    console.warn('Could not load bundled directory:', e);
    return [];
  }
}

export async function loadPolicyFile(url: string): Promise<Map<string, PolicyEntry>> {
  const map = new Map<string, PolicyEntry>();
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data: PolicyFile = await r.json();
    Object.keys(data.libraries || {}).forEach(sym => map.set(sym, data.libraries[sym]));
  } catch (e) {
    console.warn(`Could not load ${url}:`, e);
  }
  return map;
}

export interface DirectorySources {
  bundled: DirectoryEntry[];
  imported: DirectoryEntry[];
  policies: Record<string, Map<string, PolicyEntry>>; // keyed by groupCode
}

/**
 * Merge sources into a single directory list. Imported entries override
 * bundled ones with the same symbol; policy entries either decorate matches
 * (adding the group affiliation + lat/lng + response-time fields) or
 * stand alone as policy-only listings.
 */
export function mergeDirectory(s: DirectorySources): DirectoryEntry[] {
  const map = new Map<string, DirectoryEntry>();
  s.bundled.forEach(l => map.set(l.symbol, { ...l, groups: [...(l.groups || [])], _imported: false }));
  s.imported.forEach(l => map.set(l.symbol, { ...l, groups: [...(l.groups || [])], _imported: true }));

  Object.entries(s.policies).forEach(([groupCode, policies]) => {
    policies.forEach((entry, sym) => {
      const existing = map.get(sym);
      if (existing) {
        if (!existing.groups.includes(groupCode)) existing.groups.push(groupCode);
        if (existing.lat == null && typeof entry.lat === 'number') existing.lat = entry.lat;
        if (existing.lng == null && typeof entry.lng === 'number') existing.lng = entry.lng;
        if (existing.copiesDaysToRespond == null && typeof entry.copiesDaysToRespond === 'number') {
          existing.copiesDaysToRespond = entry.copiesDaysToRespond;
        }
        if (existing.loansDaysToRespond == null && typeof entry.loansDaysToRespond === 'number') {
          existing.loansDaysToRespond = entry.loansDaysToRespond;
        }
      } else {
        map.set(sym, {
          symbol: sym,
          name: entry.institution || sym,
          state: entry.state || '',
          type: entry.type || 'Other',
          groups: [groupCode],
          lat: typeof entry.lat === 'number' ? entry.lat : null,
          lng: typeof entry.lng === 'number' ? entry.lng : null,
          copiesDaysToRespond: typeof entry.copiesDaysToRespond === 'number' ? entry.copiesDaysToRespond : null,
          loansDaysToRespond: typeof entry.loansDaysToRespond === 'number' ? entry.loansDaysToRespond : null,
          _imported: false,
          _policyOnly: true
        });
      }
    });
  });

  return Array.from(map.values());
}

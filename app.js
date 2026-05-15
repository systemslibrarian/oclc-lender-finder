(function () {
  'use strict';

  const STORAGE_KEY = 'lenderFinder.months.v1';
  const SETTINGS_KEY = 'lenderFinder.settings.v1';
  const IMPORTED_DIR_KEY = 'lenderFinder.importedDir.v1';
  const UI_KEY = 'lenderFinder.ui.v1';
  const NOTES_KEY = 'lenderFinder.notes.v1';
  const SAVED_GROUPS_KEY = 'lenderFinder.savedGroups.v1';
  const AUDIT_KEY = 'lenderFinder.audit.v1';

  let months = [];
  let bundledDirectory = [];
  let importedDirectory = [];
  let notes = {};
  let savedGroups = [];
  let auditHoldings = [];          // Symbols pasted/uploaded for Audit
  let auditTierFilter = null;      // null = all, otherwise 'top' | 'strong' | 'weak' | 'unused'
  const notesExpanded = new Set();
  let homeState = 'FL';
  let homeLat = 30.4383;
  let homeLng = -84.2807;
  let homeSymbol = '';
  let activeTab = 'rankings';
  let weights = { speed: 25, fill: 30, volume: 15, consistency: 20, local: 10 };
  const expanded = new Set();
  const selected = new Set();
  const dirSelected = new Set();
  const lvisPolicies = new Map();
  const filmPolicies = new Map();
  const flinPolicies = new Map();
  const lyraPolicies = new Map();
  const plaPolicies = new Map();
  const activeFilters = { type: new Set(), state: new Set(), hist: new Set(), group: new Set() };
  const symbolGroups = new Map();
  // Whitelist of group affiliations shown in the facet UI. Other tags (e.g. ARL,
  // ASERL, BTAA) stay on the underlying directory data but are filtered out of
  // the facet so users can't pick them.
  const GROUP_NAMES = {
    'LVIS': 'Libraries Very Interested in Sharing',
    'FILM': 'Libraries supplying AV materials free of charge',
    'FLIN': 'Florida Library Information Network',
    'PL@A': 'Panhandle Library Access Network',
    'SIXX': 'So6 Group Access (SOLINET, the Southeastern Library Network)',
    'SL#N': 'Soline (SOLINET, the Southeastern Library Network)',
    'LYRA': 'Lyrasis'
  };
  const ALLOWED_GROUPS = new Set(Object.keys(GROUP_NAMES));
  // Map US/territory postal codes to full names for facet display.
  const STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
    FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
    ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
    MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
    PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
    TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
    WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    AS: 'American Samoa', GU: 'Guam', MP: 'Northern Mariana Islands',
    PR: 'Puerto Rico', VI: 'U.S. Virgin Islands',
    AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
    NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
    NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
    SK: 'Saskatchewan', YT: 'Yukon'
  };
  const stateLabel = code => {
    const name = STATE_NAMES[code];
    return name ? `${name} (${code})` : (code || '—');
  };
  const stateSort = (a, b) => stateLabel(a[0]).localeCompare(stateLabel(b[0]));
  const dirFilters = { type: new Set(), state: new Set(), group: new Set(), loanDays: new Set(), search: '', maxDist: 0, onlyNew: true, excludeHoldings: true };
  // Pagination state — page-size choices: 50/100/250/All. Page resets to 1
  // whenever filters or sort change (see resetDirPage / resetRankPage).
  let dirPage = 1, dirPageSize = 100;
  let rankPage = 1, rankPageSize = 100;
  const resetDirPage = () => { dirPage = 1; };
  const resetRankPage = () => { rankPage = 1; };

  // Render pagination footer into `wrap`, given total filtered count and
  // a callback to receive the new page number. pageSize === 0 means "all".
  function renderPagination(wrap, total, pageSize, currentPage, onPage) {
    if (!wrap) return;
    if (pageSize === 0 || total <= pageSize) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(Math.max(1, currentPage), pages);
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    // Window: page-2 ... page+2 with first/last
    const windowed = new Set([1, pages, page, page - 1, page + 1, page - 2, page + 2]);
    const visible = [...windowed].filter(p => p >= 1 && p <= pages).sort((a, b) => a - b);
    let html = `<span class="pg-info">${start}–${end} of ${total}</span>`;
    html += `<button class="pg-btn" data-pg="prev" ${page === 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>`;
    let last = 0;
    visible.forEach(p => {
      if (last && p - last > 1) html += `<span class="pg-gap">…</span>`;
      html += `<button class="pg-btn ${p === page ? 'pg-current' : ''}" data-pg="${p}" aria-label="Page ${p}" ${p === page ? 'aria-current="page"' : ''}>${p}</button>`;
      last = p;
    });
    html += `<button class="pg-btn" data-pg="next" ${page === pages ? 'disabled' : ''} aria-label="Next page">›</button>`;
    wrap.innerHTML = html;
    wrap.hidden = false;
    wrap.querySelectorAll('[data-pg]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.pg;
        if (v === 'prev') onPage(page - 1);
        else if (v === 'next') onPage(page + 1);
        else onPage(parseInt(v, 10));
      });
    });
  }

  // Last-rendered filtered lists, used by bulk actions
  let lastFilteredRankings = [];
  let lastFilteredDir = [];

  // Debounce timers
  const debounceTimers = {};
  const debounce = (key, fn, ms = 200) => {
    clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(fn, ms);
  };

  const presets = {
    balanced:  { speed: 25, fill: 30, volume: 15, consistency: 20, local: 10 },
    speed:     { speed: 45, fill: 25, volume: 10, consistency: 15, local: 5 },
    trusted:   { speed: 15, fill: 30, volume: 20, consistency: 30, local: 5 },
    samestate: { speed: 25, fill: 15, volume: 5,  consistency: 5,  local: 50 },
    workhorses:{ speed: 5,  fill: 20, volume: 40, consistency: 30, local: 5 },
    newcomers: { speed: 30, fill: 40, volume: 10, consistency: 5,  local: 15 }
  };

  const histLabels = {
    filled: 'Filled ≥ 1',
    multi: 'Filled ≥ 5',
    fast: 'Avg < 3 days',
    reliable: 'Fill > 75%',
    consistent: '3+ months'
  };

  /* ---------- OCLC report parser (Rankings tab) ---------- */

  function parseTurnaround(s) {
    if (!s || typeof s !== 'string') return 0;
    const parts = s.trim().split(':').map(p => parseInt(p, 10));
    if (parts.length !== 3 || parts.some(isNaN)) return 0;
    return parts[0] * 24 + parts[1] + parts[2] / 60;
  }

  function parseOCLCReport(text) {
    const rawLines = text.split(/\r?\n/);
    let headerIdx = -1, period = '', institution = '';
    for (let i = 0; i < rawLines.length; i++) {
      if (rawLines[i].startsWith('Reporting Period')) period = (rawLines[i].split('\t')[1] || '').trim();
      if (rawLines[i].startsWith('Institution\t')) institution = (rawLines[i].split('\t')[1] || '').trim();
      if ((rawLines[i].match(/\t/g) || []).length > 5 && rawLines[i].includes('Institution Name')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) throw new Error("Couldn't find header row. Is this a Borrower Transaction-Level Detail report?");
    const headers = rawLines[headerIdx].split('\t').map(h => h.trim());
    if (!headers.includes('Requests To Lender')) {
      throw new Error("This is a Lender report (libraries borrowing FROM you). Upload the Borrower report instead.");
    }
    const col = {
      name: headers.indexOf('Institution Name'),
      symbol: headers.indexOf('Institution Symbol'),
      state: headers.indexOf('Institution State'),
      type: headers.indexOf('Library Type'),
      requested: headers.indexOf('Requests To Lender'),
      filled: headers.indexOf('Requests Filled'),
      unfilled: headers.indexOf('Requests Unfilled'),
      avgTime: headers.indexOf('Average Turnaround Time For Filled Requests (dd:hh:mm)')
    };
    if (col.symbol < 0 || col.requested < 0 || col.filled < 0) {
      throw new Error('Report is missing required columns.');
    }
    const rows = [];
    for (let i = headerIdx + 1; i < rawLines.length; i++) {
      const cells = rawLines[i].split('\t');
      const sym = (cells[col.symbol] || '').trim();
      if (!sym) continue;
      rows.push({
        name: (cells[col.name] || '').trim(),
        symbol: sym.toUpperCase(),
        state: (cells[col.state] || '').trim() || '—',
        type: (cells[col.type] || '').trim() || 'Other',
        requested: parseInt(cells[col.requested]) || 0,
        filled: parseInt(cells[col.filled]) || 0,
        unfilled: parseInt(cells[col.unfilled]) || 0,
        avgHours: parseTurnaround(cells[col.avgTime])
      });
    }
    return { rows, period, institution };
  }

  function mergeMonths() {
    const bySym = {};
    months.forEach((m, monthIdx) => {
      m.rows.forEach(r => {
        if (!bySym[r.symbol]) {
          bySym[r.symbol] = {
            name: r.name, symbol: r.symbol, state: r.state, type: r.type,
            requested: 0, filled: 0, unfilled: 0,
            weightedHours: 0, hoursFilledCount: 0,
            monthsPresent: 0, filledMonths: [], requestedMonths: []
          };
        }
        const agg = bySym[r.symbol];
        agg.requested += r.requested;
        agg.filled += r.filled;
        agg.unfilled += r.unfilled;
        if (r.avgHours > 0 && r.filled > 0) {
          agg.weightedHours += r.avgHours * r.filled;
          agg.hoursFilledCount += r.filled;
        }
        agg.monthsPresent += 1;
        agg.filledMonths[monthIdx] = r.filled;
        agg.requestedMonths[monthIdx] = r.requested;
      });
    });
    return Object.values(bySym).map(l => ({
      ...l,
      avgHours: l.hoursFilledCount > 0 ? l.weightedHours / l.hoursFilledCount : 0,
      monthsSpan: months.length
    }));
  }

  /* ---------- Directory CSV parser (Discover tab) ---------- */

  function parseDirectoryCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV needs a header row plus at least one entry.');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const col = {
      symbol: headers.indexOf('symbol'),
      name: headers.indexOf('name'),
      state: headers.indexOf('state'),
      type: headers.indexOf('type'),
      groups: headers.indexOf('groups'),
      lat: headers.indexOf('lat'),
      lng: headers.indexOf('lng')
    };
    if (col.symbol < 0 || col.name < 0) {
      throw new Error('CSV must have at least a "symbol" and "name" column.');
    }
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVRow(lines[i]);
      const sym = (cells[col.symbol] || '').trim().toUpperCase();
      const name = (cells[col.name] || '').trim();
      if (!sym || !name) continue;
      const groups = col.groups >= 0
        ? (cells[col.groups] || '').split(/[;|]/).map(g => g.trim()).filter(Boolean)
        : [];
      rows.push({
        symbol: sym,
        name: name,
        state: col.state >= 0 ? (cells[col.state] || '').trim().toUpperCase() : '',
        type: col.type >= 0 ? (cells[col.type] || '').trim() || 'Other' : 'Other',
        groups: groups,
        lat: col.lat >= 0 && cells[col.lat] ? parseFloat(cells[col.lat]) : null,
        lng: col.lng >= 0 && cells[col.lng] ? parseFloat(cells[col.lng]) : null
      });
    }
    return rows;
  }

  function parseCSVRow(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else {
        if (c === ',') { result.push(cur); cur = ''; }
        else if (c === '"') inQuotes = true;
        else cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  function getMergedDirectory() {
    const map = new Map();
    bundledDirectory.forEach(l => map.set(l.symbol, { ...l, groups: [...(l.groups || [])], _imported: false }));
    importedDirectory.forEach(l => map.set(l.symbol, { ...l, groups: [...(l.groups || [])], _imported: true }));
    const mergePolicies = (policies, groupCode) => {
      policies.forEach((entry, sym) => {
        if (map.has(sym)) {
          const existing = map.get(sym);
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
            state: entry.state || null,
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
    };
    mergePolicies(lvisPolicies, 'LVIS');
    mergePolicies(filmPolicies, 'FILM');
    mergePolicies(flinPolicies, 'FLIN');
    mergePolicies(lyraPolicies, 'LYRA');
    mergePolicies(plaPolicies, 'PL@A');
    return Array.from(map.values());
  }

  function rebuildSymbolGroups() {
    symbolGroups.clear();
    const add = (sym, g) => {
      let s = symbolGroups.get(sym);
      if (!s) { s = new Set(); symbolGroups.set(sym, s); }
      s.add(g);
    };
    bundledDirectory.forEach(l => (l.groups || []).forEach(g => add(l.symbol, g)));
    importedDirectory.forEach(l => (l.groups || []).forEach(g => add(l.symbol, g)));
    lvisPolicies.forEach((_, sym) => add(sym, 'LVIS'));
    filmPolicies.forEach((_, sym) => add(sym, 'FILM'));
    flinPolicies.forEach((_, sym) => add(sym, 'FLIN'));
    lyraPolicies.forEach((_, sym) => add(sym, 'LYRA'));
    plaPolicies.forEach((_, sym) => add(sym, 'PL@A'));
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function kmToMiles(km) { return km * 0.621371; }

  /* ---------- Scoring (Rankings tab) ---------- */

  function fillRate(l) {
    if (l.requested === 0) return 0;
    return Math.min(100, (l.filled / l.requested) * 100);
  }
  function avgDays(l) { return l.avgHours / 24; }
  function consistencyPct(l) { return l.monthsSpan > 0 ? (l.monthsPresent / l.monthsSpan) * 100 : 0; }

  function subscores(l) {
    const days = avgDays(l);
    return {
      speed: (l.filled > 0 && days > 0) ? Math.max(0, Math.min(100, Math.round(100 - (days - 1) * 18))) : 0,
      fill: Math.round(fillRate(l)),
      volume: Math.min(100, Math.round((l.filled / 30) * 100)),
      consistency: Math.round(consistencyPct(l)),
      local: l.state === homeState ? 100 : 0
    };
  }

  function normalizedWeights() {
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    const out = {};
    Object.keys(weights).forEach(k => { out[k] = weights[k] / total; });
    return out;
  }

  function totalScore(l) {
    const s = subscores(l);
    const w = normalizedWeights();
    return Math.round(s.speed * w.speed + s.fill * w.fill + s.volume * w.volume + s.consistency * w.consistency + s.local * w.local);
  }

  /* ---------- Storage ---------- */

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(months));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ homeState, homeLat, homeLng, homeSymbol, weights }));
      localStorage.setItem(IMPORTED_DIR_KEY, JSON.stringify(importedDirectory));
      localStorage.setItem(UI_KEY, JSON.stringify({ activeTab }));
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
      localStorage.setItem(SAVED_GROUPS_KEY, JSON.stringify(savedGroups));
      localStorage.setItem(AUDIT_KEY, JSON.stringify(auditHoldings));
    } catch (e) {
      console.warn('localStorage save failed:', e);
    }
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) months = parsed;
      }
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) {
        const settings = JSON.parse(s);
        if (settings.homeState) homeState = settings.homeState;
        if (typeof settings.homeLat === 'number') homeLat = settings.homeLat;
        if (typeof settings.homeLng === 'number') homeLng = settings.homeLng;
        if (typeof settings.homeSymbol === 'string') homeSymbol = settings.homeSymbol.toUpperCase();
        if (settings.weights) { weights = { ...weights, ...settings.weights }; weightsTouched = true; }
      }
      const dir = localStorage.getItem(IMPORTED_DIR_KEY);
      if (dir) {
        const parsed = JSON.parse(dir);
        if (Array.isArray(parsed)) importedDirectory = parsed;
      }
      const ui = localStorage.getItem(UI_KEY);
      if (ui) {
        const parsed = JSON.parse(ui);
        if (parsed.activeTab === 'rankings' || parsed.activeTab === 'audit' || parsed.activeTab === 'discover') {
          activeTab = parsed.activeTab;
        }
      }
      const n = localStorage.getItem(NOTES_KEY);
      if (n) {
        const parsed = JSON.parse(n);
        if (parsed && typeof parsed === 'object') notes = parsed;
      }
      const g = localStorage.getItem(SAVED_GROUPS_KEY);
      if (g) {
        const parsed = JSON.parse(g);
        if (Array.isArray(parsed)) savedGroups = parsed;
      }
      const a = localStorage.getItem(AUDIT_KEY);
      if (a) {
        const parsed = JSON.parse(a);
        if (Array.isArray(parsed)) auditHoldings = parsed.filter(s => typeof s === 'string');
      }
    } catch (e) {
      console.warn('localStorage load failed:', e);
    }
  }

  function getNote(symbol) { return (notes && notes[symbol]) || ''; }
  function setNote(symbol, text) {
    const v = (text || '').trim();
    if (v) notes[symbol] = v;
    else delete notes[symbol];
    saveData();
  }

  /* ---------- Saved holdings groups ---------- */

  function saveCurrentGroup(name, source) {
    const trimmed = (name || '').trim();
    if (!trimmed) { alert('Give the group a name first.'); return null; }
    const sourceSet = source === 'discover' ? dirSelected : selected;
    if (sourceSet.size === 0) { alert('Select at least one lender before saving.'); return null; }
    const symbols = [...sourceSet].sort();
    const existing = savedGroups.find(g => g.name.toLowerCase() === trimmed.toLowerCase());
    const now = new Date().toISOString();
    if (existing) {
      if (!confirm(`A saved group named "${existing.name}" already exists. Overwrite it?`)) return null;
      existing.symbols = symbols;
      existing.source = source;
      existing.updatedAt = now;
    } else {
      savedGroups.push({
        id: 'g_' + Math.random().toString(36).slice(2, 10),
        name: trimmed,
        source,
        symbols,
        createdAt: now,
        updatedAt: now
      });
    }
    saveData();
    renderSavedGroups();
    announce(`Saved group "${trimmed}" with ${symbols.length} lenders`);
    return trimmed;
  }

  function loadSavedGroup(id, mode) {
    const g = savedGroups.find(x => x.id === id);
    if (!g) return;
    const targetSet = g.source === 'discover' ? dirSelected : selected;
    if (mode === 'replace') targetSet.clear();
    g.symbols.forEach(s => targetSet.add(s));
    if (g.source === 'discover') {
      if (activeTab !== 'discover') switchTab('discover');
      renderDiscover();
    } else {
      if (activeTab !== 'rankings') switchTab('rankings');
      renderRankings();
    }
    announce(`${mode === 'replace' ? 'Loaded' : 'Appended'} "${g.name}" (${g.symbols.length} lenders)`);
  }

  function deleteSavedGroup(id) {
    const idx = savedGroups.findIndex(x => x.id === id);
    if (idx < 0) return;
    const snapshot = savedGroups[idx];
    savedGroups.splice(idx, 1);
    saveData();
    renderSavedGroups();
    showToast({
      message: `Deleted "${snapshot.name}".`,
      action: 'Undo',
      onAction: () => {
        savedGroups.splice(idx, 0, snapshot);
        saveData();
        renderSavedGroups();
      }
    });
  }

  function renderSavedGroups() {
    ['rankings', 'discover'].forEach(tab => {
      const wrap = document.getElementById('saved-groups-' + tab);
      if (!wrap) return;
      if (savedGroups.length === 0) {
        wrap.innerHTML = '<p class="hint">No saved groups yet. After selecting lenders, click <em>Build holdings group</em> → <em>Save</em> to keep it for next month.</p>';
        return;
      }
      const sorted = [...savedGroups].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      wrap.innerHTML = sorted.map(g => {
        const when = g.updatedAt ? new Date(g.updatedAt).toLocaleDateString() : '';
        const src = g.source === 'discover' ? 'Discover' : 'Rankings';
        return `<div class="saved-group" data-group-id="${escapeHtml(g.id)}">
          <div class="saved-group-top">
            <div class="saved-group-name" title="${escapeHtml(g.name)}">${escapeHtml(g.name)}</div>
            <button class="month-remove" data-delete-group="${escapeHtml(g.id)}" aria-label="Delete ${escapeHtml(g.name)}">×</button>
          </div>
          <div class="saved-group-meta">${g.symbols.length} symbols · ${src}${when ? ' · ' + when : ''}</div>
          <div class="saved-group-actions">
            <button class="ghost-btn" data-load-group="${escapeHtml(g.id)}" data-mode="replace">Load</button>
            <button class="ghost-btn" data-load-group="${escapeHtml(g.id)}" data-mode="append">Append</button>
            <button class="ghost-btn" data-copy-group="${escapeHtml(g.id)}">Copy symbols</button>
          </div>
        </div>`;
      }).join('');
      wrap.querySelectorAll('[data-load-group]').forEach(btn => {
        btn.addEventListener('click', () => loadSavedGroup(btn.dataset.loadGroup, btn.dataset.mode));
      });
      wrap.querySelectorAll('[data-delete-group]').forEach(btn => {
        btn.addEventListener('click', () => deleteSavedGroup(btn.dataset.deleteGroup));
      });
      wrap.querySelectorAll('[data-copy-group]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const g = savedGroups.find(x => x.id === btn.dataset.copyGroup);
          if (!g) return;
          try {
            await navigator.clipboard.writeText(g.symbols.join(' '));
            const orig = btn.textContent;
            btn.textContent = '✓ Copied';
            setTimeout(() => { btn.textContent = orig; }, 1500);
          } catch (e) {
            alert(g.symbols.join(' '));
          }
        });
      });
    });
  }

  async function loadBundledDirectory() {
    try {
      const r = await fetch('lenders-directory.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      bundledDirectory = data.lenders || [];
    } catch (e) {
      console.warn('Could not load bundled directory:', e);
      bundledDirectory = [];
    }
  }

  async function loadLvisPolicies() {
    try {
      const r = await fetch('lvis-policies.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const libs = data.libraries || {};
      Object.keys(libs).forEach(sym => lvisPolicies.set(sym, libs[sym]));
    } catch (e) {
      console.warn('Could not load LVIS policies:', e);
    }
  }

  async function loadFilmPolicies() {
    try {
      const r = await fetch('film-policies.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const libs = data.libraries || {};
      Object.keys(libs).forEach(sym => filmPolicies.set(sym, libs[sym]));
    } catch (e) {
      console.warn('Could not load FILM policies:', e);
    }
  }

  async function loadFlinPolicies() {
    try {
      const r = await fetch('flin-policies.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const libs = data.libraries || {};
      Object.keys(libs).forEach(sym => flinPolicies.set(sym, libs[sym]));
    } catch (e) {
      console.warn('Could not load FLIN policies:', e);
    }
  }

  async function loadLyraPolicies() {
    try {
      const r = await fetch('lyra-policies.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const libs = data.libraries || {};
      Object.keys(libs).forEach(sym => lyraPolicies.set(sym, libs[sym]));
    } catch (e) {
      console.warn('Could not load LYRA policies:', e);
    }
  }

  async function loadPlaPolicies() {
    try {
      const r = await fetch('pla-policies.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const libs = data.libraries || {};
      Object.keys(libs).forEach(sym => plaPolicies.set(sym, libs[sym]));
    } catch (e) {
      console.warn('Could not load PL@A policies:', e);
    }
  }

  function sortMonthsByPeriod() {
    months.sort((a, b) => (a.period || '').localeCompare(b.period || ''));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Clamp a facet wrapper to the height of its first N rows so the rest
  // scrolls. Measures real layout so the height tracks the actual rendered
  // font/line-height. Skipped when the element isn't laid out yet (e.g.
  // hidden tab); clampAllFacets() re-runs after tab switch.
  function clampFacetToRows(wrap, n) {
    if (!wrap) return;
    const rows = wrap.querySelectorAll('.facet');
    if (rows.length <= n) {
      wrap.classList.remove('facet-scroll');
      wrap.style.maxHeight = '';
      return;
    }
    wrap.classList.add('facet-scroll');
    if (wrap.offsetParent === null) return; // hidden — measure later
    const wrapTop = wrap.getBoundingClientRect().top;
    const lastVisible = rows[n - 1].getBoundingClientRect().bottom;
    if (lastVisible > wrapTop) {
      wrap.style.maxHeight = (lastVisible - wrapTop) + 'px';
    }
  }

  function clampAllFacets() {
    [
      'type-facets', 'state-facets',
      'dir-type-facets', 'dir-state-facets'
    ].forEach(id => clampFacetToRows(document.getElementById(id), 5));
  }

  /* ---------- Period-over-period comparison ---------- */

  function aggregateRangeStats(monthIdxList) {
    const bySym = new Map();
    monthIdxList.forEach(idx => {
      const m = months[idx];
      if (!m) return;
      m.rows.forEach(r => {
        const agg = bySym.get(r.symbol) || {
          name: r.name, state: r.state, type: r.type,
          requested: 0, filled: 0, unfilled: 0,
          weightedHours: 0, hoursFilledCount: 0
        };
        agg.requested += r.requested;
        agg.filled += r.filled;
        agg.unfilled += r.unfilled;
        if (r.avgHours > 0 && r.filled > 0) {
          agg.weightedHours += r.avgHours * r.filled;
          agg.hoursFilledCount += r.filled;
        }
        bySym.set(r.symbol, agg);
      });
    });
    bySym.forEach(agg => {
      agg.avgHours = agg.hoursFilledCount > 0 ? agg.weightedHours / agg.hoursFilledCount : 0;
    });
    return bySym;
  }

  function showCompareModal() {
    if (months.length < 2) {
      showToast({ message: 'Load at least 2 months of reports to compare.', kind: 'err' });
      return;
    }
    const mid = Math.floor(months.length / 2);
    const sideA = new Set(months.slice(0, mid).map((_, i) => i));
    const sideB = new Set(months.slice(mid).map((_, i) => mid + i));

    openModal('Compare periods', `<div id="compare-body"></div>`);
    // Widen the modal for the table
    const modal = document.querySelector('#modal-backdrop .modal');
    if (modal) modal.classList.add('modal-wide');
    renderCompareBody();

    function renderCompareBody() {
      const monthOpts = (which, set) => months.map((m, i) => `
        <label class="facet" style="font-size:12px; padding: 3px 0;">
          <span><input type="checkbox" data-cmp-${which}="${i}" ${set.has(i) ? 'checked' : ''}>${escapeHtml(m.period || ('Month ' + (i + 1)))}</span>
        </label>
      `).join('');

      const body = document.getElementById('compare-body');
      body.innerHTML = `
        <div class="compare-pickers">
          <div>
            <h3 style="margin-top:0;">Period A (baseline)</h3>
            ${monthOpts('a', sideA)}
          </div>
          <div>
            <h3 style="margin-top:0;">Period B (compare to A)</h3>
            ${monthOpts('b', sideB)}
          </div>
        </div>
        <div id="compare-results"></div>
        <div style="display:flex; gap:8px; margin-top:14px; justify-content:flex-end; flex-wrap:wrap;">
          <button class="ghost-btn" id="compare-export-csv" type="button">Download CSV</button>
          <button class="primary-btn" id="compare-close" type="button">Done</button>
        </div>
      `;
      body.querySelectorAll('[data-cmp-a]').forEach(cb => cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.cmpA);
        if (cb.checked) sideA.add(idx); else sideA.delete(idx);
        recompute();
      }));
      body.querySelectorAll('[data-cmp-b]').forEach(cb => cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.cmpB);
        if (cb.checked) sideB.add(idx); else sideB.delete(idx);
        recompute();
      }));
      body.querySelector('#compare-close').addEventListener('click', closeModal);
      body.querySelector('#compare-export-csv').addEventListener('click', exportComparisonCSV);
      recompute();
    }

    function buildComparisonRows() {
      const aMonths = [...sideA].sort((a, b) => a - b);
      const bMonths = [...sideB].sort((a, b) => a - b);
      const a = aggregateRangeStats(aMonths);
      const b = aggregateRangeStats(bMonths);
      const syms = new Set([...a.keys(), ...b.keys()]);
      const rows = [];
      syms.forEach(sym => {
        const aL = a.get(sym), bL = b.get(sym);
        const ref = aL || bL;
        const aFR = aL && aL.requested > 0 ? (aL.filled / aL.requested) * 100 : null;
        const bFR = bL && bL.requested > 0 ? (bL.filled / bL.requested) * 100 : null;
        const aDays = aL && aL.filled > 0 ? aL.avgHours / 24 : null;
        const bDays = bL && bL.filled > 0 ? bL.avgHours / 24 : null;
        rows.push({
          symbol: sym, name: ref.name, state: ref.state, type: ref.type,
          aFilled: aL ? aL.filled : 0, bFilled: bL ? bL.filled : 0,
          aFR, bFR, aDays, bDays,
          frDelta: (aFR != null && bFR != null) ? bFR - aFR : null,
          daysDelta: (aDays != null && bDays != null) ? bDays - aDays : null,
          volDelta: (bL ? bL.filled : 0) - (aL ? aL.filled : 0),
          inA: !!aL, inB: !!bL
        });
      });
      rows.sort((x, y) => Math.abs(y.frDelta || 0) - Math.abs(x.frDelta || 0));
      return rows;
    }

    function exportComparisonCSV() {
      const rows = buildComparisonRows();
      const out = [['Symbol', 'Name', 'State', 'A Filled', 'B Filled', 'Vol Δ', 'A FillRate%', 'B FillRate%', 'FR Δ', 'A AvgDays', 'B AvgDays', 'Days Δ']];
      rows.forEach(r => {
        out.push([
          r.symbol, '"' + r.name.replace(/"/g, '""') + '"', r.state,
          r.aFilled, r.bFilled, r.volDelta,
          r.aFR != null ? r.aFR.toFixed(0) : '',
          r.bFR != null ? r.bFR.toFixed(0) : '',
          r.frDelta != null ? r.frDelta.toFixed(0) : '',
          r.aDays != null ? r.aDays.toFixed(1) : '',
          r.bDays != null ? r.bDays.toFixed(1) : '',
          r.daysDelta != null ? r.daysDelta.toFixed(1) : ''
        ]);
      });
      const csv = out.map(r => r.join(',')).join('\n');
      downloadFile('period-comparison.csv', csv, 'text/csv');
    }

    function recompute() {
      const results = document.getElementById('compare-results');
      if (sideA.size === 0 || sideB.size === 0) {
        results.innerHTML = '<p class="hint" style="text-align:center; padding: 20px;">Pick at least one month for each period.</p>';
        return;
      }
      const rows = buildComparisonRows();
      const newInB = rows.filter(r => !r.inA && r.inB).length;
      const droppedInB = rows.filter(r => r.inA && !r.inB).length;
      const improved = rows.filter(r => r.frDelta != null && r.frDelta > 5).length;
      const declined = rows.filter(r => r.frDelta != null && r.frDelta < -5).length;
      results.innerHTML = `
        <div class="compare-summary">
          <div><span class="cs-num">${rows.length}</span> total</div>
          <div><span class="cs-num up">${improved}</span> improved (>5pt)</div>
          <div><span class="cs-num down">${declined}</span> declined</div>
          <div><span class="cs-num">${newInB}</span> new in B</div>
          <div><span class="cs-num">${droppedInB}</span> dropped in B</div>
        </div>
        <div class="compare-table-wrap">
          <table class="compare-table">
            <thead>
              <tr>
                <th>Symbol · Name</th>
                <th>Fill rate</th>
                <th>Avg days</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const frCell = formatDelta(r.aFR, r.bFR, r.frDelta, v => v != null ? v.toFixed(0) + '%' : '—', 'higher-better');
                const daysCell = formatDelta(r.aDays, r.bDays, r.daysDelta, v => v != null ? v.toFixed(1) : '—', 'lower-better');
                const volCell = formatDelta(r.aFilled, r.bFilled, r.volDelta, v => String(v), 'higher-better');
                const tagA = !r.inA ? '<span class="new-tag">new</span>' : '';
                const tagB = !r.inB ? '<span class="new-tag dropped">dropped</span>' : '';
                return `<tr>
                  <td><div class="cmp-name">${escapeHtml(r.symbol)} <span style="color:var(--text-tertiary);font-weight:400;">· ${escapeHtml(r.name)}</span> ${tagA}${tagB}</div></td>
                  <td>${frCell}</td>
                  <td>${daysCell}</td>
                  <td>${volCell}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    function formatDelta(a, b, delta, fmt, direction) {
      if (delta == null) return `<div class="cmp-cell"><span class="muted-sub">${fmt(a)} → ${fmt(b)}</span></div>`;
      const isUp = delta > 0;
      const good = (direction === 'higher-better' ? isUp : !isUp);
      const cls = Math.abs(delta) < 0.5 ? 'flat' : good ? 'up' : 'down';
      const arrow = Math.abs(delta) < 0.5 ? '→' : isUp ? '▲' : '▼';
      const sign = delta > 0 ? '+' : '';
      return `<div class="cmp-cell">${fmt(a)} → ${fmt(b)} <span class="cmp-delta ${cls}">${arrow} ${sign}${delta.toFixed(direction === 'lower-better' && fmt(0).indexOf('.') >= 0 ? 1 : 0)}</span></div>`;
    }
  }

  /* ---------- Map view (Leaflet, lazy-loaded) ---------- */

  let leafletReady = null;
  let mapInstance = null;
  let mapMarkers = [];
  let homeMarker = null;
  let mapVisible = false;

  function loadLeaflet() {
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((resolve, reject) => {
      if (window.L) { resolve(window.L); return; }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
      link.crossOrigin = '';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
      script.crossOrigin = '';
      script.onload = () => resolve(window.L);
      script.onerror = (e) => reject(new Error('Failed to load Leaflet'));
      document.head.appendChild(script);
    });
    return leafletReady;
  }

  async function toggleMapView() {
    mapVisible = !mapVisible;
    const container = document.getElementById('map-container');
    const toggleBtn = document.getElementById('map-toggle');
    toggleBtn.setAttribute('aria-pressed', mapVisible ? 'true' : 'false');
    toggleBtn.textContent = mapVisible ? '✓ Map view' : 'Map view';
    if (!mapVisible) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.innerHTML = '<div class="map-loading">Loading map…</div>';
    try {
      const L = await loadLeaflet();
      container.innerHTML = '<div id="leaflet-map" style="height: 360px; border-radius: var(--radius-lg); overflow: hidden; border: 0.5px solid var(--border);"></div><p class="hint" style="margin-top:6px;">Click a pin to select that lender. © OpenStreetMap contributors.</p>';
      if (!mapInstance) {
        mapInstance = L.map('leaflet-map', { scrollWheelZoom: false }).setView([homeLat || 39.5, homeLng || -98.5], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          maxZoom: 18
        }).addTo(mapInstance);
      } else {
        // Re-attach after innerHTML wipe
        mapInstance.remove();
        mapInstance = L.map('leaflet-map', { scrollWheelZoom: false }).setView([homeLat || 39.5, homeLng || -98.5], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          maxZoom: 18
        }).addTo(mapInstance);
      }
      refreshMapMarkers();
    } catch (e) {
      container.innerHTML = `<div class="warning-panel">Could not load map: ${escapeHtml(e.message)}. The map needs an internet connection on first load.</div>`;
    }
  }

  function refreshMapMarkers() {
    if (!mapVisible || !mapInstance || !window.L) return;
    const L = window.L;
    // Clear previous
    mapMarkers.forEach(m => m.remove());
    mapMarkers = [];
    if (homeMarker) { homeMarker.remove(); homeMarker = null; }

    // Home marker
    if (homeLat != null && homeLng != null) {
      const homeIcon = L.divIcon({
        className: 'home-marker',
        html: '<div style="background:var(--text-info);width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 2px var(--text-info);"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
      });
      homeMarker = L.marker([homeLat, homeLng], { icon: homeIcon, title: 'Home location' }).addTo(mapInstance);
    }

    const pins = lastFilteredDir.filter(l => l.lat != null && l.lng != null);
    const bounds = [];
    pins.forEach(l => {
      const sel = dirSelected.has(l.symbol);
      const icon = L.divIcon({
        className: 'lender-marker',
        html: `<div class="lender-pin ${sel ? 'selected' : ''}" title="${escapeHtml(l.symbol)}">${escapeHtml(l.symbol)}</div>`,
        iconSize: [40, 22],
        iconAnchor: [20, 11]
      });
      const m = L.marker([l.lat, l.lng], { icon }).addTo(mapInstance);
      const distance = l._distanceMiles != null ? `${Math.round(l._distanceMiles)} mi` : '—';
      m.bindPopup(`
        <div style="min-width:180px;">
          <div style="font-weight:600;margin-bottom:2px;">${escapeHtml(l.name)}</div>
          <div style="font-size:11px;color:#666;margin-bottom:6px;">${escapeHtml(l.symbol)} · ${escapeHtml(l.type || 'Other')} · ${escapeHtml(l.state || '—')} · ${distance}</div>
          <button class="map-pin-select" data-pin-select="${escapeHtml(l.symbol)}" style="font-size:12px;padding:4px 10px;border-radius:6px;cursor:pointer;background:${sel ? '#a32d2d' : '#185fa5'};color:white;border:none;">${sel ? 'Deselect' : 'Select'}</button>
        </div>
      `);
      m.on('popupopen', () => {
        const btn = document.querySelector('[data-pin-select="' + cssEscape(l.symbol) + '"]');
        if (btn) btn.addEventListener('click', () => {
          toggleDiscoverSelection(l.symbol);
          m.closePopup();
          refreshMapMarkers();
        });
      });
      mapMarkers.push(m);
      bounds.push([l.lat, l.lng]);
    });
    if (homeLat != null && homeLng != null) bounds.push([homeLat, homeLng]);
    if (bounds.length > 1) {
      mapInstance.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
    }
  }

  /* ---------- Sample data ---------- */

  const SAMPLE_LENDERS = [
    {name: 'University of Florida', symbol: 'FUG', state: 'FL', type: 'Academic'},
    {name: 'Florida State University', symbol: 'FDA', state: 'FL', type: 'Academic'},
    {name: 'University of South Florida', symbol: 'SFU', state: 'FL', type: 'Academic'},
    {name: 'University of Georgia Libraries', symbol: 'GUA', state: 'GA', type: 'Academic'},
    {name: 'Emory University', symbol: 'EMU', state: 'GA', type: 'Academic'},
    {name: 'Library of Congress', symbol: 'DLC', state: 'DC', type: 'Government'},
    {name: 'Linda Hall Library', symbol: 'LHL', state: 'MO', type: 'Special'},
    {name: 'New York Public Library', symbol: 'NYP', state: 'NY', type: 'Public'},
    {name: 'University of Tennessee, Knoxville', symbol: 'TKN', state: 'TN', type: 'Academic'},
    {name: 'Vanderbilt University', symbol: 'TJC', state: 'TN', type: 'Academic'},
    {name: 'University of Virginia', symbol: 'VA@', state: 'VA', type: 'Academic'},
    {name: 'University of North Carolina, Chapel Hill', symbol: 'NOC', state: 'NC', type: 'Academic'},
    {name: 'Orange County Library System', symbol: 'FOC', state: 'FL', type: 'Public'},
    {name: 'Jacksonville Public Library', symbol: 'FJV', state: 'FL', type: 'Public'},
    {name: 'Center for Research Libraries', symbol: 'CRL', state: 'IL', type: 'Consortium'}
  ];

  function loadSampleData() {
    if (months.length > 0 && !confirm('Replace any loaded reports with sample data?')) return;
    months = [];
    selected.clear();
    expanded.clear();
    notesExpanded.clear();
    const periods = ['Sample Jan 2026', 'Sample Feb 2026', 'Sample Mar 2026'];
    // Deterministic-ish pseudorandom so the sample data is stable
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    periods.forEach((period, monthIdx) => {
      const rows = SAMPLE_LENDERS.map((l, i) => {
        // Each lender has a "personality": consistent vs spotty, fast vs slow
        const isStrong = i % 3 === 0;
        const isFast = i % 4 < 2;
        // Some lenders missing in some months
        if (!isStrong && rand() < 0.18 && monthIdx > 0) return null;
        const requested = Math.max(0, Math.floor((isStrong ? 12 : 4) + rand() * 8));
        const fillRatio = isStrong ? 0.78 + rand() * 0.18 : 0.35 + rand() * 0.45;
        const filled = Math.min(requested, Math.floor(requested * fillRatio));
        const unfilled = requested - filled;
        const baseHours = isFast ? 30 : 78;
        const avgH = filled > 0 ? baseHours + rand() * 40 : 0;
        return {
          name: l.name, symbol: l.symbol, state: l.state, type: l.type,
          requested, filled, unfilled, avgHours: avgH
        };
      }).filter(Boolean);
      months.push({ rows, period, institution: 'Sample Institution' });
    });
    saveData();
    renderMonthsList();
    rebuildFacetOptions();
    renderRankings();
    renderDiscover();
    const status = document.getElementById('upload-status');
    if (status) {
      status.className = 'upload-status ok';
      status.textContent = `Loaded sample data: 3 months, ${SAMPLE_LENDERS.length} lenders. Click "Clear all loaded months" to remove.`;
    }
    announce('Sample data loaded');
  }

  /* ---------- ARIA live announcements ---------- */

  function announce(text) {
    const el = document.getElementById('aria-live-status');
    if (!el) return;
    el.textContent = '';
    setTimeout(() => { el.textContent = text; }, 50);
  }

  /* ---------- Toast notifications ---------- */

  let toastId = 0;
  function showToast({ message, action, onAction, duration = 5000, kind = '' }) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const id = 'toast-' + (++toastId);
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.id = id;
    el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    el.innerHTML = `
      <span class="toast-msg"></span>
      ${action ? `<button class="toast-action" type="button"></button>` : ''}
      <button class="toast-close" type="button" aria-label="Dismiss">×</button>
    `;
    el.querySelector('.toast-msg').textContent = message;
    if (action) el.querySelector('.toast-action').textContent = action;
    stack.appendChild(el);
    announce(message);

    let timer = setTimeout(dismiss, duration);
    function dismiss() {
      clearTimeout(timer);
      el.classList.add('toast-leaving');
      setTimeout(() => el.remove(), 200);
    }
    el.querySelector('.toast-close').addEventListener('click', dismiss);
    const actBtn = el.querySelector('.toast-action');
    if (actBtn) {
      actBtn.addEventListener('click', () => {
        clearTimeout(timer);
        try { onAction && onAction(); } finally { dismiss(); }
      });
    }
    return { dismiss };
  }

  /* ---------- Rankings tab rendering ---------- */

  function renderMonthsList() {
    const wrap = document.getElementById('months-list');
    const clearBtn = document.getElementById('clear-months');
    if (months.length === 0) {
      wrap.innerHTML = '';
      clearBtn.hidden = true;
      return;
    }
    wrap.innerHTML = months.map((m, i) =>
      `<div class="month-chip">
        <span><span class="dot"></span>${escapeHtml(m.period || 'Unknown period')}</span>
        <span class="meta-text">${m.rows.length} lenders <button class="month-remove" data-remove="${i}" aria-label="Remove ${escapeHtml(m.period || '')}">×</button></span>
      </div>`
    ).join('');
    clearBtn.hidden = false;
    wrap.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        months.splice(parseInt(btn.dataset.remove), 1);
        saveData();
        rebuildFacetOptions();
        renderRankings();
        announce(`Removed report. ${months.length} month${months.length === 1 ? '' : 's'} remaining.`);
      });
    });
  }

  function renderGroupFacet(symbol, count, dataAttr, isChecked) {
    const fullName = GROUP_NAMES[symbol] || '';
    const dataKey = dataAttr === 'dirfacet' ? 'data-dirfacet' : 'data-facet';
    const sub = fullName ? `<span class="facet-sub">${escapeHtml(fullName)}</span>` : '';
    const tooltip = fullName ? ` title="${escapeHtml(fullName)}"` : '';
    return `<label class="facet"${tooltip}><span><input type="checkbox" ${dataKey}="group" value="${escapeHtml(symbol)}" ${isChecked ? 'checked' : ''}><span class="facet-label-stack"><span class="facet-label-main">${escapeHtml(symbol)}</span>${sub}</span></span><span class="count">${count}</span></label>`;
  }

  function rebuildFacetOptions() {
    const merged = mergeMonths();
    const typeCounts = {}, stateCounts = {}, groupCounts = {};
    merged.forEach(l => {
      typeCounts[l.type] = (typeCounts[l.type] || 0) + 1;
      stateCounts[l.state] = (stateCounts[l.state] || 0) + 1;
      const groups = symbolGroups.get(l.symbol);
      if (groups) groups.forEach(g => {
        if (ALLOWED_GROUPS.has(g)) groupCounts[g] = (groupCounts[g] || 0) + 1;
      });
    });
    const types = Object.entries(typeCounts).sort((a, b) => a[0].localeCompare(b[0]));
    const states = Object.entries(stateCounts).sort(stateSort);
    const groups = Object.entries(groupCounts).sort((a, b) => b[1] - a[1]);

    const typeWrap = document.getElementById('type-facets');
    if (types.length === 0) {
      typeWrap.innerHTML = '<p class="hint">Upload a report to populate filters.</p>';
    } else {
      typeWrap.innerHTML = types.map(([t, c]) =>
        `<label class="facet"><span><input type="checkbox" data-facet="type" value="${escapeHtml(t)}" ${activeFilters.type.has(t) ? 'checked' : ''}>${escapeHtml(t)}</span><span class="count">${c}</span></label>`
      ).join('');
    }
    const stateWrap = document.getElementById('state-facets');
    stateWrap.innerHTML = states.map(([s, c]) =>
      `<label class="facet"><span><input type="checkbox" data-facet="state" value="${escapeHtml(s)}" ${activeFilters.state.has(s) ? 'checked' : ''}>${escapeHtml(stateLabel(s))}</span><span class="count">${c}</span></label>`
    ).join('');
    const groupWrap = document.getElementById('group-facets');
    if (groupWrap) {
      groupWrap.innerHTML = groups.length === 0
        ? '<p class="hint">No group affiliations among current rankings.</p>'
        : groups.map(([g, c]) => renderGroupFacet(g, c, 'facet', activeFilters.group.has(g))).join('');
    }

    const wireFacet = wrap => wrap && wrap.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', () => {
      const set = activeFilters[cb.dataset.facet];
      if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      resetRankPage();
      renderRankings();
    }));
    wireFacet(typeWrap);
    wireFacet(stateWrap);
    wireFacet(groupWrap);
    clampFacetToRows(typeWrap, 5);
    clampFacetToRows(stateWrap, 5);
  }

  function syncWeightLabels() {
    Object.keys(weights).forEach(k => {
      const out = document.querySelector(`[data-weight-out="${k}"]`);
      if (out) out.textContent = weights[k];
      const inp = document.querySelector(`input[data-weight="${k}"]`);
      if (inp) inp.value = weights[k];
    });
  }

  function passesFilter(l) {
    if (activeFilters.type.size && !activeFilters.type.has(l.type)) return false;
    if (activeFilters.state.size && !activeFilters.state.has(l.state)) return false;
    if (activeFilters.hist.has('filled') && l.filled === 0) return false;
    if (activeFilters.hist.has('multi') && l.filled < 5) return false;
    if (activeFilters.hist.has('fast') && (l.filled === 0 || avgDays(l) >= 3)) return false;
    if (activeFilters.hist.has('reliable') && fillRate(l) < 75) return false;
    if (activeFilters.hist.has('consistent') && l.monthsPresent < 3) return false;
    if (activeFilters.group.size) {
      const lenderGroups = symbolGroups.get(l.symbol);
      if (!lenderGroups) return false;
      let anyMatch = false;
      activeFilters.group.forEach(g => { if (lenderGroups.has(g)) anyMatch = true; });
      if (!anyMatch) return false;
    }
    return true;
  }

  /* ---------- Filter chips ---------- */

  function renderRankingsChips() {
    const wrap = document.getElementById('rankings-chips');
    const chips = [];
    activeFilters.type.forEach(t => chips.push({ label: `Type: ${t}`, remove: () => activeFilters.type.delete(t) }));
    activeFilters.state.forEach(s => chips.push({ label: `State: ${stateLabel(s)}`, remove: () => activeFilters.state.delete(s) }));
    activeFilters.group.forEach(g => chips.push({ label: `Group: ${g}`, remove: () => activeFilters.group.delete(g) }));
    activeFilters.hist.forEach(h => chips.push({ label: histLabels[h] || h, remove: () => activeFilters.hist.delete(h) }));
    renderChips(wrap, chips, () => {
      activeFilters.type.clear();
      activeFilters.state.clear();
      activeFilters.group.clear();
      activeFilters.hist.clear();
      resetRankPage();
      rebuildFacetOptions();
      document.querySelectorAll('#rankings-view input[type="checkbox"][data-facet="hist"]').forEach(cb => cb.checked = false);
      renderRankings();
    });
  }

  function renderDiscoverChips() {
    const wrap = document.getElementById('discover-chips');
    const chips = [];
    dirFilters.type.forEach(t => chips.push({ label: `Type: ${t}`, remove: () => dirFilters.type.delete(t) }));
    dirFilters.state.forEach(s => chips.push({ label: `State: ${stateLabel(s)}`, remove: () => dirFilters.state.delete(s) }));
    dirFilters.group.forEach(g => chips.push({ label: `Group: ${g}`, remove: () => dirFilters.group.delete(g) }));
    dirFilters.loanDays.forEach(d => chips.push({ label: `Loans: ${d === '1' ? '1 day' : d + ' days'}`, remove: () => dirFilters.loanDays.delete(d) }));
    if (dirFilters.search) chips.push({ label: `"${dirFilters.search}"`, remove: () => {
      dirFilters.search = '';
      const inp = document.getElementById('dir-search');
      if (inp) inp.value = '';
      document.getElementById('dir-search-clear').hidden = true;
    }});
    if (dirFilters.maxDist > 0) chips.push({ label: `Within ${dirFilters.maxDist} mi`, remove: () => {
      dirFilters.maxDist = 0;
      document.getElementById('max-dist').value = 0;
      document.getElementById('dist-out').textContent = 'Any';
    }});
    if (!dirFilters.onlyNew) chips.push({ label: 'Including borrowed', remove: () => {
      dirFilters.onlyNew = true;
      document.getElementById('show-only-new').checked = true;
    }});
    renderChips(wrap, chips, () => {
      dirFilters.type.clear();
      dirFilters.state.clear();
      dirFilters.group.clear();
      dirFilters.loanDays.clear();
      dirFilters.search = '';
      dirFilters.maxDist = 0;
      dirFilters.onlyNew = true;
      document.getElementById('dir-search').value = '';
      document.getElementById('dir-search-clear').hidden = true;
      document.getElementById('show-only-new').checked = true;
      document.getElementById('max-dist').value = 0;
      document.getElementById('dist-out').textContent = 'Any';
      resetDirPage();
      buildDirFacetOptions();
      renderDiscover();
    });
  }

  function renderChips(wrap, chips, clearAll) {
    if (chips.length === 0) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = `<span class="filter-chips-label">Filtering by</span>` +
      chips.map((c, i) => `<span class="chip">${escapeHtml(c.label)}<button class="chip-close" data-chip-idx="${i}" aria-label="Remove filter ${escapeHtml(c.label)}">×</button></span>`).join('') +
      `<button class="chip-clear-all" data-clear-chips type="button">Clear all</button>`;
    wrap.querySelectorAll('[data-chip-idx]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.chipIdx);
        chips[idx].remove();
        // Re-render whichever tab owns these chips
        if (wrap.id === 'rankings-chips') {
          resetRankPage();
          rebuildFacetOptions();
          // Sync hist checkboxes
          document.querySelectorAll('#rankings-view input[type="checkbox"][data-facet="hist"]').forEach(cb => {
            cb.checked = activeFilters.hist.has(cb.value);
          });
          renderRankings();
        } else {
          resetDirPage();
          buildDirFacetOptions();
          renderDiscover();
        }
      });
    });
    const clearBtn = wrap.querySelector('[data-clear-chips]');
    if (clearBtn) clearBtn.addEventListener('click', clearAll);
  }

  /* ---------- Renderers ---------- */

  function renderRankings() {
    saveData();
    const merged = mergeMonths();
    const sortBy = document.getElementById('sort-by').value;
    let filtered = merged.filter(passesFilter);
    filtered.forEach(l => { l._score = totalScore(l); l._subs = subscores(l); });
    const sortFns = {
      score: (a, b) => b._score - a._score,
      speed: (a, b) => (a.filled > 0 ? a.avgHours : 1e9) - (b.filled > 0 ? b.avgHours : 1e9),
      fill: (a, b) => fillRate(b) - fillRate(a),
      volume: (a, b) => b.filled - a.filled,
      consistency: (a, b) => b.monthsPresent - a.monthsPresent
    };
    filtered.sort(sortFns[sortBy] || sortFns.score);
    lastFilteredRankings = filtered;

    document.getElementById('match-count').textContent = filtered.length;
    updateSelectionCounts();
    renderRankingsChips();
    renderProcessPanel('rankings');
    const cmpBtn = document.getElementById('compare-btn');
    if (cmpBtn) cmpBtn.hidden = months.length < 2;

    const auditNudge = document.getElementById('rankings-audit-nudge');
    if (auditNudge) auditNudge.hidden = !(months.length > 0 && auditHoldings.length === 0);

    const periodsLabel = months.map(m => m.period).filter(p => p).join(' + ') || 'no data';
    document.getElementById('meta').textContent =
      months.length === 0
        ? 'No reports loaded'
        : `${months.length} month${months.length === 1 ? '' : 's'} · ${merged.length} lenders`;
    document.getElementById('meta').setAttribute('title', `${periodsLabel}`);

    const labels = { speed: 'Speed', fill: 'Fill rate', volume: 'Volume', consistency: 'Consistency', local: 'Same state' };
    const list = document.getElementById('lender-list');
    const w = normalizedWeights();

    if (filtered.length === 0) {
      if (months.length === 0) {
        list.innerHTML = `<div class="empty-state">
          <svg class="empty-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 16V8m-4 4l4-4 4 4M5 18h14"/></svg>
          <strong>Upload a Borrower report to begin</strong>
          Drop your OCLC Borrower Transaction-Level Detail .xls in the panel on the left. Once it's loaded you can audit your current holdings group, rank lenders, and discover new candidates. Everything stays in this browser.
          <div class="empty-cta-row">
            <button class="empty-cta primary" id="empty-upload-cta" type="button">+ Add a report</button>
            <button class="empty-cta" id="empty-sample-cta" type="button">Try with sample data</button>
          </div>
        </div>`;
        const cta = document.getElementById('empty-upload-cta');
        if (cta) cta.addEventListener('click', () => document.getElementById('csv-input').click());
        const sample = document.getElementById('empty-sample-cta');
        if (sample) sample.addEventListener('click', loadSampleData);
      } else {
        list.innerHTML = `<div class="empty-state">
          <svg class="empty-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/></svg>
          <strong>No lenders match these filters</strong>
          Try removing some filters or resetting them.
        </div>`;
      }
      const pagerEmpty = document.getElementById('rank-pagination');
      if (pagerEmpty) { pagerEmpty.hidden = true; pagerEmpty.innerHTML = ''; }
      return;
    }

    // Paginate
    const rankPagerWrap = document.getElementById('rank-pagination');
    const rankTotal = filtered.length;
    let rankSlice = filtered;
    if (rankPageSize > 0) {
      const pages = Math.max(1, Math.ceil(rankTotal / rankPageSize));
      if (rankPage > pages) rankPage = pages;
      const startIdx = (rankPage - 1) * rankPageSize;
      rankSlice = filtered.slice(startIdx, startIdx + rankPageSize);
    }
    list.innerHTML = rankSlice.map(l => renderRankingCard(l, labels, w)).join('');
    renderPagination(rankPagerWrap, rankTotal, rankPageSize, rankPage, (p) => {
      rankPage = p;
      renderRankings();
      list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Card click → toggle selection (but not when clicking interactive children)
    list.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('input, button, a, .explain')) return;
        const sym = card.dataset.symbol;
        toggleRankingSelection(sym);
      });
    });
    list.querySelectorAll('[data-explain]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sym = btn.dataset.explain;
        if (expanded.has(sym)) expanded.delete(sym); else expanded.add(sym);
        const card = list.querySelector(`.card[data-symbol="${cssEscape(sym)}"]`);
        if (card) {
          const l = filtered.find(x => x.symbol === sym);
          if (l) card.outerHTML = renderRankingCard(l, labels, w);
          rewireCardEvents();
        }
      });
    });
    list.querySelectorAll('[data-note-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sym = btn.dataset.noteToggle;
        if (notesExpanded.has(sym)) notesExpanded.delete(sym); else notesExpanded.add(sym);
        renderRankings();
      });
    });
    list.querySelectorAll('[data-note-input]').forEach(ta => {
      ta.addEventListener('click', (e) => e.stopPropagation());
      ta.addEventListener('input', () => {
        debounce('note-' + ta.dataset.noteInput, () => setNote(ta.dataset.noteInput, ta.value), 400);
      });
      ta.addEventListener('blur', () => setNote(ta.dataset.noteInput, ta.value));
    });
    list.querySelectorAll('[data-select]').forEach(cb => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => toggleRankingSelection(cb.dataset.select, cb.checked));
    });
  }

  function rewireCardEvents() {
    // After surgical re-render of one card, re-wire only what's needed
    renderRankings(); // simplest correctness path; cheap because cards re-render is fast
  }

  function renderRankingCard(l, labels, w) {
    const scoreClass = l._score >= 70 ? 'high' : l._score >= 50 ? 'med' : '';
    const isOpen = expanded.has(l.symbol);
    const isSel = selected.has(l.symbol);
    const noteOpen = notesExpanded.has(l.symbol);
    const note = getNote(l.symbol);
    const fr = fillRate(l), days = avgDays(l);
    const thinNote = l.filled === 0 ? '<p class="card-thin">No filled requests yet</p>' : '';
    const monthDots = Array.from({ length: l.monthsSpan }).map((_, i) => {
      const present = l.filledMonths[i] !== undefined;
      const filled = (l.filledMonths[i] || 0) > 0;
      const cls = !present ? 'missing' : filled ? 'filled' : 'empty';
      const m = months[i];
      const title = m ? `${escapeHtml(m.period)}: ${l.filledMonths[i] || 0} filled / ${l.requestedMonths[i] || 0} requested` : '';
      return `<span class="month-dot ${cls}" title="${title}"></span>`;
    }).join(' ');
    const sparkline = renderSparkline(l);
    const explainRows = Object.keys(labels).map(k =>
      `<div class="explain-row">
        <span style="color: var(--text-secondary);">${labels[k]}</span>
        <div class="bar"><div class="bar-fill" style="width: ${l._subs[k]}%;"></div></div>
        <span class="pts">${l._subs[k]} × ${(w[k] * 100).toFixed(0)}%</span>
        <span class="wt">${Math.round(l._subs[k] * w[k])}</span>
      </div>`
    ).join('');
    return `
      <div class="card ${isSel ? 'selected' : ''}" role="listitem" data-symbol="${escapeHtml(l.symbol)}" tabindex="0">
        <div class="card-top">
          <div class="card-left">
            <input type="checkbox" data-select="${escapeHtml(l.symbol)}" ${isSel ? 'checked' : ''} aria-label="Select ${escapeHtml(l.name)}">
            <div>
              <p class="card-name">${escapeHtml(l.name)}</p>
              <p class="card-sub">${escapeHtml(l.symbol)} · ${escapeHtml(l.type)} · ${escapeHtml(l.state)}</p>
              ${l.monthsSpan > 1 ? `<div class="months-dot-row">${monthDots} <span>${l.monthsPresent}/${l.monthsSpan} months</span>${sparkline}</div>` : ''}
              ${thinNote}
            </div>
          </div>
          <span class="score ${scoreClass}" title="Composite score from weighted subscores">${l._score}</span>
        </div>
        <div class="card-stats">
          <div class="stat"><span class="stat-label">Requested</span><span class="stat-val">${l.requested}</span></div>
          <div class="stat"><span class="stat-label">Filled</span><span class="stat-val">${l.filled}</span></div>
          <div class="stat"><span class="stat-label">Fill rate</span><span class="stat-val ${l.requested === 0 ? 'muted' : ''}">${l.requested > 0 ? fr.toFixed(0) + '%' : '—'}</span></div>
          <div class="stat"><span class="stat-label">Avg days</span><span class="stat-val ${l.filled === 0 ? 'muted' : ''}">${l.filled > 0 ? days.toFixed(1) : '—'}</span></div>
          <div class="stat"><span class="stat-label">Months</span><span class="stat-val">${l.monthsPresent}/${l.monthsSpan}</span></div>
        </div>
        <div class="badges">
          ${l.state === homeState ? '<span class="badge local">Same state</span>' : ''}
          ${l.monthsPresent === l.monthsSpan && l.monthsSpan > 1 ? '<span class="badge every-month">Every month</span>' : ''}
          ${note ? '<span class="badge note-badge">📝 Note</span>' : ''}
          <button class="explain-btn" data-explain="${escapeHtml(l.symbol)}" aria-expanded="${isOpen}">${isOpen ? 'Hide why ▴' : 'Why this score ▾'}</button>
          <button class="explain-btn" data-note-toggle="${escapeHtml(l.symbol)}" aria-expanded="${noteOpen}">${noteOpen ? 'Hide note ▴' : (note ? 'Edit note ▾' : 'Add note ▾')}</button>
        </div>
        ${isOpen ? `<div class="explain">${explainRows}<div class="explain-total"><span>Total</span><span>${l._score}</span></div></div>` : ''}
        ${noteOpen ? renderNoteEditor(l.symbol, note) : ''}
      </div>`;
  }

  function renderNoteEditor(symbol, note) {
    return `<div class="note-editor">
      <textarea data-note-input="${escapeHtml(symbol)}" placeholder="Notes about this lender — preferences, contact, payment, anything useful next time" aria-label="Notes for ${escapeHtml(symbol)}">${escapeHtml(note)}</textarea>
      <div class="note-meta">Saved automatically · stored locally</div>
    </div>`;
  }

  function renderSparkline(l) {
    if (l.monthsSpan < 3) return '';
    const points = [];
    for (let i = 0; i < l.monthsSpan; i++) {
      const req = l.requestedMonths[i] || 0;
      const fil = l.filledMonths[i] || 0;
      if (req > 0) points.push({ i, fr: fil / req });
      else points.push({ i, fr: null });
    }
    const present = points.filter(p => p.fr != null);
    if (present.length < 2) return '';
    const w = 56, h = 14;
    const xStep = l.monthsSpan > 1 ? w / (l.monthsSpan - 1) : w;
    const segs = [];
    let last = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.fr == null) { last = null; continue; }
      const x = i * xStep;
      const y = h - p.fr * (h - 2) - 1;
      if (last == null) segs.push(`M${x.toFixed(1)} ${y.toFixed(1)}`);
      else segs.push(`L${x.toFixed(1)} ${y.toFixed(1)}`);
      last = { x, y };
    }
    const first = present[0].fr, lastV = present[present.length - 1].fr;
    const trendCls = lastV > first + 0.05 ? 'up' : lastV < first - 0.05 ? 'down' : 'flat';
    return `<svg class="sparkline ${trendCls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-label="Fill rate trend across ${l.monthsSpan} months"><path d="${segs.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>`;
  }

  function cssEscape(s) {
    if (window.CSS && window.CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  /* ---------- Surgical selection updates ---------- */

  function toggleRankingSelection(symbol, force) {
    const isSelected = force != null ? force : !selected.has(symbol);
    if (isSelected) selected.add(symbol); else selected.delete(symbol);
    updateCardSelectionUI('lender-list', symbol, isSelected);
    updateSelectionCounts();
  }

  function toggleDiscoverSelection(symbol, force) {
    const isSelected = force != null ? force : !dirSelected.has(symbol);
    if (isSelected) dirSelected.add(symbol); else dirSelected.delete(symbol);
    updateCardSelectionUI('dir-list', symbol, isSelected);
    updateSelectionCounts();
    renderProcessPanel('discover');
    renderProcessPanel('rankings');
  }

  function updateCardSelectionUI(listId, symbol, isSelected) {
    const list = document.getElementById(listId);
    if (!list) return;
    const card = list.querySelector(`.card[data-symbol="${cssEscape(symbol)}"]`);
    if (card) {
      card.classList.toggle('selected', isSelected);
      const cb = card.querySelector('input[type="checkbox"]');
      if (cb && cb.checked !== isSelected) cb.checked = isSelected;
    }
  }

  function updateSelectionCounts() {
    document.getElementById('sel-count').textContent = selected.size;
    document.getElementById('dir-sel-count').textContent = dirSelected.size;
    document.getElementById('clear-selection').hidden = selected.size === 0;
    document.getElementById('dir-clear-selection').hidden = dirSelected.size === 0;
  }

  /* ---------- Discover tab rendering ---------- */

  let processCollapsed = { rankings: false, discover: false };
  let weightsTouched = false;
  let stepSkipped = { 'rankings-3': false };
  try {
    processCollapsed.rankings = localStorage.getItem('lf-rankings-process-collapsed') === '1';
    processCollapsed.discover = localStorage.getItem('lf-discover-process-collapsed') === '1';
  } catch (_) {}

  function isHomeSet() {
    return !!homeState
      && typeof homeLat === 'number' && !isNaN(homeLat)
      && typeof homeLng === 'number' && !isNaN(homeLng);
  }

  function scrollFocus(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      if (el.focus) el.focus({ preventScroll: true });
      el.classList.add('flash-highlight');
      setTimeout(() => el.classList.remove('flash-highlight'), 1400);
    }, 350);
  }

  function openSidebarIfNeeded(tab) {
    if (window.innerWidth > 880) return;
    const toggle = document.querySelector(`[data-filter-toggle="${tab}"]`);
    const facets = document.getElementById(`${tab}-facets`);
    if (toggle && facets && !facets.classList.contains('open')) toggle.click();
  }

  function rankingsStepConfigs() {
    return [
      {
        done: months.length > 0,
        title: 'Upload your monthly Borrower reports',
        desc: 'Drop the .xls export from OCLC WorldShare Reports → "Borrower Transaction-Level Detail Report — Institution". Everything stays in your browser.',
        cta: 'Choose a file',
        action: () => {
          openSidebarIfNeeded('rankings');
          document.getElementById('csv-input').click();
        }
      },
      {
        done: isHomeSet(),
        title: 'Tell us where your library is',
        desc: 'Your state and coordinates power the same-state boost here, and the distance filter in Discover.',
        cta: 'Set home location',
        action: () => { openSidebarIfNeeded('rankings'); scrollFocus(document.getElementById('home-state')); }
      },
      {
        done: weightsTouched || selected.size > 0 || activeFilters.type.size > 0 || activeFilters.state.size > 0 || activeFilters.hist.size > 0 || stepSkipped['rankings-3'],
        skippable: true,
        title: 'Review the rankings — sort, filter, or tune weights',
        desc: 'Sort by score/speed/fill-rate, filter by type/state/history, or move the scoring sliders to favor what you care about.',
        cta: 'Adjust scoring',
        action: () => { openSidebarIfNeeded('rankings'); scrollFocus(document.querySelector('input[data-weight="speed"]')); }
      },
      {
        done: selected.size > 0,
        title: 'Pick lenders and build a holdings group',
        desc: 'Click any card on the right to select it (or use "Select top 10"). Then name and export your group as an OCLC holdings list or CSV.',
        cta: 'Select top 10 now',
        action: () => document.getElementById('select-top-10').click()
      }
    ];
  }

  function discoverStepConfigs() {
    return [
      {
        done: isHomeSet(),
        title: 'Tell us where your library is',
        desc: 'Add your home state + coordinates so distance filtering and the same-state badge work. Use "Use my location" for one-click GPS.',
        cta: 'Set home location',
        action: () => { openSidebarIfNeeded('discover'); scrollFocus(document.getElementById('dir-home-state')); }
      },
      {
        done: !!dirFilters.search || dirFilters.type.size > 0 || dirFilters.state.size > 0 || dirFilters.group.size > 0 || dirFilters.loanDays.size > 0 || dirFilters.maxDist > 0,
        title: 'Narrow the list to good candidates',
        desc: 'Search by name/symbol, set a distance radius, or pick a library type, state, or consortium (ASERL, LVIS, etc.).',
        cta: 'Focus the search box',
        action: () => { openSidebarIfNeeded('discover'); scrollFocus(document.getElementById('dir-search')); }
      },
      {
        done: dirSelected.size > 0,
        title: 'Pick candidates and build a holdings group',
        desc: 'Click any card on the right to select it. When you have a shortlist, hit "Build holdings group" to name and export it.',
        cta: 'Select all visible',
        action: () => document.getElementById('dir-select-all').click()
      }
    ];
  }

  function renderProcessPanel(tab) {
    const panelId = `${tab}-process`;
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.dataset.collapsed = processCollapsed[tab] ? 'true' : 'false';
    const configs = tab === 'rankings' ? rankingsStepConfigs() : discoverStepConfigs();

    let activeIdx = -1;
    for (let i = 0; i < configs.length; i++) {
      const li = document.getElementById(`${tab}-step-${i + 1}`);
      if (!li) continue;
      li.classList.remove('active', 'done', 'pending');
      if (configs[i].done) {
        li.classList.add('done');
      } else if (activeIdx === -1) {
        li.classList.add('active');
        activeIdx = i;
      } else {
        li.classList.add('pending');
      }
    }

    const allDone = activeIdx === -1;
    panel.classList.toggle('all-done', allDone);

    const titleEl = document.getElementById(`${tab}-process-title`);
    const toggleBtn = document.getElementById(`${tab}-process-toggle`);
    if (toggleBtn) {
      toggleBtn.textContent = processCollapsed[tab] ? 'Show steps' : 'Hide steps';
      toggleBtn.setAttribute('aria-expanded', processCollapsed[tab] ? 'false' : 'true');
    }
    if (titleEl) {
      if (allDone) {
        titleEl.innerHTML = `<span class="check">✓</span> All steps complete — you're set`;
      } else {
        const label = tab === 'rankings' ? 'Rankings' : 'Discover';
        titleEl.textContent = `${label} workflow · step ${activeIdx + 1} of ${configs.length}`;
      }
    }

    if (!allDone) {
      const cfg = configs[activeIdx];
      const nextTitle = document.getElementById(`${tab}-next-title`);
      const nextDesc = document.getElementById(`${tab}-next-desc`);
      const cta = document.getElementById(`${tab}-next-cta`);
      const skip = document.getElementById(`${tab}-next-skip`);
      if (nextTitle) nextTitle.textContent = cfg.title;
      if (nextDesc) nextDesc.textContent = cfg.desc;
      if (cta) {
        cta.textContent = `${cfg.cta} →`;
        cta.onclick = cfg.action;
      }
      if (skip) {
        skip.hidden = !cfg.skippable;
        if (cfg.skippable) {
          skip.textContent = cfg.skipLabel || 'Skip for now';
          skip.onclick = () => {
            stepSkipped[`${tab}-${activeIdx + 1}`] = true;
            renderProcessPanel(tab);
          };
        }
      }
    }
  }

  function renderAllProcessPanels() {
    renderProcessPanel('rankings');
    renderProcessPanel('discover');
  }

  function syncHomeInputs() {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      const s = (v == null || (typeof v === 'number' && isNaN(v))) ? '' : String(v);
      if (document.activeElement !== el && el.value !== s) el.value = s;
    };
    set('home-state', homeState);
    set('home-lat', homeLat);
    set('home-lng', homeLng);
    set('dir-home-state', homeState);
    set('dir-home-lat', homeLat);
    set('dir-home-lng', homeLng);
    set('home-symbol', homeSymbol);
    set('dir-home-symbol', homeSymbol);
    const summary = document.getElementById('dir-home-summary');
    if (summary) {
      const state = homeState || '—';
      const sym = homeSymbol ? `${homeSymbol} · ` : '';
      const hasCoords = typeof homeLat === 'number' && typeof homeLng === 'number' && !isNaN(homeLat) && !isNaN(homeLng);
      summary.textContent = hasCoords
        ? `Home: ${sym}${state} · ${homeLat.toFixed(2)}, ${homeLng.toFixed(2)}`
        : `Home: ${sym}${state} — add coordinates to enable distance filtering.`;
    }
  }

  function getBorrowedSymbols() {
    const set = new Set();
    months.forEach(m => m.rows.forEach(r => { if (r.filled > 0) set.add(r.symbol); }));
    return set;
  }

  function buildDirFacetOptions() {
    const dir = getMergedDirectory();
    const borrowedSyms = dirFilters.onlyNew ? getBorrowedSymbols() : null;
    const holdingsSet = dirFilters.excludeHoldings && auditHoldings.length > 0
      ? new Set(auditHoldings)
      : null;
    const typeCounts = {}, stateCounts = {}, groupCounts = {}, loanDaysCounts = {};
    dir.forEach(l => {
      // Never count the user's own library as a candidate.
      if (homeSymbol && l.symbol === homeSymbol) return;
      // Keep facet counts consistent with the candidate list: when
      // "Only libraries I haven't borrowed from" is on, exclude borrowed
      // libraries here too so the sidebar totals match the visible count.
      if (borrowedSyms && borrowedSyms.has(l.symbol)) return;
      if (holdingsSet && holdingsSet.has(l.symbol)) return;
      typeCounts[l.type || 'Other'] = (typeCounts[l.type || 'Other'] || 0) + 1;
      if (l.state) stateCounts[l.state] = (stateCounts[l.state] || 0) + 1;
      (l.groups || []).forEach(g => {
        if (ALLOWED_GROUPS.has(g)) groupCounts[g] = (groupCounts[g] || 0) + 1;
      });
      if (typeof l.loansDaysToRespond === 'number') {
        const k = String(l.loansDaysToRespond);
        loanDaysCounts[k] = (loanDaysCounts[k] || 0) + 1;
      }
    });
    document.getElementById('dir-type-facets').innerHTML =
      Object.entries(typeCounts).sort((a, b) => a[0].localeCompare(b[0])).map(([t, c]) =>
        `<label class="facet"><span><input type="checkbox" data-dirfacet="type" value="${escapeHtml(t)}" ${dirFilters.type.has(t) ? 'checked' : ''}>${escapeHtml(t)}</span><span class="count">${c}</span></label>`
      ).join('') || '<p class="hint">No data.</p>';
    document.getElementById('dir-state-facets').innerHTML =
      Object.entries(stateCounts).sort(stateSort).map(([s, c]) =>
        `<label class="facet"><span><input type="checkbox" data-dirfacet="state" value="${escapeHtml(s)}" ${dirFilters.state.has(s) ? 'checked' : ''}>${escapeHtml(stateLabel(s))}</span><span class="count">${c}</span></label>`
      ).join('');
    document.getElementById('dir-group-facets').innerHTML =
      Object.entries(groupCounts).sort((a, b) => b[1] - a[1]).map(([g, c]) =>
        renderGroupFacet(g, c, 'dirfacet', dirFilters.group.has(g))
      ).join('') || '<p class="hint">No groups recorded in directory.</p>';
    const loanDaysWrap = document.getElementById('dir-loandays-facets');
    if (loanDaysWrap) {
      const loanDays = Object.entries(loanDaysCounts).sort((a, b) => Number(a[0]) - Number(b[0]));
      loanDaysWrap.innerHTML = loanDays.length === 0
        ? '<p class="hint">No loan-response data available.</p>'
        : loanDays.map(([d, c]) => {
            const label = d === '1' ? '1 day' : `${d} days`;
            return `<label class="facet"><span><input type="checkbox" data-dirfacet="loanDays" value="${escapeHtml(d)}" ${dirFilters.loanDays.has(d) ? 'checked' : ''}>${escapeHtml(label)}</span><span class="count">${c}</span></label>`;
          }).join('');
    }
    clampFacetToRows(document.getElementById('dir-type-facets'), 5);
    clampFacetToRows(document.getElementById('dir-state-facets'), 5);

    document.querySelectorAll('input[type="checkbox"][data-dirfacet]').forEach(cb => {
      cb.addEventListener('change', () => {
        const set = dirFilters[cb.dataset.dirfacet];
        if (cb.checked) set.add(cb.value); else set.delete(cb.value);
        resetDirPage();
        renderDiscover();
      });
    });
  }

  function renderDiscover() {
    saveData();
    const dir = getMergedDirectory();
    const borrowedSyms = getBorrowedSymbols();
    const sortBy = document.getElementById('dir-sort-by').value;
    const search = dirFilters.search.toLowerCase().trim();

    const holdingsSet = dirFilters.excludeHoldings && auditHoldings.length > 0
      ? new Set(auditHoldings)
      : null;
    let filtered = dir.filter(l => {
      if (homeSymbol && l.symbol === homeSymbol) return false;
      if (dirFilters.onlyNew && borrowedSyms.has(l.symbol)) return false;
      if (holdingsSet && holdingsSet.has(l.symbol)) return false;
      if (dirFilters.type.size && !dirFilters.type.has(l.type || 'Other')) return false;
      if (dirFilters.state.size && !dirFilters.state.has(l.state)) return false;
      if (dirFilters.group.size) {
        const lenderGroups = new Set(l.groups || []);
        let anyMatch = false;
        dirFilters.group.forEach(g => { if (lenderGroups.has(g)) anyMatch = true; });
        if (!anyMatch) return false;
      }
      if (dirFilters.loanDays.size) {
        if (typeof l.loansDaysToRespond !== 'number') return false;
        if (!dirFilters.loanDays.has(String(l.loansDaysToRespond))) return false;
      }
      if (search) {
        const hay = `${l.symbol} ${l.name}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    filtered.forEach(l => {
      l._distance = haversineKm(homeLat, homeLng, l.lat, l.lng);
      l._distanceMiles = l._distance != null ? kmToMiles(l._distance) : null;
    });

    if (dirFilters.maxDist > 0) {
      filtered = filtered.filter(l => l._distanceMiles != null && l._distanceMiles <= dirFilters.maxDist);
    }

    const sortFns = {
      distance: (a, b) => (a._distance ?? 1e9) - (b._distance ?? 1e9),
      name: (a, b) => a.name.localeCompare(b.name),
      state: (a, b) => (a.state || '').localeCompare(b.state || ''),
      loans: (a, b) => (a.loansDaysToRespond ?? 1e9) - (b.loansDaysToRespond ?? 1e9),
      copies: (a, b) => (a.copiesDaysToRespond ?? 1e9) - (b.copiesDaysToRespond ?? 1e9)
    };
    filtered.sort(sortFns[sortBy] || sortFns.distance);
    lastFilteredDir = filtered;

    document.getElementById('dir-match-count').textContent = filtered.length;
    const newCount = filtered.filter(l => !borrowedSyms.has(l.symbol)).length;
    const extra = document.getElementById('dir-summary-extra');
    if (extra) {
      extra.textContent = filtered.length > 0
        ? `(${newCount} new, ${filtered.length - newCount} known)`
        : '';
    }
    updateSelectionCounts();
    renderDiscoverChips();
    renderProcessPanel('discover');

    const list = document.getElementById('dir-list');
    if (filtered.length === 0) {
      const dirEmpty = dir.length === 0;
      list.innerHTML = `<div class="empty-state">
        <svg class="empty-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="6"/><path d="m20 20-3.5-3.5"/></svg>
        <strong>${dirEmpty ? 'Directory is empty' : 'No candidates match'}</strong>
        ${dirEmpty ? 'Import a directory CSV using the panel on the left.' : 'Try removing filters, or turn off "Only libraries I haven\'t borrowed from".'}
      </div>`;
      const pagerEmpty = document.getElementById('dir-pagination');
      if (pagerEmpty) { pagerEmpty.hidden = true; pagerEmpty.innerHTML = ''; }
      return;
    }

    // Paginate
    const pageWrap = document.getElementById('dir-pagination');
    const total = filtered.length;
    let pageSlice = filtered;
    if (dirPageSize > 0) {
      const pages = Math.max(1, Math.ceil(total / dirPageSize));
      if (dirPage > pages) dirPage = pages;
      const startIdx = (dirPage - 1) * dirPageSize;
      pageSlice = filtered.slice(startIdx, startIdx + dirPageSize);
    }
    list.innerHTML = pageSlice.map(l => renderDiscoverCard(l, borrowedSyms)).join('');
    renderPagination(pageWrap, total, dirPageSize, dirPage, (p) => {
      dirPage = p;
      renderDiscover();
      // Scroll top of list into view
      list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    list.querySelectorAll('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('input, button, a, .policy-panel')) return;
        toggleDiscoverSelection(card.dataset.symbol);
      });
    });
    list.querySelectorAll('[data-dir-select]').forEach(cb => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => toggleDiscoverSelection(cb.dataset.dirSelect, cb.checked));
    });
    list.querySelectorAll('[data-note-toggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sym = btn.dataset.noteToggle;
        if (notesExpanded.has(sym)) notesExpanded.delete(sym); else notesExpanded.add(sym);
        renderDiscover();
      });
    });
    list.querySelectorAll('[data-note-input]').forEach(ta => {
      ta.addEventListener('click', (e) => e.stopPropagation());
      ta.addEventListener('input', () => {
        debounce('note-' + ta.dataset.noteInput, () => setNote(ta.dataset.noteInput, ta.value), 400);
      });
      ta.addEventListener('blur', () => setNote(ta.dataset.noteInput, ta.value));
    });
    if (mapVisible) refreshMapMarkers();
  }

  function renderDiscoverCard(l, borrowedSyms) {
    const isSel = dirSelected.has(l.symbol);
    const alreadyBorrowed = borrowedSyms.has(l.symbol);
    const groupBadges = (l.groups || []).map(g => `<span class="badge">${escapeHtml(g)}</span>`).join('');
    const distanceText = l._distanceMiles != null
      ? `${Math.round(l._distanceMiles)} mi`
      : '—';
    const fmtDays = d => (typeof d === 'number' ? `${d} day${d === 1 ? '' : 's'}` : '—');
    const loansDaysText = fmtDays(l.loansDaysToRespond);
    const copiesDaysText = fmtDays(l.copiesDaysToRespond);
    const importedBadge = l._imported ? '<span class="badge" style="background:var(--bg-info); color:var(--text-info);">Imported</span>' : '';
    const borrowedBadge = alreadyBorrowed ? '<span class="badge every-month">Borrowed before</span>' : '<span class="badge local">New candidate</span>';
    const noteOpen = notesExpanded.has(l.symbol);
    const note = getNote(l.symbol);
    const noteBadge = note ? '<span class="badge note-badge">📝 Note</span>' : '';
    const noteBtn = `<button class="policy-lookup-btn" data-note-toggle="${escapeHtml(l.symbol)}" aria-expanded="${noteOpen}">${noteOpen ? 'Hide note ▴' : (note ? 'Edit note ▾' : 'Add note ▾')}</button>`;
    return `
      <div class="card ${isSel ? 'selected' : ''}" role="listitem" data-symbol="${escapeHtml(l.symbol)}" tabindex="0">
        <div class="card-top">
          <div class="card-left">
            <input type="checkbox" data-dir-select="${escapeHtml(l.symbol)}" ${isSel ? 'checked' : ''} aria-label="Select ${escapeHtml(l.name)}">
            <div>
              <p class="card-name">${escapeHtml(l.name)}</p>
              <p class="card-sub">${escapeHtml(l.symbol)} · ${escapeHtml(l.type || 'Other')} · ${escapeHtml(l.state || '—')}</p>
            </div>
          </div>
        </div>
        <div class="discover-card-stats">
          <div class="stat"><span class="stat-label">Distance</span><span class="stat-val ${l._distanceMiles == null ? 'muted' : ''}">${distanceText}</span></div>
          <div class="stat" title="OCLC stated turnaround for loan requests"><span class="stat-label">Loans</span><span class="stat-val ${l.loansDaysToRespond == null ? 'muted' : ''}">${loansDaysText}</span></div>
          <div class="stat" title="OCLC stated turnaround for copy requests"><span class="stat-label">Copies</span><span class="stat-val ${l.copiesDaysToRespond == null ? 'muted' : ''}">${copiesDaysText}</span></div>
          <div class="stat"><span class="stat-label">Groups</span><span class="stat-val ${(l.groups || []).length === 0 ? 'muted' : ''}">${(l.groups || []).length || '—'}</span></div>
        </div>
        <div class="badges">
          ${borrowedBadge}
          ${l.state === homeState ? '<span class="badge local">Same state</span>' : ''}
          ${groupBadges}
          ${importedBadge}
          ${noteBadge}
          ${noteBtn}
        </div>
        ${noteOpen ? renderNoteEditor(l.symbol, note) : ''}
      </div>`;
  }

  /* ---------- Export panels ---------- */

  function defaultGroupName(facets, isDiscover) {
    const parts = [];
    if (isDiscover) parts.push('Discover');
    if (facets.state && facets.state.size === 1) parts.push([...facets.state][0]);
    if (facets.type && facets.type.size === 1) parts.push([...facets.type][0].replace(/[^A-Za-z]/g, ''));
    if (facets.hist) {
      if (facets.hist.has('reliable')) parts.push('Reliable');
      if (facets.hist.has('fast')) parts.push('Fast');
      if (facets.hist.has('consistent')) parts.push('Consistent');
    }
    if (parts.length === (isDiscover ? 1 : 0)) parts.push('TopLenders');
    return parts.join('_').toUpperCase();
  }

  function renderExportPanel(panelId, symbols, isDiscover) {
    const panel = document.getElementById(panelId);
    if (symbols.size === 0) {
      panel.innerHTML = `<div class="warning-panel">No lenders selected. Tick boxes on the cards, then click <strong>Build holdings group</strong> again.</div>`;
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const syms = [...symbols].sort();
    const symbolString = syms.join(' ');
    panel.innerHTML = `
      <div class="export-panel">
        <div class="export-header">
          <p class="export-title">Custom holdings group${isDiscover ? ' (Discover)' : ''}</p>
          <button class="close-btn" data-close-export aria-label="Close">×</button>
        </div>
        <div class="name-row">
          <label for="group-name-${isDiscover ? 'd' : 'r'}">Group name</label>
          <input type="text" id="group-name-${isDiscover ? 'd' : 'r'}" value="${escapeHtml(defaultGroupName(isDiscover ? dirFilters : activeFilters, isDiscover))}" maxlength="50">
        </div>
        <div class="count-row">OCLC Symbols · <strong>${syms.length}</strong> in this group</div>
        <textarea class="symbols-box" data-symbols-box readonly aria-label="Symbols list">${escapeHtml(symbolString)}</textarea>
        <div class="export-actions">
          <button class="primary-btn" data-copy-btn>Copy symbols</button>
          <button data-save-btn>💾 Save group</button>
          <button data-download-btn>Download .txt</button>
          ${!isDiscover ? '<button data-csv-btn>Download ranked CSV</button>' : ''}
          <button data-print-btn style="margin-left: auto;">Print</button>
        </div>
        <div class="export-instructions">
          <strong>How to paste into OCLC:</strong>
          <ol>
            <li>Open <em>OCLC Service Configuration → WorldShare ILL → Custom Holdings Groups</em></li>
            <li>Click <em>Create New Custom Holdings Group</em> and name it</li>
            <li>Click <em>Add/Edit symbol(s)</em>, paste, then <em>Update Symbols</em></li>
          </ol>
        </div>
      </div>`;
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    panel.querySelector('[data-close-export]').addEventListener('click', () => { panel.innerHTML = ''; });
    panel.querySelector('[data-copy-btn]').addEventListener('click', async () => {
      const text = panel.querySelector('[data-symbols-box]').value;
      const btn = panel.querySelector('[data-copy-btn]');
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '✓ Copied to clipboard';
        announce('Symbols copied to clipboard');
        setTimeout(() => { if (btn) btn.textContent = 'Copy symbols'; }, 2000);
      } catch (e) {
        panel.querySelector('[data-symbols-box]').select();
        document.execCommand('copy');
      }
    });
    panel.querySelector('[data-download-btn]').addEventListener('click', () => {
      const nameInput = panel.querySelector(`#group-name-${isDiscover ? 'd' : 'r'}`);
      const name = nameInput.value || 'lenders';
      downloadFile(`${name}.txt`, symbolString, 'text/plain');
    });
    panel.querySelector('[data-print-btn]').addEventListener('click', () => {
      window.print();
    });
    panel.querySelector('[data-save-btn]').addEventListener('click', () => {
      const nameInput = panel.querySelector(`#group-name-${isDiscover ? 'd' : 'r'}`);
      const saved = saveCurrentGroup(nameInput.value, isDiscover ? 'discover' : 'rankings');
      if (saved) {
        const btn = panel.querySelector('[data-save-btn]');
        btn.textContent = '✓ Saved';
        setTimeout(() => { btn.textContent = '💾 Save group'; }, 1800);
      }
    });
    if (!isDiscover) {
      const csvBtn = panel.querySelector('[data-csv-btn]');
      if (csvBtn) {
        csvBtn.addEventListener('click', () => {
          const merged = mergeMonths();
          const selectedLenders = merged.filter(l => selected.has(l.symbol)).map(l => ({ ...l, _score: totalScore(l) }));
          selectedLenders.sort((a, b) => b._score - a._score);
          const rows = [['Rank', 'Symbol', 'Name', 'State', 'Type', 'Filled', 'Requested', 'FillRate%', 'AvgDays', 'MonthsPresent', 'MonthsSpan', 'Score']];
          selectedLenders.forEach((l, i) => {
            rows.push([
              i + 1, l.symbol, '"' + l.name.replace(/"/g, '""') + '"', l.state, l.type,
              l.filled, l.requested, fillRate(l).toFixed(0),
              l.filled > 0 ? avgDays(l).toFixed(1) : '',
              l.monthsPresent, l.monthsSpan, l._score
            ]);
          });
          const csv = rows.map(r => r.join(',')).join('\n');
          const name = panel.querySelector(`#group-name-r`).value || 'lenders';
          downloadFile(`${name}_ranked.csv`, csv, 'text/csv');
        });
      }
    }
  }

  /* ---------- Session export / import ---------- */

  const SESSION_VERSION = 1;

  function buildSessionBundle() {
    return {
      _type: 'lender-finder-session',
      version: SESSION_VERSION,
      exportedAt: new Date().toISOString(),
      months: JSON.parse(JSON.stringify(months)),
      selected: [...selected],
      dirSelected: [...dirSelected],
      notes: { ...notes },
      savedGroups: JSON.parse(JSON.stringify(savedGroups)),
      weights: { ...weights },
      homeState,
      homeLat,
      homeLng,
      importedDirectory: JSON.parse(JSON.stringify(importedDirectory))
    };
  }

  function exportSession() {
    const bundle = buildSessionBundle();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`lender-finder-session-${stamp}.json`, JSON.stringify(bundle, null, 2), 'application/json');
    showToast({ message: 'Session exported.', kind: 'ok' });
  }

  function summarizeBundle(b) {
    return {
      months: (b.months || []).length,
      selected: (b.selected || []).length,
      dirSelected: (b.dirSelected || []).length,
      notes: Object.keys(b.notes || {}).length,
      savedGroups: (b.savedGroups || []).length,
      importedDirectory: (b.importedDirectory || []).length
    };
  }

  function applySessionBundle(b, mode) {
    if (mode === 'replace') {
      months = b.months || [];
      selected.clear(); (b.selected || []).forEach(s => selected.add(s));
      dirSelected.clear(); (b.dirSelected || []).forEach(s => dirSelected.add(s));
      notes = b.notes || {};
      savedGroups = b.savedGroups || [];
      importedDirectory = b.importedDirectory || [];
      if (b.weights) weights = { ...weights, ...b.weights };
      if (typeof b.homeState === 'string') homeState = b.homeState;
      if (typeof b.homeLat === 'number') homeLat = b.homeLat;
      if (typeof b.homeLng === 'number') homeLng = b.homeLng;
    } else {
      // Merge
      (b.months || []).forEach(m => {
        if (!months.some(x => x.period === m.period)) months.push(m);
      });
      sortMonthsByPeriod();
      (b.selected || []).forEach(s => selected.add(s));
      (b.dirSelected || []).forEach(s => dirSelected.add(s));
      Object.keys(b.notes || {}).forEach(sym => { if (!notes[sym]) notes[sym] = b.notes[sym]; });
      (b.savedGroups || []).forEach(g => {
        if (!savedGroups.some(x => x.name.toLowerCase() === g.name.toLowerCase())) savedGroups.push(g);
      });
      const dirBySym = new Map(importedDirectory.map(r => [r.symbol, r]));
      (b.importedDirectory || []).forEach(r => { if (!dirBySym.has(r.symbol)) dirBySym.set(r.symbol, r); });
      importedDirectory = Array.from(dirBySym.values());
    }
    saveData();
    syncHomeInputs();
    syncWeightLabels();
    renderMonthsList();
    rebuildSymbolGroups();
    rebuildFacetOptions();
    renderSavedGroups();
    buildDirFacetOptions();
    renderRankings();
    renderDiscover();
  }

  function handleSessionFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const bundle = JSON.parse(ev.target.result);
        if (!bundle || bundle._type !== 'lender-finder-session') {
          throw new Error('Not a Lender Finder session file.');
        }
        const s = summarizeBundle(bundle);
        const exportedAt = bundle.exportedAt ? new Date(bundle.exportedAt).toLocaleString() : 'unknown date';
        openModal('Import session', `
          <p>Loaded a session exported on <strong>${escapeHtml(exportedAt)}</strong>.</p>
          <h3>Contents</h3>
          <ul style="margin:6px 0 12px; padding-left: 18px; line-height: 1.7;">
            <li>${s.months} month${s.months === 1 ? '' : 's'} of reports</li>
            <li>${s.selected} selected lender${s.selected === 1 ? '' : 's'} (Rankings)</li>
            <li>${s.dirSelected} selected candidate${s.dirSelected === 1 ? '' : 's'} (Discover)</li>
            <li>${s.notes} lender note${s.notes === 1 ? '' : 's'}</li>
            <li>${s.savedGroups} saved holdings group${s.savedGroups === 1 ? '' : 's'}</li>
            <li>${s.importedDirectory} imported directory entr${s.importedDirectory === 1 ? 'y' : 'ies'}</li>
          </ul>
          <h3>How to apply</h3>
          <p><strong>Merge</strong> — add the imported items to what you already have (skips duplicates). <strong>Replace</strong> — wipe your current data and use only the imported session.</p>
          <div style="display:flex; gap:8px; margin-top:16px; justify-content:flex-end; flex-wrap:wrap;">
            <button class="ghost-btn" id="session-cancel" type="button">Cancel</button>
            <button class="ghost-btn" id="session-merge" type="button">Merge</button>
            <button class="primary-btn" id="session-replace" type="button">Replace</button>
          </div>
        `);
        document.getElementById('session-cancel').addEventListener('click', closeModal);
        document.getElementById('session-merge').addEventListener('click', () => {
          applySessionBundle(bundle, 'merge');
          closeModal();
          showToast({ message: 'Session merged.', kind: 'ok' });
        });
        document.getElementById('session-replace').addEventListener('click', () => {
          const snapshot = buildSessionBundle();
          applySessionBundle(bundle, 'replace');
          closeModal();
          showToast({
            message: 'Session replaced.',
            action: 'Undo',
            kind: 'ok',
            onAction: () => { applySessionBundle(snapshot, 'replace'); }
          });
        });
      } catch (e) {
        showToast({ message: `Import failed: ${e.message}`, kind: 'err', duration: 7000 });
      }
    };
    reader.onerror = () => showToast({ message: 'Could not read file.', kind: 'err' });
    reader.readAsText(file);
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ---------- File handling ---------- */

  function handleReportSelection(files) {
    if (!files || files.length === 0) return;
    const status = document.getElementById('upload-status');
    let pending = files.length;
    const errors = [];
    let added = 0;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = parseOCLCReport(ev.target.result);
          if (parsed.rows.length === 0) {
            errors.push(`${file.name}: empty report`);
          } else if (parsed.period && months.some(m => m.period === parsed.period)) {
            errors.push(`${file.name}: ${parsed.period} already loaded`);
          } else {
            months.push(parsed);
            added += 1;
          }
        } catch (err) {
          errors.push(`${file.name}: ${err.message}`);
        }
        pending -= 1;
        if (pending === 0) {
          sortMonthsByPeriod();
          saveData();
          if (errors.length > 0 && added === 0) {
            status.className = 'upload-status err';
            status.textContent = errors.join(' · ');
            announce('Upload failed');
          } else if (errors.length > 0) {
            status.className = 'upload-status ok';
            status.textContent = `Added ${added}. Skipped: ${errors.join(' · ')}`;
            announce(`Added ${added} report${added === 1 ? '' : 's'}`);
          } else {
            status.className = 'upload-status ok';
            status.textContent = `Loaded ${months.length} month${months.length === 1 ? '' : 's'}.`;
            announce(`Loaded ${months.length} month${months.length === 1 ? '' : 's'}`);
          }
          renderMonthsList();
          rebuildFacetOptions();
          renderRankings();
          renderDiscover();
        }
      };
      reader.onerror = () => {
        errors.push(`${file.name}: read failed`);
        pending -= 1;
        if (pending === 0) renderRankings();
      };
      reader.readAsText(file);
    });
  }

  /* ---------- Drag & drop ---------- */

  function bindDropzones() {
    // Page-level: prevent browser from opening dropped files outside dropzones
    ['dragover', 'drop'].forEach(ev => {
      document.addEventListener(ev, e => {
        if (!e.target.closest('[data-dropzone]')) {
          e.preventDefault();
        }
      });
    });

    document.querySelectorAll('[data-dropzone]').forEach(zone => {
      const kind = zone.dataset.dropzone;
      zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', e => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        if (kind === 'report') handleReportSelection(files);
      });
    });
  }

  /* ---------- Tab switching ---------- */

  function switchTab(name) {
    activeTab = name;
    document.querySelectorAll('.tab').forEach(b => {
      const active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      // Roving tabindex: only the active tab is in the natural tab order.
      b.setAttribute('tabindex', active ? '0' : '-1');
    });
    document.getElementById('rankings-view').hidden = name !== 'rankings';
    document.getElementById('discover-view').hidden = name !== 'discover';
    const auditView = document.getElementById('audit-view');
    if (auditView) auditView.hidden = name !== 'audit';
    if (name === 'rankings' || name === 'discover') renderProcessPanel(name);
    if (name === 'audit') renderAudit();
    saveData();
    // Re-clamp facets now that the newly-shown panel has a layout.
    clampAllFacets();
  }

  /* ---------- Audit tab ---------- */

  function parseAuditInput(text) {
    if (!text) return [];
    const seen = new Set();
    const out = [];
    text.split(/[\s,;]+/).forEach(t => {
      const sym = t.trim().toUpperCase();
      if (!sym || seen.has(sym)) return;
      seen.add(sym);
      out.push(sym);
    });
    return out;
  }

  function auditTierForScore(score, inReport) {
    if (!inReport) return 'unused';
    if (score >= 70) return 'top';
    if (score >= 50) return 'strong';
    return 'weak';
  }

  const TIER_META = {
    top:    { label: 'Top',    badge: 'badge-top'    },
    strong: { label: 'Strong', badge: 'badge-strong' },
    weak:   { label: 'Weak',   badge: 'badge-weak'   },
    unused: { label: 'Unused', badge: 'badge-unused' }
  };

  function renderAudit() {
    const ta = document.getElementById('audit-input');
    if (ta && ta.value !== auditHoldings.join(', ')) ta.value = auditHoldings.join(', ');
    const countEl = document.getElementById('audit-count');
    if (countEl) countEl.textContent = auditHoldings.length === 1 ? '1 symbol' : `${auditHoldings.length} symbols`;

    const merged = mergeMonths();
    const reportBySym = new Map(merged.map(l => [l.symbol, l]));
    const dir = getMergedDirectory();
    const dirBySym = new Map(dir.map(l => [l.symbol, l]));

    let rows = auditHoldings.map(sym => {
      const r = reportBySym.get(sym);
      const d = dirBySym.get(sym);
      const inReport = !!r;
      const score = inReport ? totalScore(r) : 0;
      const subs = inReport ? subscores(r) : null;
      const tier = auditTierForScore(score, inReport);
      return {
        symbol: sym,
        name: (r && r.name) || (d && d.name) || sym,
        type: (r && r.type) || (d && d.type) || '—',
        state: (r && r.state) || (d && d.state) || '—',
        groups: (d && d.groups) || [],
        loansDays: d && typeof d.loansDaysToRespond === 'number' ? d.loansDaysToRespond : null,
        copiesDays: d && typeof d.copiesDaysToRespond === 'number' ? d.copiesDaysToRespond : null,
        requested: r ? r.requested : 0,
        filled: r ? r.filled : 0,
        avgHours: r ? r.avgHours : 0,
        monthsPresent: r ? r.monthsPresent : 0,
        monthsSpan: r ? r.monthsSpan : (months.length || 0),
        score, subs, tier, inReport
      };
    });

    const counts = { top: 0, strong: 0, weak: 0, unused: 0 };
    rows.forEach(r => counts[r.tier]++);
    document.getElementById('audit-total').textContent = rows.length;
    document.getElementById('audit-top').textContent = counts.top;
    document.getElementById('audit-strong').textContent = counts.strong;
    document.getElementById('audit-weak').textContent = counts.weak;
    document.getElementById('audit-unused').textContent = counts.unused;
    document.querySelectorAll('.audit-tier-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tier === (auditTierFilter || 'all'));
    });
    // Apply the tier filter to the rendered rows (counts above always reflect
    // the full set so the user can see how many would match each tier).
    if (auditTierFilter) rows = rows.filter(r => r.tier === auditTierFilter);

    const sortSel = document.getElementById('audit-sort-by');
    const sortBy = (sortSel && sortSel.value) || 'score';
    const tierOrder = { top: 0, strong: 1, weak: 2, unused: 3 };
    const sortFns = {
      score: (a, b) => b.score - a.score,
      tier:  (a, b) => tierOrder[a.tier] - tierOrder[b.tier] || b.score - a.score,
      name:  (a, b) => a.name.localeCompare(b.name),
      filled:(a, b) => b.filled - a.filled,
      fill:  (a, b) => {
        const fa = a.requested > 0 ? a.filled / a.requested : -1;
        const fb = b.requested > 0 ? b.filled / b.requested : -1;
        return fb - fa;
      },
      speed: (a, b) => (a.filled > 0 ? a.avgHours : 1e9) - (b.filled > 0 ? b.avgHours : 1e9)
    };
    rows.sort(sortFns[sortBy] || sortFns.score);

    const list = document.getElementById('audit-list');
    if (rows.length === 0) {
      if (months.length === 0) {
        list.innerHTML = `<div class="empty-state">
          <svg class="empty-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 16V8m-4 4l4-4 4 4M5 18h14"/></svg>
          <strong>Load a Borrower report first</strong>
          The audit needs your actual borrowing history to bucket each holdings member as Top, Strong, Weak, or Unused. Head to Rankings, upload at least one month, then come back here.
          <div class="empty-cta-row">
            <button class="empty-cta primary" id="audit-empty-rankings-cta" type="button">Go to Rankings →</button>
          </div>
        </div>`;
        const goBtn = document.getElementById('audit-empty-rankings-cta');
        if (goBtn) goBtn.addEventListener('click', () => switchTab('rankings'));
      } else if (auditHoldings.length === 0) {
        list.innerHTML = `<div class="empty-state">
          <strong>Paste your current holdings group to audit it</strong>
          Enter OCLC symbols on the left and click <em>Audit holdings</em>. Each member gets bucketed by how it has performed in your loaded Borrower reports.
        </div>`;
      } else {
        list.innerHTML = `<div class="empty-state">
          <strong>No members in this tier</strong>
          Click <em>members</em> at the top to clear the filter.
        </div>`;
      }
      return;
    }
    list.innerHTML = rows.map(renderAuditCard).join('');
  }

  function renderAuditCard(r) {
    const meta = TIER_META[r.tier];
    const fr = r.requested > 0 ? Math.min(100, (r.filled / r.requested) * 100) : null;
    const days = r.avgHours > 0 ? r.avgHours / 24 : null;
    const groupBadges = r.groups.map(g => `<span class="badge">${escapeHtml(g)}</span>`).join('');
    const policy = (typeof r.loansDays === 'number' || typeof r.copiesDays === 'number')
      ? `<div class="audit-policy">OCLC stated: loans ${typeof r.loansDays === 'number' ? r.loansDays + 'd' : '—'} · copies ${typeof r.copiesDays === 'number' ? r.copiesDays + 'd' : '—'}</div>`
      : '';
    const scoreCell = r.inReport
      ? `<span class="score ${r.score >= 70 ? 'high' : r.score >= 50 ? 'med' : ''}">${r.score}</span>`
      : '<span class="score" style="opacity:0.5;">—</span>';
    return `
      <div class="card audit-card" role="listitem" data-tier="${r.tier}">
        <div class="card-top">
          <div class="card-left">
            <div>
              <p class="card-name">${escapeHtml(r.name)}</p>
              <p class="card-sub">${escapeHtml(r.symbol)} · ${escapeHtml(r.type)} · ${escapeHtml(r.state)}</p>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <span class="badge audit-tier ${meta.badge}">${meta.label}</span>
            ${scoreCell}
          </div>
        </div>
        <div class="card-stats">
          <div class="stat"><span class="stat-label">Requested</span><span class="stat-val ${r.requested === 0 ? 'muted' : ''}">${r.requested || '—'}</span></div>
          <div class="stat"><span class="stat-label">Filled</span><span class="stat-val ${r.filled === 0 ? 'muted' : ''}">${r.filled || '—'}</span></div>
          <div class="stat"><span class="stat-label">Fill rate</span><span class="stat-val ${fr == null ? 'muted' : ''}">${fr == null ? '—' : fr.toFixed(0) + '%'}</span></div>
          <div class="stat"><span class="stat-label">Avg days</span><span class="stat-val ${days == null ? 'muted' : ''}">${days == null ? '—' : days.toFixed(1)}</span></div>
          <div class="stat"><span class="stat-label">Months</span><span class="stat-val ${r.monthsSpan === 0 ? 'muted' : ''}">${r.monthsSpan > 0 ? `${r.monthsPresent}/${r.monthsSpan}` : '—'}</span></div>
        </div>
        ${groupBadges ? `<div class="badges">${groupBadges}</div>` : ''}
        ${policy}
      </div>`;
  }

  /* ---------- Modal & help ---------- */

  let lastFocusedBeforeModal = null;
  let modalKeyHandler = null;
  function openModal(title, html) {
    lastFocusedBeforeModal = document.activeElement;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = html;
    const backdrop = document.getElementById('modal-backdrop');
    backdrop.hidden = false;
    const modal = backdrop.querySelector('.modal');
    modal.focus();
    document.body.style.overflow = 'hidden';

    // Focus trap: keep Tab inside the modal
    modalKeyHandler = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = modal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === modal)) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && active === last) {
        first.focus();
        e.preventDefault();
      }
    };
    modal.addEventListener('keydown', modalKeyHandler);
  }
  function closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    const modal = backdrop.querySelector('.modal');
    if (modalKeyHandler) {
      modal.removeEventListener('keydown', modalKeyHandler);
      modalKeyHandler = null;
    }
    modal.classList.remove('modal-wide');
    backdrop.hidden = true;
    document.body.style.overflow = '';
    if (lastFocusedBeforeModal && lastFocusedBeforeModal.focus) lastFocusedBeforeModal.focus();
  }

  function showHelpModal() {
    openModal('Help & shortcuts', `
      <h3>Keyboard shortcuts</h3>
      <div class="shortcut-row"><span>Switch to Rankings</span><span class="shortcut-keys"><kbd>1</kbd></span></div>
      <div class="shortcut-row"><span>Switch to Audit</span><span class="shortcut-keys"><kbd>2</kbd></span></div>
      <div class="shortcut-row"><span>Switch to Discover</span><span class="shortcut-keys"><kbd>3</kbd></span></div>
      <div class="shortcut-row"><span>Focus search (Discover)</span><span class="shortcut-keys"><kbd>/</kbd></span></div>
      <div class="shortcut-row"><span>Clear search / close panel</span><span class="shortcut-keys"><kbd>Esc</kbd></span></div>
      <div class="shortcut-row"><span>Toggle card selection</span><span class="shortcut-keys"><kbd>Enter</kbd> or <kbd>Space</kbd></span></div>
      <div class="shortcut-row"><span>Show this help</span><span class="shortcut-keys"><kbd>?</kbd></span></div>

      <h3>Tips</h3>
      <p>Drag-and-drop CSV/XLS files anywhere on the sidebar upload boxes.</p>
      <p>Click anywhere on a card (not just the checkbox) to select it.</p>
      <p>Use the filter chips at the top of the results to remove filters one at a time.</p>
      <p>All data lives in your browser. Nothing is uploaded.</p>
    `);
  }

  function showScoringModal() {
    openModal('How the score is calculated', `
      <p>The composite score (0–100) is a weighted average of five subscores. Adjust the sliders to match your priorities — the weights renormalize automatically.</p>

      <div class="scoring-row"><strong>Speed</strong><span>Faster turnaround scores higher. A 1-day average is 100; each extra day subtracts 18 points. Zero if the lender has never filled.</span></div>
      <div class="scoring-row"><strong>Fill rate</strong><span>Percentage of your requests that were filled, capped at 100. The single most predictive metric for whether a request will succeed.</span></div>
      <div class="scoring-row"><strong>Volume</strong><span>Reaches 100 at 30 filled requests. Higher volume means more confidence in the speed and fill-rate measurements.</span></div>
      <div class="scoring-row"><strong>Consistency</strong><span>Months the lender appeared in your reports as a share of months loaded. Filters out one-off flukes.</span></div>
      <div class="scoring-row"><strong>Local</strong><span>100 if the lender is in your home state, 0 otherwise. Same-state borrowing is usually faster and cheaper.</span></div>

      <h3>Presets</h3>
      <p><strong>Balanced</strong> — sensible defaults for everyday use.<br>
      <strong>Speed first</strong> — prioritizes turnaround time. Use for urgent / patron-facing requests.<br>
      <strong>Trusted</strong> — favors fill rate and consistency. Use to identify reliable suppliers for course reserves or repeat needs.</p>
    `);
  }

  /* ---------- Geolocation ---------- */

  function useMyLocation() {
    if (!navigator.geolocation) {
      announce('Geolocation is not supported in this browser.');
      return;
    }
    const btn = document.getElementById('use-location');
    const original = btn.textContent;
    btn.textContent = '⌛ Locating…';
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      pos => {
        homeLat = +pos.coords.latitude.toFixed(4);
        homeLng = +pos.coords.longitude.toFixed(4);
        syncHomeInputs();
        saveData();
        renderDiscover();
        btn.textContent = original;
        btn.disabled = false;
        announce(`Location set to ${homeLat}, ${homeLng}`);
      },
      err => {
        btn.textContent = original;
        btn.disabled = false;
        announce('Could not get location: ' + err.message);
        alert('Could not get your location: ' + err.message);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  }

  /* ---------- Event wiring ---------- */

  function bindEvents() {
    const tabEls = Array.from(document.querySelectorAll('.tab'));
    tabEls.forEach((b, i) => {
      b.addEventListener('click', () => switchTab(b.dataset.tab));
      b.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        let next = i;
        if (e.key === 'ArrowRight') next = (i + 1) % tabEls.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + tabEls.length) % tabEls.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabEls.length - 1;
        const target = tabEls[next];
        target.focus();
        switchTab(target.dataset.tab);
      });
    });

    document.getElementById('csv-input').addEventListener('change', e => {
      handleReportSelection(e.target.files);
      e.target.value = '';
    });

    document.getElementById('clear-months').addEventListener('click', () => {
      const snapshot = { months: JSON.parse(JSON.stringify(months)), selected: [...selected], expanded: [...expanded] };
      months = [];
      selected.clear();
      expanded.clear();
      saveData();
      const status = document.getElementById('upload-status');
      status.className = 'upload-status';
      status.textContent = 'Drop one or more monthly Borrower Transaction-Level Detail reports here, or click above.';
      renderMonthsList();
      rebuildFacetOptions();
      renderRankings();
      renderDiscover();
      showToast({
        message: `Cleared ${snapshot.months.length} month${snapshot.months.length === 1 ? '' : 's'}.`,
        action: 'Undo',
        onAction: () => {
          months = snapshot.months;
          snapshot.selected.forEach(s => selected.add(s));
          snapshot.expanded.forEach(s => expanded.add(s));
          saveData();
          renderMonthsList();
          rebuildFacetOptions();
          renderRankings();
          renderDiscover();
        }
      });
    });

    document.getElementById('show-format-help').addEventListener('click', (e) => {
      const h = document.getElementById('format-help');
      h.hidden = !h.hidden;
      e.target.setAttribute('aria-expanded', !h.hidden);
    });

    const wireHomeState = (id) => {
      document.getElementById(id).addEventListener('input', e => {
        homeState = (e.target.value || '').toUpperCase().slice(0, 2);
        e.target.value = homeState;
        syncHomeInputs();
        debounce('home-state', () => { renderRankings(); renderDiscover(); }, 200);
      });
    };
    const wireHomeLat = (id) => {
      document.getElementById(id).addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) { homeLat = v; syncHomeInputs(); debounce('home-lat', renderDiscover, 200); }
      });
    };
    const wireHomeLng = (id) => {
      document.getElementById(id).addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) { homeLng = v; syncHomeInputs(); debounce('home-lng', renderDiscover, 200); }
      });
    };
    wireHomeState('home-state'); wireHomeState('dir-home-state');
    wireHomeLat('home-lat');     wireHomeLat('dir-home-lat');
    wireHomeLng('home-lng');     wireHomeLng('dir-home-lng');
    const wireHomeSymbol = (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', e => {
        homeSymbol = (e.target.value || '').toUpperCase().trim();
        e.target.value = homeSymbol;
        syncHomeInputs();
        debounce('home-symbol', () => { buildDirFacetOptions(); renderDiscover(); }, 200);
      });
    };
    wireHomeSymbol('home-symbol'); wireHomeSymbol('dir-home-symbol');
    document.getElementById('use-location').addEventListener('click', useMyLocation);
    document.getElementById('dir-use-location').addEventListener('click', useMyLocation);

    document.querySelectorAll('input[data-weight]').forEach(inp => {
      const onWeightChange = () => {
        const n = inp.valueAsNumber;
        if (Number.isFinite(n)) weights[inp.dataset.weight] = n;
        weightsTouched = true;
        // Snap sort to "best match" so weight changes actually reorder visibly.
        const sortSel = document.getElementById('sort-by');
        if (sortSel && sortSel.value !== 'score') sortSel.value = 'score';
        syncWeightLabels();
        renderRankings();
      };
      inp.addEventListener('input', onWeightChange);
      inp.addEventListener('change', onWeightChange);
    });

    document.querySelectorAll('.preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = presets[btn.dataset.preset];
        if (p) {
          weights = { ...p };
          weightsTouched = true;
          const sortSel = document.getElementById('sort-by');
          if (sortSel && sortSel.value !== 'score') sortSel.value = 'score';
          syncWeightLabels();
          renderRankings();
        }
      });
    });

    document.querySelectorAll('input[type="checkbox"][data-facet="hist"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) activeFilters.hist.add(cb.value);
        else activeFilters.hist.delete(cb.value);
        renderRankings();
      });
    });

    document.getElementById('sort-by').addEventListener('change', () => { resetRankPage(); renderRankings(); });
    const rankPageSel = document.getElementById('rank-page-size');
    if (rankPageSel) {
      rankPageSel.addEventListener('change', () => {
        const v = rankPageSel.value;
        rankPageSize = v === 'all' ? 0 : parseInt(v, 10);
        resetRankPage();
        renderRankings();
      });
    }
    document.getElementById('build-group-btn').addEventListener('click', () => renderExportPanel('export-panel', selected, false));
    document.getElementById('compare-btn').addEventListener('click', showCompareModal);

    document.getElementById('select-top-10').addEventListener('click', () => {
      lastFilteredRankings.slice(0, 10).forEach(l => selected.add(l.symbol));
      renderRankings();
      announce(`Selected top ${Math.min(10, lastFilteredRankings.length)}`);
    });
    document.getElementById('select-all-visible').addEventListener('click', () => {
      lastFilteredRankings.forEach(l => selected.add(l.symbol));
      renderRankings();
      announce(`Selected all ${lastFilteredRankings.length} visible`);
    });
    document.getElementById('clear-selection').addEventListener('click', () => {
      selected.clear();
      renderRankings();
      announce('Selection cleared');
    });

    document.getElementById('reset-filters').addEventListener('click', () => {
      activeFilters.type.clear();
      activeFilters.state.clear();
      activeFilters.hist.clear();
      activeFilters.group.clear();
      document.querySelectorAll('#rankings-view input[type="checkbox"][data-facet]').forEach(cb => cb.checked = false);
      selected.clear();
      expanded.clear();
      document.getElementById('export-panel').innerHTML = '';
      weights = { ...presets.balanced };
      syncWeightLabels();
      rebuildFacetOptions();
      renderRankings();
    });

    /* Process panel toggle (both tabs) */
    ['rankings', 'discover'].forEach(tab => {
      const btn = document.getElementById(`${tab}-process-toggle`);
      if (!btn) return;
      btn.addEventListener('click', () => {
        processCollapsed[tab] = !processCollapsed[tab];
        try { localStorage.setItem(`lf-${tab}-process-collapsed`, processCollapsed[tab] ? '1' : '0'); } catch (_) {}
        renderProcessPanel(tab);
      });
    });

    /* Cross-tab nudge: Rankings → Audit */
    const auditNudgeBtn = document.getElementById('rankings-audit-nudge-btn');
    if (auditNudgeBtn) {
      auditNudgeBtn.addEventListener('click', () => {
        switchTab('audit');
        openSidebarIfNeeded('audit');
        const ta = document.getElementById('audit-input');
        if (ta) ta.focus();
      });
    }

    /* Discover tab events */
    const searchInput = document.getElementById('dir-search');
    const searchClear = document.getElementById('dir-search-clear');
    searchInput.addEventListener('input', e => {
      dirFilters.search = e.target.value;
      searchClear.hidden = !e.target.value;
      resetDirPage();
      debounce('search', renderDiscover, 150);
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      dirFilters.search = '';
      searchClear.hidden = true;
      resetDirPage();
      renderDiscover();
      searchInput.focus();
    });

    document.getElementById('show-only-new').addEventListener('change', e => {
      dirFilters.onlyNew = e.target.checked;
      resetDirPage();
      buildDirFacetOptions();
      renderDiscover();
    });
    const excludeHoldingsEl = document.getElementById('exclude-holdings');
    if (excludeHoldingsEl) {
      excludeHoldingsEl.addEventListener('change', e => {
        dirFilters.excludeHoldings = e.target.checked;
        resetDirPage();
        buildDirFacetOptions();
        renderDiscover();
      });
    }
    document.getElementById('max-dist').addEventListener('input', e => {
      dirFilters.maxDist = parseInt(e.target.value);
      const out = document.getElementById('dist-out');
      out.textContent = dirFilters.maxDist > 0 ? `${dirFilters.maxDist} mi` : 'Any';
      resetDirPage();
      debounce('dist', renderDiscover, 50);
    });
    document.getElementById('dir-sort-by').addEventListener('change', () => { resetDirPage(); renderDiscover(); });
    const dirPageSel = document.getElementById('dir-page-size');
    if (dirPageSel) {
      dirPageSel.addEventListener('change', () => {
        const v = dirPageSel.value;
        dirPageSize = v === 'all' ? 0 : parseInt(v, 10);
        resetDirPage();
        renderDiscover();
      });
    }
    document.getElementById('dir-build-btn').addEventListener('click', () => renderExportPanel('dir-export-panel', dirSelected, true));
    document.getElementById('map-toggle').addEventListener('click', toggleMapView);
    document.getElementById('dir-select-all').addEventListener('click', () => {
      lastFilteredDir.forEach(l => dirSelected.add(l.symbol));
      renderDiscover();
      announce(`Selected all ${lastFilteredDir.length} visible`);
    });
    document.getElementById('dir-clear-selection').addEventListener('click', () => {
      dirSelected.clear();
      renderDiscover();
      announce('Selection cleared');
    });

    document.getElementById('reset-dir-filters').addEventListener('click', () => {
      dirFilters.type.clear();
      dirFilters.state.clear();
      dirFilters.group.clear();
      dirFilters.loanDays.clear();
      dirFilters.search = '';
      dirFilters.maxDist = 0;
      dirFilters.onlyNew = true;
      document.getElementById('dir-search').value = '';
      document.getElementById('dir-search-clear').hidden = true;
      document.getElementById('show-only-new').checked = true;
      document.getElementById('max-dist').value = 0;
      document.getElementById('dist-out').textContent = 'Any';
      dirSelected.clear();
      document.getElementById('dir-export-panel').innerHTML = '';
      buildDirFacetOptions();
      renderDiscover();
    });

    /* Audit tab */
    const auditTa = document.getElementById('audit-input');
    if (auditTa) {
      // Live-update counter as the user types.
      auditTa.addEventListener('input', () => {
        const parsed = parseAuditInput(auditTa.value);
        const c = document.getElementById('audit-count');
        if (c) c.textContent = parsed.length === 1 ? '1 symbol' : `${parsed.length} symbols`;
      });
    }
    const auditRun = document.getElementById('audit-run');
    if (auditRun) {
      auditRun.addEventListener('click', () => {
        auditHoldings = parseAuditInput(auditTa ? auditTa.value : '');
        renderAudit();
        // Keep Discover in sync — it can be configured to hide audit-list
        // symbols, and its facet counts need to refresh too.
        buildDirFacetOptions();
        renderDiscover();
        saveData();
      });
    }
    const auditClear = document.getElementById('audit-clear');
    if (auditClear) {
      auditClear.addEventListener('click', () => {
        auditHoldings = [];
        if (auditTa) auditTa.value = '';
        renderAudit();
        buildDirFacetOptions();
        renderDiscover();
        saveData();
      });
    }
    const auditSort = document.getElementById('audit-sort-by');
    if (auditSort) auditSort.addEventListener('change', renderAudit);
    document.querySelectorAll('.audit-tier-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tier;
        auditTierFilter = t === 'all' ? null : t;
        renderAudit();
      });
    });

    /* Filter toggle (mobile) */
    document.querySelectorAll('[data-filter-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const which = btn.dataset.filterToggle;
        const facets = document.getElementById(`${which}-facets`);
        if (!facets) return;
        const open = facets.classList.toggle('open');
        btn.setAttribute('aria-expanded', open);
      });
    });

    /* Modal */
    document.getElementById('open-help').addEventListener('click', showHelpModal);
    document.getElementById('footer-help').addEventListener('click', showHelpModal);
    document.getElementById('open-scoring-help').addEventListener('click', showScoringModal);

    /* Session export/import */
    document.getElementById('footer-export').addEventListener('click', exportSession);
    document.getElementById('footer-import').addEventListener('click', () => {
      document.getElementById('session-import-input').click();
    });
    document.getElementById('session-import-input').addEventListener('change', e => {
      if (e.target.files && e.target.files[0]) handleSessionFile(e.target.files[0]);
      e.target.value = '';
    });
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-backdrop').addEventListener('click', e => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });

    /* Keyboard shortcuts */
    document.addEventListener('keydown', e => {
      const target = e.target;
      const inEditable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      // Esc: close modal first, then export panel, then clear search
      if (e.key === 'Escape') {
        const backdrop = document.getElementById('modal-backdrop');
        if (!backdrop.hidden) { closeModal(); return; }
        const expPanel = document.getElementById('export-panel');
        const dExpPanel = document.getElementById('dir-export-panel');
        if (expPanel && expPanel.innerHTML.trim()) { expPanel.innerHTML = ''; return; }
        if (dExpPanel && dExpPanel.innerHTML.trim()) { dExpPanel.innerHTML = ''; return; }
        const searchInp = document.getElementById('dir-search');
        if (document.activeElement === searchInp && searchInp.value) {
          searchInp.value = '';
          dirFilters.search = '';
          document.getElementById('dir-search-clear').hidden = true;
          renderDiscover();
          return;
        }
        if (target && target.blur && !inEditable) target.blur();
        return;
      }

      if (inEditable) return;

      if (e.key === '1') { switchTab('rankings'); e.preventDefault(); }
      else if (e.key === '2') { switchTab('audit'); e.preventDefault(); }
      else if (e.key === '3') { switchTab('discover'); e.preventDefault(); }
      else if (e.key === '/') {
        if (activeTab !== 'discover') switchTab('discover');
        const inp = document.getElementById('dir-search');
        if (inp) { inp.focus(); inp.select(); }
        e.preventDefault();
      }
      else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        showHelpModal();
        e.preventDefault();
      }
      else if (e.key === 'Enter' || e.key === ' ') {
        // Toggle selection if a card has focus
        const card = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('card')
          ? document.activeElement : null;
        if (card) {
          const sym = card.dataset.symbol;
          const list = card.parentElement;
          if (list && list.id === 'lender-list') toggleRankingSelection(sym);
          else if (list && list.id === 'dir-list') toggleDiscoverSelection(sym);
          e.preventDefault();
        }
      }
    });
  }

  function initFacetCollapse() {
    document.querySelectorAll('.facets .facet-group').forEach((group, i) => {
      const headerH3 = group.querySelector(':scope > h2, :scope > h3') || group.querySelector(':scope > .group-header > h2, :scope > .group-header > h3');
      if (!headerH3) return;
      const title = (headerH3.textContent || '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40);
      const key = `lf-facet-collapsed:${group.id || title || i}`;
      let collapsed = false;
      try { collapsed = localStorage.getItem(key) === '1'; } catch (_) {}
      if (collapsed) group.classList.add('collapsed');
      headerH3.classList.add('facet-toggle');
      headerH3.setAttribute('role', 'button');
      headerH3.setAttribute('tabindex', '0');
      headerH3.setAttribute('aria-expanded', String(!collapsed));
      const toggle = () => {
        const nowCollapsed = group.classList.toggle('collapsed');
        headerH3.setAttribute('aria-expanded', String(!nowCollapsed));
        try { localStorage.setItem(key, nowCollapsed ? '1' : '0'); } catch (_) {}
      };
      headerH3.addEventListener('click', toggle);
      headerH3.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  async function init() {
    loadData();
    syncHomeInputs();
    syncWeightLabels();
    bindEvents();
    bindDropzones();
    initFacetCollapse();

    switchTab(activeTab);

    await Promise.all([loadBundledDirectory(), loadLvisPolicies(), loadFilmPolicies(), loadFlinPolicies(), loadLyraPolicies(), loadPlaPolicies()]);
    rebuildSymbolGroups();
    buildDirFacetOptions();

    renderMonthsList();
    rebuildFacetOptions();
    renderSavedGroups();
    renderRankings();
    renderDiscover();
    if (activeTab === 'audit') renderAudit();
  }

  const inTestMode = typeof window !== 'undefined' && window.location && window.location.search.indexOf('test=1') >= 0;

  // Expose pure functions for the browser test runner
  if (inTestMode) {
    window.__lenderFinderTest = {
      parseOCLCReport,
      parseDirectoryCSV,
      parseTurnaround,
      parseCSVRow,
      mergeMonths: () => mergeMonths(),
      setMonths: (m) => { months = m; },
      setHomeState: (s) => { homeState = s; },
      setWeights: (w) => { weights = w; },
      fillRate,
      avgDays,
      consistencyPct,
      subscores,
      totalScore,
      normalizedWeights,
      haversineKm,
      kmToMiles,
      renderSparkline
    };
  }

  if (!inTestMode) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();

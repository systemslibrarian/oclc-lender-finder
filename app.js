(function () {
  'use strict';

  const STORAGE_KEY = 'lenderFinder.months.v1';
  const SETTINGS_KEY = 'lenderFinder.settings.v1';
  const IMPORTED_DIR_KEY = 'lenderFinder.importedDir.v1';

  let months = [];
  let bundledDirectory = [];
  let importedDirectory = [];
  let homeState = 'FL';
  let homeLat = 30.4383;
  let homeLng = -84.2807;
  let backendUrl = '';
  let weights = { speed: 25, fill: 30, volume: 15, consistency: 20, local: 10 };
  const expanded = new Set();
  const selected = new Set();
  const dirSelected = new Set();
  const policyCache = new Map();
  const policyLoading = new Set();
  const policyExpanded = new Set();
  const activeFilters = { type: new Set(), state: new Set(), hist: new Set() };
  const dirFilters = { type: new Set(), state: new Set(), group: new Set(), search: '', maxDist: 0, onlyNew: true };

  const presets = {
    balanced: { speed: 25, fill: 30, volume: 15, consistency: 20, local: 10 },
    speed: { speed: 45, fill: 25, volume: 10, consistency: 15, local: 5 },
    trusted: { speed: 15, fill: 30, volume: 20, consistency: 30, local: 5 }
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
    bundledDirectory.forEach(l => map.set(l.symbol, { ...l, _imported: false }));
    importedDirectory.forEach(l => map.set(l.symbol, { ...l, _imported: true }));
    return Array.from(map.values());
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
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ homeState, homeLat, homeLng, weights, backendUrl }));
      localStorage.setItem(IMPORTED_DIR_KEY, JSON.stringify(importedDirectory));
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
        if (settings.weights) weights = { ...weights, ...settings.weights };
        if (typeof settings.backendUrl === 'string') backendUrl = settings.backendUrl;
      }
      const dir = localStorage.getItem(IMPORTED_DIR_KEY);
      if (dir) {
        const parsed = JSON.parse(dir);
        if (Array.isArray(parsed)) importedDirectory = parsed;
      }
    } catch (e) {
      console.warn('localStorage load failed:', e);
    }
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

  function sortMonthsByPeriod() {
    months.sort((a, b) => (a.period || '').localeCompare(b.period || ''));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
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
      });
    });
  }

  function rebuildFacetOptions() {
    const merged = mergeMonths();
    const typeCounts = {}, stateCounts = {};
    merged.forEach(l => {
      typeCounts[l.type] = (typeCounts[l.type] || 0) + 1;
      stateCounts[l.state] = (stateCounts[l.state] || 0) + 1;
    });
    const types = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const states = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]);

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
      `<label class="facet"><span><input type="checkbox" data-facet="state" value="${escapeHtml(s)}" ${activeFilters.state.has(s) ? 'checked' : ''}>${escapeHtml(s)}</span><span class="count">${c}</span></label>`
    ).join('');

    typeWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', () => {
      const set = activeFilters[cb.dataset.facet];
      if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      renderRankings();
    }));
    stateWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', () => {
      const set = activeFilters[cb.dataset.facet];
      if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      renderRankings();
    }));
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
    return true;
  }

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

    document.getElementById('match-count').textContent = filtered.length;
    document.getElementById('sel-count').textContent = selected.size;

    const periodsLabel = months.map(m => m.period).filter(p => p).join(' + ') || 'no data';
    document.getElementById('meta').textContent =
      months.length === 0
        ? 'No reports loaded — upload one to start'
        : `${months.length} month${months.length === 1 ? '' : 's'} (${periodsLabel}) · ${merged.length} unique lenders`;

    const labels = { speed: 'Speed', fill: 'Fill rate', volume: 'Volume', consistency: 'Consistency', local: 'Same state' };
    const list = document.getElementById('lender-list');
    const w = normalizedWeights();

    if (filtered.length === 0) {
      if (months.length === 0) {
        list.innerHTML = `<div class="empty-state">
          <strong>No data yet</strong>
          Upload one or more OCLC Borrower Transaction-Level Detail reports using the panel on the left. Your data stays in this browser.
        </div>`;
      } else {
        list.innerHTML = '<div class="empty-state"><strong>No lenders match these filters</strong>Try removing some filters or resetting them.</div>';
      }
      return;
    }

    list.innerHTML = filtered.map(l => {
      const scoreClass = l._score >= 70 ? 'high' : l._score >= 50 ? 'med' : '';
      const isOpen = expanded.has(l.symbol);
      const isSel = selected.has(l.symbol);
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
      const explainRows = Object.keys(labels).map(k =>
        `<div class="explain-row">
          <span style="color: var(--text-secondary);">${labels[k]}</span>
          <div class="bar"><div class="bar-fill" style="width: ${l._subs[k]}%;"></div></div>
          <span class="pts">${l._subs[k]} × ${(w[k] * 100).toFixed(0)}%</span>
          <span class="wt">${Math.round(l._subs[k] * w[k])}</span>
        </div>`
      ).join('');
      return `
        <div class="card ${isSel ? 'selected' : ''}" role="listitem">
          <div class="card-top">
            <div class="card-left">
              <input type="checkbox" data-select="${escapeHtml(l.symbol)}" ${isSel ? 'checked' : ''} aria-label="Select ${escapeHtml(l.name)}">
              <div>
                <p class="card-name">${escapeHtml(l.name)}</p>
                <p class="card-sub">${escapeHtml(l.symbol)} · ${escapeHtml(l.type)} · ${escapeHtml(l.state)}</p>
                ${l.monthsSpan > 1 ? `<div class="months-dot-row">${monthDots} <span>${l.monthsPresent}/${l.monthsSpan} months</span></div>` : ''}
                ${thinNote}
              </div>
            </div>
            <span class="score ${scoreClass}">${l._score}</span>
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
            <button class="explain-btn" data-explain="${escapeHtml(l.symbol)}">${isOpen ? 'Hide why ▴' : 'Why this score ▾'}</button>
          </div>
          ${isOpen ? `<div class="explain">${explainRows}<div class="explain-total"><span>Total</span><span>${l._score}</span></div></div>` : ''}
        </div>`;
    }).join('');

    list.querySelectorAll('[data-explain]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sym = btn.dataset.explain;
        if (expanded.has(sym)) expanded.delete(sym); else expanded.add(sym);
        renderRankings();
      });
    });
    list.querySelectorAll('[data-select]').forEach(cb => {
      cb.addEventListener('change', () => {
        const sym = cb.dataset.select;
        if (cb.checked) selected.add(sym); else selected.delete(sym);
        renderRankings();
      });
    });
  }

  /* ---------- Policy lookup (calls backend proxy) ---------- */

  async function checkBackendHealth() {
    const statusEl = document.getElementById('backend-status');
    if (!backendUrl) {
      statusEl.textContent = '';
      statusEl.className = 'upload-status';
      return;
    }
    statusEl.textContent = 'Checking…';
    statusEl.className = 'upload-status';
    try {
      const r = await fetch(`${backendUrl.replace(/\/+$/, '')}/api/health`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const body = await r.json();
      if (body.has_credentials) {
        statusEl.textContent = 'Proxy reachable. OCLC credentials configured.';
        statusEl.className = 'upload-status ok';
      } else {
        statusEl.textContent = 'Proxy reachable but OCLC credentials missing.';
        statusEl.className = 'upload-status err';
      }
    } catch (e) {
      statusEl.textContent = `Could not reach proxy: ${e.message}`;
      statusEl.className = 'upload-status err';
    }
  }

  async function fetchPolicies(symbol) {
    if (!backendUrl) return { error: 'No backend URL configured.' };
    if (policyCache.has(symbol)) return policyCache.get(symbol);
    if (policyLoading.has(symbol)) return { loading: true };
    policyLoading.add(symbol);
    try {
      const url = `${backendUrl.replace(/\/+$/, '')}/api/policies/${encodeURIComponent(symbol)}`;
      const r = await fetch(url);
      if (r.status === 404) {
        const result = { error: 'Not in OCLC Library Profiles directory.' };
        policyCache.set(symbol, result);
        return result;
      }
      if (!r.ok) {
        const txt = await r.text();
        const result = { error: `HTTP ${r.status}: ${txt.slice(0, 200)}` };
        policyCache.set(symbol, result);
        return result;
      }
      const data = await r.json();
      policyCache.set(symbol, data);
      return data;
    } catch (e) {
      const result = { error: `Network error: ${e.message}` };
      return result;
    } finally {
      policyLoading.delete(symbol);
    }
  }

  function renderPolicyPanel(symbol) {
    const data = policyCache.get(symbol);
    if (!data) {
      if (policyLoading.has(symbol)) {
        return '<div class="policy-panel loading">Loading policies…</div>';
      }
      return '';
    }
    if (data.error) {
      return `<div class="policy-panel err">Could not load policies: ${escapeHtml(data.error)}</div>`;
    }
    const fmtFee = (lo, hi) => {
      if (lo == null && hi == null) return '—';
      if (lo === 0 && (hi === 0 || hi == null)) return 'Free';
      if (lo != null && hi != null && lo === hi) return `$${lo}`;
      if (lo != null && hi != null) return `$${lo}–$${hi}`;
      if (lo != null) return `$${lo}+`;
      return `up to $${hi}`;
    };
    const supplierLabel = data.is_supplier === true ? 'Active supplier'
      : data.is_supplier === false ? 'Not currently supplying'
      : 'Supplier status unknown';
    const materialsHtml = (data.materials && data.materials.length > 0)
      ? data.materials.map(m => `
        <div class="policy-material-row">
          <span class="material-name">${escapeHtml(m.material)}</span>
          <span class="material-status">${m.will_lend === true ? 'Lends' : m.will_lend === false ? 'Does not lend' : 'Unknown'}${m.notes ? ' · ' + escapeHtml(m.notes) : ''}</span>
        </div>`).join('')
      : '<div class="material-status" style="color:var(--text-tertiary);">No per-material policy on file.</div>';
    const delivery = [];
    if (data.delivery) {
      if (data.delivery.article_exchange) delivery.push('Article Exchange');
      if (data.delivery.mail) delivery.push('Mail');
      if (data.delivery.fax) delivery.push('Fax');
      (data.delivery.other || []).forEach(o => delivery.push(o));
    }
    const contact = data.contact || {};
    const hours = data.hours || {};
    const loan = data.loan_terms || {};
    const warning = data.raw_warning ? `<div class="policy-panel err" style="margin-top:0;margin-bottom:8px;">${escapeHtml(data.raw_warning)}</div>` : '';

    return `
      <div class="policy-panel">
        ${warning}
        <div class="policy-section">
          <div class="policy-section-label">Status</div>
          <div>${escapeHtml(supplierLabel)}</div>
        </div>
        <div class="policy-section">
          <div class="policy-section-label">Fees</div>
          <dl class="policy-grid">
            <dt>Loan</dt><dd>${fmtFee(data.fees?.loan_min, data.fees?.loan_max)}</dd>
            <dt>Copy</dt><dd>${fmtFee(data.fees?.copy_min, data.fees?.copy_max)}</dd>
            <dt>IFM</dt><dd>${data.fees?.accepts_ifm === true ? 'Accepts IFM' : data.fees?.accepts_ifm === false ? 'No IFM' : '—'}</dd>
          </dl>
        </div>
        <div class="policy-section">
          <div class="policy-section-label">Materials lent</div>
          ${materialsHtml}
        </div>
        <div class="policy-section">
          <div class="policy-section-label">Delivery</div>
          <div>${delivery.length ? delivery.map(escapeHtml).join(' · ') : '—'}</div>
        </div>
        <div class="policy-section">
          <div class="policy-section-label">Loan terms</div>
          <dl class="policy-grid">
            <dt>Period</dt><dd>${loan.loan_period_days != null ? loan.loan_period_days + ' days' : '—'}</dd>
            <dt>Renewable</dt><dd>${loan.renewable === true ? 'Yes' : loan.renewable === false ? 'No' : '—'}</dd>
          </dl>
          ${loan.notes ? `<div style="margin-top:4px; color:var(--text-secondary);">${escapeHtml(loan.notes)}</div>` : ''}
        </div>
        <div class="policy-section">
          <div class="policy-section-label">Contact</div>
          <dl class="policy-grid">
            <dt>Email</dt><dd>${contact.email ? `<a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>` : '—'}</dd>
            <dt>Phone</dt><dd>${contact.phone ? escapeHtml(contact.phone) : '—'}</dd>
            <dt>Website</dt><dd>${contact.url ? `<a href="${escapeHtml(contact.url)}" target="_blank" rel="noopener">${escapeHtml(contact.url)}</a>` : '—'}</dd>
          </dl>
        </div>
        <div class="policy-section">
          <div class="policy-section-label">Hours</div>
          <div>${hours.weekly_hours ? escapeHtml(hours.weekly_hours) : '—'}</div>
          ${hours.closures && hours.closures.length ? `<div style="margin-top:4px; color:var(--text-secondary);">Closed: ${hours.closures.map(escapeHtml).join(', ')}</div>` : ''}
        </div>
      </div>`;
  }

  async function togglePolicyPanel(symbol) {
    if (policyExpanded.has(symbol)) {
      policyExpanded.delete(symbol);
      renderDiscover();
      return;
    }
    policyExpanded.add(symbol);
    if (!policyCache.has(symbol)) {
      renderDiscover();
      await fetchPolicies(symbol);
    }
    renderDiscover();
  }

  /* ---------- Discover tab rendering ---------- */

  function getBorrowedSymbols() {
    const set = new Set();
    months.forEach(m => m.rows.forEach(r => { if (r.filled > 0) set.add(r.symbol); }));
    return set;
  }

  function buildDirFacetOptions() {
    const dir = getMergedDirectory();
    const typeCounts = {}, stateCounts = {}, groupCounts = {};
    dir.forEach(l => {
      typeCounts[l.type || 'Other'] = (typeCounts[l.type || 'Other'] || 0) + 1;
      if (l.state) stateCounts[l.state] = (stateCounts[l.state] || 0) + 1;
      (l.groups || []).forEach(g => { groupCounts[g] = (groupCounts[g] || 0) + 1; });
    });
    document.getElementById('dir-type-facets').innerHTML =
      Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([t, c]) =>
        `<label class="facet"><span><input type="checkbox" data-dirfacet="type" value="${escapeHtml(t)}" ${dirFilters.type.has(t) ? 'checked' : ''}>${escapeHtml(t)}</span><span class="count">${c}</span></label>`
      ).join('') || '<p class="hint">No data.</p>';
    document.getElementById('dir-state-facets').innerHTML =
      Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).map(([s, c]) =>
        `<label class="facet"><span><input type="checkbox" data-dirfacet="state" value="${escapeHtml(s)}" ${dirFilters.state.has(s) ? 'checked' : ''}>${escapeHtml(s)}</span><span class="count">${c}</span></label>`
      ).join('');
    document.getElementById('dir-group-facets').innerHTML =
      Object.entries(groupCounts).sort((a, b) => b[1] - a[1]).map(([g, c]) =>
        `<label class="facet"><span><input type="checkbox" data-dirfacet="group" value="${escapeHtml(g)}" ${dirFilters.group.has(g) ? 'checked' : ''}>${escapeHtml(g)}</span><span class="count">${c}</span></label>`
      ).join('') || '<p class="hint">No groups recorded in directory.</p>';

    document.querySelectorAll('input[type="checkbox"][data-dirfacet]').forEach(cb => {
      cb.addEventListener('change', () => {
        const set = dirFilters[cb.dataset.dirfacet];
        if (cb.checked) set.add(cb.value); else set.delete(cb.value);
        renderDiscover();
      });
    });
  }

  function renderDirectoryStats() {
    const total = getMergedDirectory().length;
    const imported = importedDirectory.length;
    const stats = document.getElementById('dir-stats');
    stats.textContent = `${total} entries (${bundledDirectory.length} bundled${imported > 0 ? `, ${imported} imported` : ''}).`;
    document.getElementById('clear-imported-dir').hidden = imported === 0;
  }

  function renderDiscover() {
    saveData();
    const dir = getMergedDirectory();
    const borrowedSyms = getBorrowedSymbols();
    const sortBy = document.getElementById('dir-sort-by').value;
    const search = dirFilters.search.toLowerCase().trim();

    let filtered = dir.filter(l => {
      if (dirFilters.onlyNew && borrowedSyms.has(l.symbol)) return false;
      if (dirFilters.type.size && !dirFilters.type.has(l.type || 'Other')) return false;
      if (dirFilters.state.size && !dirFilters.state.has(l.state)) return false;
      if (dirFilters.group.size) {
        const lenderGroups = new Set(l.groups || []);
        let anyMatch = false;
        dirFilters.group.forEach(g => { if (lenderGroups.has(g)) anyMatch = true; });
        if (!anyMatch) return false;
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
      state: (a, b) => (a.state || '').localeCompare(b.state || '')
    };
    filtered.sort(sortFns[sortBy] || sortFns.distance);

    document.getElementById('dir-match-count').textContent = filtered.length;
    document.getElementById('dir-sel-count').textContent = dirSelected.size;

    const list = document.getElementById('dir-list');
    if (filtered.length === 0) {
      const dirEmpty = dir.length === 0;
      list.innerHTML = `<div class="empty-state">
        <strong>${dirEmpty ? 'Directory is empty' : 'No candidates match'}</strong>
        ${dirEmpty ? 'Import a directory CSV using the panel on the left.' : 'Try removing filters, or turn off "Only libraries I haven\'t borrowed from".'}
      </div>`;
      return;
    }

    list.innerHTML = filtered.map(l => {
      const isSel = dirSelected.has(l.symbol);
      const alreadyBorrowed = borrowedSyms.has(l.symbol);
      const groupBadges = (l.groups || []).map(g => `<span class="badge">${escapeHtml(g)}</span>`).join('');
      const distanceText = l._distanceMiles != null
        ? `${Math.round(l._distanceMiles)} mi`
        : '—';
      const importedBadge = l._imported ? '<span class="badge" style="background:var(--bg-info); color:var(--text-info);">Imported</span>' : '';
      const borrowedBadge = alreadyBorrowed ? '<span class="badge every-month">Borrowed from before</span>' : '<span class="badge local">New candidate</span>';
      const policyBtn = backendUrl
        ? `<button class="policy-lookup-btn" data-policy="${escapeHtml(l.symbol)}">${policyExpanded.has(l.symbol) ? 'Hide policies ▴' : 'Load policies from OCLC ▾'}</button>`
        : '';
      const policyHtml = policyExpanded.has(l.symbol) ? renderPolicyPanel(l.symbol) : '';
      return `
        <div class="card ${isSel ? 'selected' : ''}" role="listitem">
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
            <div class="stat"><span class="stat-label">Groups</span><span class="stat-val ${(l.groups || []).length === 0 ? 'muted' : ''}">${(l.groups || []).length || '—'}</span></div>
            <div class="stat"><span class="stat-label">Status</span><span class="stat-val">${alreadyBorrowed ? 'Known' : 'New'}</span></div>
          </div>
          <div class="badges">
            ${borrowedBadge}
            ${l.state === homeState ? '<span class="badge local">Same state</span>' : ''}
            ${groupBadges}
            ${importedBadge}
            ${policyBtn}
          </div>
          ${policyHtml}
        </div>`;
    }).join('');

    list.querySelectorAll('[data-dir-select]').forEach(cb => {
      cb.addEventListener('change', () => {
        const sym = cb.dataset.dirSelect;
        if (cb.checked) dirSelected.add(sym); else dirSelected.delete(sym);
        renderDiscover();
      });
    });
    list.querySelectorAll('[data-policy]').forEach(btn => {
      btn.addEventListener('click', () => togglePolicyPanel(btn.dataset.policy));
    });
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
        <textarea class="symbols-box" data-symbols-box readonly>${escapeHtml(symbolString)}</textarea>
        <div class="export-actions">
          <button class="primary-btn" data-copy-btn style="border: 0.5px solid var(--border-info);">Copy symbols</button>
          <button data-download-btn>Download .txt</button>
          ${!isDiscover ? '<button data-csv-btn style="margin-left: auto;">Download ranked CSV</button>' : ''}
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
    panel.querySelector('[data-close-export]').addEventListener('click', () => { panel.innerHTML = ''; });
    panel.querySelector('[data-copy-btn]').addEventListener('click', async () => {
      const text = panel.querySelector('[data-symbols-box]').value;
      try {
        await navigator.clipboard.writeText(text);
        const btn = panel.querySelector('[data-copy-btn]');
        btn.textContent = 'Copied to clipboard';
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
          } else if (errors.length > 0) {
            status.className = 'upload-status ok';
            status.textContent = `Added ${added}. Skipped: ${errors.join(' · ')}`;
          } else {
            status.className = 'upload-status ok';
            status.textContent = `Loaded ${months.length} month${months.length === 1 ? '' : 's'}.`;
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

  function handleDirectorySelection(files) {
    const status = document.getElementById('dir-upload-status');
    let pending = files.length;
    const errors = [];
    let totalAdded = 0;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const rows = parseDirectoryCSV(ev.target.result);
          if (rows.length === 0) {
            errors.push(`${file.name}: no entries`);
          } else {
            const bySym = new Map(importedDirectory.map(r => [r.symbol, r]));
            rows.forEach(r => bySym.set(r.symbol, r));
            importedDirectory = Array.from(bySym.values());
            totalAdded += rows.length;
          }
        } catch (err) {
          errors.push(`${file.name}: ${err.message}`);
        }
        pending -= 1;
        if (pending === 0) {
          saveData();
          if (errors.length > 0 && totalAdded === 0) {
            status.className = 'upload-status err';
            status.textContent = errors.join(' · ');
          } else if (errors.length > 0) {
            status.className = 'upload-status ok';
            status.textContent = `Imported ${totalAdded}. Issues: ${errors.join(' · ')}`;
          } else {
            status.className = 'upload-status ok';
            status.textContent = `Imported ${totalAdded} entries. Total directory: ${getMergedDirectory().length}.`;
          }
          renderDirectoryStats();
          buildDirFacetOptions();
          renderDiscover();
        }
      };
      reader.onerror = () => {
        errors.push(`${file.name}: read failed`);
        pending -= 1;
        if (pending === 0) renderDiscover();
      };
      reader.readAsText(file);
    });
  }

  /* ---------- Tab switching ---------- */

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(b => {
      const active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.getElementById('rankings-view').hidden = name !== 'rankings';
    document.getElementById('discover-view').hidden = name !== 'discover';
  }

  /* ---------- Event wiring ---------- */

  function bindEvents() {
    document.querySelectorAll('.tab').forEach(b => {
      b.addEventListener('click', () => switchTab(b.dataset.tab));
    });

    document.getElementById('csv-input').addEventListener('change', e => {
      handleReportSelection(e.target.files);
      e.target.value = '';
    });

    document.getElementById('clear-months').addEventListener('click', () => {
      if (!confirm('Remove all loaded months? This cannot be undone.')) return;
      months = [];
      selected.clear();
      expanded.clear();
      saveData();
      const status = document.getElementById('upload-status');
      status.className = 'upload-status';
      status.textContent = 'Upload one or more monthly Borrower Transaction-Level Detail reports. They merge automatically and save in your browser.';
      renderMonthsList();
      rebuildFacetOptions();
      renderRankings();
      renderDiscover();
    });

    document.getElementById('show-format-help').addEventListener('click', () => {
      const h = document.getElementById('format-help');
      h.hidden = !h.hidden;
    });

    document.getElementById('home-state').addEventListener('input', e => {
      homeState = (e.target.value || '').toUpperCase().slice(0, 2);
      e.target.value = homeState;
      renderRankings();
      renderDiscover();
    });
    document.getElementById('home-lat').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) { homeLat = v; renderDiscover(); }
    });
    document.getElementById('home-lng').addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) { homeLng = v; renderDiscover(); }
    });

    document.querySelectorAll('input[data-weight]').forEach(inp => {
      inp.addEventListener('input', () => {
        weights[inp.dataset.weight] = parseInt(inp.value);
        syncWeightLabels();
        renderRankings();
      });
    });

    document.querySelectorAll('.preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = presets[btn.dataset.preset];
        if (p) { weights = { ...p }; syncWeightLabels(); renderRankings(); }
      });
    });

    document.querySelectorAll('input[type="checkbox"][data-facet="hist"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) activeFilters.hist.add(cb.value);
        else activeFilters.hist.delete(cb.value);
        renderRankings();
      });
    });

    document.getElementById('sort-by').addEventListener('change', renderRankings);
    document.getElementById('build-group-btn').addEventListener('click', () => renderExportPanel('export-panel', selected, false));

    document.getElementById('reset-filters').addEventListener('click', () => {
      activeFilters.type.clear();
      activeFilters.state.clear();
      activeFilters.hist.clear();
      document.querySelectorAll('#rankings-view input[type="checkbox"][data-facet]').forEach(cb => cb.checked = false);
      selected.clear();
      expanded.clear();
      document.getElementById('export-panel').innerHTML = '';
      weights = { ...presets.balanced };
      syncWeightLabels();
      rebuildFacetOptions();
      renderRankings();
    });

    /* Discover tab events */
    document.getElementById('dir-input').addEventListener('change', e => {
      handleDirectorySelection(e.target.files);
      e.target.value = '';
    });
    document.getElementById('show-dir-format-help').addEventListener('click', () => {
      const h = document.getElementById('dir-format-help');
      h.hidden = !h.hidden;
    });
    document.getElementById('clear-imported-dir').addEventListener('click', () => {
      if (!confirm('Clear all imported directory entries? Bundled entries will remain.')) return;
      importedDirectory = [];
      dirSelected.clear();
      saveData();
      renderDirectoryStats();
      buildDirFacetOptions();
      renderDiscover();
    });
    document.getElementById('dir-search').addEventListener('input', e => {
      dirFilters.search = e.target.value;
      renderDiscover();
    });
    document.getElementById('show-only-new').addEventListener('change', e => {
      dirFilters.onlyNew = e.target.checked;
      renderDiscover();
    });
    document.getElementById('max-dist').addEventListener('input', e => {
      dirFilters.maxDist = parseInt(e.target.value);
      const out = document.getElementById('dist-out');
      out.textContent = dirFilters.maxDist > 0 ? `${dirFilters.maxDist} mi` : 'Any';
      renderDiscover();
    });
    document.getElementById('dir-sort-by').addEventListener('change', renderDiscover);
    document.getElementById('dir-build-btn').addEventListener('click', () => renderExportPanel('dir-export-panel', dirSelected, true));
    document.getElementById('reset-dir-filters').addEventListener('click', () => {
      dirFilters.type.clear();
      dirFilters.state.clear();
      dirFilters.group.clear();
      dirFilters.search = '';
      dirFilters.maxDist = 0;
      dirFilters.onlyNew = true;
      document.getElementById('dir-search').value = '';
      document.getElementById('show-only-new').checked = true;
      document.getElementById('max-dist').value = 0;
      document.getElementById('dist-out').textContent = 'Any';
      dirSelected.clear();
      document.getElementById('dir-export-panel').innerHTML = '';
      buildDirFacetOptions();
      renderDiscover();
    });

    /* Backend URL */
    const backendInput = document.getElementById('backend-url');
    backendInput.addEventListener('input', e => {
      backendUrl = e.target.value.trim();
      saveData();
    });
    backendInput.addEventListener('blur', () => {
      checkBackendHealth();
      renderDiscover();
    });
  }

  async function init() {
    loadData();
    document.getElementById('home-state').value = homeState;
    document.getElementById('home-lat').value = homeLat;
    document.getElementById('home-lng').value = homeLng;
    document.getElementById('backend-url').value = backendUrl;
    syncWeightLabels();
    bindEvents();

    await loadBundledDirectory();
    renderDirectoryStats();
    buildDirFacetOptions();

    renderMonthsList();
    rebuildFacetOptions();
    renderRankings();
    renderDiscover();

    if (backendUrl) {
      checkBackendHealth();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

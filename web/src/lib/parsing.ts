// OCLC Borrower-report parser and supporting CSV utilities.
// Ported verbatim from the vanilla app's app.js — these are pure functions.

import type { MonthReport, MonthRow, DirectoryEntry } from './types';

export function parseTurnaround(s: unknown): number {
  if (!s || typeof s !== 'string') return 0;
  const parts = s.trim().split(':').map(p => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return parts[0] * 24 + parts[1] + parts[2] / 60;
}

export function parseOCLCReport(text: string): MonthReport {
  const rawLines = text.split(/\r?\n/);
  let headerIdx = -1;
  let period = '';
  let institution = '';
  for (let i = 0; i < rawLines.length; i++) {
    if (rawLines[i].startsWith('Reporting Period')) period = (rawLines[i].split('\t')[1] || '').trim();
    if (rawLines[i].startsWith('Institution\t')) institution = (rawLines[i].split('\t')[1] || '').trim();
    if ((rawLines[i].match(/\t/g) || []).length > 5 && rawLines[i].includes('Institution Name')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error("Couldn't find header row. Is this a Borrower Transaction-Level Detail report?");
  }
  const headers = rawLines[headerIdx].split('\t').map(h => h.trim());
  if (!headers.includes('Requests To Lender')) {
    throw new Error('This is a Lender report (libraries borrowing FROM you). Upload the Borrower report instead.');
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
  const rows: MonthRow[] = [];
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

export function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === ',') {
        result.push(cur);
        cur = '';
      } else if (c === '"') {
        inQuotes = true;
      } else {
        cur += c;
      }
    }
  }
  result.push(cur);
  return result;
}

export function parseDirectoryCSV(text: string): DirectoryEntry[] {
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
  const rows: DirectoryEntry[] = [];
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
      name,
      state: col.state >= 0 ? (cells[col.state] || '').trim().toUpperCase() : '',
      type: col.type >= 0 ? (cells[col.type] || '').trim() || 'Other' : 'Other',
      groups,
      lat: col.lat >= 0 && cells[col.lat] ? parseFloat(cells[col.lat]) : null,
      lng: col.lng >= 0 && cells[col.lng] ? parseFloat(cells[col.lng]) : null
    });
  }
  return rows;
}

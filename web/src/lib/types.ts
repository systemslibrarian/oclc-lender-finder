// Shared types across the Lender Finder rebuild.

export interface MonthRow {
  name: string;
  symbol: string;
  state: string;
  type: string;
  requested: number;
  filled: number;
  unfilled: number;
  avgHours: number;
}

export interface MonthReport {
  rows: MonthRow[];
  period: string;
  institution: string;
}

export interface MergedLender {
  name: string;
  symbol: string;
  state: string;
  type: string;
  requested: number;
  filled: number;
  unfilled: number;
  weightedHours: number;
  hoursFilledCount: number;
  monthsPresent: number;
  filledMonths: Array<number | undefined>;
  requestedMonths: Array<number | undefined>;
  avgHours: number;
  monthsSpan: number;
}

export interface Weights {
  speed: number;
  fill: number;
  volume: number;
  consistency: number;
  local: number;
}

export interface Subscores {
  speed: number;
  fill: number;
  volume: number;
  consistency: number;
  local: number;
}

export interface DirectoryEntry {
  symbol: string;
  name: string;
  state: string;
  type: string;
  groups: string[];
  lat: number | null;
  lng: number | null;
  _imported?: boolean;
  _policyOnly?: boolean;
  copiesDaysToRespond?: number | null;
  loansDaysToRespond?: number | null;
}

export interface PolicyEntry {
  symbol: string;
  institution: string | null;
  branch: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  location: string | null;
  copiesDaysToRespond: number | null;
  loansDaysToRespond: number | null;
  copiesFees: string | null;
  loansFees: string | null;
  policyUrl: string | null;
  institutionId: string | null;
  lat: number | null;
  lng: number | null;
  type: string;
  group: string;
}

export interface PolicyFile {
  _meta: Record<string, unknown>;
  libraries: Record<string, PolicyEntry>;
}

export interface BundledDirectoryFile {
  _meta?: Record<string, unknown>;
  lenders: DirectoryEntry[];
}

export type PresetName = 'balanced' | 'speed' | 'trusted' | 'samestate' | 'workhorses' | 'newcomers';
export type TabName = 'rankings' | 'discover' | 'audit';
export type AuditTier = 'top' | 'strong' | 'weak' | 'unused';

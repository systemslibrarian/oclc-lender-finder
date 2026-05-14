// Leaflet map view for the Discover tab. Plots every candidate with
// known lat/lng, plus the home library, and lets the user click pins to
// toggle selection without losing the card list state.

import { useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { DirectoryEntry } from '@/lib/types';

// Leaflet is a CSS-aware library; we import the stylesheet here so it's
// only pulled in when the user actually flips to the Map view.
import 'leaflet/dist/leaflet.css';
import L, { type LatLngExpression, type Map as LeafletMap } from 'leaflet';

interface Props {
  candidates: Array<DirectoryEntry & { _mi?: number | null }>;
  home: { lat: number; lng: number; symbol: string };
  selected: Set<string>;
  onToggle: (sym: string) => void;
  borrowed: Set<string>;
}

function homeIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#185fa5;border:3px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.2);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function pinIcon(opts: { borrowed: boolean; selected: boolean }) {
  const color = opts.selected ? '#185fa5' : opts.borrowed ? '#5f5e5a' : '#10b981';
  const ring = opts.selected ? '3px solid #185fa5' : '2px solid white';
  const size = opts.selected ? 16 : 12;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};${opts.selected ? '' : 'border:' + ring + ';'}box-shadow:0 0 0 1px rgba(0,0,0,0.25);${opts.selected ? 'box-shadow:0 0 0 2px #185fa5, 0 0 0 4px rgba(24,95,165,0.25);' : ''}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

export function DiscoverMap({ candidates, home, selected, onToggle, borrowed }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);

  // Initial map setup — runs once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true
    }).setView([home.lat, home.lng] as LatLngExpression, 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, [home.lat, home.lng]);

  // Re-render markers whenever the input list changes.
  const pinable = useMemo(
    () => candidates.filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number'),
    [candidates]
  );

  useEffect(() => {
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    // Home marker
    L.marker([home.lat, home.lng] as LatLngExpression, { icon: homeIcon(), zIndexOffset: 1000 })
      .bindTooltip(`<strong>Home</strong> ${home.symbol ? `(${home.symbol})` : ''}`, { direction: 'top' })
      .addTo(layer);

    // Candidate pins
    pinable.forEach((c) => {
      const isSel = selected.has(c.symbol);
      const wasBorrowed = borrowed.has(c.symbol);
      const dist = typeof c._mi === 'number' ? `${Math.round(c._mi)} mi` : '';
      const m = L.marker([c.lat as number, c.lng as number] as LatLngExpression, {
        icon: pinIcon({ borrowed: wasBorrowed, selected: isSel }),
        zIndexOffset: isSel ? 500 : 0
      });
      const labelHtml = `
        <div style="min-width:160px;font-family:system-ui,sans-serif;">
          <div style="font-weight:600;">${escapeHtml(c.name)}</div>
          <div style="font-size:11px;color:#555;">${escapeHtml(c.symbol)} · ${escapeHtml(c.type || 'Other')} · ${escapeHtml(c.state || '—')}${dist ? ` · ${dist}` : ''}</div>
          ${(c.groups || []).length ? `<div style="font-size:10px;color:#888;margin-top:4px;">${(c.groups || []).map(escapeHtml).join(' · ')}</div>` : ''}
          <div style="font-size:11px;color:#185fa5;margin-top:6px;">Click pin to ${isSel ? 'deselect' : 'select'}</div>
        </div>`;
      m.bindTooltip(labelHtml, { direction: 'top', opacity: 0.95 });
      m.on('click', () => onToggle(c.symbol));
      m.addTo(layer);
    });

    // Auto-fit on first render when there are points; preserve user pan/zoom
    // on subsequent renders.
    if (pinable.length > 0 && !map.__lf_autoFitted) {
      const bounds = L.latLngBounds([[home.lat, home.lng]]);
      pinable.forEach((c) => bounds.extend([c.lat as number, c.lng as number]));
      map.fitBounds(bounds.pad(0.2), { maxZoom: 8 });
      // Mark fitted on the map object so we don't keep re-zooming as the user
      // toggles selections.
      map.__lf_autoFitted = true;
    }
  }, [pinable, home.lat, home.lng, home.symbol, selected, onToggle, borrowed]);

  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No candidates to plot.
        </CardContent>
      </Card>
    );
  }
  const missing = candidates.length - pinable.length;
  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="h-[560px] w-full overflow-hidden rounded-md border"
        aria-label="Map of candidate lenders"
      />
      {missing > 0 && (
        <p className="text-xs text-muted-foreground">
          {missing} candidate{missing === 1 ? '' : 's'} skipped — no coordinates.
        </p>
      )}
    </div>
  );
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

// Augment Leaflet's Map with an internal marker for our auto-fit gate.
declare module 'leaflet' {
  interface Map {
    __lf_autoFitted?: boolean;
  }
}

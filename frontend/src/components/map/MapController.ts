import {
  Map as MlMap,
  Marker,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type PaddingOptions,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// Configure MapLibre to use the Vite-bundled web worker URL
setWorkerUrl(maplibreWorkerUrl);
import type { FeatureCollection, LineString, Point } from 'geojson';
import type { Checkpoint, PlanResponse } from '../../types';
import { boundsOf, decimate, measure, toLngLat, type LatLng, type MeasuredLine } from '../../lib/geo';
import { MAP_STYLES, RISK_TOKENS, ROUTE_TOKENS, type ThemeName } from '../../lib/tokens';
import { viewStore, type ViewState } from '../../lib/store';
import { HeatLayer } from './HeatLayer';
import { TruckAnimator } from './TruckAnimator';
import { checkpointPopupHtml } from './popup';

export interface PreparedRoute {
  id: string;
  index: number;
  coords: LatLng[];
  line: MeasuredLine;
  checkpoints: Checkpoint[];
  durationSec: number;
  miles: number;
}

export interface MapCallbacks {
  onSelectRoute: (id: string) => void;
  onError?: (msg: string) => void;
  onLoaded?: () => void;
}

export const STYLE_FALLBACKS: Record<ThemeName, string[]> = {
  dark: [
    'https://tiles.openfreemap.org/styles/dark',
    'https://tiles.openfreemap.org/styles/positron',
    'https://tiles.openfreemap.org/styles/liberty',
  ],
  light: [
    'https://tiles.openfreemap.org/styles/positron',
    'https://tiles.openfreemap.org/styles/liberty',
    'https://tiles.openfreemap.org/styles/bright',
  ],
};

const MAX_ROUTES = 3;
const TRANSPARENT = 'rgba(0,0,0,0)';
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const DRAW_MS = 1300;
const REVEAL_STEP_MS = 32;
const CASING: Record<ThemeName, string> = { dark: '#07080A', light: '#FFFFFF' };
const BASE_TINT: Record<ThemeName, { bg: string; water: string }> = {
  dark: { bg: '#0D0F12', water: '#0A1118' },
  light: { bg: '#EFEDE7', water: '#D7DEE3' },
};

/** Gradient along the line that reveals it up to progress `p` (route "draws itself"). */
function progressGradient(color: string, p: number): ExpressionSpecification {
  if (p >= 0.999) return ['interpolate', ['linear'], ['line-progress'], 0, color, 1, color];
  const a = Math.max(p, 0.0001);
  return ['interpolate', ['linear'], ['line-progress'], 0, color, a, color, a + 0.0005, TRANSPARENT];
}

/**
 * Imperative owner of the MapLibre instance. React only calls the public setters; high-frequency
 * view state (hour, hover, selection) arrives through `viewStore.subscribe`, never via re-render.
 */
export class MapController {
  readonly map: MlMap;
  private readonly heat: HeatLayer;
  private readonly truck: TruckAnimator;
  private readonly popup: Popup;
  private theme: ThemeName;
  private routes: PreparedRoute[] = [];
  private selectedId: string | null = null;
  private departure = '';
  private drawP = 1;
  private revealN = Number.POSITIVE_INFINITY;
  private pulses: Marker[] = [];
  private hovered: number | null = null;
  private padding: PaddingOptions = { top: 80, right: 40, bottom: 120, left: 40 };
  private timers: number[] = [];
  private raf = 0;
  private interactionsBound = false;
  private readonly unsub: () => void;
  private frames = new Map<number, import('../../types').HeatmapResponse>();
  private styleAttempt = 0;
  private isReady = false;

  constructor(
    container: HTMLElement,
    theme: ThemeName,
    private readonly cb: { current: MapCallbacks },
    private readonly reducedMotion: boolean,
  ) {
    this.theme = theme;
    const styles = STYLE_FALLBACKS[theme];
    this.map = new MlMap({
      container,
      style: styles[0],
      center: [-97, 39.2],
      zoom: 3.2,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      fadeDuration: 0,
    });
    this.map.touchZoomRotate.disableRotation();
    this.heat = new HeatLayer(this.map, theme, reducedMotion);
    this.truck = new TruckAnimator(this.map, reducedMotion);
    this.popup = new Popup({ closeButton: true, maxWidth: '300px', offset: 14, focusAfterOpen: false });
    this.popup.on('close', () => {
      if (viewStore.get().selectedCp !== null) viewStore.set({ selectedCp: null });
    });

    (window as any).__map = this.map;
    (window as any).__controller = this;

    this.map.on('error', (e) => {
      // Style fallback chain
      const currentFallbacks = STYLE_FALLBACKS[this.theme];
      if (!this.isReady && this.styleAttempt < currentFallbacks.length - 1) {
        this.styleAttempt++;
        const next = currentFallbacks[this.styleAttempt];
        console.warn(`[MapLibre] Style load failed, falling back to: ${next}`, e);
        this.map.setStyle(next, { diff: false });
        return;
      }
      if (!this.isReady && this.styleAttempt >= currentFallbacks.length - 1) {
        this.cb.current.onError?.(e.error?.message || 'Failed to initialize map tiles');
      }
    });

    this.map.on('style.load', () => {
      this.isReady = true;
      this.install();
      this.cb.current.onLoaded?.();
    });
    this.map.once('load', () => {
      if (!this.routes.length && !reducedMotion) this.map.easeTo({ zoom: 3.75, duration: 1800, easing: easeOut });
    });
    this.unsub = viewStore.subscribe((s, prev) => this.onView(s, prev));
  }

  // ───────────────────────── public API ─────────────────────────

  setTheme(theme: ThemeName): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.styleAttempt = 0;
    this.heat.setTheme(theme);
    this.map.setStyle(STYLE_FALLBACKS[theme][0], { diff: false });
  }

  retry(): void {
    this.styleAttempt = 0;
    this.isReady = false;
    this.map.setStyle(STYLE_FALLBACKS[this.theme][0], { diff: false });
  }

  resize(): void {
    this.map.resize();
  }

  setPadding(p: PaddingOptions): void {
    this.padding = p;
  }

  setPlan(plan: PlanResponse | null, selectedId: string | null): void {
    this.clearTimers();
    this.popup.remove();
    this.clearPulses();
    this.truck.stop(true);
    this.routes = (plan?.routes ?? []).slice(0, MAX_ROUTES).map((r, index) => {
      const coords = decimate(r.geometry, 0.3);
      return {
        id: r.id,
        index,
        coords,
        line: measure(coords),
        checkpoints: r.checkpoints,
        durationSec: r.duration_seconds,
        miles: r.distance_mi,
      };
    });
    this.departure = plan?.departure_time ?? '';
    this.selectedId = selectedId;
    this.heat.setRoutes(this.routes.map((r) => r.coords));
    if (this.frames.size > 0) {
      this.heat.setFrames(this.frames);
    }
    if (!this.map.isStyleLoaded()) return; // install() will apply once ready
    this.applyRouteData();
    this.applySelectionStyle();
    this.fit();
    this.animateIn();
  }

  setSelected(id: string | null): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.popup.remove();
    if (!this.map.isStyleLoaded()) return;
    this.applySelectionStyle();
    this.revealN = Number.POSITIVE_INFINITY;
    this.applyCheckpoints();
    this.applyPulses();
    this.startTruck();
  }

  setFrames(frames: Map<number, import('../../types').HeatmapResponse>): void {
    this.frames = frames;
    this.heat.setFrames(frames);
  }

  fit(duration = 1400): void {
    const b = boundsOf(this.routes.map((r) => r.coords));
    if (!b) return;
    const pad = this.padding;
    this.map.fitBounds(
      [
        [b.minLng, b.minLat],
        [b.maxLng, b.maxLat],
      ],
      {
        padding: {
          top: (pad.top ?? 0) + 30,
          right: (pad.right ?? 0) + 30,
          bottom: (pad.bottom ?? 0) + 30,
          left: (pad.left ?? 0) + 30,
        },
        duration: this.reducedMotion ? 0 : duration,
        easing: easeOut,
        maxZoom: 9,
      },
    );
  }

  destroy(): void {
    this.clearTimers();
    this.unsub();
    this.heat.destroy();
    this.truck.stop(true);
    this.map.remove();
  }

  // ───────────────────────── style install ─────────────────────────

  private install(): void {
    const map = this.map;
    const tint = BASE_TINT[this.theme];
    if (map.getLayer('background')) map.setPaintProperty('background', 'background-color', tint.bg);
    if (map.getLayer('water')) map.setPaintProperty('water', 'fill-color', tint.water);

    // Find the first road or symbol layer to anchor the heatmap ABOVE land/water and BELOW roads
    const layers = map.getStyle().layers || [];
    let anchor: string | undefined;
    for (const l of layers) {
      if (l.id.startsWith('route-') || l.id.startsWith('cp-') || l.id === 'heat-layer') continue;
      if (
        (l.type === 'line' || l.type === 'symbol') &&
        /highway|road|street|transport|transit|rail|tunnel|bridge/i.test(l.id)
      ) {
        anchor = l.id;
        break;
      }
    }
    if (!anchor) {
      anchor = layers.find((l) => l.type === 'symbol' && !l.id.startsWith('route-') && !l.id.startsWith('cp-'))?.id;
    }
    this.heat.install(anchor);
    if (this.frames.size > 0) {
      this.heat.setFrames(this.frames);
    }

    for (let i = 0; i < MAX_ROUTES; i++) {
      map.addSource(`route-${i}`, { type: 'geojson', lineMetrics: true, data: EMPTY });
      const layout = { 'line-cap': 'round', 'line-join': 'round' } as const;
      map.addLayer({ id: `route-casing-${i}`, type: 'line', source: `route-${i}`, layout, paint: { 'line-width': 0 } });
      map.addLayer({ id: `route-line-${i}`, type: 'line', source: `route-${i}`, layout, paint: { 'line-width': 2 } });
    }
    map.addSource('cps', { type: 'geojson', data: EMPTY, promoteId: 'idx' });
    const hover: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
    map.addLayer({
      id: 'cp-halo',
      type: 'circle',
      source: 'cps',
      filter: declutterFilter(),
      paint: {
        'circle-color': ['get', 'color'],
        'circle-opacity': ['case', hover, 0.35, 0],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 14, 9, 22],
        'circle-blur': 0.35,
      },
    });
    map.addLayer({
      id: 'cp-dot',
      type: 'circle',
      source: 'cps',
      filter: declutterFilter(),
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          3,
          ['case', hover, 8, ['case', ['get', 'severe'], 5.2, 4.0]],
          9,
          ['case', hover, 13, ['case', ['get', 'severe'], 9.5, 7.5]],
        ],
        'circle-stroke-color': ['case', hover, '#FFA62B', this.theme === 'dark' ? '#FFFFFF' : '#111316'],
        'circle-stroke-width': ['case', hover, 3.0, 2.0],
      },
    });

    this.bindInteractions();
    this.applyRouteData();
    this.applySelectionStyle();
    this.applyDraw(this.drawP);
    this.applyCheckpoints();
    if (this.hovered !== null) this.setHover(this.hovered);
    this.heat.show(viewStore.get().hour, viewStore.get().metric, viewStore.get().heatmapOn);
    if (this.routes.length && this.drawP >= 1) {
      this.applyPulses();
      this.startTruck();
    }
  }

  private bindInteractions(): void {
    if (this.interactionsBound) return;
    this.interactionsBound = true;
    const map = this.map;
    for (let i = 0; i < MAX_ROUTES; i++) {
      const onSelect = () => {
        const r = this.routes[i];
        if (r) this.cb.current.onSelectRoute(r.id);
      };
      const onEnter = () => (map.getCanvas().style.cursor = 'pointer');
      const onLeave = () => (map.getCanvas().style.cursor = '');

      map.on('click', `route-line-${i}`, onSelect);
      map.on('click', `route-casing-${i}`, onSelect);
      map.on('mouseenter', `route-line-${i}`, onEnter);
      map.on('mouseenter', `route-casing-${i}`, onEnter);
      map.on('mouseleave', `route-line-${i}`, onLeave);
      map.on('mouseleave', `route-casing-${i}`, onLeave);
    }
    map.on('mousemove', 'cp-dot', (e: MapLayerMouseEvent) => {
      const idx = e.features?.[0]?.id;
      if (typeof idx === 'number') {
        map.getCanvas().style.cursor = 'pointer';
        viewStore.set({ hoveredCp: idx });
      }
    });
    map.on('mouseleave', 'cp-dot', () => {
      map.getCanvas().style.cursor = '';
      viewStore.set({ hoveredCp: null });
    });
    map.on('click', 'cp-dot', (e: MapLayerMouseEvent) => {
      const idx = e.features?.[0]?.id;
      if (typeof idx === 'number') viewStore.set({ selectedCp: idx });
    });
  }

  // ───────────────────────── view-store reactions ─────────────────────────

  private onView(s: ViewState, prev: ViewState): void {
    if (s.hoveredCp !== prev.hoveredCp) this.setHover(s.hoveredCp);
    if (s.selectedCp !== prev.selectedCp && s.selectedCp !== null) this.openPopup(s.selectedCp);
    if (s.hour !== prev.hour || s.metric !== prev.metric || s.heatmapOn !== prev.heatmapOn) {
      this.heat.show(s.hour, s.metric, s.heatmapOn);
    }
    if (s.truckOn !== prev.truckOn) {
      this.truck.setEnabled(s.truckOn);
      if (s.truckOn) this.startTruck();
    }
  }

  private setHover(idx: number | null): void {
    if (this.hovered !== null && this.map.getSource('cps')) {
      this.map.setFeatureState({ source: 'cps', id: this.hovered }, { hover: false });
    }
    this.hovered = idx;
    if (idx !== null && this.map.getSource('cps')) {
      this.map.setFeatureState({ source: 'cps', id: idx }, { hover: true });
    }
  }

  private openPopup(idx: number): void {
    const cp = this.selected()?.checkpoints.find((c) => c.index === idx);
    if (!cp) return;
    this.popup.setLngLat([cp.lng, cp.lat]).setHTML(checkpointPopupHtml(cp)).addTo(this.map);
    const pt = this.map.project([cp.lng, cp.lat]);
    const c = this.map.getContainer();
    const p = this.padding;
    const inside =
      pt.x > (p.left ?? 0) &&
      pt.x < c.clientWidth - (p.right ?? 0) &&
      pt.y > (p.top ?? 0) &&
      pt.y < c.clientHeight - (p.bottom ?? 0);
    if (!inside) this.map.easeTo({ center: [cp.lng, cp.lat], padding: p, duration: 700, easing: easeOut });
  }

  // ───────────────────────── data → layers ─────────────────────────

  private selected(): PreparedRoute | undefined {
    return this.routes.find((r) => r.id === this.selectedId) ?? this.routes[0];
  }

  private applyRouteData(): void {
    for (let i = 0; i < MAX_ROUTES; i++) {
      const src = this.map.getSource(`route-${i}`) as GeoJSONSource | undefined;
      const r = this.routes[i];
      const data: FeatureCollection<LineString> = r
        ? {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: toLngLat(r.coords) } }],
          }
        : (EMPTY as FeatureCollection<LineString>);
      src?.setData(data);
    }
  }

  private applySelectionStyle(): void {
    const map = this.map;
    const sel = this.selected();
    let altSlot = 0;
    for (let i = 0; i < MAX_ROUTES; i++) {
      if (!map.getLayer(`route-line-${i}`)) continue;
      const isSel = sel?.index === i;
      const offset = isSel ? 0 : altSlot++ === 0 ? -4 : 4;
      map.setPaintProperty(
        `route-line-${i}`,
        'line-width',
        isSel ? ['interpolate', ['linear'], ['zoom'], 3, 4.0, 10, 7.5] : ['interpolate', ['linear'], ['zoom'], 3, 2.2, 10, 4.5],
      );
      map.setPaintProperty(`route-line-${i}`, 'line-opacity', isSel ? 1.0 : 0.62);
      map.setPaintProperty(`route-line-${i}`, 'line-offset', offset);
      map.setPaintProperty(`route-casing-${i}`, 'line-offset', offset);
      map.setPaintProperty(
        `route-casing-${i}`,
        'line-width',
        isSel ? ['interpolate', ['linear'], ['zoom'], 3, 8.0, 10, 13.0] : ['interpolate', ['linear'], ['zoom'], 3, 4.2, 10, 7.0],
      );
      map.setPaintProperty(`route-casing-${i}`, 'line-opacity', isSel ? 0.95 : 0.85);
    }
    // Selected route on top of alternatives, beneath checkpoints.
    if (sel && map.getLayer('cp-halo')) {
      map.moveLayer(`route-casing-${sel.index}`, 'cp-halo');
      map.moveLayer(`route-line-${sel.index}`, 'cp-halo');
    }
    this.applyDraw(this.drawP);
  }

  private applyDraw(p: number): void {
    for (let i = 0; i < MAX_ROUTES; i++) {
      if (!this.map.getLayer(`route-line-${i}`)) continue;
      const color = ROUTE_TOKENS[i].hex[this.theme];
      // Stagger: alternatives lag slightly behind each other for a layered draw.
      const pi = Math.max(0, Math.min(1, p * 1.25 - i * 0.12));
      this.map.setPaintProperty(`route-line-${i}`, 'line-gradient', progressGradient(color, pi));
      this.map.setPaintProperty(`route-casing-${i}`, 'line-gradient', progressGradient(CASING[this.theme], pi));
    }
  }

  private applyCheckpoints(): void {
    const src = this.map.getSource('cps') as GeoJSONSource | undefined;
    const sel = this.selected();
    if (!src) return;
    if (!sel) {
      src.setData(EMPTY);
      return;
    }
    const cps = sel.checkpoints;
    const last = cps.length - 1;
    const n = Math.min(this.revealN, cps.length);
    const features: FeatureCollection<Point>['features'] = cps.slice(0, n).map((cp, i) => {
      const severe = cp.risk_level === 'Severe' || cp.risk_level === 'No Travel';
      const rank = i === 0 || i === last || severe || i % 4 === 0 ? 0 : i % 2 === 0 ? 1 : 2;
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [cp.lng, cp.lat] },
        properties: { idx: cp.index, rank, severe, color: RISK_TOKENS[cp.risk_level].hex[this.theme] },
      };
    });
    src.setData({ type: 'FeatureCollection', features });
  }

  private applyPulses(): void {
    this.clearPulses();
    const sel = this.selected();
    if (!sel) return;
    const severeCps = sel.checkpoints.filter(
      (cp) => cp.risk_level === 'Severe' || cp.risk_level === 'No Travel',
    );
    // Cap at top 3 severe checkpoints to eliminate DOM animation thrashing
    const topPulses = severeCps.slice(0, 3);
    for (const cp of topPulses) {
      const el = document.createElement('div');
      el.className = 'pulse-marker';
      el.style.setProperty('--pulse-color', RISK_TOKENS[cp.risk_level].hex[this.theme]);
      el.setAttribute('aria-hidden', 'true');
      this.pulses.push(new Marker({ element: el }).setLngLat([cp.lng, cp.lat]).addTo(this.map));
    }
  }

  private clearPulses(): void {
    this.pulses.forEach((m) => m.remove());
    this.pulses = [];
  }

  private startTruck(): void {
    const sel = this.selected();
    if (!sel || !viewStore.get().truckOn) return;
    this.truck.setRoute(sel.line, this.departure, sel.durationSec, sel.miles);
    this.truck.start();
  }

  // ───────────────────────── entrance choreography ─────────────────────────

  private animateIn(): void {
    if (this.reducedMotion || !this.routes.length) {
      this.drawP = 1;
      this.revealN = Number.POSITIVE_INFINITY;
      this.applyDraw(1);
      this.applyCheckpoints();
      this.applyPulses();
      this.startTruck();
      return;
    }
    this.drawP = 0;
    this.revealN = 0;
    this.applyDraw(0);
    this.applyCheckpoints();
    const start = performance.now() + 250; // let fitBounds begin first
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / DRAW_MS));
      this.drawP = easeInOut(t);
      this.applyDraw(this.drawP);
      if (t < 1) {
        this.raf = requestAnimationFrame(tick);
      } else {
        this.revealCheckpoints();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  private revealCheckpoints(): void {
    const total = this.selected()?.checkpoints.length ?? 0;
    const step = () => {
      this.revealN = Math.min(total, this.revealN + 1);
      this.applyCheckpoints();
      if (this.revealN < total) {
        this.timers.push(window.setTimeout(step, REVEAL_STEP_MS));
      } else {
        this.revealN = Number.POSITIVE_INFINITY;
        this.applyPulses();
        this.startTruck();
      }
    };
    step();
  }

  private clearTimers(): void {
    cancelAnimationFrame(this.raf);
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
  }
}

/** Progressive disclosure: at low zoom only rank-0 checkpoints (every 4th + severe + ends). */
function declutterFilter(): ExpressionSpecification {
  return ['step', ['zoom'], ['==', ['get', 'rank'], 0], 5.6, ['<=', ['get', 'rank'], 1], 7, true];
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

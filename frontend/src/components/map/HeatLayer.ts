import type { CanvasSource, Map as MlMap } from 'maplibre-gl';
import type { HeatmapResponse } from '../../types';
import type { LatLng } from '../../lib/geo';
import { extentOf, frameHeight, renderFrame, FRAME_WIDTH, type RasterExtent } from '../../lib/heatmapRaster';
import type { HeatMetric } from '../../lib/riskScale';
import type { ThemeName } from '../../lib/tokens';
import { nearestLoaded } from '../../hooks/useHeatmapFrames';

const SOURCE = 'heat';
const LAYER = 'heat-layer';
const FADE_MS = 240;

type IdleHandle = number;
const requestIdle: (cb: () => void) => IdleHandle =
  typeof window.requestIdleCallback === 'function'
    ? (cb) => window.requestIdleCallback(cb, { timeout: 400 })
    : (cb) => window.setTimeout(cb, 16);
const cancelIdle: (h: IdleHandle) => void =
  typeof window.cancelIdleCallback === 'function' ? (h) => window.cancelIdleCallback(h) : (h) => window.clearTimeout(h);

/**
 * Corridor heatmap rendered into a MapLibre `canvas` source.
 * Frames are rasterised once (IDW + blur + corridor mask) and cached; switching hours only
 * crossfades two cached bitmaps on the display canvas inside a rAF loop — React is not involved.
 */
export class HeatLayer {
  private readonly canvas = document.createElement('canvas');
  private readonly prev = document.createElement('canvas');
  private ext: RasterExtent | null = null;
  private frames = new Map<number, HeatmapResponse>();
  private routes: LatLng[][] = [];
  private cache = new Map<string, HTMLCanvasElement>();
  private currentKey: string | null = null;
  private fadeRaf = 0;
  private idle: IdleHandle | null = null;
  private beforeId: string | undefined;
  private want = { hour: 0, metric: 'overall' as HeatMetric, on: true };

  constructor(
    private readonly map: MlMap,
    private theme: ThemeName,
    private readonly reducedMotion: boolean,
  ) {}

  /** Called after every style (re)load. */
  install(beforeId: string | undefined): void {
    this.beforeId = beforeId;
    if (this.ext) this.ensureSource();
  }

  setRoutes(routes: LatLng[][]): void {
    this.routes = routes;
    this.ext = null;
    this.frames = new Map();
    this.resetCache();
    const ctx = this.canvas.getContext('2d');
    ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setTheme(theme: ThemeName): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.resetCache();
  }

  setFrames(frames: Map<number, HeatmapResponse>): void {
    this.frames = frames;
    if (!this.ext && frames.size > 0) {
      const first = frames.values().next().value as HeatmapResponse;
      this.ext = extentOf(first.points);
      this.canvas.width = this.prev.width = FRAME_WIDTH;
      this.canvas.height = this.prev.height = frameHeight(this.ext, FRAME_WIDTH);
      this.ensureSource();
    }
    this.refresh();
    this.schedulePrecompute();
  }

  show(hour: number, metric: HeatMetric, on: boolean): void {
    const metricChanged = metric !== this.want.metric;
    this.want = { hour, metric, on };
    if (metricChanged) this.resetCache();
    this.refresh();
    if (metricChanged) this.schedulePrecompute();
  }

  destroy(): void {
    cancelAnimationFrame(this.fadeRaf);
    if (this.idle !== null) cancelIdle(this.idle);
  }

  // ───────────────────────── internals ─────────────────────────

  private resetCache(): void {
    this.cache.clear();
    this.currentKey = null;
  }

  private coords(): [[number, number], [number, number], [number, number], [number, number]] | null {
    if (!this.ext) return null;
    const { west, east, north, south } = this.ext;
    return [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ];
  }

  private ensureSource(): void {
    const coordinates = this.coords();
    if (!coordinates || !this.map.isStyleLoaded()) return;
    const existing = this.map.getSource(SOURCE) as CanvasSource | undefined;
    if (existing) {
      existing.setCoordinates(coordinates);
    } else {
      this.map.addSource(SOURCE, { type: 'canvas', canvas: this.canvas, coordinates, animate: false });
      this.map.addLayer(
        {
          id: LAYER,
          type: 'raster',
          source: SOURCE,
          paint: { 'raster-opacity': 1, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
        },
        this.beforeId && this.map.getLayer(this.beforeId) ? this.beforeId : undefined,
      );
    }
    this.currentKey = null;
    this.refresh();
  }

  private source(): CanvasSource | undefined {
    return this.map.getSource(SOURCE) as CanvasSource | undefined;
  }

  private raster(metric: HeatMetric, hour: number): HTMLCanvasElement | null {
    const key = `${metric}|${hour}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const frame = this.frames.get(hour);
    if (!frame || !this.ext) return null;
    const c = renderFrame(frame.points, metric, this.theme, this.ext, this.routes);
    this.cache.set(key, c);
    return c;
  }

  private refresh(): void {
    if (!this.map.getLayer(LAYER)) return;
    this.map.setLayoutProperty(LAYER, 'visibility', this.want.on ? 'visible' : 'none');
    if (!this.want.on) return;
    const h = nearestLoaded(this.frames, this.want.hour);
    if (h === null) return;
    const key = `${this.want.metric}|${h}`;
    if (key === this.currentKey) return;
    const next = this.raster(this.want.metric, h);
    if (!next) return;
    this.currentKey = key;
    this.crossfade(next);
  }

  private crossfade(next: HTMLCanvasElement): void {
    const ctx = this.canvas.getContext('2d');
    const pctx = this.prev.getContext('2d');
    const src = this.source();
    if (!ctx || !pctx || !src) return;
    cancelAnimationFrame(this.fadeRaf);

    // Snapshot whatever is on screen now (possibly mid-fade) as the "from" frame.
    pctx.clearRect(0, 0, this.prev.width, this.prev.height);
    pctx.drawImage(this.canvas, 0, 0);

    const W = this.canvas.width;
    const H = this.canvas.height;
    const duration = this.reducedMotion ? 0 : FADE_MS;
    const start = performance.now();
    src.play();

    const step = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(this.prev, 0, 0, W, H);
      // Additive blend of premultiplied pixels == exact linear crossfade (no mid-fade dip).
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = t;
      ctx.drawImage(next, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (t < 1) {
        this.fadeRaf = requestAnimationFrame(step);
      } else {
        // One more frame so the final bitmap is uploaded, then stop re-uploading.
        this.fadeRaf = requestAnimationFrame(() => this.source()?.pause());
      }
    };
    this.fadeRaf = requestAnimationFrame(step);
  }

  /** Rasterise remaining loaded frames for the active metric during idle time. */
  private schedulePrecompute(): void {
    if (this.idle !== null) cancelIdle(this.idle);
    const run = () => {
      this.idle = null;
      if (!this.ext) return;
      const metric = this.want.metric;
      for (const h of this.frames.keys()) {
        if (!this.cache.has(`${metric}|${h}`)) {
          this.raster(metric, h);
          this.idle = requestIdle(run);
          return;
        }
      }
    };
    this.idle = requestIdle(run);
  }
}

import type { CanvasSource, Map as MlMap } from 'maplibre-gl';
import type { HeatmapResponse } from '../../types';
import type { LatLng } from '../../lib/geo';
import { extentOf, frameHeight, renderFrame, FRAME_WIDTH, type RasterExtent } from '../../lib/heatmapRaster';
import type { HeatMetric } from '../../lib/riskScale';
import type { ThemeName } from '../../lib/tokens';
import { nearestLoaded } from '../../hooks/useHeatmapFrames';
import type { HeatWorkerRequest, HeatWorkerResponse } from '../../lib/heatmap.worker';

const SOURCE = 'heat';
const LAYER = 'heat-layer';
const FADE_MS = 200;

type Drawable = HTMLCanvasElement | ImageBitmap;

type IdleHandle = number;
const requestIdle: (cb: () => void) => IdleHandle =
  typeof window.requestIdleCallback === 'function'
    ? (cb) => window.requestIdleCallback(cb, { timeout: 400 })
    : (cb) => window.setTimeout(cb, 16);
const cancelIdle: (h: IdleHandle) => void =
  typeof window.cancelIdleCallback === 'function' ? (h) => window.cancelIdleCallback(h) : (h) => window.clearTimeout(h);

export interface FrameStats {
  min: number;
  max: number;
  mean: number;
}

/**
 * Corridor heatmap rendered into a MapLibre `canvas` source.
 * Frames are rasterised via a dedicated Web Worker (OffscreenCanvas/ImageBitmap)
 * and cached; switching hours crossfades two cached bitmaps inside a rAF loop.
 */
export class HeatLayer {
  private readonly canvas = document.createElement('canvas');
  private readonly prev = document.createElement('canvas');
  private ext: RasterExtent | null = null;
  private frames = new Map<number, HeatmapResponse>();
  private routes: LatLng[][] = [];
  private cache = new Map<string, Drawable>();
  private statsCache = new Map<string, FrameStats>();
  private currentKey: string | null = null;
  private fadeRaf = 0;
  private idle: IdleHandle | null = null;
  private beforeId: string | undefined;
  private want = { hour: 0, metric: 'overall' as HeatMetric, on: true };
  private worker: Worker | null = null;

  constructor(
    private readonly map: MlMap,
    private theme: ThemeName,
    private readonly reducedMotion: boolean,
  ) {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('../../lib/heatmap.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<HeatWorkerResponse>) => {
        const { id, bitmap, imageData, stats } = e.data;
        if (stats) {
          this.statsCache.set(id, stats);
        }
        if (bitmap) {
          this.cache.set(id, bitmap);
        } else if (imageData) {
          const c = document.createElement('canvas');
          c.width = imageData.width;
          c.height = imageData.height;
          const ctx = c.getContext('2d');
          if (ctx) {
            const img = ctx.createImageData(imageData.width, imageData.height);
            img.data.set(imageData.data);
            ctx.putImageData(img, 0, 0);
            this.cache.set(id, c);
          }
        }
        // If this newly ready frame matches our currently desired hour, update canvas
        const activeKey = `${this.want.metric}|${nearestLoaded(this.frames, this.want.hour)}`;
        if (id === activeKey) {
          this.refresh();
        }
      };
      this.worker.onerror = (err) => {
        console.warn('[HeatLayer] Worker error, falling back to main-thread rasterizer', err);
        this.worker?.terminate();
        this.worker = null;
      };
    } catch (err) {
      console.warn('[HeatLayer] Worker unavailable, falling back to main-thread rasterizer', err);
      this.worker = null;
    }
  }

  /** Called after every style (re)load. */
  install(beforeId: string | undefined): void {
    this.beforeId = beforeId;
    if (this.ext) this.ensureSource();
  }

  setRoutes(routes: LatLng[][]): void {
    this.routes = routes;
    this.resetCache();
    if (this.frames.size > 0) {
      const first = this.frames.values().next().value as HeatmapResponse;
      this.ext = extentOf(first.points);
      this.canvas.width = this.prev.width = FRAME_WIDTH;
      this.canvas.height = this.prev.height = frameHeight(this.ext, FRAME_WIDTH);
      this.ensureSource();
      this.refresh();
      this.schedulePrecompute();
    }
  }

  setTheme(theme: ThemeName): void {
    if (theme === this.theme) return;
    this.theme = theme;
    this.resetCache();
  }

  setFrames(frames: Map<number, HeatmapResponse>): void {
    this.frames = frames;
    if (frames.size > 0) {
      if (!this.ext) {
        const first = frames.values().next().value as HeatmapResponse;
        this.ext = extentOf(first.points);
        this.canvas.width = this.prev.width = FRAME_WIDTH;
        this.canvas.height = this.prev.height = frameHeight(this.ext, FRAME_WIDTH);
      }
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
    this.worker?.terminate();
    this.worker = null;
  }

  // ───────────────────────── internals ─────────────────────────

  private resetCache(): void {
    this.cache.clear();
    this.statsCache.clear();
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
          paint: {
            'raster-opacity': 0.72,
            'raster-fade-duration': 0,
            'raster-resampling': 'linear',
          },
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

  private requestWorkerFrame(metric: HeatMetric, hour: number, frame: HeatmapResponse): void {
    if (!this.worker || !this.ext) return;
    const req: HeatWorkerRequest = {
      id: `${metric}|${hour}`,
      points: frame.points,
      metric,
      theme: this.theme,
      ext: this.ext,
      routes: this.routes,
      width: FRAME_WIDTH,
    };
    this.worker.postMessage(req);
  }

  private raster(metric: HeatMetric, hour: number): Drawable | null {
    const key = `${metric}|${hour}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const frame = this.frames.get(hour);
    if (!frame || !this.ext) return null;

    if (this.worker) {
      this.requestWorkerFrame(metric, hour, frame);
    }
    // Synchronous fallback so current frame renders even before worker responds
    const c = renderFrame(frame.points, metric, this.theme, this.ext, this.routes);
    this.cache.set(key, c);
    return c;
  }

  private refresh(): void {
    if (!this.map.getLayer(LAYER)) {
      if (this.ext && this.map.isStyleLoaded()) {
        this.ensureSource();
      }
      if (!this.map.getLayer(LAYER)) return;
    }
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

    // Diagnostic log & global debug badge
    const stats = this.statsCache.get(key);
    const hasLayer = Boolean(this.map.getLayer(LAYER));
    (window as any).__heatmapDebug = {
      present: hasLayer,
      hour: h,
      metric: this.want.metric,
      stats: stats ?? null,
    };
    console.log(
      `[Heatmap] layer present: ${hasLayer}, metric: ${this.want.metric}, hour: ${h}, min: ${stats?.min?.toFixed(2) ?? 'N/A'}, max: ${stats?.max?.toFixed(2) ?? 'N/A'}, mean: ${stats?.mean?.toFixed(2) ?? 'N/A'}`,
    );
  }

  private crossfade(next: Drawable): void {
    const ctx = this.canvas.getContext('2d');
    const pctx = this.prev.getContext('2d');
    const src = this.source();
    if (!ctx || !pctx || !src) return;
    cancelAnimationFrame(this.fadeRaf);

    // Snapshot whatever is on screen now
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
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = t;
      ctx.drawImage(next, 0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (t < 1) {
        this.fadeRaf = requestAnimationFrame(step);
      } else {
        this.fadeRaf = requestAnimationFrame(() => this.source()?.pause());
      }
    };
    this.fadeRaf = requestAnimationFrame(step);
  }

  /** Send remaining loaded frames to the Web Worker for background rasterization. */
  private schedulePrecompute(): void {
    if (this.idle !== null) cancelIdle(this.idle);
    const run = () => {
      this.idle = null;
      if (!this.ext) return;
      const metric = this.want.metric;
      for (const [h, frame] of this.frames.entries()) {
        const key = `${metric}|${h}`;
        if (!this.cache.has(key)) {
          if (this.worker) {
            this.requestWorkerFrame(metric, h, frame);
          } else {
            this.raster(metric, h);
            this.idle = requestIdle(run);
            return;
          }
        }
      }
    };
    this.idle = requestIdle(run);
  }
}

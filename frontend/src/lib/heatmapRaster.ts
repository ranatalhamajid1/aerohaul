import type { HeatmapPoint } from '../types';
import { mercY, type LatLng } from './geo';
import { metricValue, rampLut, type HeatMetric } from './riskScale';
import type { ThemeName } from './tokens';

export interface RasterExtent {
  west: number;
  east: number;
  south: number;
  north: number;
}

/** Display resolution of each frame (upscaled + blurred from a coarse IDW grid). */
export const FRAME_WIDTH = 640;
const COARSE_WIDTH = 130;
const CORRIDOR_BUFFER_MI = 35;

export function extentOf(points: HeatmapPoint[]): RasterExtent {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const p of points) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  return { west, east, south, north };
}

export function frameHeight(ext: RasterExtent, width: number): number {
  const spanX = ((ext.east - ext.west) * Math.PI) / 180;
  const spanY = mercY(ext.north) - mercY(ext.south);
  return Math.max(40, Math.min(width * 1.5, Math.round((width * spanY) / Math.max(spanX, 1e-6))));
}

/** Pixel position (x, y) of a lat/lng in a frame of size (w, h) — mercator-correct. */
function project(ext: RasterExtent, w: number, h: number, lat: number, lng: number): [number, number] {
  const x = ((lng - ext.west) / (ext.east - ext.west)) * w;
  const yTop = mercY(ext.north);
  const y = ((yTop - mercY(lat)) / (yTop - mercY(ext.south))) * h;
  return [x, y];
}

/**
 * Render one heatmap frame (synchronous fallback when Web Worker is unavailable):
 *  1. inverse-distance-weighted interpolation of grid values onto a coarse canvas,
 *  2. bilinear upscale + soft blur onto the display canvas,
 *  3. clip to a soft-edged buffer around the route corridors.
 */
export function renderFrame(
  points: HeatmapPoint[],
  metric: HeatMetric,
  theme: ThemeName,
  ext: RasterExtent,
  routes: LatLng[][],
): HTMLCanvasElement {
  const cw = COARSE_WIDTH;
  const ch = frameHeight(ext, cw);
  const coarse = document.createElement('canvas');
  coarse.width = cw;
  coarse.height = ch;
  const cctx = coarse.getContext('2d');
  const out = document.createElement('canvas');
  out.width = FRAME_WIDTH;
  out.height = frameHeight(ext, FRAME_WIDTH);
  const octx = out.getContext('2d');
  if (!cctx || !octx || points.length === 0) return out;

  const px = new Float32Array(points.length);
  const py = new Float32Array(points.length);
  const pv = new Float32Array(points.length);
  points.forEach((p, i) => {
    const [x, y] = project(ext, cw, ch, p.lat, p.lng);
    px[i] = x;
    py[i] = y;
    pv[i] = metricValue(p, metric);
  });

  const lut = rampLut(theme);
  const img = cctx.createImageData(cw, ch);
  const data = img.data;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let num = 0;
      let den = 0;
      let exact = -1;
      for (let i = 0; i < pv.length; i++) {
        const dx = x + 0.5 - px[i];
        const dy = y + 0.5 - py[i];
        const d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          exact = pv[i];
          break;
        }
        const w = 1 / (d2 * d2);
        num += w * pv[i];
        den += w;
      }
      const v = exact >= 0 ? exact : den > 0 ? num / den : 0;
      const li = Math.max(0, Math.min(255, Math.round(v * 255))) * 4;
      const o = (y * cw + x) * 4;
      data[o] = lut[li];
      data[o + 1] = lut[li + 1];
      data[o + 2] = lut[li + 2];
      data[o + 3] = lut[li + 3];
    }
  }
  cctx.putImageData(img, 0, 0);

  const W = out.width;
  const H = out.height;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.filter = 'blur(8px)';
  octx.drawImage(coarse, 0, 0, W, H);

  // Corridor mask around all routes
  const midLat = (ext.north + ext.south) / 2;
  const miPerPx = ((ext.east - ext.west) * 69.17 * Math.cos((midLat * Math.PI) / 180)) / W;
  const bufferPx = (CORRIDOR_BUFFER_MI * 2) / Math.max(miPerPx, 1e-6);
  octx.globalCompositeOperation = 'destination-in';
  octx.filter = `blur(${Math.round(bufferPx * 0.18)}px)`;
  octx.strokeStyle = '#000';
  octx.lineCap = 'round';
  octx.lineJoin = 'round';
  octx.lineWidth = bufferPx;
  octx.beginPath();
  for (const line of routes) {
    line.forEach(([lat, lng], i) => {
      const [x, y] = project(ext, W, H, lat, lng);
      if (i === 0) octx.moveTo(x, y);
      else octx.lineTo(x, y);
    });
  }
  octx.stroke();
  octx.globalCompositeOperation = 'source-over';
  octx.filter = 'none';
  return out;
}

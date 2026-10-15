import type { HeatmapPoint } from '../types';
import type { LatLng } from './geo';
import { mercY, haversineMi } from './geo';
import { metricValue, rampLut, type HeatMetric } from './riskScale';
import type { ThemeName } from './tokens';
import type { RasterExtent } from './heatmapRaster';

export interface HeatWorkerRequest {
  id: string;
  points: HeatmapPoint[];
  metric: HeatMetric;
  theme: ThemeName;
  ext: RasterExtent;
  routes: LatLng[][];
  width: number;
}

export interface HeatWorkerResponse {
  id: string;
  bitmap?: ImageBitmap;
  imageData?: { width: number; height: number; data: Uint8ClampedArray };
  stats?: { min: number; max: number; mean: number };
  error?: string;
}

const COARSE_WIDTH = 130;
const CORRIDOR_BUFFER_MI = 35;

function frameH(ext: RasterExtent, width: number): number {
  const spanX = ((ext.east - ext.west) * Math.PI) / 180;
  const spanY = mercY(ext.north) - mercY(ext.south);
  return Math.max(40, Math.min(width * 1.5, Math.round((width * spanY) / Math.max(spanX, 1e-6))));
}

function project(ext: RasterExtent, w: number, h: number, lat: number, lng: number): [number, number] {
  const x = ((lng - ext.west) / (ext.east - ext.west)) * w;
  const yTop = mercY(ext.north);
  const y = ((yTop - mercY(lat)) / (yTop - mercY(ext.south))) * h;
  return [x, y];
}

self.onmessage = async (e: MessageEvent<HeatWorkerRequest>) => {
  const { id, points, metric, theme, ext, routes, width } = e.data;
  if (!points || points.length === 0) {
    self.postMessage({ id, error: 'No points' });
    return;
  }

  try {
    const cw = COARSE_WIDTH;
    const ch = frameH(ext, cw);
    const fw = width;
    const fh = frameH(ext, fw);

    const px = new Float32Array(points.length);
    const py = new Float32Array(points.length);
    const pv = new Float32Array(points.length);
    let minVal = Infinity;
    let maxVal = -Infinity;
    let sumVal = 0;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const [x, y] = project(ext, cw, ch, p.lat, p.lng);
      px[i] = x;
      py[i] = y;
      const v = metricValue(p, metric);
      pv[i] = v;
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
      sumVal += v;
    }
    const meanVal = points.length > 0 ? sumVal / points.length : 0;

    const lut = rampLut(theme);
    const coarseBytes = new Uint8ClampedArray(cw * ch * 4);

    // IDW Interpolation on coarse grid
    for (let y = 0; y < ch; y++) {
      const rowOffset = y * cw * 4;
      for (let x = 0; x < cw; x++) {
        let num = 0;
        let den = 0;
        let exact = -1;
        const cx = x + 0.5;
        const cy = y + 0.5;

        for (let i = 0; i < pv.length; i++) {
          const dx = cx - px[i];
          const dy = cy - py[i];
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.04) {
            exact = pv[i];
            break;
          }
          const w = 1 / (d2 * d2);
          num += w * pv[i];
          den += w;
        }

        const val = exact >= 0 ? exact : den > 0 ? num / den : 0;
        // val is in [0, 1]
        const norm = Math.max(0, Math.min(255, Math.round(val * 255)));
        const lutOffset = norm * 4;
        const offset = rowOffset + x * 4;
        coarseBytes[offset] = lut[lutOffset] ?? 0;
        coarseBytes[offset + 1] = lut[lutOffset + 1] ?? 0;
        coarseBytes[offset + 2] = lut[lutOffset + 2] ?? 0;
        coarseBytes[offset + 3] = lut[lutOffset + 3] ?? 0;
      }
    }

    if (typeof OffscreenCanvas !== 'undefined') {
      const coarseCanvas = new OffscreenCanvas(cw, ch);
      const cctx = coarseCanvas.getContext('2d');
      if (cctx) {
        const cImg = cctx.createImageData(cw, ch);
        cImg.data.set(coarseBytes);
        cctx.putImageData(cImg, 0, 0);

        const outCanvas = new OffscreenCanvas(fw, fh);
        const octx = outCanvas.getContext('2d');
        if (octx) {
          octx.imageSmoothingEnabled = true;
          octx.imageSmoothingQuality = 'medium';
          octx.drawImage(coarseCanvas, 0, 0, fw, fh);

          // Corridor Buffer Clipping around ALL routes
          if (routes && routes.length > 0) {
            const maskCanvas = new OffscreenCanvas(fw, fh);
            const mctx = maskCanvas.getContext('2d');
            if (mctx) {
              const miSpanX = haversineMi([ext.south, ext.west], [ext.south, ext.east]);
              const pxPerMi = fw / Math.max(miSpanX, 1);
              const radiusPx = Math.max(16, CORRIDOR_BUFFER_MI * pxPerMi);

              mctx.lineCap = 'round';
              mctx.lineJoin = 'round';
              mctx.strokeStyle = '#ffffff';
              mctx.lineWidth = radiusPx * 2;

              for (const route of routes) {
                if (route.length < 2) continue;
                mctx.beginPath();
                const [x0, y0] = project(ext, fw, fh, route[0][0], route[0][1]);
                mctx.moveTo(x0, y0);
                for (let k = 1; k < route.length; k++) {
                  const [xk, yk] = project(ext, fw, fh, route[k][0], route[k][1]);
                  mctx.lineTo(xk, yk);
                }
                mctx.stroke();
              }

              // Apply mask
              octx.globalCompositeOperation = 'destination-in';
              octx.drawImage(maskCanvas, 0, 0);
            }
          }

          const bitmap = outCanvas.transferToImageBitmap();
          (postMessage as (msg: unknown, transfer: Transferable[]) => void)(
            { id, bitmap, stats: { min: minVal, max: maxVal, mean: meanVal } },
            [bitmap],
          );
          return;
        }
      }
    }

    // Fallback: send raw coarse data if OffscreenCanvas 2D unavailable
    postMessage({
      id,
      imageData: { width: cw, height: ch, data: coarseBytes },
      stats: { min: minVal, max: maxVal, mean: meanVal },
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    postMessage({ id, error });
  }
};

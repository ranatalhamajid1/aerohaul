/** Geometry helpers. Inputs are [lat, lng] pairs as returned by the API. */
export type LatLng = [number, number];
export type LngLat = [number, number];

const R_MI = 3958.8;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMi(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.sqrt(h));
}

/** Drop vertices closer than `minMi` to the previously kept one (keeps endpoints). */
export function decimate(coords: LatLng[], minMi = 0.25): LatLng[] {
  if (coords.length < 3) return coords;
  const out: LatLng[] = [coords[0]];
  let last = coords[0];
  for (let i = 1; i < coords.length - 1; i++) {
    if (haversineMi(last, coords[i]) >= minMi) {
      out.push(coords[i]);
      last = coords[i];
    }
  }
  out.push(coords[coords.length - 1]);
  return out;
}

export const toLngLat = (coords: LatLng[]): LngLat[] => coords.map(([lat, lng]) => [lng, lat]);

export interface MeasuredLine {
  coords: LatLng[];
  cum: number[];
  total: number;
}

export function measure(coords: LatLng[]): MeasuredLine {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversineMi(coords[i - 1], coords[i]));
  return { coords, cum, total: cum[cum.length - 1] ?? 0 };
}

/** Point + bearing at a fraction (0..1) of the line length. */
export function pointAt(line: MeasuredLine, t: number): { pos: LatLng; bearing: number } {
  const target = Math.max(0, Math.min(1, t)) * line.total;
  let lo = 0;
  let hi = line.cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (line.cum[mid] < target) lo = mid;
    else hi = mid;
  }
  const a = line.coords[lo];
  const b = line.coords[Math.min(hi, line.coords.length - 1)];
  const seg = line.cum[hi] - line.cum[lo] || 1;
  const f = (target - line.cum[lo]) / seg;
  const pos: LatLng = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  return { pos, bearing: bearing(a, b) };
}

export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x =
    Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) -
    Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export function boundsOf(lines: LatLng[][]): Bounds | null {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const line of lines)
    for (const [lat, lng] of line) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  return Number.isFinite(minLat) ? { minLat, minLng, maxLat, maxLng } : null;
}

/** Web-mercator Y (unitless) for a latitude — used to place heatmap pixels correctly. */
export const mercY = (lat: number): number => Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2));

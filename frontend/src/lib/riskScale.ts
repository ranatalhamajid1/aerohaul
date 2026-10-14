import type { HeatmapPoint } from '../types';
import type { ThemeName } from './tokens';

export type HeatMetric = 'overall' | 'wind' | 'rain' | 'snow';

/**
 * Tier boundaries per metric (lower bound of Low, Moderate, High, Severe, No Travel, and a
 * visual ceiling). These mirror backend/routing/constants.py and are used ONLY to place a
 * reading on a continuous 1..6 scale for smooth visual interpolation — classification itself
 * always comes from the backend.
 */
const BREAKS: Record<Exclude<HeatMetric, 'overall'>, number[]> = {
  wind: [0, 25, 35, 45, 55, 75],
  rain: [0, 0.1, 0.25, 0.5, 1.0, 2.0],
  snow: [0, 0.5, 1.0, 2.0, 3.0, 5.0],
};

function continuous(value: number, b: number[]): number {
  for (let i = 0; i < b.length - 1; i++) {
    if (value < b[i + 1]) return 1 + i + (value - b[i]) / (b[i + 1] - b[i]);
  }
  return 5.99;
}

/** Continuous tier value in [1, 6): integer part = tier (1 Low … 5 No Travel). */
export function metricValue(p: HeatmapPoint, metric: HeatMetric): number {
  const w = continuous(p.wind_mph, BREAKS.wind);
  const r = continuous(p.rain_in_hr, BREAKS.rain);
  const s = continuous(p.snow_in_hr, BREAKS.snow);
  if (metric === 'wind') return w;
  if (metric === 'rain') return r;
  if (metric === 'snow') return s;
  // Overall honours backend load escalation via risk_score as a floor.
  return Math.min(5.99, Math.max(w, r, s, p.risk_score));
}

type Stop = [v: number, r: number, g: number, b: number, a: number];

const RAMPS: Record<ThemeName, Stop[]> = {
  dark: [
    [1.0, 63, 182, 139, 0.0],
    [1.6, 63, 182, 139, 0.18],
    [2.4, 232, 197, 71, 0.42],
    [3.4, 240, 136, 62, 0.55],
    [4.4, 229, 72, 77, 0.66],
    [5.4, 176, 46, 98, 0.78],
  ],
  light: [
    [1.0, 30, 140, 100, 0.0],
    [1.6, 30, 140, 100, 0.16],
    [2.4, 214, 170, 20, 0.4],
    [3.4, 224, 110, 30, 0.52],
    [4.4, 210, 45, 52, 0.62],
    [5.4, 128, 22, 64, 0.74],
  ],
};

const LUT_SIZE = 256;
const lutCache = new Map<ThemeName, Uint8ClampedArray>();

/** 256-entry RGBA lookup over v ∈ [1, 6). */
export function rampLut(theme: ThemeName): Uint8ClampedArray {
  const cached = lutCache.get(theme);
  if (cached) return cached;
  const stops = RAMPS[theme];
  const lut = new Uint8ClampedArray(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const v = 1 + (i / (LUT_SIZE - 1)) * 5;
    let j = 0;
    while (j < stops.length - 2 && v > stops[j + 1][0]) j++;
    const a = stops[j];
    const b = stops[j + 1];
    const t = Math.max(0, Math.min(1, (v - a[0]) / (b[0] - a[0])));
    const alpha = a[4] + (b[4] - a[4]) * t;
    lut[i * 4] = a[1] + (b[1] - a[1]) * t;
    lut[i * 4 + 1] = a[2] + (b[2] - a[2]) * t;
    lut[i * 4 + 2] = a[3] + (b[3] - a[3]) * t;
    lut[i * 4 + 3] = alpha * 255;
  }
  lutCache.set(theme, lut);
  return lut;
}

export function rampCss(theme: ThemeName): string {
  const stops = RAMPS[theme].slice(1);
  const min = stops[0][0];
  const max = stops[stops.length - 1][0];
  return `linear-gradient(90deg, ${stops
    .map(([v, r, g, b]) => `rgb(${r} ${g} ${b}) ${(((v - min) / (max - min)) * 100).toFixed(0)}%`)
    .join(', ')})`;
}

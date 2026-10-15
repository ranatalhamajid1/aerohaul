import type { HeatmapPoint } from '../types';
import type { ThemeName } from './tokens';

export type HeatMetric = 'overall' | 'wind' | 'rain' | 'snow';

/**
 * Spec thresholds:
 * Wind: 0 -> 25 -> 35 -> 45 -> 55 mph
 * Rain: 0 -> 0.10 -> 0.25 -> 0.50 -> 1.00 in/hr
 * Snow: 0 -> 0.5 -> 1.0 -> 2.0 -> 3.0 in/hr
 * Overall: 1 -> 2 -> 3 -> 4 -> 5 risk score
 */
export interface LegendTick {
  label: string;
  pos: number; // 0 to 100 percent
}

export interface MetricSpec {
  id: HeatMetric;
  label: string;
  unit: string;
  ticks: LegendTick[];
}

export const METRIC_SPECS: Record<HeatMetric, MetricSpec> = {
  overall: {
    id: 'overall',
    label: 'Overall Risk',
    unit: 'Tiers 1–5',
    ticks: [
      { label: 'Low', pos: 0 },
      { label: 'Mod', pos: 25 },
      { label: 'High', pos: 50 },
      { label: 'Sev', pos: 75 },
      { label: 'No Travel', pos: 100 },
    ],
  },
  wind: {
    id: 'wind',
    label: 'Wind Speed',
    unit: 'mph',
    ticks: [
      { label: '0', pos: 0 },
      { label: '25', pos: 25 },
      { label: '35', pos: 50 },
      { label: '45', pos: 75 },
      { label: '55+', pos: 100 },
    ],
  },
  rain: {
    id: 'rain',
    label: 'Rainfall Rate',
    unit: 'in/hr',
    ticks: [
      { label: '0', pos: 0 },
      { label: '0.10', pos: 25 },
      { label: '0.25', pos: 50 },
      { label: '0.50', pos: 75 },
      { label: '1.0+', pos: 100 },
    ],
  },
  snow: {
    id: 'snow',
    label: 'Snowfall Rate',
    unit: 'in/hr',
    ticks: [
      { label: '0', pos: 0 },
      { label: '0.5', pos: 25 },
      { label: '1.0', pos: 50 },
      { label: '2.0', pos: 75 },
      { label: '3.0+', pos: 100 },
    ],
  },
};

/**
 * Piecewise continuous interpolation from raw value to [0, 1] normalized space.
 * 0..0.25 is Low tier, 0.25..0.50 is Moderate, 0.50..0.75 is High, 0.75..1.00 is Severe/No Travel.
 * This guarantees visible variation even within the "Low" range (e.g. 13 mph vs 24 mph).
 */
export function normalizeMetric(val: number, metric: HeatMetric): number {
  if (metric === 'wind') {
    if (val <= 0) return 0;
    if (val <= 25) return (val / 25) * 0.25;
    if (val <= 35) return 0.25 + ((val - 25) / 10) * 0.25;
    if (val <= 45) return 0.50 + ((val - 35) / 10) * 0.25;
    if (val <= 55) return 0.75 + ((val - 45) / 10) * 0.25;
    return 1.0;
  }
  if (metric === 'rain') {
    if (val <= 0) return 0;
    if (val <= 0.10) return (val / 0.10) * 0.25;
    if (val <= 0.25) return 0.25 + ((val - 0.10) / 0.15) * 0.25;
    if (val <= 0.50) return 0.50 + ((val - 0.25) / 0.25) * 0.25;
    if (val <= 1.00) return 0.75 + ((val - 0.50) / 0.50) * 0.25;
    return 1.0;
  }
  if (metric === 'snow') {
    if (val <= 0) return 0;
    if (val <= 0.5) return (val / 0.5) * 0.25;
    if (val <= 1.0) return 0.25 + ((val - 0.5) / 0.5) * 0.25;
    if (val <= 2.0) return 0.50 + ((val - 1.0) / 1.0) * 0.25;
    if (val <= 3.0) return 0.75 + ((val - 2.0) / 1.0) * 0.25;
    return 1.0;
  }
  // Overall: risk_score 1..5 mapped to 0..1
  return Math.max(0, Math.min(1, (val - 1) / 4));
}

/** Get raw normalized [0, 1] value for a point and metric. */
export function metricValue(p: HeatmapPoint, metric: HeatMetric): number {
  if (metric === 'wind') return normalizeMetric(p.wind_mph, 'wind');
  if (metric === 'rain') return normalizeMetric(p.rain_in_hr, 'rain');
  if (metric === 'snow') return normalizeMetric(p.snow_in_hr, 'snow');
  // Overall uses the backend risk score (which factors in load rules)
  return normalizeMetric(p.risk_score, 'overall');
}

/**
 * Color ramp definitions:
 * Stops are [normalized_pos (0..1), R, G, B, Alpha (0..1)].
 * Low risk (pos = 0) has an alpha floor >= 0.50 so it's vividly visible across the corridor,
 * not a faint invisible haze.
 *
 * Dark theme: bright, glowing, high-luminance neon palette.
 * Light theme: deeper, rich saturated tones for maximum contrast on pale basemaps.
 */
type Stop = [t: number, r: number, g: number, b: number, a: number];

export const RAMPS: Record<ThemeName, Stop[]> = {
  dark: [
    [0.0, 46, 196, 182, 0.58],   // Vibrant Teal/Emerald (Low)
    [0.25, 242, 201, 76, 0.68],  // Bright Golden Yellow (Moderate)
    [0.50, 245, 140, 44, 0.75],  // Glowing Amber/Orange (High)
    [0.75, 235, 75, 75, 0.82],   // Coral Red (Severe)
    [1.0, 187, 45, 126, 0.88],   // Magenta/Crimson (No Travel)
  ],
  light: [
    [0.0, 16, 140, 110, 0.50],   // Deep Sea Teal (Low)
    [0.25, 195, 145, 10, 0.60],  // Golden Olive (Moderate)
    [0.50, 220, 105, 20, 0.68],  // Warm Vivid Orange (High)
    [0.75, 205, 38, 48, 0.76],   // Strong Crimson (Severe)
    [1.0, 140, 18, 70, 0.82],    // Deep Ruby Violet (No Travel)
  ],
};

const LUT_SIZE = 256;
const lutCache = new Map<ThemeName, Uint8ClampedArray>();

/** 256-entry RGBA lookup over t ∈ [0, 1]. */
export function rampLut(theme: ThemeName): Uint8ClampedArray {
  const cached = lutCache.get(theme);
  if (cached) return cached;
  const stops = RAMPS[theme];
  const lut = new Uint8ClampedArray(LUT_SIZE * 4);
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    let j = 0;
    while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
    const a = stops[j];
    const b = stops[j + 1];
    const span = b[0] - a[0];
    const factor = span > 0 ? Math.max(0, Math.min(1, (t - a[0]) / span)) : 0;
    const alpha = a[4] + (b[4] - a[4]) * factor;

    lut[i * 4] = Math.round(a[1] + (b[1] - a[1]) * factor);
    lut[i * 4 + 1] = Math.round(a[2] + (b[2] - a[2]) * factor);
    lut[i * 4 + 2] = Math.round(a[3] + (b[3] - a[3]) * factor);
    lut[i * 4 + 3] = Math.round(alpha * 255);
  }
  lutCache.set(theme, lut);
  return lut;
}

/** CSS linear-gradient string for legend rendering. */
export function rampCss(theme: ThemeName): string {
  const stops = RAMPS[theme];
  return `linear-gradient(to right, ${stops
    .map(([t, r, g, b, a]) => `rgba(${r}, ${g}, ${b}, ${a}) ${(t * 100).toFixed(0)}%`)
    .join(', ')})`;
}

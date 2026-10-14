import type { HeatmapResponse, LocationInfo, PlanResponse } from './types';

const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

export interface PlanParams {
  origin: string;
  destination: string;
  departure_time: string;
  load_weight_lb: number;
  interval_miles: number;
}

interface ApiErrorBody {
  error?: string;
  message?: string;
  errors?: Record<string, string[] | string>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as ApiErrorBody;
  if (body.errors) {
    return Object.entries(body.errors)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
      .join(' · ');
  }
  return body.error ?? body.message ?? fallback;
}

export async function fetchRoutePlan(params: PlanParams, signal?: AbortSignal): Promise<PlanResponse> {
  const res = await fetch(`${API_BASE}/plan/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) throw new Error(await readError(res, 'Failed to calculate routes.'));
  return (await res.json()) as PlanResponse;
}

export interface HeatmapParams {
  min_lat: number;
  min_lng: number;
  max_lat: number;
  max_lng: number;
  hour: number;
  departure_time?: string;
  load_weight_lb?: number;
}

export async function fetchHeatmapData(params: HeatmapParams, signal?: AbortSignal): Promise<HeatmapResponse> {
  const q = new URLSearchParams({
    min_lat: String(params.min_lat),
    min_lng: String(params.min_lng),
    max_lat: String(params.max_lat),
    max_lng: String(params.max_lng),
    hour: String(params.hour),
  });
  if (params.departure_time) q.set('departure_time', params.departure_time);
  if (params.load_weight_lb !== undefined) q.set('load_weight_lb', String(params.load_weight_lb));
  const res = await fetch(`${API_BASE}/heatmap/?${q.toString()}`, { signal });
  if (!res.ok) throw new Error(await readError(res, 'Failed to load weather heatmap.'));
  return (await res.json()) as HeatmapResponse;
}

export async function searchLocationSuggestions(query: string, signal?: AbortSignal): Promise<LocationInfo[]> {
  if (query.trim().length < 2) return [];
  const res = await fetch(`${API_BASE}/geocode/?q=${encodeURIComponent(query.trim())}&limit=5`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { suggestions?: LocationInfo[] };
  return data.suggestions ?? [];
}

import { PlanResponse, HeatmapResponse, LocationInfo } from './types';

const API_BASE = '/api';

export interface PlanParams {
  origin: string;
  destination: string;
  departure_time: string;
  load_weight_lb: number;
  interval_miles: number;
}

export async function fetchRoutePlan(params: PlanParams, signal?: AbortSignal): Promise<PlanResponse> {
  const response = await fetch(`${API_BASE}/plan/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      errorData.error ||
      errorData.message ||
      (errorData.errors ? Object.values(errorData.errors).flat().join(', ') : 'Failed to calculate routes.');
    throw new Error(message);
  }

  return response.json();
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
  const query = new URLSearchParams({
    min_lat: params.min_lat.toString(),
    min_lng: params.min_lng.toString(),
    max_lat: params.max_lat.toString(),
    max_lng: params.max_lng.toString(),
    hour: params.hour.toString(),
  });

  if (params.departure_time) {
    query.set('departure_time', params.departure_time);
  }
  if (params.load_weight_lb) {
    query.set('load_weight_lb', params.load_weight_lb.toString());
  }

  const response = await fetch(`${API_BASE}/heatmap/?${query.toString()}`, { signal });
  if (!response.ok) {
    throw new Error('Failed to load weather heatmap.');
  }
  return response.json();
}

export async function searchLocationSuggestions(query: string, signal?: AbortSignal): Promise<LocationInfo[]> {
  if (query.trim().length < 2) return [];

  const response = await fetch(`${API_BASE}/geocode/?q=${encodeURIComponent(query.trim())}&limit=5`, { signal });
  if (!response.ok) return [];

  const data = await response.json();
  return data.suggestions || [];
}

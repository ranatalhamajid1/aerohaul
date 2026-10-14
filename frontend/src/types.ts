export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Severe' | 'No Travel';

export interface LocationInfo {
  display_name: string;
  lat: number;
  lng: number;
}

export interface Checkpoint {
  index: number;
  lat: number;
  lng: number;
  mile: number;
  segment_miles: number;
  cumulative_duration_sec: number;
  eta: string;
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  temperature_f?: number;
  risk_level: RiskLevel;
  risk_score: number;
  wind_risk: RiskLevel;
  rain_risk: RiskLevel;
  snow_risk: RiskLevel;
  reasons: string[];
  load_escalated: boolean;
  escalation_reason?: string | null;
  beyond_forecast_range?: boolean;
  forecast_warning?: string | null;
}

export interface RouteSummary {
  miles_by_risk: Record<RiskLevel, number>;
  severe_miles: number;
  high_miles: number;
  no_travel_miles: number;
  moderate_miles: number;
  low_miles: number;
  avg_risk: number;
  max_risk: RiskLevel;
  has_no_travel: boolean;
  total_distance_miles: number;
}

export interface RouteOption {
  id: string;
  name: string;
  geometry: [number, number][]; // [lat, lng] pairs
  distance_mi: number;
  distance_miles?: number;
  duration: string;
  duration_seconds: number;
  diverted_via_waypoint: boolean;
  alternative_note?: string;
  checkpoints: Checkpoint[];
  summary: RouteSummary;
  recommended?: boolean;
}

export interface Recommendation {
  route_id: string;
  route_name?: string;
  explanation: string;
  all_no_travel: boolean;
  winner_summary?: RouteSummary;
}

export interface ComparisonTableRow {
  route_id: string;
  name: string;
  distance_miles: number;
  duration: string;
  duration_seconds: number;
  severe_miles: number;
  high_miles: number;
  no_travel_miles: number;
  avg_risk: number;
  max_risk: RiskLevel;
  recommended: boolean;
}

export interface PlanResponse {
  origin: LocationInfo;
  destination: LocationInfo;
  departure_time: string;
  load_weight_lb: number;
  interval_miles: number;
  routes: RouteOption[];
  recommendation: Recommendation;
  comparison_table: ComparisonTableRow[];
  corridor_bbox: {
    min_lat: number;
    min_lng: number;
    max_lat: number;
    max_lng: number;
  };
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  temperature_f: number;
  risk_level: RiskLevel;
  risk_score: number;
  intensity: number;
  reasons: string[];
}

export interface HeatmapResponse {
  forecast_hour: number;
  target_time: string;
  points: HeatmapPoint[];
  bounds: {
    min_lat: number;
    min_lng: number;
    max_lat: number;
    max_lng: number;
  };
}

import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import {
  Play,
  Pause,
  Layers,
  Thermometer,
  Wind,
  CloudRain,
  Snowflake,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { RouteOption, Checkpoint, HeatmapPoint } from '../types';
import { ROUTE_COLORS, RISK_COLORS } from '../constants';
import { fetchHeatmapData } from '../api';

interface MapViewProps {
  routes: RouteOption[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  corridorBbox?: {
    min_lat: number;
    min_lng: number;
    max_lat: number;
    max_lng: number;
  };
  departureTime?: string;
  loadWeightLb?: number;
}

type HeatmapMetric = 'overall' | 'wind' | 'rain' | 'snow';

// Helper component to auto-fit bounds on route change
function MapBoundsUpdater({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [bounds, map]);
  return null;
}

export const MapView: React.FC<MapViewProps> = ({
  routes,
  selectedRouteId,
  onSelectRoute,
  corridorBbox,
  departureTime,
  loadWeightLb,
}) => {
  // Heatmap state
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [forecastHour, setForecastHour] = useState(0);
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>('overall');
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [isHeatmapLoading, setIsHeatmapLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Cache of heatmap frames by hour to prevent refetching and flicker
  const heatmapCache = useRef<Record<number, HeatmapPoint[]>>({});

  // Compute map bounds from all routes
  const bounds = useMemo(() => {
    if (!routes || routes.length === 0) {
      return L.latLngBounds([[37.0, -109.0], [43.0, -87.0]]);
    }
    const lats: number[] = [];
    const lngs: number[] = [];
    routes.forEach((r) => {
      r.geometry.forEach(([lat, lng]) => {
        lats.push(lat);
        lngs.push(lng);
      });
    });
    return L.latLngBounds([
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ]);
  }, [routes]);

  // Fetch heatmap frame when corridor or hour changes
  useEffect(() => {
    if (!showHeatmap || !corridorBbox) return;

    if (heatmapCache.current[forecastHour]) {
      setHeatmapPoints(heatmapCache.current[forecastHour]);
      return;
    }

    let isSubscribed = true;
    setIsHeatmapLoading(true);

    fetchHeatmapData({
      min_lat: corridorBbox.min_lat,
      min_lng: corridorBbox.min_lng,
      max_lat: corridorBbox.max_lat,
      max_lng: corridorBbox.max_lng,
      hour: forecastHour,
      departure_time: departureTime,
      load_weight_lb: loadWeightLb,
    })
      .then((data) => {
        if (isSubscribed) {
          heatmapCache.current[forecastHour] = data.points;
          setHeatmapPoints(data.points);
          setIsHeatmapLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Heatmap load warning:', err);
        if (isSubscribed) setIsHeatmapLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [showHeatmap, forecastHour, corridorBbox, departureTime, loadWeightLb]);

  // Play / Pause animation for 0..48 hour timeline
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying) {
      interval = setInterval(() => {
        setForecastHour((prev) => (prev >= 48 ? 0 : prev + 3));
      }, 1200);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Get active route
  const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  return (
    <div className="relative w-full h-full bg-slate-100 overflow-hidden flex flex-col">
      <MapContainer
        center={[39.8283, -98.5795]}
        zoom={5}
        className="w-full h-full"
        zoomControl={false}
      >
        <MapBoundsUpdater bounds={bounds} />

        {/* Clean Base Tile Layer (CartoDB Positron for high-contrast logistics visualization) */}
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>, &copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />

        {/* Corridor Weather Heatmap Layer */}
        {showHeatmap &&
          heatmapPoints.map((pt, idx) => {
            const circleColor = getHeatmapColor(pt, heatmapMetric);
            const radius = Math.max(16, Math.min(32, 22 * pt.intensity));
            return (
              <CircleMarker
                key={`hm-${idx}`}
                center={[pt.lat, pt.lng]}
                radius={radius}
                pathOptions={{
                  fillColor: circleColor,
                  fillOpacity: 0.32,
                  color: circleColor,
                  weight: 1,
                  opacity: 0.5,
                }}
              >
                <Popup>
                  <div className="text-xs p-1 space-y-1">
                    <div className="font-bold text-slate-800">
                      Corridor Forecast (+{forecastHour}h)
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                        style={{ backgroundColor: RISK_COLORS[pt.risk_level].hex }}
                      >
                        {pt.risk_level} Risk
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      <div>Wind: <strong>{pt.wind_mph.toFixed(1)} mph</strong></div>
                      <div>Rain: <strong>{pt.rain_in_hr.toFixed(2)} in/hr</strong></div>
                      <div>Snow: <strong>{pt.snow_in_hr.toFixed(2)} in/hr</strong></div>
                      <div>Temp: <strong>{pt.temperature_f.toFixed(0)}°F</strong></div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        {/* Route Polylines */}
        {routes.map((route, idx) => {
          const isSelected = route.id === activeRoute?.id;
          const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
          return (
            <Polyline
              key={route.id}
              positions={route.geometry}
              eventHandlers={{
                click: () => onSelectRoute(route.id),
              }}
              pathOptions={{
                color: color,
                weight: isSelected ? 6 : 3.5,
                opacity: isSelected ? 0.95 : 0.45,
                dashArray: isSelected ? undefined : '4, 8',
              }}
            />
          );
        })}

        {/* Checkpoint Markers for the Selected Route */}
        {activeRoute &&
          activeRoute.checkpoints.map((cp: Checkpoint) => {
            const riskConfig = RISK_COLORS[cp.risk_level] || RISK_COLORS['Low'];
            const isSevereOrNoTravel =
              cp.risk_level === 'Severe' || cp.risk_level === 'No Travel';

            return (
              <CircleMarker
                key={`cp-${cp.index}`}
                center={[cp.lat, cp.lng]}
                radius={isSevereOrNoTravel ? 9 : 6.5}
                pathOptions={{
                  fillColor: riskConfig.hex,
                  fillOpacity: 0.95,
                  color: isSevereOrNoTravel ? '#ffffff' : '#334155',
                  weight: isSevereOrNoTravel ? 2.5 : 1.5,
                }}
              >
                <Popup>
                  <div className="text-xs p-1 min-w-[210px] space-y-1.5">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b pb-1">
                      <span className="font-bold text-slate-800">
                        Mile {cp.mile.toFixed(0)}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-xs"
                        style={{ backgroundColor: riskConfig.hex }}
                      >
                        {cp.risk_level}
                      </span>
                    </div>

                    {/* ETA */}
                    <div className="text-[11px] text-slate-600">
                      <span>Arrival ETA: </span>
                      <strong className="text-slate-800">
                        {new Date(cp.eta).toLocaleTimeString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </strong>
                    </div>

                    {/* Weather Stats Grid */}
                    <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-2 rounded border border-slate-100 text-[10px]">
                      <div>
                        <span className="text-slate-400 block">Wind (mph)</span>
                        <strong className="text-slate-700 text-xs">
                          {cp.wind_mph.toFixed(1)} mph
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Rain (in/hr)</span>
                        <strong className="text-slate-700 text-xs">
                          {cp.rain_in_hr.toFixed(2)} in/hr
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Snow (in/hr)</span>
                        <strong className="text-slate-700 text-xs">
                          {cp.snow_in_hr.toFixed(2)} in/hr
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Temp</span>
                        <strong className="text-slate-700 text-xs">
                          {cp.temperature_f ? `${cp.temperature_f.toFixed(0)}°F` : '--'}
                        </strong>
                      </div>
                    </div>

                    {/* Reasons & Escalation notes */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                        Risk Analysis
                      </span>
                      <ul className="text-[10px] text-slate-600 space-y-0.5 pl-3 list-disc">
                        {cp.reasons.map((r, rIdx) => (
                          <li
                            key={rIdx}
                            className={
                              r.includes('No Travel') || r.includes('Severe')
                                ? 'text-rose-900 font-semibold'
                                : ''
                            }
                          >
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Horizon warnings if applicable */}
                    {cp.forecast_warning && (
                      <div className="text-[10px] text-amber-800 bg-amber-50 p-1 rounded border border-amber-200">
                        ⚠ {cp.forecast_warning}
                      </div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
      </MapContainer>

      {/* Floating Weather Timeline & Heatmap Controls (Top Right) */}
      <div className="absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 p-3.5 max-w-sm w-full space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Layers className="w-4 h-4 text-blue-600" />
            <span>Corridor Weather Forecast</span>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
              className="rounded accent-blue-600"
            />
            <span>Heatmap Overlay</span>
          </label>
        </div>

        {showHeatmap && (
          <>
            {/* Metric Selector */}
            <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg text-[10px] font-medium">
              {(
                [
                  { id: 'overall', label: 'Overall', icon: ShieldAlert },
                  { id: 'wind', label: 'Wind', icon: Wind },
                  { id: 'rain', label: 'Rain', icon: CloudRain },
                  { id: 'snow', label: 'Snow', icon: Snowflake },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => setHeatmapMetric(m.id)}
                    className={`py-1 px-1.5 rounded flex items-center justify-center gap-1 cursor-pointer transition ${
                      heatmapMetric === m.id
                        ? 'bg-white text-blue-700 shadow-xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Timeline Slider with Play / Pause */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">
                  Forecast Hour: <span className="text-blue-600 font-bold">+{forecastHour}h</span>
                </span>
                <span className="text-[10px] text-slate-400">0h &rarr; 48h Horizon</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer shrink-0"
                  title={isPlaying ? 'Pause timeline animation' : 'Play timeline animation'}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>

                <input
                  type="range"
                  min="0"
                  max="48"
                  step="1"
                  value={forecastHour}
                  onChange={(e) => setForecastHour(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Floating Risk Legend (Bottom Right) */}
      <div className="absolute bottom-4 right-4 z-20 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200/80 p-3 text-[11px] space-y-1.5">
        <span className="font-bold text-slate-800 block text-xs border-b pb-1">
          Checkpoint Risk Legend
        </span>
        <div className="grid grid-cols-1 gap-1 text-[10px]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            <span>Low (&lt;25 mph, &lt;0.10 in/hr rain)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0" />
            <span>Moderate (25–34 mph, 0.10–0.25 in/hr)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0" />
            <span>High (35–44 mph, 0.25–0.50 in/hr)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
            <span>Severe (45–54 mph, or load &gt;40k lb)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-950 shrink-0 ring-1 ring-rose-400" />
            <span className="font-bold text-rose-950">No Travel (&ge;55 mph or 45–54 mph + &gt;30k lb)</span>
          </div>
        </div>
      </div>
    </div>
  );
};

function getHeatmapColor(point: HeatmapPoint, metric: HeatmapMetric): string {
  if (metric === 'wind') {
    if (point.wind_mph >= 55) return '#881337';
    if (point.wind_mph >= 45) return '#EF4444';
    if (point.wind_mph >= 35) return '#F97316';
    if (point.wind_mph >= 25) return '#F59E0B';
    return '#10B981';
  }
  if (metric === 'rain') {
    if (point.rain_in_hr > 1.0) return '#881337';
    if (point.rain_in_hr >= 0.5) return '#EF4444';
    if (point.rain_in_hr >= 0.25) return '#F97316';
    if (point.rain_in_hr >= 0.1) return '#F59E0B';
    return '#10B981';
  }
  if (metric === 'snow') {
    if (point.snow_in_hr > 3.0) return '#881337';
    if (point.snow_in_hr >= 2.0) return '#EF4444';
    if (point.snow_in_hr >= 1.0) return '#F97316';
    if (point.snow_in_hr >= 0.5) return '#F59E0B';
    return '#10B981';
  }
  // Overall Risk
  return RISK_COLORS[point.risk_level]?.hex || '#10B981';
}

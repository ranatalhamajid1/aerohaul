import React from 'react';
import { Award, Clock, ArrowRight, AlertTriangle, ShieldAlert, Sparkles, ChevronRight } from 'lucide-react';
import { RouteOption } from '../types';
import { ROUTE_COLORS, RISK_COLORS } from '../constants';

interface RouteCardProps {
  route: RouteOption;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

export const RouteCard: React.FC<RouteCardProps> = ({ route, index, isSelected, onSelect }) => {
  const color = ROUTE_COLORS[index % ROUTE_COLORS.length];
  const summary = route.summary;
  const isRecommended = !!route.recommended;

  const totalMiles = summary.total_distance_miles || route.distance_mi || 1;
  const lowPct = Math.round((summary.low_miles / totalMiles) * 100);
  const modPct = Math.round((summary.moderate_miles / totalMiles) * 100);
  const highPct = Math.round((summary.high_miles / totalMiles) * 100);
  const severePct = Math.round((summary.severe_miles / totalMiles) * 100);
  const noTravelPct = Math.round((summary.no_travel_miles / totalMiles) * 100);

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border transition-all p-3.5 cursor-pointer relative ${
        isSelected
          ? 'bg-blue-50/40 border-blue-500 shadow-md ring-1 ring-blue-500'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="w-3.5 h-3.5 rounded-full ring-2 ring-white shadow-sm shrink-0"
            style={{ backgroundColor: color }}
          />
          <h2 className="text-xs font-bold text-slate-800 truncate m-0">
            {route.name}
          </h2>
        </div>

        {isRecommended && (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Award className="w-3.5 h-3.5 text-emerald-600" />
            Recommended
          </span>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-center mb-2.5">
        <div>
          <div className="text-[10px] text-slate-400 font-medium">Distance</div>
          <div className="text-xs font-bold text-slate-800">{route.distance_mi.toFixed(1)} mi</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-medium">Drive Time</div>
          <div className="text-xs font-bold text-slate-800">{route.duration}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 font-medium">Avg Risk Score</div>
          <div className={`text-xs font-bold ${summary.avg_risk > 2.5 ? 'text-amber-700' : 'text-slate-800'}`}>
            {summary.avg_risk.toFixed(2)} <span className="text-[10px] text-slate-400 font-normal">/ 5.0</span>
          </div>
        </div>
      </div>

      {/* Stacked Risk Distribution Bar */}
      <div className="mb-2">
        <div className="flex justify-between items-center text-[10px] text-slate-500 mb-1">
          <span>Weather Risk Profile</span>
          <span>{summary.total_distance_miles} mi evaluated</span>
        </div>
        <div className="h-2 w-full rounded-full overflow-hidden flex bg-slate-100">
          {summary.low_miles > 0 && (
            <div
              style={{ width: `${(summary.low_miles / totalMiles) * 100}%` }}
              className="bg-emerald-500 h-full"
              title={`Low Risk: ${summary.low_miles} mi (${lowPct}%)`}
            />
          )}
          {summary.moderate_miles > 0 && (
            <div
              style={{ width: `${(summary.moderate_miles / totalMiles) * 100}%` }}
              className="bg-amber-400 h-full"
              title={`Moderate Risk: ${summary.moderate_miles} mi (${modPct}%)`}
            />
          )}
          {summary.high_miles > 0 && (
            <div
              style={{ width: `${(summary.high_miles / totalMiles) * 100}%` }}
              className="bg-orange-500 h-full"
              title={`High Risk: ${summary.high_miles} mi (${highPct}%)`}
            />
          )}
          {summary.severe_miles > 0 && (
            <div
              style={{ width: `${(summary.severe_miles / totalMiles) * 100}%` }}
              className="bg-red-500 h-full"
              title={`Severe Risk: ${summary.severe_miles} mi (${severePct}%)`}
            />
          )}
          {summary.no_travel_miles > 0 && (
            <div
              style={{ width: `${(summary.no_travel_miles / totalMiles) * 100}%` }}
              className="bg-rose-950 h-full"
              title={`No Travel Risk: ${summary.no_travel_miles} mi (${noTravelPct}%)`}
            />
          )}
        </div>
      </div>

      {/* Risk Badges */}
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {summary.no_travel_miles > 0 ? (
          <span className="flex items-center gap-1 font-semibold px-2 py-0.5 rounded bg-rose-950 text-rose-100">
            <ShieldAlert className="w-3 h-3 text-rose-300" />
            {summary.no_travel_miles.toFixed(1)} mi No Travel
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium border border-emerald-200">
            0 No Travel miles
          </span>
        )}

        {summary.severe_miles > 0 && (
          <span className="flex items-center gap-1 font-medium px-2 py-0.5 rounded bg-red-100 text-red-800">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            {summary.severe_miles.toFixed(1)} mi Severe
          </span>
        )}

        {summary.high_miles > 0 && (
          <span className="font-medium px-2 py-0.5 rounded bg-orange-100 text-orange-800">
            {summary.high_miles.toFixed(1)} mi High
          </span>
        )}
      </div>

      {/* Alternative detour info if synthesized */}
      {route.diverted_via_waypoint && route.alternative_note && (
        <div className="mt-2 text-[10px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100">
          ℹ {route.alternative_note}
        </div>
      )}
    </div>
  );
};

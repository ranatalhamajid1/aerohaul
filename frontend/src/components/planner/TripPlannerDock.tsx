import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Navigation,
  ArrowUpDown,
  Calendar,
  Weight,
  Ruler,
  AlertTriangle,
  ChevronRight,
  Edit3,
  CheckCircle2,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import type { PlanParams } from '../../api';
import type { PlanResponse, LocationInfo, RouteOption } from '../../types';
import { searchLocationSuggestions } from '../../api';
import { PLAN_STEPS } from '../../hooks/usePlan';
import { defaultDepartureLocal } from '../../lib/scenarios';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { RiskBadge } from '../ui/RiskBadge';
import { Stat } from '../ui/Stat';
import { StackedRiskBar } from '../ui/StackedRiskBar';
import { useCountUp } from '../../hooks/useCountUp';
import { ROUTE_TOKENS, type ThemeName } from '../../lib/tokens';

interface TripPlannerDockProps {
  onPlan: (params: PlanParams) => void;
  isPending: boolean;
  planningStep: number;
  planResult: PlanResponse | null;
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  initialValues?: Partial<PlanParams>;
  theme: ThemeName;
}

export const TripPlannerDock: React.FC<TripPlannerDockProps> = ({
  onPlan,
  isPending,
  planningStep,
  planResult,
  selectedRouteId,
  onSelectRoute,
  initialValues,
  theme,
}) => {
  const [isEditing, setIsEditing] = useState(!planResult);
  const [origin, setOrigin] = useState(initialValues?.origin || 'Chicago, IL');
  const [destination, setDestination] = useState(initialValues?.destination || 'Denver, CO');
  const [departureTime, setDepartureTime] = useState(
    initialValues?.departure_time ? initialValues.departure_time.slice(0, 16) : defaultDepartureLocal(),
  );
  const [loadWeight, setLoadWeight] = useState<number>(initialValues?.load_weight_lb ?? 45000);
  const [intervalMiles, setIntervalMiles] = useState<number>(initialValues?.interval_miles ?? 25);

  const [originSuggestions, setOriginSuggestions] = useState<LocationInfo[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<LocationInfo[]>([]);
  const [showOriginList, setShowOriginList] = useState(false);
  const [showDestList, setShowDestList] = useState(false);

  // Sync initialValues
  useEffect(() => {
    if (initialValues?.origin) setOrigin(initialValues.origin);
    if (initialValues?.destination) setDestination(initialValues.destination);
    if (initialValues?.departure_time) setDepartureTime(initialValues.departure_time.slice(0, 16));
    if (initialValues?.load_weight_lb !== undefined) setLoadWeight(initialValues.load_weight_lb);
    if (initialValues?.interval_miles) setIntervalMiles(initialValues.interval_miles);
  }, [initialValues]);

  // Collapse editing view when new plan arrives
  useEffect(() => {
    if (planResult) setIsEditing(false);
  }, [planResult]);

  // Autocomplete debouncing
  useEffect(() => {
    const t = setTimeout(async () => {
      if (origin.length >= 3 && showOriginList) {
        setOriginSuggestions(await searchLocationSuggestions(origin));
      }
    }, 280);
    return () => clearTimeout(t);
  }, [origin, showOriginList]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (destination.length >= 3 && showDestList) {
        setDestSuggestions(await searchLocationSuggestions(destination));
      }
    }, 280);
    return () => clearTimeout(t);
  }, [destination, showDestList]);

  const handleSwap = () => {
    const tmp = origin;
    setOrigin(destination);
    setDestination(tmp);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin.trim() || !destination.trim()) return;
    onPlan({
      origin: origin.trim(),
      destination: destination.trim(),
      departure_time: new Date(departureTime).toISOString(),
      load_weight_lb: Number(loadWeight),
      interval_miles: intervalMiles,
    });
  };

  const selectedRoute =
    planResult?.routes.find((r) => r.id === selectedRouteId) || planResult?.routes[0];

  const animatedMiles = useCountUp(selectedRoute?.distance_mi ?? 0);
  const animatedAvgRisk = useCountUp(selectedRoute?.summary.avg_risk ?? 0);

  return (
    <Panel className="w-full md:w-[392px] max-h-[calc(100vh-100px)] overflow-y-auto scroll-thin p-4 shadow-panel border hairline flex flex-col gap-4">
      {/* ───────────────── Planning Progress State ───────────────── */}
      {isPending && (
        <div className="py-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
            <h2 className="font-display font-bold text-sm tracking-tight text-ink m-0">
              OPTIMIZING CORRIDORS
            </h2>
          </div>
          <p className="text-xs text-muted leading-relaxed m-0">
            Evaluating multi-route aerodynamics, hourly Open-Meteo forecasts, and load rules...
          </p>

          <div className="space-y-2 pt-2">
            {PLAN_STEPS.map((name, i) => {
              const isDone = planningStep > i;
              const isCurrent = planningStep === i;
              return (
                <div
                  key={name}
                  className={`flex items-center justify-between p-2.5 rounded-[10px] text-xs font-mono border hairline transition-all ${
                    isDone
                      ? 'bg-surface text-ink border-accent/30'
                      : isCurrent
                      ? 'bg-accent/10 text-accent border-accent/40 font-bold'
                      : 'text-muted/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] opacity-60">0{i + 1}</span>
                    <span>{name}</span>
                  </span>
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                  ) : isCurrent ? (
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-line/20" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ───────────────── Form State (Editing) ───────────────── */}
      {!isPending && (isEditing || !planResult) && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between border-b hairline pb-2">
            <div className="flex items-center gap-2 text-ink font-display font-bold text-xs">
              <Navigation className="w-3.5 h-3.5 text-accent" />
              <span>TRIP PLANNER</span>
            </div>
            {planResult && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-[11px] font-mono text-muted hover:text-ink cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Origin & Destination */}
          <div className="space-y-2.5 relative">
            {/* Origin */}
            <div className="relative">
              <label className="eyebrow block mb-1">ORIGIN HUB</label>
              <input
                type="text"
                value={origin}
                onChange={(e) => {
                  setOrigin(e.target.value);
                  setShowOriginList(true);
                }}
                onFocus={() => setShowOriginList(true)}
                required
                className="field text-xs font-sans font-medium"
                placeholder="e.g. Chicago, IL"
              />
              {showOriginList && originSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 glass rounded-[10px] shadow-lift max-h-44 overflow-y-auto border hairline">
                  {originSuggestions.map((s, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => {
                        setOrigin(s.display_name.split(',')[0] + ', ' + (s.display_name.split(',')[1] || '').trim());
                        setShowOriginList(false);
                      }}
                      className="w-full text-left text-xs px-3 py-2 hover:bg-surface text-ink truncate border-b hairline last:border-0 cursor-pointer"
                    >
                      {s.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Swap Button */}
            <div className="flex justify-end -my-1 pr-2">
              <button
                type="button"
                onClick={handleSwap}
                className="p-1 rounded-[6px] hover:bg-surface text-muted hover:text-accent transition cursor-pointer"
                title="Swap origin and destination"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Destination */}
            <div className="relative">
              <label className="eyebrow block mb-1">DESTINATION HUB</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setShowDestList(true);
                }}
                onFocus={() => setShowDestList(true)}
                required
                className="field text-xs font-sans font-medium"
                placeholder="e.g. Denver, CO"
              />
              {showDestList && destSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 glass rounded-[10px] shadow-lift max-h-44 overflow-y-auto border hairline">
                  {destSuggestions.map((s, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => {
                        setDestination(s.display_name.split(',')[0] + ', ' + (s.display_name.split(',')[1] || '').trim());
                        setShowDestList(false);
                      }}
                      className="w-full text-left text-xs px-3 py-2 hover:bg-surface text-ink truncate border-b hairline last:border-0 cursor-pointer"
                    >
                      {s.display_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Departure & Interval */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="eyebrow block mb-1">DEPARTURE</label>
              <input
                type="datetime-local"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                required
                className="field text-xs font-mono"
              />
            </div>
            <div>
              <label className="eyebrow block mb-1">CHECKPOINT STEP</label>
              <div className="grid grid-cols-3 gap-1 bg-surface/60 p-1 rounded-[10px] border hairline">
                {[10, 25, 50].map((step) => (
                  <button
                    type="button"
                    key={step}
                    onClick={() => setIntervalMiles(step)}
                    className={`text-[11px] font-mono py-1 rounded-[6px] transition cursor-pointer ${
                      intervalMiles === step ? 'bg-accent text-accent-ink font-bold' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {step}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Gross Load Weight & Rules Notice */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <label className="eyebrow">GROSS LOAD WEIGHT</label>
              <span className="num text-xs font-bold text-ink">
                {loadWeight.toLocaleString()} <span className="text-[10px] font-mono text-muted">lb</span>
              </span>
            </div>

            <input
              type="range"
              min="5000"
              max="80000"
              step="1000"
              value={loadWeight}
              onChange={(e) => setLoadWeight(Number(e.target.value))}
              className="w-full accent-accent cursor-pointer h-1.5 bg-line/20 rounded-lg"
            />

            {/* Quick weight chips */}
            <div className="flex gap-1 justify-end pt-0.5">
              {[25000, 35000, 45000, 65000].map((w) => (
                <button
                  type="button"
                  key={w}
                  onClick={() => setLoadWeight(w)}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-[6px] border hairline cursor-pointer transition ${
                    loadWeight === w ? 'bg-accent text-accent-ink font-bold' : 'text-muted hover:text-ink'
                  }`}
                >
                  {w / 1000}k
                </button>
              ))}
            </div>

            {/* Active Escalation Threshold Notice */}
            <div className="mt-2 p-2.5 rounded-[10px] bg-surface/80 border hairline space-y-1 text-[11px]">
              <div className="flex items-center gap-1.5 text-muted text-[10px] font-mono uppercase tracking-wider">
                <Info className="w-3 h-3 text-accent" />
                <span>Active Load Rules</span>
              </div>
              <div className="space-y-0.5 pl-4 text-[10.5px]">
                <div className={loadWeight > 30000 ? 'text-ink font-semibold' : 'text-muted/60'}>
                  • &gt;30k lb: Wind 45–54 mph &rarr; <span className="text-risk-notravel font-bold">NO TRAVEL</span>
                </div>
                <div className={loadWeight > 40000 ? 'text-ink font-semibold' : 'text-muted/60'}>
                  • &gt;40k lb: Wind 35–44 mph &rarr; <span className="text-risk-severe font-bold">SEVERE</span>
                </div>
              </div>
            </div>
          </div>

          <Button type="submit" variant="primary" size="md" className="w-full">
            Analyze Safety & Compute Routes
          </Button>
        </form>
      )}

      {/* ───────────────── Results Hero Card & Switcher ───────────────── */}
      {!isPending && !isEditing && planResult && (
        <div className="space-y-3.5">
          {/* Header Bar with Edit Button */}
          <div className="flex items-center justify-between border-b hairline pb-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              <span className="font-display font-bold text-xs tracking-tight text-ink">
                MISSION OVERVIEW
              </span>
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="text-[11px] font-sans font-medium text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Edit3 className="w-3 h-3" />
              Edit Plan
            </button>
          </div>

          {/* Recommendation Banner / Hero */}
          <div className="rounded-[14px] p-3.5 bg-surface/90 border hairline space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="shimmer-once inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-accent text-accent-ink">
                  <Sparkles className="w-3 h-3" />
                  RECOMMENDED
                </span>
              </div>
              <span className="text-[10px] font-mono text-muted">
                {planResult.load_weight_lb.toLocaleString()} lb load
              </span>
            </div>

            <p className="text-xs text-ink leading-relaxed m-0 font-sans">
              {planResult.recommendation.explanation}
            </p>
          </div>

          {/* Route Alternatives Switcher */}
          <div className="space-y-1.5">
            <div className="eyebrow px-0.5">ALTERNATIVE CORRIDORS</div>
            <div className="grid grid-cols-3 gap-1.5">
              {planResult.routes.map((r: RouteOption, idx: number) => {
                const isSel = r.id === selectedRouteId;
                const token = ROUTE_TOKENS[idx % ROUTE_TOKENS.length];
                return (
                  <button
                    key={r.id}
                    onClick={() => onSelectRoute(r.id)}
                    className={`relative p-2.5 rounded-[12px] border text-left transition cursor-pointer flex flex-col justify-between ${
                      isSel
                        ? 'bg-surface border-accent/60 shadow-xs'
                        : 'bg-surface/40 hover:bg-surface/70 border-line/10'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full ring-1 ring-white/20 shrink-0"
                        style={{ backgroundColor: token.hex[theme] }}
                      />
                      <span className="text-[11px] font-display font-bold text-ink truncate">
                        {r.name.split('(')[0].trim()}
                      </span>
                    </div>

                    <div className="num text-xs font-semibold text-ink">
                      {r.distance_mi.toFixed(0)} mi
                    </div>
                    <div className="text-[10px] font-mono text-muted">
                      {r.duration}
                    </div>

                    {isSel && (
                      <motion.div
                        layoutId="active-route-indicator"
                        className="absolute inset-0 rounded-[12px] ring-2 ring-accent pointer-events-none"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Route Live Key Stats */}
          {selectedRoute && (
            <div className="rounded-[14px] p-3.5 bg-surface/70 border hairline space-y-3">
              <div className="grid grid-cols-3 gap-2 border-b hairline pb-3">
                <Stat
                  label="DISTANCE"
                  value={animatedMiles.toFixed(0)}
                  unit="mi"
                />
                <Stat
                  label="DRIVE TIME"
                  value={selectedRoute.duration}
                />
                <Stat
                  label="AVG RISK"
                  value={animatedAvgRisk.toFixed(2)}
                  unit="/ 5.0"
                  highlight={selectedRoute.summary.avg_risk > 2.5}
                />
              </div>

              {/* Stacked Risk Profile */}
              <StackedRiskBar summary={selectedRoute.summary} showLabels height={7} />

              {/* Badges Row */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedRoute.summary.no_travel_miles > 0 ? (
                  <RiskBadge level="No Travel" size="sm" />
                ) : (
                  <RiskBadge level="Low" size="sm" />
                )}
                {selectedRoute.summary.severe_miles > 0 && (
                  <RiskBadge level="Severe" size="sm" />
                )}
                {selectedRoute.summary.high_miles > 0 && (
                  <RiskBadge level="High" size="sm" />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

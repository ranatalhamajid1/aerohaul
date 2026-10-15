import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTheme } from './hooks/useTheme';
import { usePlan } from './hooks/usePlan';
import { useHeatmapFrames } from './hooks/useHeatmapFrames';
import { useIsMobile } from './hooks/useMediaQuery';
import { Header } from './components/nav/Header';
import { MapContainerView } from './components/map/MapContainerView';
import { TripPlannerDock } from './components/planner/TripPlannerDock';
import { JourneyTimeline } from './components/results/JourneyTimeline';
import { ForecastTimelineBar } from './components/timeline/ForecastTimelineBar';
import { ComparisonModal } from './components/modal/ComparisonModal';
import type { PlanResponse } from './types';
import type { PlanParams } from './api';
import type { Scenario } from './lib/scenarios';
import { SCENARIOS, defaultDepartureLocal } from './lib/scenarios';
import { AlertCircle } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 15,
    },
  },
});

function FreightMissionControl() {
  const [theme, toggleTheme] = useTheme();
  const [planResult, setPlanResult] = useState<PlanResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'plan' | 'routes' | 'journey'>('plan');

  const [formValues, setFormValues] = useState<Partial<PlanParams>>({
    origin: 'Chicago, IL',
    destination: 'Denver, CO',
    departure_time: defaultDepartureLocal(),
    load_weight_lb: 45000,
    interval_miles: 25,
  });

  const { plan, isPending, error, step } = usePlan((data) => {
    setPlanResult(data);
    setSelectedRouteId(data.recommendation.route_id || data.routes[0]?.id || null);
    setMobileTab('routes');
  });

  // Prefetch heatmap frames when plan exists
  const heatmapFrames = useHeatmapFrames(planResult);
  const isMobile = useIsMobile();

  // Run Chicago -> Denver 45k lb assessment scenario on first load
  useEffect(() => {
    const defaultParams: PlanParams = {
      origin: 'Chicago, IL',
      destination: 'Denver, CO',
      departure_time: new Date(defaultDepartureLocal()).toISOString(),
      load_weight_lb: 45000,
      interval_miles: 25,
    };
    plan(defaultParams);
  }, []);

  const handleSelectScenario = (sc: Scenario) => {
    const params: PlanParams = {
      origin: sc.origin,
      destination: sc.destination,
      departure_time: new Date(defaultDepartureLocal()).toISOString(),
      load_weight_lb: sc.load_weight_lb,
      interval_miles: 25,
    };
    setFormValues(params);
    plan(params);
  };

  const selectedRoute =
    planResult?.routes.find((r) => r.id === selectedRouteId) || planResult?.routes[0] || null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-ink">
      {/* ───────────────── Full-Bleed Map (Base Layer) ───────────────── */}
      <MapContainerView
        theme={theme}
        plan={planResult}
        selectedRouteId={selectedRouteId}
        onSelectRoute={(id) => setSelectedRouteId(id)}
        heatmapFrames={heatmapFrames}
      />

      {/* ───────────────── Top Flight-Deck Header ───────────────── */}
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onSelectScenario={handleSelectScenario}
        onOpenComparison={() => setIsComparisonOpen(true)}
        hasPlan={!!planResult}
      />

      {/* ───────────────── Desktop Left Dock (Trip Planner & Results) ───────────────── */}
      <div className="hidden md:block absolute top-20 left-4 z-20 pointer-events-auto">
        <TripPlannerDock
          onPlan={plan}
          isPending={isPending}
          planningStep={step}
          planResult={planResult}
          selectedRouteId={selectedRouteId}
          onSelectRoute={(id) => setSelectedRouteId(id)}
          initialValues={formValues}
          theme={theme}
        />
      </div>

      {/* ───────────────── Desktop Right Dock (Journey Waypoint Log) ───────────────── */}
      {planResult && (
        <div className="hidden md:block absolute top-20 right-4 z-20 pointer-events-auto">
          <JourneyTimeline route={selectedRoute} />
        </div>
      )}

      {/* ───────────────── Floating Bottom Forecast Timeline Bar ───────────────── */}
      <div className="absolute bottom-4 left-4 right-4 z-20 pointer-events-none">
        <ForecastTimelineBar
          departureTime={planResult?.departure_time}
          heatmapFrames={heatmapFrames}
          theme={theme}
          loadWeight={planResult?.load_weight_lb}
        />
      </div>

      {/* ───────────────── Mobile Bottom Sheet ───────────────── */}
      {isMobile && (
        <div className="md:hidden absolute bottom-24 left-3 right-3 z-30 pointer-events-auto max-h-[55vh] overflow-y-auto">
          <div className="flex gap-1 mb-2 bg-surface p-1 rounded-xl glass">
            {(['plan', 'routes', 'journey'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setMobileTab(tab)}
                className={`flex-1 py-1.5 text-xs font-mono uppercase rounded-lg transition ${
                  mobileTab === tab ? 'bg-accent text-accent-ink font-bold' : 'text-muted'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {mobileTab === 'plan' && (
            <TripPlannerDock
              onPlan={plan}
              isPending={isPending}
              planningStep={step}
              planResult={planResult}
              selectedRouteId={selectedRouteId}
              onSelectRoute={(id) => setSelectedRouteId(id)}
              initialValues={formValues}
              theme={theme}
            />
          )}

          {mobileTab === 'routes' && planResult && (
            <TripPlannerDock
              onPlan={plan}
              isPending={isPending}
              planningStep={step}
              planResult={planResult}
              selectedRouteId={selectedRouteId}
              onSelectRoute={(id) => setSelectedRouteId(id)}
              initialValues={formValues}
              theme={theme}
            />
          )}

          {mobileTab === 'journey' && planResult && (
            <JourneyTimeline route={selectedRoute} />
          )}
        </div>
      )}

      {/* ───────────────── Error Toast ───────────────── */}
      {error && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 glass rounded-panel p-3 border border-risk-severe/50 text-xs text-risk-severe flex items-center gap-2 shadow-lift">
          <AlertCircle className="w-4 h-4 text-risk-severe shrink-0" />
          <span>{error.message}</span>
        </div>
      )}

      {/* ───────────────── Decision Matrix Modal ───────────────── */}
      <ComparisonModal
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        rows={planResult?.comparison_table || []}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FreightMissionControl />
    </QueryClientProvider>
  );
}

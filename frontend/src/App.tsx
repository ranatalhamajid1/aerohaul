import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { Navbar } from './components/Navbar';
import { RoutingForm } from './components/RoutingForm';
import { RouteCard } from './components/RouteCard';
import { RecommendationBanner } from './components/RecommendationBanner';
import { MapView } from './components/MapView';
import { ComparisonTableModal } from './components/ComparisonTableModal';
import { CheckpointTable } from './components/CheckpointTable';
import { fetchRoutePlan, PlanParams } from './api';
import { PlanResponse, RouteOption } from './types';
import { RoutePreset, SAMPLE_PRESETS } from './constants';
import { AlertCircle, Loader2 } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 mins
    },
  },
});

function TruckRouterApp() {
  const [planResult, setPlanResult] = useState<PlanResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form values state for presets
  const [formValues, setFormValues] = useState<Partial<PlanParams>>({
    origin: 'Chicago, IL',
    destination: 'Denver, CO',
    load_weight_lb: 45000,
    interval_miles: 25,
  });

  const planMutation = useMutation({
    mutationFn: (params: PlanParams) => fetchRoutePlan(params),
    onSuccess: (data) => {
      setPlanResult(data);
      setSelectedRouteId(data.recommendation.route_id || data.routes[0]?.id || null);
      setErrorMessage(null);
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || 'Failed to calculate routes.');
    },
  });

  // Automatically plan default scenario on initial load
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 2);
    tomorrow.setMinutes(0);
    tomorrow.setSeconds(0);

    const defaultParams: PlanParams = {
      origin: 'Chicago, IL',
      destination: 'Denver, CO',
      departure_time: tomorrow.toISOString(),
      load_weight_lb: 45000,
      interval_miles: 25,
    };
    planMutation.mutate(defaultParams);
  }, []);

  const handleSelectPreset = (preset: RoutePreset) => {
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 2);

    const params: PlanParams = {
      origin: preset.origin,
      destination: preset.destination,
      departure_time: tomorrow.toISOString(),
      load_weight_lb: preset.load_weight_lb,
      interval_miles: 25,
    };

    setFormValues(params);
    planMutation.mutate(params);
  };

  const selectedRoute =
    planResult?.routes.find((r) => r.id === selectedRouteId) || planResult?.routes[0];

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100">
      {/* Top Navigation */}
      <Navbar
        onSelectPreset={handleSelectPreset}
        onOpenTable={() => setIsTableModalOpen(true)}
        hasRoutes={!!planResult?.routes && planResult.routes.length > 0}
      />

      {/* Main Content: Left Control Panel + Right Full-Height Map */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-full md:w-[440px] lg:w-[480px] h-full flex flex-col bg-slate-50 border-r border-slate-200 z-10 shadow-sm shrink-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Trip Configuration Form */}
            <RoutingForm
              onSubmit={(params) => planMutation.mutate(params)}
              isLoading={planMutation.isPending}
              initialValues={formValues}
            />

            {/* Error Message Toast */}
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2 shadow-xs">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold block">Routing Notice</span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {/* Results Section */}
            {planResult && (
              <div className="space-y-3.5">
                {/* Recommendation Banner */}
                <RecommendationBanner
                  recommendation={planResult.recommendation}
                  onOpenTable={() => setIsTableModalOpen(true)}
                />

                {/* Route Alternatives Header */}
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 pt-1">
                  <span>3 Alternative Highway Corridors</span>
                  <span className="text-[10px] text-slate-400 font-normal">Click to focus route</span>
                </div>

                {/* Route Cards */}
                <div className="space-y-2.5">
                  {planResult.routes.map((route: RouteOption, idx: number) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      index={idx}
                      isSelected={route.id === selectedRouteId}
                      onSelect={() => setSelectedRouteId(route.id)}
                    />
                  ))}
                </div>

                {/* Selected Route Checkpoint Details */}
                {selectedRoute && <CheckpointTable route={selectedRoute} />}
              </div>
            )}
          </div>
        </aside>

        {/* Right Map View */}
        <main className="flex-1 h-full relative">
          <MapView
            routes={planResult?.routes || []}
            selectedRouteId={selectedRouteId}
            onSelectRoute={(id) => setSelectedRouteId(id)}
            corridorBbox={planResult?.corridor_bbox}
            departureTime={planResult?.departure_time}
            loadWeightLb={planResult?.load_weight_lb}
          />
        </main>
      </div>

      {/* Comparison Table Modal */}
      <ComparisonTableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        rows={planResult?.comparison_table || []}
      />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TruckRouterApp />
    </QueryClientProvider>
  );
}

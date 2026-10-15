import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { MapController, type MapCallbacks } from './MapController';
import type { PlanResponse } from '../../types';
import type { ThemeName } from '../../lib/tokens';
import type { HeatmapFrames } from '../../hooks/useHeatmapFrames';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface MapContainerViewProps {
  theme: ThemeName;
  plan: PlanResponse | null;
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  heatmapFrames: HeatmapFrames;
}

export const MapContainerView: React.FC<MapContainerViewProps> = ({
  theme,
  plan,
  selectedRouteId,
  onSelectRoute,
  heatmapFrames,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MapController | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const reducedMotion = !!useReducedMotion();
  const isMobile = useIsMobile();

  const cbRef = useRef<MapCallbacks>({
    onSelectRoute,
    onError: (err) => setMapError(err),
    onLoaded: () => setMapError(null),
  });
  cbRef.current = {
    onSelectRoute,
    onError: (err) => setMapError(err),
    onLoaded: () => setMapError(null),
  };

  // Initialize MapController once with cleanup
  useEffect(() => {
    if (!containerRef.current) return;
    const controller = new MapController(
      containerRef.current,
      theme,
      cbRef,
      reducedMotion,
    );
    controllerRef.current = controller;

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, []);

  // ResizeObserver on map container
  useEffect(() => {
    if (!containerRef.current) return;
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        controllerRef.current?.resize();
      });
    });
    ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  // Update theme
  useEffect(() => {
    controllerRef.current?.setTheme(theme);
  }, [theme]);

  // Update padding for panel offset
  useEffect(() => {
    if (!controllerRef.current) return;
    if (isMobile) {
      controllerRef.current.setPadding({ top: 70, right: 16, bottom: 260, left: 16 });
    } else {
      // Desktop: dock on left (400px), journey on right (320px), timeline bottom (80px), header top (60px)
      controllerRef.current.setPadding({ top: 80, right: 350, bottom: 100, left: 420 });
    }
  }, [isMobile]);

  // Update plan & selection
  useEffect(() => {
    controllerRef.current?.setPlan(plan, selectedRouteId);
  }, [plan]);

  // Update selected route
  useEffect(() => {
    controllerRef.current?.setSelected(selectedRouteId);
  }, [selectedRouteId]);

  // Update heatmap frames when new frames arrive
  useEffect(() => {
    if (controllerRef.current && heatmapFrames.frames.size > 0) {
      controllerRef.current.setFrames(heatmapFrames.frames);
    }
  }, [heatmapFrames.version, heatmapFrames.frames]);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-bg">
      <div ref={containerRef} className="w-full h-full" />

      {/* Visible Error Overlay with Retry */}
      {mapError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-bg/80 backdrop-blur-sm">
          <div className="glass max-w-md p-6 rounded-2xl border hairline text-center space-y-4 shadow-lift">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-ink">Map Service Offline</h3>
              <p className="text-xs text-muted mt-1 font-mono leading-relaxed">{mapError}</p>
            </div>
            <button
              onClick={() => {
                setMapError(null);
                controllerRef.current?.retry();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-accent-ink rounded-lg text-xs font-semibold hover:brightness-110 active:brightness-95 transition cursor-pointer shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Map Connection</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

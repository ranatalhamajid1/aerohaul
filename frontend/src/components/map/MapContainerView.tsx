import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { MapController, type MapCallbacks } from './MapController';
import type { PlanResponse } from '../../types';
import type { ThemeName } from '../../lib/tokens';
import type { HeatmapFrames } from '../../hooks/useHeatmapFrames';
import { useIsMobile } from '../../hooks/useMediaQuery';

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
  const cbRef = useRef<MapCallbacks>({ onSelectRoute });
  cbRef.current = { onSelectRoute };

  const reducedMotion = !!useReducedMotion();
  const isMobile = useIsMobile();

  // Initialize MapController once
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
    </div>
  );
};

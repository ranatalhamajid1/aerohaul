import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchHeatmapData } from '../api';
import type { HeatmapResponse, PlanResponse } from '../types';

export const MAX_HOUR = 48;
const CONCURRENCY = 4;

/** Coarse hours first so the whole timeline is usable quickly, then fill the gaps. */
function prefetchOrder(): number[] {
  const coarse: number[] = [];
  for (let h = 0; h <= MAX_HOUR; h += 3) coarse.push(h);
  const rest: number[] = [];
  for (let h = 0; h <= MAX_HOUR; h++) if (h % 3 !== 0) rest.push(h);
  return [...coarse, ...rest];
}

export interface HeatmapFrames {
  frames: Map<number, HeatmapResponse>;
  /** Bumped whenever a frame arrives (cheap change signal). */
  version: number;
  loaded: number;
  failed: number;
}

/**
 * Prefetch all 0–48h corridor frames for the current plan via TanStack Query
 * (deduped + cached); cancels everything in flight when the plan changes.
 */
export function useHeatmapFrames(plan: PlanResponse | null): HeatmapFrames {
  const qc = useQueryClient();
  const framesRef = useRef(new Map<number, HeatmapResponse>());
  const [version, setVersion] = useState(0);
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    framesRef.current = new Map();
    setVersion((v) => v + 1);
    setFailed(0);
    if (!plan) return;

    const ctrl = new AbortController();
    const bbox = plan.corridor_bbox;
    const key = [bbox.min_lat, bbox.min_lng, bbox.max_lat, bbox.max_lng, plan.departure_time, plan.load_weight_lb];
    const queue = prefetchOrder();

    const worker = async () => {
      while (queue.length && !ctrl.signal.aborted) {
        const hour = queue.shift() as number;
        try {
          const data = await qc.fetchQuery({
            queryKey: ['heatmap', ...key, hour],
            queryFn: ({ signal }) =>
              fetchHeatmapData(
                { ...bbox, hour, departure_time: plan.departure_time, load_weight_lb: plan.load_weight_lb },
                signal,
              ),
            staleTime: 30 * 60_000,
            retry: 1,
          });
          if (ctrl.signal.aborted) return;
          framesRef.current.set(hour, data);
          setVersion((v) => v + 1);
        } catch {
          if (!ctrl.signal.aborted) setFailed((f) => f + 1);
        }
      }
    };
    for (let i = 0; i < CONCURRENCY; i++) void worker();

    return () => {
      ctrl.abort();
      void qc.cancelQueries({ queryKey: ['heatmap', ...key] });
    };
  }, [plan, qc]);

  return { frames: framesRef.current, version, loaded: framesRef.current.size, failed };
}

/** Nearest loaded hour to `hour` (exact match preferred). */
export function nearestLoaded(frames: Map<number, HeatmapResponse>, hour: number): number | null {
  if (frames.has(hour)) return hour;
  let best: number | null = null;
  for (const h of frames.keys()) if (best === null || Math.abs(h - hour) < Math.abs(best - hour)) best = h;
  return best;
}

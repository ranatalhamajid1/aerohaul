import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { fetchRoutePlan, type PlanParams } from '../api';
import type { PlanResponse } from '../types';

export const PLAN_STEPS = ['Geocoding', 'Routing', 'Forecasting', 'Scoring'] as const;
/** Elapsed-ms thresholds at which the visual step advances (final step completes on response). */
const STEP_AT_MS = [0, 900, 2200, 4200];

/**
 * Wraps the plan mutation with: stale-request abort, and a step indicator that advances by
 * elapsed time and only completes when the real response arrives.
 */
export function usePlan(onSuccess: (data: PlanResponse) => void) {
  const abortRef = useRef<AbortController | null>(null);
  const [step, setStep] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const mutation = useMutation<PlanResponse, Error, PlanParams>({
    mutationFn: (params) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      return fetchRoutePlan(params, ctrl.signal);
    },
    onMutate: () => {
      setStep(0);
      setStartedAt(performance.now());
    },
    onSuccess: (data) => {
      setStep(PLAN_STEPS.length);
      onSuccess(data);
    },
    onSettled: () => setStartedAt(null),
  });

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      let s = 0;
      STEP_AT_MS.forEach((ms, i) => {
        if (elapsed >= ms) s = i;
      });
      setStep(s);
    }, 120);
    return () => window.clearInterval(id);
  }, [startedAt]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const plan = useCallback((p: PlanParams) => mutation.mutate(p), [mutation]);

  const isAbort = mutation.error?.name === 'AbortError';
  return {
    plan,
    isPending: mutation.isPending,
    error: isAbort ? null : mutation.error,
    step,
  };
}

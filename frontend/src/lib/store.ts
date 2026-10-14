import { useSyncExternalStore } from 'react';
import type { HeatMetric } from './riskScale';

/**
 * Tiny external store. High-frequency UI state (forecast hour while scrubbing, hovered checkpoint)
 * lives here so that only subscribers re-render — the map reads it imperatively via `subscribe`.
 */
export function createStore<T extends object>(initial: T) {
  let state = initial;
  const listeners = new Set<(s: T, prev: T) => void>();
  return {
    get: () => state,
    set(patch: Partial<T>) {
      const prev = state;
      const next = { ...state, ...patch };
      if (Object.keys(patch).every((k) => Object.is(prev[k as keyof T], next[k as keyof T]))) return;
      state = next;
      listeners.forEach((l) => l(state, prev));
    },
    subscribe(l: (s: T, prev: T) => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export interface ViewState {
  hour: number;
  metric: HeatMetric;
  playing: boolean;
  heatmapOn: boolean;
  hoveredCp: number | null;
  selectedCp: number | null;
  truckOn: boolean;
}

export const viewStore = createStore<ViewState>({
  hour: 0,
  metric: 'overall',
  playing: false,
  heatmapOn: true,
  hoveredCp: null,
  selectedCp: null,
  truckOn: true,
});

export function useView<K>(selector: (s: ViewState) => K): K {
  return useSyncExternalStore(
    viewStore.subscribe,
    () => selector(viewStore.get()),
    () => selector(viewStore.get()),
  );
}

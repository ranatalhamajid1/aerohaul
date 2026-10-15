import React from 'react';
import { useView } from '../../lib/store';
import { METRIC_SPECS, rampCss, type HeatMetric } from '../../lib/riskScale';
import type { ThemeName } from '../../lib/tokens';

interface HeatmapLegendProps {
  theme: ThemeName;
  loadWeight?: number;
}

export const HeatmapLegend: React.FC<HeatmapLegendProps> = ({ theme, loadWeight = 45000 }) => {
  const metric = useView((s) => s.metric);
  const heatmapOn = useView((s) => s.heatmapOn);

  if (!heatmapOn) return null;

  const spec = METRIC_SPECS[metric];
  const gradient = rampCss(theme);

  return (
    <div className="glass px-3 py-2 rounded-xl border hairline shadow-lift flex flex-col gap-1.5 min-w-[240px] pointer-events-auto select-none">
      {/* Title & Unit Row */}
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="font-bold text-ink uppercase tracking-wider">{spec.label}</span>
        <span className="text-muted">[{spec.unit}]</span>
      </div>

      {/* Gradient Bar with Threshold Ticks */}
      <div className="relative pt-0.5 pb-3">
        <div
          className="h-2 w-full rounded-full border border-white/20 shadow-xs"
          style={{ background: gradient }}
        />

        {/* Ticks positioned under the bar */}
        <div className="absolute inset-x-0 top-3.5 flex justify-between text-[9px] font-mono text-muted">
          {spec.ticks.map((t, i) => (
            <span
              key={i}
              className="transform -translate-x-1/2 first:translate-x-0 last:translate-x-0"
              style={{
                position: i === 0 || i === spec.ticks.length - 1 ? 'static' : 'absolute',
                left: i === 0 || i === spec.ticks.length - 1 ? undefined : `${t.pos}%`,
              }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      {/* Weight rules note in Overall mode */}
      {metric === 'overall' && (
        <div className="text-[9.5px] font-mono text-muted/80 pt-0.5 border-t hairline flex items-center justify-between">
          <span>Load escalation active</span>
          <span className="text-accent font-semibold">{loadWeight.toLocaleString()} lb</span>
        </div>
      )}
    </div>
  );
};

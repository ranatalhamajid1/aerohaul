import React, { useEffect, useRef } from 'react';
import { Play, Pause, Layers, Truck, Wind, CloudRain, Snowflake, ShieldAlert } from 'lucide-react';
import { useView, viewStore } from '../../lib/store';
import type { HeatMetric } from '../../lib/riskScale';
import type { HeatmapFrames } from '../../hooks/useHeatmapFrames';
import { Panel } from '../ui/Panel';
import { formatClock, formatDay, addHours } from '../../lib/format';

interface TimeDisplayPillProps {
  departureTime: string;
  loadedFrames: number;
}

const TimeDisplayPill = React.memo<TimeDisplayPillProps>(({ departureTime, loadedFrames }) => {
  const hour = useView((s) => s.hour);
  const targetDate = addHours(departureTime, hour);
  const targetTimeStr = formatClock(targetDate);
  const targetDayStr = formatDay(targetDate);
  const targetHourNum = targetDate.getHours();
  const isNight = targetHourNum >= 20 || targetHourNum < 6;

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-1.5">
        <span className="num text-sm font-bold text-accent">+{hour}h</span>
        <span className="text-[11px] font-mono text-ink">
          {targetDayStr} {targetTimeStr}
        </span>
        <span
          className={`text-[9px] font-mono px-1.5 py-0.2 rounded border hairline ${
            isNight ? 'bg-indigo-950/40 text-indigo-300' : 'bg-amber-500/20 text-amber-500'
          }`}
        >
          {isNight ? 'NIGHT' : 'DAY'}
        </span>
      </div>
      <span className="text-[9px] font-mono text-muted">
        {loadedFrames}/49 frames loaded
      </span>
    </div>
  );
});
TimeDisplayPill.displayName = 'TimeDisplayPill';

interface ForecastTimelineBarProps {
  departureTime?: string;
  heatmapFrames: HeatmapFrames;
}

export const ForecastTimelineBar: React.FC<ForecastTimelineBarProps> = ({
  departureTime = new Date().toISOString(),
  heatmapFrames,
}) => {
  const hour = useView((s) => s.hour);
  const metric = useView((s) => s.metric);
  const playing = useView((s) => s.playing);
  const heatmapOn = useView((s) => s.heatmapOn);
  const truckOn = useView((s) => s.truckOn);
  const rafRef = useRef(0);

  // Play animation loop
  useEffect(() => {
    let timer: number;
    if (playing) {
      timer = window.setInterval(() => {
        const next = (viewStore.get().hour + 1) % 49;
        viewStore.set({ hour: next });
      }, 500);
    }
    return () => window.clearInterval(timer);
  }, [playing]);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      viewStore.set({ hour: val });
    });
  };

  const metrics: { id: HeatMetric; label: string; icon: React.ReactNode }[] = [
    { id: 'overall', label: 'Overall', icon: <ShieldAlert className="w-3 h-3" /> },
    { id: 'wind', label: 'Wind', icon: <Wind className="w-3 h-3" /> },
    { id: 'rain', label: 'Rain', icon: <CloudRain className="w-3 h-3" /> },
    { id: 'snow', label: 'Snow', icon: <Snowflake className="w-3 h-3" /> },
  ];

  return (
    <Panel className="pointer-events-auto p-3 shadow-lift border hairline flex flex-col md:flex-row items-center gap-3 md:gap-4 max-w-4xl w-full mx-auto">
      {/* Controls Left: Play/Pause + Time Display */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => viewStore.set({ playing: !playing })}
          className="w-8 h-8 rounded-[9px] bg-accent text-accent-ink hover:brightness-105 active:brightness-95 flex items-center justify-center transition cursor-pointer shadow-xs"
          title={playing ? 'Pause timeline animation' : 'Play timeline animation'}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>

        <TimeDisplayPill departureTime={departureTime} loadedFrames={heatmapFrames.loaded} />
      </div>

      {/* Center: Timeline Scrubber with Ticks */}
      <div className="flex-1 w-full space-y-1">
        <input
          type="range"
          min={0}
          max={48}
          step={1}
          value={hour}
          onChange={handleSlider}
          className="scrubber"
          aria-label="Forecast hour slider (0 to 48 hours)"
        />

        {/* Hour Ticks */}
        <div className="flex justify-between text-[9px] font-mono text-muted px-1">
          {[0, 6, 12, 18, 24, 30, 36, 42, 48].map((tick) => (
            <span
              key={tick}
              className={`transition-colors cursor-pointer ${
                hour === tick ? 'text-accent font-bold' : 'hover:text-ink'
              }`}
              onClick={() => viewStore.set({ hour: tick })}
            >
              {tick}h
            </span>
          ))}
        </div>
      </div>

      {/* Right: Metric Chips & Heatmap / Truck Toggles */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Metric Selector Chips */}
        <div className="flex items-center gap-1 bg-surface p-1 rounded-[10px] border hairline">
          {metrics.map((m) => (
            <button
              key={m.id}
              onClick={() => viewStore.set({ metric: m.id })}
              className={`text-[11px] font-sans font-medium px-2 py-1 rounded-[6px] transition flex items-center gap-1 cursor-pointer ${
                metric === m.id
                  ? 'bg-accent text-accent-ink font-bold shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
              title={`Switch heatmap to ${m.label}`}
            >
              {m.icon}
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>

        {/* Heatmap Toggle */}
        <button
          onClick={() => viewStore.set({ heatmapOn: !heatmapOn })}
          className={`p-2 rounded-[10px] border transition cursor-pointer ${
            heatmapOn
              ? 'bg-accent/15 border-accent/40 text-accent'
              : 'glass border-line/10 text-muted hover:text-ink'
          }`}
          title={heatmapOn ? 'Hide Weather Radar' : 'Show Weather Radar'}
          aria-label="Toggle weather radar overlay"
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

        {/* Truck Toggle */}
        <button
          onClick={() => viewStore.set({ truckOn: !truckOn })}
          className={`p-2 rounded-[10px] border transition cursor-pointer ${
            truckOn
              ? 'bg-accent/15 border-accent/40 text-accent'
              : 'glass border-line/10 text-muted hover:text-ink'
          }`}
          title={truckOn ? 'Disable Truck Animation' : 'Enable Truck Animation'}
          aria-label="Toggle animated truck marker"
        >
          <Truck className="w-3.5 h-3.5" />
        </button>
      </div>
    </Panel>
  );
};

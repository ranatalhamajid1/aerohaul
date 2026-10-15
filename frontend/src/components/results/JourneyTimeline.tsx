import React, { useEffect, useRef, useCallback } from 'react';
import type { RouteOption, Checkpoint } from '../../types';
import { Panel } from '../ui/Panel';
import { RiskBadge } from '../ui/RiskBadge';
import { formatEta } from '../../lib/format';
import { useView, viewStore } from '../../lib/store';
import { Wind, CloudRain, Snowflake } from 'lucide-react';

interface CheckpointRowProps {
  cp: Checkpoint;
  isHovered: boolean;
  isSelected: boolean;
  onSelect?: (index: number) => void;
  setRowRef: (index: number, el: HTMLDivElement | null) => void;
}

const CheckpointRow = React.memo<CheckpointRowProps>(({
  cp,
  isHovered,
  isSelected,
  onSelect,
  setRowRef,
}) => {
  const eta = formatEta(cp.eta);
  const isSevere = cp.risk_level === 'Severe' || cp.risk_level === 'No Travel';

  return (
    <div
      ref={(el) => setRowRef(cp.index, el)}
      onMouseEnter={() => viewStore.set({ hoveredCp: cp.index })}
      onMouseLeave={() => viewStore.set({ hoveredCp: null })}
      onClick={() => {
        viewStore.set({ selectedCp: cp.index });
        onSelect?.(cp.index);
      }}
      className={`p-2.5 rounded-[10px] transition-all cursor-pointer flex flex-col gap-1.5 ${
        isSelected
          ? 'bg-accent/15 border border-accent/40 shadow-xs'
          : isHovered
          ? 'bg-surface border border-line/20'
          : 'hover:bg-surface/50 border border-transparent'
      }`}
    >
      {/* Row Top: Mile + ETA + Risk Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="num text-xs font-bold text-ink">
            mi {Math.round(cp.mile)}
          </span>
          <span className="text-[10px] font-mono text-muted">
            {eta.day} {eta.time}
          </span>
        </div>
        <RiskBadge level={cp.risk_level} size="sm" />
      </div>

      {/* Row Stats: Wind, Rain, Snow */}
      <div className="flex items-center gap-3 text-[10px] font-mono text-muted">
        <span className="flex items-center gap-1">
          <Wind className="w-3 h-3 text-muted/70" />
          <span className="text-ink font-semibold">{cp.wind_mph.toFixed(0)}</span> mph
        </span>
        {cp.rain_in_hr > 0 && (
          <span className="flex items-center gap-1 text-sky-400">
            <CloudRain className="w-3 h-3" />
            <span>{cp.rain_in_hr.toFixed(2)}</span> in/h
          </span>
        )}
        {cp.snow_in_hr > 0 && (
          <span className="flex items-center gap-1 text-cyan-300">
            <Snowflake className="w-3 h-3" />
            <span>{cp.snow_in_hr.toFixed(2)}</span> in/h
          </span>
        )}
        {cp.temperature_f !== undefined && (
          <span className="ml-auto text-[10px] text-muted">
            {cp.temperature_f.toFixed(0)}°F
          </span>
        )}
      </div>

      {/* Reason / Load Rule Trigger snippet */}
      {isSevere && cp.reasons.length > 0 && (
        <div className="text-[10px] text-risk-severe font-sans line-clamp-1">
          {cp.reasons[0]}
        </div>
      )}
    </div>
  );
});
CheckpointRow.displayName = 'CheckpointRow';

interface JourneyTimelineProps {
  route: RouteOption | null;
  onSelectCheckpoint?: (index: number) => void;
}

export const JourneyTimeline: React.FC<JourneyTimelineProps> = ({
  route,
  onSelectCheckpoint,
}) => {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const hoveredCp = useView((s) => s.hoveredCp);
  const selectedCp = useView((s) => s.selectedCp);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const setRowRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(index, el);
    else rowRefs.current.delete(index);
  }, []);

  // Auto-scroll when checkpoint is clicked on map
  useEffect(() => {
    if (selectedCp !== null && !isCollapsed) {
      const el = rowRefs.current.get(selectedCp);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedCp, isCollapsed]);

  if (!route) return null;
  const checkpoints = route.checkpoints || [];

  return (
    <Panel className="w-full md:w-[310px] max-h-[calc(100vh-210px)] overflow-hidden shadow-panel border hairline flex flex-col transition-all">
      {/* Header */}
      <div className="p-3 border-b hairline flex items-center justify-between bg-surface/60">
        <div>
          <div className="eyebrow">WAYPOINT LOG</div>
          <div className="text-xs font-display font-bold text-ink">
            {checkpoints.length} Checkpoints (~{checkpoints[1]?.mile || 25} mi)
          </div>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-muted hover:text-ink text-[11px] font-mono px-2 py-0.5 rounded border hairline bg-surface/40 hover:bg-surface cursor-pointer transition"
          title={isCollapsed ? 'Expand waypoint log' : 'Collapse waypoint log'}
        >
          {isCollapsed ? 'EXPAND' : 'COLLAPSE'}
        </button>
      </div>

      {/* Checkpoints Scrollable List */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto scroll-thin divide-y divide-line/5 p-1.5">
          {checkpoints.map((cp: Checkpoint) => (
            <CheckpointRow
              key={cp.index}
              cp={cp}
              isHovered={hoveredCp === cp.index}
              isSelected={selectedCp === cp.index}
              onSelect={onSelectCheckpoint}
              setRowRef={setRowRef}
            />
          ))}
        </div>
      )}
    </Panel>
  );
};

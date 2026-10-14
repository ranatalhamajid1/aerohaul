import React from 'react';
import { motion } from 'framer-motion';
import type { RouteSummary } from '../../types';
import { RISK_ORDER, RISK_TOKENS, riskVar } from '../../lib/tokens';

interface StackedRiskBarProps {
  summary: RouteSummary;
  height?: number;
  className?: string;
  showLabels?: boolean;
}

export const StackedRiskBar: React.FC<StackedRiskBarProps> = ({
  summary,
  height = 8,
  className = '',
  showLabels = false,
}) => {
  const total = summary.total_distance_miles || 1;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {showLabels && (
        <div className="flex justify-between items-center text-[10px] text-muted font-mono">
          <span>RISK PROFILE</span>
          <span className="num">{summary.total_distance_miles.toFixed(0)} mi</span>
        </div>
      )}
      <div
        className="w-full flex rounded-full overflow-hidden bg-line/10 hairline p-[1px]"
        style={{ height: height + 2 }}
      >
        {RISK_ORDER.map((level) => {
          const miles = summary.miles_by_risk[level] || 0;
          if (miles <= 0) return null;
          const pct = Math.max(1, (miles / total) * 100);

          return (
            <motion.div
              key={level}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 28 }}
              style={{
                width: `${pct}%`,
                backgroundColor: riskVar(level),
                transformOrigin: 'left',
              }}
              className="h-full first:rounded-l-full last:rounded-r-full"
              title={`${RISK_TOKENS[level].short}: ${miles.toFixed(1)} mi (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
    </div>
  );
};

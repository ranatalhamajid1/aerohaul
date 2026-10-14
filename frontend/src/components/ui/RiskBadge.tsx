import React from 'react';
import type { RiskLevel } from '../../types';
import { RISK_TOKENS, riskVar } from '../../lib/tokens';

interface RiskBadgeProps {
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
  showGlyph?: boolean;
  className?: string;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({
  level,
  size = 'md',
  showGlyph = true,
  className = '',
}) => {
  const tok = RISK_TOKENS[level];
  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1 tracking-wider',
    md: 'text-[11px] px-2.5 py-1 gap-1.5 tracking-wide',
    lg: 'text-xs px-3 py-1.5 gap-2 tracking-wide',
  }[size];

  return (
    <span
      className={`inline-flex items-center font-mono font-semibold rounded-full uppercase border transition-colors ${sizeClasses} ${className}`}
      style={{
        color: riskVar(level),
        backgroundColor: riskVar(level, 0.12),
        borderColor: riskVar(level, 0.38),
      }}
      role="status"
      aria-label={`Risk Level: ${level}`}
    >
      {showGlyph && <span aria-hidden="true" className="opacity-90">{tok.glyph}</span>}
      <span>{tok.short}</span>
    </span>
  );
};

import React from 'react';

interface StatProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  subtext?: string;
  highlight?: boolean;
  className?: string;
}

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  unit,
  subtext,
  highlight = false,
  className = '',
}) => {
  return (
    <div className={`space-y-0.5 ${className}`}>
      <div className="eyebrow truncate">{label}</div>
      <div className="flex items-baseline gap-1">
        <span
          className={`num text-base font-semibold leading-none ${
            highlight ? 'text-accent' : 'text-ink'
          }`}
        >
          {value}
        </span>
        {unit && <span className="text-[11px] font-mono text-muted">{unit}</span>}
      </div>
      {subtext && <div className="text-[10px] text-muted truncate">{subtext}</div>}
    </div>
  );
};

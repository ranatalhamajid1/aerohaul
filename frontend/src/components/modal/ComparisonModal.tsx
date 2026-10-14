import React from 'react';
import { X, Award, CheckCircle2 } from 'lucide-react';
import type { ComparisonTableRow } from '../../types';
import { RiskBadge } from '../ui/RiskBadge';
import { Panel } from '../ui/Panel';

interface ComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: ComparisonTableRow[];
}

export const ComparisonModal: React.FC<ComparisonModalProps> = ({
  isOpen,
  onClose,
  rows,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <Panel className="max-w-4xl w-full p-6 shadow-panel border hairline space-y-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between border-b hairline pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent" />
              <h2 className="font-display font-bold text-base text-ink m-0">
                ROUTE DECISION MATRIX
              </h2>
            </div>
            <p className="text-xs text-muted leading-relaxed m-0">
              Lexicographical Hierarchy: 1. Avoid No Travel &rarr; 2. Fewest Severe Miles &rarr; 3. Fewest High Miles &rarr; 4. Lowest Average Risk &rarr; 5. Shortest Travel Time
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-[8px] hover:bg-surface text-muted hover:text-ink transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-x-auto overflow-y-auto scroll-thin">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b hairline text-muted font-mono text-[10px] uppercase tracking-wider bg-surface/40">
                <th className="py-2.5 px-3">CORRIDOR OPTION</th>
                <th className="py-2.5 px-3 text-right">DISTANCE</th>
                <th className="py-2.5 px-3 text-right">DRIVE TIME</th>
                <th className="py-2.5 px-3 text-center">NO TRAVEL</th>
                <th className="py-2.5 px-3 text-center">SEVERE MI</th>
                <th className="py-2.5 px-3 text-center">HIGH MI</th>
                <th className="py-2.5 px-3 text-center">AVG RISK</th>
                <th className="py-2.5 px-3 text-center">MAX RISK</th>
                <th className="py-2.5 px-3 text-center">DECISION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/5">
              {rows.map((row) => (
                <tr
                  key={row.route_id}
                  className={`transition-colors ${
                    row.recommended ? 'bg-accent/10 font-semibold' : 'hover:bg-surface/50'
                  }`}
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      {row.recommended && <Award className="w-4 h-4 text-accent shrink-0" />}
                      <span className="text-ink">{row.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right num text-ink">
                    {row.distance_miles.toFixed(1)} mi
                  </td>
                  <td className="py-3 px-3 text-right num text-ink">
                    {row.duration}
                  </td>
                  <td className="py-3 px-3 text-center num">
                    {row.no_travel_miles > 0 ? (
                      <span className="text-risk-notravel font-bold">
                        {row.no_travel_miles.toFixed(1)} mi
                      </span>
                    ) : (
                      <span className="text-muted">0.0 mi</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center num">
                    {row.severe_miles > 0 ? (
                      <span className="text-risk-severe font-bold">
                        {row.severe_miles.toFixed(1)} mi
                      </span>
                    ) : (
                      <span className="text-muted">0.0 mi</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center num">
                    {row.high_miles > 0 ? (
                      <span className="text-risk-high font-bold">
                        {row.high_miles.toFixed(1)} mi
                      </span>
                    ) : (
                      <span className="text-muted">0.0 mi</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center num text-ink font-bold">
                    {row.avg_risk.toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <RiskBadge level={row.max_risk} size="sm" />
                  </td>
                  <td className="py-3 px-3 text-center">
                    {row.recommended ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-accent text-accent-ink">
                        <CheckCircle2 className="w-3 h-3" /> WINNER
                      </span>
                    ) : (
                      <span className="text-muted text-[11px] font-mono">ALTERNATIVE</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="pt-2 border-t hairline flex items-center justify-between text-[11px] font-mono text-muted">
          <span>Heavy Goods Vehicle Gross Weight Specification</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-[8px] bg-surface hover:bg-line/10 text-ink transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </Panel>
    </div>
  );
};

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, ShieldAlert } from 'lucide-react';
import { RouteOption, Checkpoint } from '../types';
import { RISK_COLORS } from '../constants';

interface CheckpointTableProps {
  route: RouteOption;
}

export const CheckpointTable: React.FC<CheckpointTableProps> = ({ route }) => {
  const [isOpen, setIsOpen] = useState(false);
  const checkpoints = route.checkpoints || [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 bg-slate-50/70 hover:bg-slate-100 transition cursor-pointer"
      >
        <span>
          Detailed Checkpoint Breakdown ({checkpoints.length} samples every ~{checkpoints[1]?.mile || 25} mi)
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>

      {isOpen && (
        <div className="max-h-72 overflow-y-auto overflow-x-auto p-2">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-semibold uppercase text-[9px] tracking-wider bg-slate-50/50">
                <th className="py-1.5 px-2">Mile</th>
                <th className="py-1.5 px-2">ETA (Local)</th>
                <th className="py-1.5 px-2 text-right">Wind</th>
                <th className="py-1.5 px-2 text-right">Precip</th>
                <th className="py-1.5 px-2 text-center">Risk</th>
                <th className="py-1.5 px-2">Reason / Rule Trigger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {checkpoints.map((cp: Checkpoint) => {
                const isCritical = cp.risk_level === 'Severe' || cp.risk_level === 'No Travel';
                const style = RISK_COLORS[cp.risk_level] || RISK_COLORS['Low'];

                return (
                  <tr
                    key={cp.index}
                    className={isCritical ? 'bg-red-50/40 font-medium' : 'hover:bg-slate-50'}
                  >
                    <td className="py-1.5 px-2 text-slate-700 font-medium">
                      mi {cp.mile.toFixed(0)}
                    </td>
                    <td className="py-1.5 px-2 text-slate-600">
                      {new Date(cp.eta).toLocaleTimeString([], {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-700">
                      {cp.wind_mph.toFixed(0)} mph
                    </td>
                    <td className="py-1.5 px-2 text-right text-slate-700">
                      {cp.snow_in_hr > 0
                        ? `${cp.snow_in_hr.toFixed(1)}″ snow`
                        : `${cp.rain_in_hr.toFixed(2)}″ rain`}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <span
                        className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold text-white shadow-xs"
                        style={{ backgroundColor: style.hex }}
                      >
                        {cp.risk_level}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-slate-600 text-[10px] truncate max-w-[200px]" title={cp.reasons.join(', ')}>
                      {cp.reasons[0] || 'Clear'}
                      {cp.load_escalated && ' (Load Rule Applied)'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

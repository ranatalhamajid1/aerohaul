import React from 'react';
import { X, CheckCircle, ShieldAlert, Award, AlertCircle } from 'lucide-react';
import { ComparisonTableRow } from '../types';
import { RISK_COLORS } from '../constants';

interface ComparisonTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: ComparisonTableRow[];
}

export const ComparisonTableModal: React.FC<ComparisonTableModalProps> = ({ isOpen, onClose, rows }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 className="text-base font-bold text-slate-800 m-0">
              Route Decision & Risk Comparison Table
            </h2>
            <p className="text-xs text-slate-500 m-0 mt-0.5">
              Strict Lexicographical Priority: (1) Avoid No Travel &rarr; (2) Fewest Severe Miles &rarr; (3) Fewest High Miles &rarr; (4) Lowest Average Risk &rarr; (5) Shortest Travel Time
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-x-auto overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider bg-slate-50/60">
                <th className="py-2.5 px-3">Route Option</th>
                <th className="py-2.5 px-3 text-right">Distance</th>
                <th className="py-2.5 px-3 text-right">Drive Time</th>
                <th className="py-2.5 px-3 text-center">No Travel Miles</th>
                <th className="py-2.5 px-3 text-center">Severe Miles</th>
                <th className="py-2.5 px-3 text-center">High Miles</th>
                <th className="py-2.5 px-3 text-center">Avg Risk Score</th>
                <th className="py-2.5 px-3 text-center">Max Risk</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const maxRiskStyle = RISK_COLORS[row.max_risk] || RISK_COLORS['Low'];
                return (
                  <tr
                    key={row.route_id}
                    className={`transition-colors ${
                      row.recommended ? 'bg-blue-50/60 font-medium' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {row.recommended && <Award className="w-4 h-4 text-emerald-600 shrink-0" />}
                        <span className="font-semibold text-slate-800">{row.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-700">
                      {row.distance_miles.toFixed(1)} mi
                    </td>
                    <td className="py-3 px-3 text-right text-slate-700">
                      {row.duration}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {row.no_travel_miles > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded font-bold bg-rose-950 text-rose-100 text-[11px]">
                          {row.no_travel_miles.toFixed(1)} mi
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-medium">0.0 mi</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {row.severe_miles > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded font-bold bg-red-100 text-red-800 text-[11px]">
                          {row.severe_miles.toFixed(1)} mi
                        </span>
                      ) : (
                        <span className="text-slate-400">0.0 mi</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {row.high_miles > 0 ? (
                        <span className="inline-block px-2 py-0.5 rounded font-medium bg-orange-100 text-orange-800 text-[11px]">
                          {row.high_miles.toFixed(1)} mi
                        </span>
                      ) : (
                        <span className="text-slate-400">0.0 mi</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-800">
                      {row.avg_risk.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-white shadow-xs"
                        style={{ backgroundColor: maxRiskStyle.hex }}
                      >
                        {row.max_risk}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {row.recommended ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle className="w-3 h-3 text-emerald-600" /> Winner
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Alternative</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-blue-600" />
            <span>Over-the-road freight evaluation adhering to heavy vehicle gross weight standards.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

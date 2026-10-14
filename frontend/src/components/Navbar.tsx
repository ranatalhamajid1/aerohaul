import React from 'react';
import { Truck, ShieldCheck, CloudRain, ExternalLink } from 'lucide-react';
import { SAMPLE_PRESETS, RoutePreset } from '../constants';

interface NavbarProps {
  onSelectPreset: (preset: RoutePreset) => void;
  onOpenTable: () => void;
  hasRoutes: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onSelectPreset, onOpenTable, hasRoutes }) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-inner">
          <Truck className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg tracking-tight text-white m-0">AeroHaul</h1>
            <span className="bg-blue-500/20 text-blue-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-blue-500/30">
              WEATHER-AWARE HGV ROUTER
            </span>
          </div>
          <p className="text-xs text-slate-400 m-0">
            Dispatch Safety & Lexicographical Route Optimization Engine
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Quick Presets */}
        <div className="hidden lg:flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60 text-xs">
          <span className="text-slate-400 px-2 font-medium">Test Scenarios:</span>
          {SAMPLE_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => onSelectPreset(preset)}
              className="px-2.5 py-1 rounded bg-slate-700/60 hover:bg-blue-600 hover:text-white text-slate-200 transition-colors cursor-pointer"
              title={preset.note}
            >
              {preset.label.split('(')[0].trim()}
            </button>
          ))}
        </div>

        {hasRoutes && (
          <button
            onClick={onOpenTable}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-sm cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            Comparison Table
          </button>
        )}
      </div>
    </header>
  );
};

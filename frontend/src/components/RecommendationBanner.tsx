import React from 'react';
import { Award, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { Recommendation } from '../types';

interface RecommendationBannerProps {
  recommendation: Recommendation;
  onOpenTable: () => void;
}

export const RecommendationBanner: React.FC<RecommendationBannerProps> = ({
  recommendation,
  onOpenTable,
}) => {
  const isWarning = recommendation.all_no_travel;

  return (
    <div
      className={`rounded-xl p-3.5 border shadow-sm transition-all ${
        isWarning
          ? 'bg-rose-900 text-white border-rose-950'
          : 'bg-gradient-to-r from-blue-900 to-indigo-900 text-white border-blue-800'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
            isWarning ? 'bg-rose-800 text-rose-200' : 'bg-blue-800 text-blue-200'
          }`}
        >
          {isWarning ? <AlertTriangle className="w-4 h-4 text-rose-300" /> : <Award className="w-4 h-4 text-emerald-400" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-200 m-0">
              {isWarning ? 'Severe Weather Hazard Alert' : 'Recommended Route'}
            </h2>
            <button
              onClick={onOpenTable}
              className="text-[11px] underline text-blue-200 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              Compare All <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <p className="text-xs text-slate-100 mt-1 leading-relaxed m-0 font-medium">
            {recommendation.explanation}
          </p>
        </div>
      </div>
    </div>
  );
};

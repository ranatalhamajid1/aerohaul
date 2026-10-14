import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Calendar,
  Weight,
  Ruler,
  Navigation,
  ArrowUpDown,
  AlertTriangle,
  Info,
  Loader2,
} from 'lucide-react';
import { PlanParams, searchLocationSuggestions } from '../api';
import { LocationInfo } from '../types';

interface RoutingFormProps {
  onSubmit: (params: PlanParams) => void;
  isLoading: boolean;
  initialValues?: Partial<PlanParams>;
}

export const RoutingForm: React.FC<RoutingFormProps> = ({ onSubmit, isLoading, initialValues }) => {
  const [origin, setOrigin] = useState(initialValues?.origin || 'Chicago, IL');
  const [destination, setDestination] = useState(initialValues?.destination || 'Denver, CO');
  const [departureTime, setDepartureTime] = useState(
    initialValues?.departure_time || getDefaultDepartureTime()
  );
  const [loadWeight, setLoadWeight] = useState<number>(initialValues?.load_weight_lb ?? 45000);
  const [intervalMiles, setIntervalMiles] = useState<number>(initialValues?.interval_miles ?? 25);

  // Suggestions state
  const [originSuggestions, setOriginSuggestions] = useState<LocationInfo[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<LocationInfo[]>([]);
  const [showOriginList, setShowOriginList] = useState(false);
  const [showDestList, setShowDestList] = useState(false);

  // Sync with initialValues if updated externally (e.g. preset clicked)
  useEffect(() => {
    if (initialValues?.origin) setOrigin(initialValues.origin);
    if (initialValues?.destination) setDestination(initialValues.destination);
    if (initialValues?.load_weight_lb !== undefined) setLoadWeight(initialValues.load_weight_lb);
    if (initialValues?.interval_miles) setIntervalMiles(initialValues.interval_miles);
  }, [initialValues]);

  // Debounced search for suggestions
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (origin.length >= 3 && showOriginList) {
        const results = await searchLocationSuggestions(origin);
        setOriginSuggestions(results);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [origin, showOriginList]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (destination.length >= 3 && showDestList) {
        const results = await searchLocationSuggestions(destination);
        setDestSuggestions(results);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [destination, showDestList]);

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origin.trim() || !destination.trim()) return;

    onSubmit({
      origin: origin.trim(),
      destination: destination.trim(),
      departure_time: new Date(departureTime).toISOString(),
      load_weight_lb: Number(loadWeight),
      interval_miles: intervalMiles,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm">
          <Navigation className="w-4 h-4 text-blue-600" />
          <span>Trip Configuration</span>
        </div>
        <button
          type="button"
          onClick={handleSwap}
          className="text-xs text-slate-500 hover:text-blue-600 flex items-center gap-1 p-1 rounded hover:bg-slate-50 transition cursor-pointer"
          title="Swap Origin and Destination"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          Swap
        </button>
      </div>

      {/* Origin & Destination Inputs */}
      <div className="space-y-3 relative">
        {/* Origin */}
        <div className="relative">
          <label className="block text-xs font-medium text-slate-600 mb-1">Origin City / Hub</label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-emerald-600 absolute left-3 top-2.5" />
            <input
              type="text"
              value={origin}
              onChange={(e) => {
                setOrigin(e.target.value);
                setShowOriginList(true);
              }}
              onFocus={() => setShowOriginList(true)}
              placeholder="e.g. Chicago, IL"
              required
              className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>
          {showOriginList && originSuggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {originSuggestions.map((s, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => {
                    setOrigin(s.display_name.split(',')[0] + ', ' + (s.display_name.split(',')[1] || '').trim());
                    setShowOriginList(false);
                  }}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-0 truncate"
                >
                  {s.display_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Destination */}
        <div className="relative">
          <label className="block text-xs font-medium text-slate-600 mb-1">Destination City / Hub</label>
          <div className="relative">
            <MapPin className="w-4 h-4 text-red-600 absolute left-3 top-2.5" />
            <input
              type="text"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                setShowDestList(true);
              }}
              onFocus={() => setShowDestList(true)}
              placeholder="e.g. Denver, CO"
              required
              className="w-full text-xs pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>
          {showDestList && destSuggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {destSuggestions.map((s, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => {
                    setDestination(s.display_name.split(',')[0] + ', ' + (s.display_name.split(',')[1] || '').trim());
                    setShowDestList(false);
                  }}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-0 truncate"
                >
                  {s.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Departure Date/Time & Sampling Interval */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            Departure (Local)
          </label>
          <input
            type="datetime-local"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            required
            className="w-full text-xs px-2.5 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1">
            <Ruler className="w-3.5 h-3.5 text-blue-600" />
            Checkpoint Step
          </label>
          <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
            {[10, 25, 50].map((step) => (
              <button
                type="button"
                key={step}
                onClick={() => setIntervalMiles(step)}
                className={`text-xs py-1.5 rounded font-medium transition cursor-pointer ${
                  intervalMiles === step
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {step} mi
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cargo Load Weight with Load Rule Warning Hints */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
            <Weight className="w-3.5 h-3.5 text-blue-600" />
            Gross Load Weight: <span className="font-bold text-slate-800">{Number(loadWeight).toLocaleString()} lb</span>
          </label>
          <div className="flex gap-1">
            {[25000, 35000, 45000, 65000].map((preset) => (
              <button
                type="button"
                key={preset}
                onClick={() => setLoadWeight(preset)}
                className={`text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${
                  loadWeight === preset
                    ? 'bg-blue-600 text-white font-medium'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {preset / 1000}k
              </button>
            ))}
          </div>
        </div>

        <input
          type="range"
          min="5000"
          max="80000"
          step="1000"
          value={loadWeight}
          onChange={(e) => setLoadWeight(Number(e.target.value))}
          className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
        />

        {/* Load Escalation Rule Status Notice */}
        <div className="mt-2 text-[11px] p-2 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <Info className="w-3.5 h-3.5 text-blue-600" />
            <span>Active Load Escalation Thresholds:</span>
          </div>
          <div className="flex flex-col gap-1 text-[10px] text-slate-600 pl-4">
            <div className={loadWeight > 30000 ? 'text-amber-800 font-semibold flex items-center gap-1' : 'opacity-70'}>
              <span>• &gt; 30,000 lb: Wind 45–54 mph triggers <strong className="text-rose-900">NO TRAVEL</strong></span>
              {loadWeight > 30000 && <span className="text-[9px] bg-amber-100 text-amber-900 px-1 rounded">Active</span>}
            </div>
            <div className={loadWeight > 40000 ? 'text-orange-800 font-semibold flex items-center gap-1' : 'opacity-70'}>
              <span>• &gt; 40,000 lb: Wind 35–44 mph escalates to <strong className="text-red-700">SEVERE</strong></span>
              {loadWeight > 40000 && <span className="text-[9px] bg-orange-100 text-orange-900 px-1 rounded">Active</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold rounded-lg shadow transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Evaluating 3 Routes & Corridor Forecasts...</span>
          </>
        ) : (
          <>
            <Navigation className="w-4 h-4" />
            <span>Analyze Safety & Optimize 3 Routes</span>
          </>
        )}
      </button>
    </form>
  );
};

function getDefaultDepartureTime(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2);
  d.setMinutes(0);
  d.setSeconds(0);
  // Format YYYY-MM-DDTHH:mm for datetime-local
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localISOTime = new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  return localISOTime;
}

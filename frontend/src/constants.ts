import { RiskLevel } from './types';

export const RISK_COLORS: Record<RiskLevel, { bg: string; text: string; hex: string; border: string }> = {
  'Low': {
    bg: 'bg-emerald-500',
    text: 'text-emerald-700',
    hex: '#10B981',
    border: 'border-emerald-500',
  },
  'Moderate': {
    bg: 'bg-amber-400',
    text: 'text-amber-800',
    hex: '#F59E0B',
    border: 'border-amber-400',
  },
  'High': {
    bg: 'bg-orange-500',
    text: 'text-orange-800',
    hex: '#F97316',
    border: 'border-orange-500',
  },
  'Severe': {
    bg: 'bg-red-500',
    text: 'text-red-800',
    hex: '#EF4444',
    border: 'border-red-500',
  },
  'No Travel': {
    bg: 'bg-rose-950',
    text: 'text-rose-200',
    hex: '#881337',
    border: 'border-rose-900',
  },
};

export const ROUTE_COLORS: string[] = [
  '#2563EB', // Blue for Route 1
  '#7C3AED', // Violet for Route 2
  '#0D9488', // Teal for Route 3
];

export interface RoutePreset {
  label: string;
  origin: string;
  destination: string;
  load_weight_lb: number;
  note: string;
}

export const SAMPLE_PRESETS: RoutePreset[] = [
  {
    label: 'Chicago → Denver (Assessment Scenario, 45k lb)',
    origin: 'Chicago, IL',
    destination: 'Denver, CO',
    load_weight_lb: 45000,
    note: 'Evaluates Great Plains crosswinds & heavy load escalation',
  },
  {
    label: 'Dallas → Atlanta (32k lb)',
    origin: 'Dallas, TX',
    destination: 'Atlanta, GA',
    load_weight_lb: 32000,
    note: 'Gulf corridor precipitation & thunderstorm checks',
  },
  {
    label: 'Seattle → Salt Lake City (42k lb)',
    origin: 'Seattle, WA',
    destination: 'Salt Lake City, UT',
    load_weight_lb: 42000,
    note: 'Mountain pass snowfall and winter icing risks',
  },
];

import type { RiskLevel } from '../types';

export const RISK_ORDER: readonly RiskLevel[] = ['Low', 'Moderate', 'High', 'Severe', 'No Travel'];

export type ThemeName = 'dark' | 'light';

interface RiskToken {
  /** CSS variable name holding the "r g b" triplet. */
  cssVar: string;
  /** Static hex used inside WebGL/canvas where CSS vars are not available. */
  hex: Record<ThemeName, string>;
  /** Shape glyph so risk is never encoded by colour alone. */
  glyph: string;
  short: string;
}

export const RISK_TOKENS: Record<RiskLevel, RiskToken> = {
  Low: { cssVar: '--risk-low', hex: { dark: '#3FB68B', light: '#1E8C64' }, glyph: '●', short: 'LOW' },
  Moderate: { cssVar: '--risk-moderate', hex: { dark: '#E8C547', light: '#B08A00' }, glyph: '◆', short: 'MOD' },
  High: { cssVar: '--risk-high', hex: { dark: '#F0883E', light: '#CC6216' }, glyph: '▲', short: 'HIGH' },
  Severe: { cssVar: '--risk-severe', hex: { dark: '#E5484D', light: '#C82830' }, glyph: '■', short: 'SEV' },
  'No Travel': { cssVar: '--risk-notravel', hex: { dark: '#B02E62', light: '#801640' }, glyph: '✕', short: 'NO-GO' },
};

export const riskVar = (level: RiskLevel, alpha = 1): string =>
  `rgb(var(${RISK_TOKENS[level].cssVar}) / ${alpha})`;

/** Neutral route identities — deliberately outside the risk hue family. */
export const ROUTE_TOKENS: readonly { name: string; hex: Record<ThemeName, string> }[] = [
  { name: 'Bone', hex: { dark: '#EDE6D6', light: '#1F2328' } },
  { name: 'Steel', hex: { dark: '#7FA7D9', light: '#2F5F98' } },
  { name: 'Sand', hex: { dark: '#B9A27A', light: '#8A6A35' } },
];

export const ACCENT_HEX: Record<ThemeName, string> = { dark: '#FFA62B', light: '#B86A00' };

export const MAP_STYLES: Record<ThemeName, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron',
};

export interface Scenario {
  id: string;
  label: string;
  origin: string;
  destination: string;
  load_weight_lb: number;
  note: string;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'chi-den',
    label: 'Chicago → Denver',
    origin: 'Chicago, IL',
    destination: 'Denver, CO',
    load_weight_lb: 45000,
    note: 'Assessment scenario · Great Plains crosswinds · 45k lb',
  },
  {
    id: 'dal-atl',
    label: 'Dallas → Atlanta',
    origin: 'Dallas, TX',
    destination: 'Atlanta, GA',
    load_weight_lb: 32000,
    note: 'Gulf corridor precipitation · 32k lb',
  },
  {
    id: 'sea-slc',
    label: 'Seattle → Salt Lake City',
    origin: 'Seattle, WA',
    destination: 'Salt Lake City, UT',
    load_weight_lb: 42000,
    note: 'Mountain passes · snowfall · 42k lb',
  },
];

/** Next whole hour + 1h, as a local `datetime-local` string. */
export function defaultDepartureLocal(): string {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

export const formatClock = (d: Date | string): string => timeFmt.format(new Date(d));
export const formatDay = (d: Date | string): string => dayFmt.format(new Date(d));
export const formatDate = (d: Date | string): string => dateFmt.format(new Date(d));

export function formatEta(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  return { day: formatDay(d), time: formatClock(d) };
}

export const fmtInt = (n: number): string => Math.round(n).toLocaleString();
export const fmt1 = (n: number): string => n.toFixed(1);

export function addHours(iso: string, h: number): Date {
  return new Date(new Date(iso).getTime() + h * 3_600_000);
}

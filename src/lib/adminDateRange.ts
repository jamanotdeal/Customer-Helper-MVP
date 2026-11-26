// Date ranges for the admin lists. Days are local calendar days, written
// YYYY-MM-DD and read back as `${day}T00:00:00` — the same convention the
// admin's date inputs and reports already use.

export type AdminDatePreset = 'TODAY' | 'YESTERDAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'CUSTOM';

export interface AdminDateRange {
  preset: AdminDatePreset;
  /** First day, inclusive (YYYY-MM-DD). */
  start: string;
  /** Last day, inclusive (YYYY-MM-DD). */
  end: string;
}

export const toLocalDay = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalDay(d);
};

export function rangeForPreset(preset: Exclude<AdminDatePreset, 'CUSTOM'>): AdminDateRange {
  const today = toLocalDay();
  switch (preset) {
    case 'YESTERDAY':
      return { preset, start: daysAgo(1), end: daysAgo(1) };
    case 'LAST_7':
      return { preset, start: daysAgo(6), end: today };
    case 'LAST_30':
      return { preset, start: daysAgo(29), end: today };
    case 'THIS_MONTH': {
      const d = new Date();
      d.setDate(1);
      return { preset, start: toLocalDay(d), end: today };
    }
    default:
      return { preset: 'TODAY', start: today, end: today };
  }
}

/** Server bounds for a range of days: [start of first day, start of the day after the last). */
export function rangeBoundsIso(start: string, end: string): { startIso: string; endIso: string } {
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T00:00:00`);
  to.setDate(to.getDate() + 1);
  return { startIso: from.toISOString(), endIso: to.toISOString() };
}

/** True when an ISO timestamp falls on one of the range's days. */
export function isInRange(iso: string | undefined, startIso: string, endIso: string): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(startIso).getTime() && t < new Date(endIso).getTime();
}

export function describeRange(range: AdminDateRange): string {
  switch (range.preset) {
    case 'TODAY': return 'today';
    case 'YESTERDAY': return 'yesterday';
    case 'LAST_7': return 'last 7 days';
    case 'LAST_30': return 'last 30 days';
    case 'THIS_MONTH': return 'this month';
    default: return range.start === range.end ? range.start : `${range.start} – ${range.end}`;
  }
}

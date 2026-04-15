/**
 * Finance projection engine — pure functions (no DB access).
 *
 * Given a starting capital, a set of realized transactions, scheduled
 * future transactions, and recurring series, compute the running capital
 * curve between two dates at a chosen granularity.
 *
 * Kept DB-agnostic so the service layer can unit test it without Prisma.
 */

export type RecurrenceType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
export type TransactionType = 'INCOME' | 'EXPENSE';
export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface ProjectionTransaction {
  id: string;
  date: Date;
  amount: number; // positive number, direction comes from `type`
  type: TransactionType;
}

export interface ProjectionSeries {
  id: string;
  type: TransactionType;
  amount: number;
  recurrenceType: RecurrenceType;
  interval: number;
  daysOfWeek: number[]; // 0=Sun..6=Sat
  dayOfMonth: number | null;
  monthOfYear: number | null; // 1..12
  startDate: Date;
  endDate: Date | null;
  paused: boolean;
}

export interface ProjectionPoint {
  date: string;  // ISO yyyy-mm-dd
  income: number;
  expense: number;
  net: number;
  balance: number; // running capital at end of bucket
}

export interface ProjectionInput {
  startingBalance: number;
  referenceDate: Date;
  from: Date;
  to: Date;
  granularity: Granularity;
  realized: ProjectionTransaction[];
  scheduled: ProjectionTransaction[];
  series: ProjectionSeries[];
}

// ---- date helpers (UTC-based to avoid TZ drift) ----

const MS_DAY = 24 * 3600 * 1000;

function toUtcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDay(d: Date): string {
  return toUtcDate(d).toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(toUtcDate(d).getTime() + n * MS_DAY);
}

function addMonths(d: Date, n: number): Date {
  const u = toUtcDate(d);
  return new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth() + n, u.getUTCDate()));
}

function addYears(d: Date, n: number): Date {
  const u = toUtcDate(d);
  return new Date(Date.UTC(u.getUTCFullYear() + n, u.getUTCMonth(), u.getUTCDate()));
}

function startOfWeek(d: Date): Date {
  // Monday as first day
  const u = toUtcDate(d);
  const dow = u.getUTCDay(); // 0=Sun
  const diff = (dow + 6) % 7;
  return addDays(u, -diff);
}

function startOfMonth(d: Date): Date {
  const u = toUtcDate(d);
  return new Date(Date.UTC(u.getUTCFullYear(), u.getUTCMonth(), 1));
}

function startOfYear(d: Date): Date {
  const u = toUtcDate(d);
  return new Date(Date.UTC(u.getUTCFullYear(), 0, 1));
}

function bucketStart(d: Date, g: Granularity): Date {
  switch (g) {
    case 'day': return toUtcDate(d);
    case 'week': return startOfWeek(d);
    case 'month': return startOfMonth(d);
    case 'year': return startOfYear(d);
  }
}

function bucketNext(d: Date, g: Granularity): Date {
  switch (g) {
    case 'day': return addDays(d, 1);
    case 'week': return addDays(d, 7);
    case 'month': return addMonths(d, 1);
    case 'year': return addYears(d, 1);
  }
}

// ---- occurrence generator ----

/**
 * Expand a recurring series into concrete occurrence dates within [from, to].
 * Bounded by the series' own startDate / endDate and `paused` flag.
 */
export function generateOccurrences(
  series: ProjectionSeries,
  from: Date,
  to: Date,
): Date[] {
  if (series.paused) return [];
  const rangeStart = toUtcDate(from);
  const rangeEnd = toUtcDate(to);
  const sStart = toUtcDate(series.startDate);
  const sEnd = series.endDate ? toUtcDate(series.endDate) : null;

  const lowerBound = sStart > rangeStart ? sStart : rangeStart;
  const upperBound = sEnd && sEnd < rangeEnd ? sEnd : rangeEnd;
  if (lowerBound > upperBound) return [];

  const out: Date[] = [];
  const interval = Math.max(1, series.interval);

  switch (series.recurrenceType) {
    case 'DAILY': {
      // first occurrence >= lowerBound aligned to sStart + k*interval days
      const daysFromStart = Math.floor((lowerBound.getTime() - sStart.getTime()) / MS_DAY);
      const firstK = Math.max(0, Math.ceil(daysFromStart / interval));
      let cur = addDays(sStart, firstK * interval);
      while (cur <= upperBound) {
        if (cur >= lowerBound) out.push(cur);
        cur = addDays(cur, interval);
      }
      break;
    }
    case 'WEEKLY': {
      const days = series.daysOfWeek.length > 0
        ? series.daysOfWeek
        : [sStart.getUTCDay()];
      // Align to the week of sStart, step by `interval` weeks
      let weekStart = startOfWeek(sStart);
      while (weekStart <= upperBound) {
        for (const dow of days) {
          // startOfWeek is Monday; map 0=Sun → 6, 1=Mon → 0, ...
          const offset = (dow + 6) % 7;
          const occ = addDays(weekStart, offset);
          if (occ >= lowerBound && occ <= upperBound && occ >= sStart) {
            out.push(occ);
          }
        }
        weekStart = addDays(weekStart, 7 * interval);
      }
      break;
    }
    case 'MONTHLY': {
      const dom = series.dayOfMonth ?? sStart.getUTCDate();
      let cur = new Date(Date.UTC(sStart.getUTCFullYear(), sStart.getUTCMonth(), 1));
      while (cur <= upperBound) {
        const daysInMonth = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0)).getUTCDate();
        const day = Math.min(dom, daysInMonth);
        const occ = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), day));
        if (occ >= lowerBound && occ <= upperBound && occ >= sStart) {
          out.push(occ);
        }
        cur = addMonths(cur, interval);
      }
      break;
    }
    case 'YEARLY': {
      const month = (series.monthOfYear ?? sStart.getUTCMonth() + 1) - 1;
      const dom = series.dayOfMonth ?? sStart.getUTCDate();
      let year = sStart.getUTCFullYear();
      while (true) {
        const occ = new Date(Date.UTC(year, month, dom));
        if (occ > upperBound) break;
        if (occ >= lowerBound && occ >= sStart) out.push(occ);
        year += interval;
      }
      break;
    }
    case 'CUSTOM':
    default:
      break;
  }

  return out;
}

// ---- main projection ----

export function computeProjection(input: ProjectionInput): ProjectionPoint[] {
  const { startingBalance, referenceDate, from, to, granularity, realized, scheduled, series } = input;

  // Build a flat list of dated deltas inside [from, to]
  type Delta = { date: Date; income: number; expense: number };
  const deltas: Delta[] = [];

  const pushTx = (t: ProjectionTransaction) => {
    if (t.date < from || t.date > to) return;
    if (t.type === 'INCOME') deltas.push({ date: t.date, income: t.amount, expense: 0 });
    else deltas.push({ date: t.date, income: 0, expense: t.amount });
  };

  realized.forEach(pushTx);
  scheduled.forEach(pushTx);

  for (const s of series) {
    const occs = generateOccurrences(s, from, to);
    for (const occ of occs) {
      if (s.type === 'INCOME') deltas.push({ date: occ, income: s.amount, expense: 0 });
      else deltas.push({ date: occ, income: 0, expense: s.amount });
    }
  }

  // Bucket deltas by granularity
  const buckets = new Map<string, { start: Date; income: number; expense: number }>();
  for (const d of deltas) {
    const bStart = bucketStart(d.date, granularity);
    const key = isoDay(bStart);
    const cur = buckets.get(key) ?? { start: bStart, income: 0, expense: 0 };
    cur.income += d.income;
    cur.expense += d.expense;
    buckets.set(key, cur);
  }

  // Walk buckets from `from` to `to`, producing one point per bucket even if empty
  const points: ProjectionPoint[] = [];
  // Starting capital must account for realized/scheduled before `from`
  // (we assume caller passes the right starting balance, OR pre-rolls it).
  // Simplification: we compute pre-roll from series + realized + scheduled between referenceDate and from.
  let balance = startingBalance;

  // Pre-roll: everything between referenceDate and (from - 1 day)
  if (from > referenceDate) {
    const preFrom = referenceDate;
    const preTo = addDays(from, -1);
    const preDeltas: Delta[] = [];
    const pushPre = (t: ProjectionTransaction) => {
      if (t.date >= preFrom && t.date <= preTo) {
        if (t.type === 'INCOME') preDeltas.push({ date: t.date, income: t.amount, expense: 0 });
        else preDeltas.push({ date: t.date, income: 0, expense: t.amount });
      }
    };
    realized.forEach(pushPre);
    scheduled.forEach(pushPre);
    for (const s of series) {
      const occs = generateOccurrences(s, preFrom, preTo);
      for (const occ of occs) {
        if (s.type === 'INCOME') preDeltas.push({ date: occ, income: s.amount, expense: 0 });
        else preDeltas.push({ date: occ, income: 0, expense: s.amount });
      }
    }
    for (const d of preDeltas) balance += d.income - d.expense;
  }

  let cursor = bucketStart(from, granularity);
  const end = toUtcDate(to);
  while (cursor <= end) {
    const key = isoDay(cursor);
    const cur = buckets.get(key) ?? { start: cursor, income: 0, expense: 0 };
    balance += cur.income - cur.expense;
    points.push({
      date: isoDay(cursor),
      income: round2(cur.income),
      expense: round2(cur.expense),
      net: round2(cur.income - cur.expense),
      balance: round2(balance),
    });
    cursor = bucketNext(cursor, granularity);
  }

  return points;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

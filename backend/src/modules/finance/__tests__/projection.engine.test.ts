import {
  computeProjection,
  generateOccurrences,
  ProjectionSeries,
  ProjectionTransaction,
} from '../projection.engine';

const utc = (s: string) => new Date(s + 'T00:00:00Z');

describe('projection.engine', () => {
  describe('generateOccurrences', () => {
    it('DAILY every 1 day', () => {
      const s: ProjectionSeries = {
        id: 's', type: 'EXPENSE', amount: 10,
        recurrenceType: 'DAILY', interval: 1, daysOfWeek: [],
        dayOfMonth: null, monthOfYear: null,
        startDate: utc('2026-01-01'), endDate: null, paused: false,
      };
      const occs = generateOccurrences(s, utc('2026-01-01'), utc('2026-01-05'));
      expect(occs.map((d) => d.toISOString().slice(0, 10))).toEqual([
        '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05',
      ]);
    });

    it('DAILY every 3 days', () => {
      const s: ProjectionSeries = {
        id: 's', type: 'INCOME', amount: 10,
        recurrenceType: 'DAILY', interval: 3, daysOfWeek: [],
        dayOfMonth: null, monthOfYear: null,
        startDate: utc('2026-01-01'), endDate: null, paused: false,
      };
      const occs = generateOccurrences(s, utc('2026-01-01'), utc('2026-01-10'));
      expect(occs.map((d) => d.toISOString().slice(0, 10))).toEqual([
        '2026-01-01', '2026-01-04', '2026-01-07', '2026-01-10',
      ]);
    });

    it('MONTHLY on day-of-month with clamping for short months', () => {
      const s: ProjectionSeries = {
        id: 's', type: 'EXPENSE', amount: 100,
        recurrenceType: 'MONTHLY', interval: 1, daysOfWeek: [],
        dayOfMonth: 31, monthOfYear: null,
        startDate: utc('2026-01-31'), endDate: null, paused: false,
      };
      const occs = generateOccurrences(s, utc('2026-01-01'), utc('2026-04-30'));
      expect(occs.map((d) => d.toISOString().slice(0, 10))).toEqual([
        '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
      ]);
    });

    it('WEEKLY on specified days-of-week', () => {
      const s: ProjectionSeries = {
        id: 's', type: 'EXPENSE', amount: 5,
        recurrenceType: 'WEEKLY', interval: 1,
        daysOfWeek: [1, 3], // Mon, Wed
        dayOfMonth: null, monthOfYear: null,
        startDate: utc('2026-01-05'), // Mon
        endDate: null, paused: false,
      };
      const occs = generateOccurrences(s, utc('2026-01-05'), utc('2026-01-18'));
      expect(occs.map((d) => d.toISOString().slice(0, 10))).toEqual([
        '2026-01-05', '2026-01-07', '2026-01-12', '2026-01-14',
      ]);
    });

    it('respects paused and endDate', () => {
      const s: ProjectionSeries = {
        id: 's', type: 'INCOME', amount: 100,
        recurrenceType: 'DAILY', interval: 1, daysOfWeek: [],
        dayOfMonth: null, monthOfYear: null,
        startDate: utc('2026-01-01'), endDate: utc('2026-01-03'), paused: false,
      };
      const occs = generateOccurrences(s, utc('2026-01-01'), utc('2026-01-10'));
      expect(occs).toHaveLength(3);

      const paused = { ...s, paused: true };
      expect(generateOccurrences(paused, utc('2026-01-01'), utc('2026-01-10'))).toHaveLength(0);
    });
  });

  describe('computeProjection', () => {
    it('computes monthly capital curve mixing realized, scheduled and recurring', () => {
      const realized: ProjectionTransaction[] = [
        { id: 'r1', date: utc('2026-01-05'), amount: 200, type: 'EXPENSE' },
      ];
      const scheduled: ProjectionTransaction[] = [
        { id: 's1', date: utc('2026-02-10'), amount: 500, type: 'EXPENSE' },
      ];
      const series: ProjectionSeries[] = [
        {
          id: 'salary', type: 'INCOME', amount: 3000,
          recurrenceType: 'MONTHLY', interval: 1, daysOfWeek: [],
          dayOfMonth: 1, monthOfYear: null,
          startDate: utc('2026-01-01'), endDate: null, paused: false,
        },
        {
          id: 'rent', type: 'EXPENSE', amount: 1000,
          recurrenceType: 'MONTHLY', interval: 1, daysOfWeek: [],
          dayOfMonth: 5, monthOfYear: null,
          startDate: utc('2026-01-01'), endDate: null, paused: false,
        },
      ];

      const points = computeProjection({
        startingBalance: 1000,
        referenceDate: utc('2026-01-01'),
        from: utc('2026-01-01'),
        to: utc('2026-03-31'),
        granularity: 'month',
        realized,
        scheduled,
        series,
      });

      expect(points).toHaveLength(3);
      // Jan: +3000 salary, -1000 rent, -200 realized => +1800 → 2800
      expect(points[0]!.date).toBe('2026-01-01');
      expect(points[0]!.balance).toBe(2800);
      // Feb: +3000 salary, -1000 rent, -500 scheduled => +1500 → 4300
      expect(points[1]!.date).toBe('2026-02-01');
      expect(points[1]!.balance).toBe(4300);
      // Mar: +3000 salary, -1000 rent => +2000 → 6300
      expect(points[2]!.date).toBe('2026-03-01');
      expect(points[2]!.balance).toBe(6300);
    });

    it('pre-rolls transactions between referenceDate and from', () => {
      const points = computeProjection({
        startingBalance: 0,
        referenceDate: utc('2026-01-01'),
        from: utc('2026-03-01'),
        to: utc('2026-03-31'),
        granularity: 'month',
        realized: [{ id: 'r', date: utc('2026-01-15'), amount: 500, type: 'INCOME' }],
        scheduled: [],
        series: [],
      });
      expect(points).toHaveLength(1);
      expect(points[0]!.balance).toBe(500);
    });

    it('day granularity produces one point per day', () => {
      const points = computeProjection({
        startingBalance: 100,
        referenceDate: utc('2026-01-01'),
        from: utc('2026-01-01'),
        to: utc('2026-01-03'),
        granularity: 'day',
        realized: [{ id: 'r', date: utc('2026-01-02'), amount: 50, type: 'EXPENSE' }],
        scheduled: [],
        series: [],
      });
      expect(points.map((p) => [p.date, p.balance])).toEqual([
        ['2026-01-01', 100],
        ['2026-01-02', 50],
        ['2026-01-03', 50],
      ]);
    });
  });
});

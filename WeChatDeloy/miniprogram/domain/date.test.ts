/**
 * domain/date.ts 单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  formatDate,
  parseDate,
  isDateInRange,
  isPastDate,
  generateDateOptions,
  inferMealTypeFromTime,
  daysBetween,
  getToday,
  getPickerDateBounds,
  getMinSelectableDate,
  getMaxSelectableDate,
  DATE_RANGE,
} from './date';

describe('formatDate', () => {
  it('pads single-digit month and day with zeros', () => {
    const d = new Date(2026, 0, 5); // 2026-01-05
    expect(formatDate(d)).toBe('2026-01-05');
  });

  it('handles two-digit month/day unchanged', () => {
    const d = new Date(2026, 11, 25); // 2026-12-25
    expect(formatDate(d)).toBe('2026-12-25');
  });
});

describe('parseDate', () => {
  it('returns a Date at local midnight', () => {
    const d = parseDate('2026-08-17');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // 0-indexed August
    expect(d.getDate()).toBe(17);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('round-trips with formatDate', () => {
    const original = new Date(2030, 5, 9);
    expect(formatDate(original)).toBe('2030-06-09');
    expect(formatDate(parseDate(formatDate(original)))).toBe('2030-06-09');
  });
});

describe('getToday', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(getToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isDateInRange', () => {
  it('returns true for today', () => {
    expect(isDateInRange(getToday())).toBe(true);
  });

  it('returns true for dates within next 30 days', () => {
    const today = parseDate(getToday());
    const future = new Date(today);
    future.setDate(future.getDate() + 15);
    expect(isDateInRange(formatDate(future))).toBe(true);
  });

  it('returns true for the boundary (today + 30 days)', () => {
    const today = parseDate(getToday());
    const max = new Date(today);
    max.setDate(max.getDate() + 30);
    expect(isDateInRange(formatDate(max))).toBe(true);
  });

  it('returns false for past dates', () => {
    const today = parseDate(getToday());
    const past = new Date(today);
    past.setDate(past.getDate() - 1);
    expect(isDateInRange(formatDate(past))).toBe(false);
  });

  it('returns false for dates beyond 30 days', () => {
    const today = parseDate(getToday());
    const future = new Date(today);
    future.setDate(future.getDate() + 31);
    expect(isDateInRange(formatDate(future))).toBe(false);
  });
});

describe('isPastDate', () => {
  it('returns false for today', () => {
    expect(isPastDate(getToday())).toBe(false);
  });

  it('returns true for yesterday', () => {
    const today = parseDate(getToday());
    const past = new Date(today);
    past.setDate(past.getDate() - 1);
    expect(isPastDate(formatDate(past))).toBe(true);
  });

  it('returns false for tomorrow', () => {
    const today = parseDate(getToday());
    const future = new Date(today);
    future.setDate(future.getDate() + 1);
    expect(isPastDate(formatDate(future))).toBe(false);
  });
});

describe('generateDateOptions', () => {
  it('returns 31 options (today + 30 days)', () => {
    expect(generateDateOptions()).toHaveLength(31);
  });

  it('first entry starts with "今天"', () => {
    expect(generateDateOptions()[0].label.startsWith('今天')).toBe(true);
  });

  it('second entry starts with "明天"', () => {
    expect(generateDateOptions()[1].label.startsWith('明天')).toBe(true);
  });

  it('third entry starts with "后天"', () => {
    expect(generateDateOptions()[2].label.startsWith('后天')).toBe(true);
  });

  it('every entry has a value in YYYY-MM-DD', () => {
    for (const opt of generateDateOptions()) {
      expect(opt.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('entries from index 3 onward use "X月Y日" format', () => {
    const opt = generateDateOptions()[5];
    expect(opt.label).toMatch(/^\d+月\d+日/);
  });

  it('values are monotonically increasing', () => {
    const opts = generateDateOptions();
    for (let i = 1; i < opts.length; i++) {
      expect(opts[i].value > opts[i - 1].value).toBe(true);
    }
  });
});

describe('inferMealTypeFromTime', () => {
  it('returns one of the three valid meal types', () => {
    const meal = inferMealTypeFromTime();
    expect(['breakfast', 'lunch', 'dinner']).toContain(meal);
  });
});

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2026-08-17', '2026-08-17')).toBe(0);
  });

  it('returns positive when second is later', () => {
    expect(daysBetween('2026-08-17', '2026-08-20')).toBe(3);
  });

  it('returns negative when second is earlier', () => {
    expect(daysBetween('2026-08-20', '2026-08-17')).toBe(-3);
  });

  it('crosses month boundary correctly', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3);
  });

  it('crosses year boundary correctly', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
  });
});

describe('DATE_RANGE constants', () => {
  it('exposes the 30-day future window', () => {
    expect(DATE_RANGE.MAX_OFFSET_DAYS).toBe(30);
    expect(DATE_RANGE.MIN_OFFSET_DAYS).toBe(0);
  });
});

describe('getPickerDateBounds', () => {
  it('returns start = today, end = today + 30', () => {
    const { start, end } = getPickerDateBounds();
    expect(start).toBe(getToday());
    expect(daysBetween(start, end)).toBe(30);
  });

  it('bounds are valid YYYY-MM-DD strings', () => {
    const { start, end } = getPickerDateBounds();
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getMinSelectableDate / getMaxSelectableDate', () => {
  it('min equals today', () => {
    expect(getMinSelectableDate()).toBe(getToday());
  });

  it('max equals today + 30', () => {
    expect(daysBetween(getMinSelectableDate(), getMaxSelectableDate())).toBe(30);
  });
});
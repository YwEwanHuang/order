import { describe, it, expect } from 'vitest';
import { todayISO, shiftISO, isInRange, formatDisplay } from './date';

describe('todayISO', () => {
  it('returns YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('shiftISO', () => {
  it('+1 = tomorrow', () => {
    const today = todayISO();
    const tomorrow = shiftISO(today, 1);
    expect(new Date(tomorrow).getTime() - new Date(today).getTime()).toBe(86400000);
  });
  it('-1 = yesterday', () => {
    const today = todayISO();
    const yest = shiftISO(today, -1);
    expect(new Date(today).getTime() - new Date(yest).getTime()).toBe(86400000);
  });
});

describe('isInRange', () => {
  it('today = true', () => {
    expect(isInRange(todayISO())).toBe(true);
  });
  it('+6 = true (boundary inclusive)', () => {
    expect(isInRange(shiftISO(todayISO(), 6))).toBe(true);
  });
  it('+7 = false', () => {
    expect(isInRange(shiftISO(todayISO(), 7))).toBe(false);
  });
  it('-1 = false', () => {
    expect(isInRange(shiftISO(todayISO(), -1))).toBe(false);
  });
});

describe('formatDisplay', () => {
  it('8月20日 周三', () => {
    const out = formatDisplay('2026-08-20');
    expect(out).toMatch(/^8月20日/);
  });
});
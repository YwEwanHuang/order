import { describe, it, expect } from 'vitest';
import { validateNote, validateDishCount, buildPayload, maskOpenid } from './mealPlan';

describe('validateNote', () => {
  it('空 → ok', () => expect(validateNote('')).toBeNull());
  it('100 字 → ok', () => expect(validateNote('x'.repeat(100))).toBeNull());
  it('200 字 → ok (boundary)', () => expect(validateNote('x'.repeat(200))).toBeNull());
  it('201 字 → 报错', () => expect(validateNote('x'.repeat(201))).toBe('note_too_long'));
});

describe('validateDishCount', () => {
  it('0 → 报错', () => expect(validateDishCount([])).toBe('invalid_dish_count'));
  it('1 → ok', () => expect(validateDishCount([1])).toBeNull());
  it('20 → ok', () => expect(validateDishCount(Array(20).fill(1))).toBeNull());
  it('21 → 报错', () => expect(validateDishCount(Array(21).fill(1))).toBe('invalid_dish_count'));
});

describe('buildPayload', () => {
  it('去重', () => {
    expect(buildPayload('2026-08-20', [1, 1, 2], '')).toEqual({
      date: '2026-08-20',
      dish_ids: [1, 2],
      note: '',
    });
  });
  it('note undefined → 字符串空', () => {
    expect(buildPayload('2026-08-20', [1], undefined as any).note).toBe('');
  });
});

describe('maskOpenid', () => {
  it('短 openid 原样返回', () => {
    expect(maskOpenid('oABCD')).toBe('oABCD');
  });
  it('长 openid 取首尾各 4', () => {
    expect(maskOpenid('oABCDEFGHijklmnop')).toBe('oABCD…mnop');
  });
  it('null → 空', () => {
    expect(maskOpenid(null)).toBe('');
  });
});
/**
 * domain/selection.ts 单元测试
 */
import { describe, it, expect } from 'vitest';
import type { Dish } from './types';
import {
  addDish,
  removeDish,
  isSelected,
  getSelectedCount,
  toggleDish,
  hasUnsavedChanges,
  clearSelection,
  changeDate,
  changeMealType,
  createInitialState,
  validateSelectionForSubmit,
  validateNote,
  buildSubmitBody,
  shouldConfirmOnSwitch,
  MIN_SELECTION_ITEMS,
  MAX_SELECTION_ITEMS,
  MAX_NOTE_LENGTH,
} from './selection';
import { isValidMealType } from './types';
import { getToday } from './date';

// 用相对日期避免 fixture 随时间漂移；模块加载时算一次
const TODAY = getToday();
const TOMORROW_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
})();

const baseState = createInitialState(TODAY, 'lunch');

const dishA: Dish = {
  id: 'a',
  name: '红烧肉',
  category: 'hot',
  isActive: true,
  sortOrder: 1,
};

const dishB: Dish = {
  id: 'b',
  name: '凉拌黄瓜',
  category: 'cold',
  isActive: true,
  sortOrder: 2,
  imageUrl: 'cloud://img-b',
};

describe('createInitialState', () => {
  it('creates empty state with given date and mealType', () => {
    const s = createInitialState('2026-08-17', 'dinner');
    expect(s).toEqual({ date: '2026-08-17', mealType: 'dinner', items: [] });
  });
});

describe('addDish', () => {
  it('appends dish to items', () => {
    const next = addDish(baseState, dishA);
    expect(next.items).toEqual([
      { dishId: 'a', name: '红烧肉', imageUrl: undefined },
    ]);
  });

  it('preserves imageUrl when provided', () => {
    const next = addDish(baseState, dishB);
    expect(next.items[0].imageUrl).toBe('cloud://img-b');
  });

  it('returns same state when dish already exists', () => {
    const once = addDish(baseState, dishA);
    const twice = addDish(once, dishA);
    expect(twice).toBe(once);
  });

  it('does not mutate the input state', () => {
    addDish(baseState, dishA);
    expect(baseState.items).toEqual([]);
  });
});

describe('removeDish', () => {
  it('removes matching dish', () => {
    const once = addDish(baseState, dishA);
    const twice = addDish(once, dishB);
    const next = removeDish(twice, 'a');
    expect(next.items).toHaveLength(1);
    expect(next.items[0].dishId).toBe('b');
  });

  it('is a no-op when id is not present', () => {
    const next = removeDish(baseState, 'missing');
    expect(next.items).toEqual([]);
  });
});

describe('isSelected', () => {
  it('returns true for selected id', () => {
    const next = addDish(baseState, dishA);
    expect(isSelected(next, 'a')).toBe(true);
  });

  it('returns false for absent id', () => {
    expect(isSelected(baseState, 'a')).toBe(false);
  });
});

describe('getSelectedCount', () => {
  it('returns 0 for empty state', () => {
    expect(getSelectedCount(baseState)).toBe(0);
  });

  it('returns count after adds', () => {
    const next = addDish(addDish(baseState, dishA), dishB);
    expect(getSelectedCount(next)).toBe(2);
  });
});

describe('toggleDish', () => {
  it('adds when not selected', () => {
    const next = toggleDish(baseState, dishA);
    expect(next.items).toHaveLength(1);
  });

  it('removes when already selected', () => {
    const once = toggleDish(baseState, dishA);
    const twice = toggleDish(once, dishA);
    expect(twice.items).toEqual([]);
  });
});

describe('hasUnsavedChanges', () => {
  it('returns false for empty state', () => {
    expect(hasUnsavedChanges(baseState)).toBe(false);
  });

  it('returns true when items present', () => {
    const next = addDish(baseState, dishA);
    expect(hasUnsavedChanges(next)).toBe(true);
  });
});

describe('clearSelection', () => {
  it('empties items but preserves date/mealType', () => {
    const next = clearSelection(addDish(baseState, dishA));
    expect(next.items).toEqual([]);
    expect(next.date).toBe(TODAY);
    expect(next.mealType).toBe('lunch');
  });
});

describe('changeDate', () => {
  it('updates date and clears items', () => {
    const next = changeDate(addDish(baseState, dishA), TOMORROW_DATE);
    expect(next).toEqual({ date: TOMORROW_DATE, mealType: 'lunch', items: [] });
  });
});

describe('changeMealType', () => {
  it('updates mealType and clears items', () => {
    const next = changeMealType(addDish(baseState, dishA), 'dinner');
    expect(next).toEqual({ date: TODAY, mealType: 'dinner', items: [] });
  });
});

// ---------- T-030 新增：餐次类型守卫 ----------
describe('isValidMealType', () => {
  it('accepts the three valid meal types', () => {
    expect(isValidMealType('breakfast')).toBe(true);
    expect(isValidMealType('lunch')).toBe(true);
    expect(isValidMealType('dinner')).toBe(true);
  });

  it('rejects unknown values', () => {
    expect(isValidMealType('snack')).toBe(false);
    expect(isValidMealType('')).toBe(false);
    expect(isValidMealType(null)).toBe(false);
    expect(isValidMealType(undefined)).toBe(false);
    expect(isValidMealType(42)).toBe(false);
  });

  it('is case-sensitive (matches API contract)', () => {
    expect(isValidMealType('BREAKFAST')).toBe(false);
    expect(isValidMealType('Breakfast')).toBe(false);
  });
});

// ---------- T-030 新增：选择篮数量校验 ----------
describe('validateSelectionForSubmit', () => {
  it('rejects empty selection with field=items', () => {
    const r = validateSelectionForSubmit(baseState);
    expect(r.ok).toBe(false);
    expect(r.field).toBe('items');
    expect(r.reason).toContain('至少');
  });

  it('accepts exactly MIN_SELECTION_ITEMS (1)', () => {
    const state = addDish(baseState, dishA);
    expect(validateSelectionForSubmit(state).ok).toBe(true);
  });

  it('accepts exactly MAX_SELECTION_ITEMS (20)', () => {
    let s = baseState;
    for (let i = 0; i < MAX_SELECTION_ITEMS; i++) {
      s = addDish(s, { id: `d${i}`, name: `菜${i}`, category: 'hot', isActive: true, sortOrder: i });
    }
    expect(s.items).toHaveLength(MAX_SELECTION_ITEMS);
    expect(validateSelectionForSubmit(s).ok).toBe(true);
  });

  it('rejects more than MAX_SELECTION_ITEMS', () => {
    let s = baseState;
    for (let i = 0; i < MAX_SELECTION_ITEMS + 1; i++) {
      s = addDish(s, { id: `d${i}`, name: `菜${i}`, category: 'hot', isActive: true, sortOrder: i });
    }
    const r = validateSelectionForSubmit(s);
    expect(r.ok).toBe(false);
    expect(r.field).toBe('items');
    expect(r.reason).toContain(String(MAX_SELECTION_ITEMS));
  });

  it('rejects past date with field=date', () => {
    const state = addDish(createInitialState('2020-01-01', 'lunch'), dishA);
    const r = validateSelectionForSubmit(state);
    expect(r.ok).toBe(false);
    expect(r.field).toBe('date');
  });

  it('rejects out-of-range date (> +30 days) with field=date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 60);
    const yyyy = future.getFullYear();
    const mm = String(future.getMonth() + 1).padStart(2, '0');
    const dd = String(future.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const state = addDish(createInitialState(dateStr, 'lunch'), dishA);
    expect(validateSelectionForSubmit(state).ok).toBe(false);
  });

  it('rejects malformed date string', () => {
    const state = addDish(createInitialState('not-a-date', 'lunch'), dishA);
    expect(validateSelectionForSubmit(state).ok).toBe(false);
  });
});

// ---------- T-030 新增：备注长度校验 ----------
describe('validateNote', () => {
  it('treats undefined / null / empty as valid', () => {
    expect(validateNote(undefined).ok).toBe(true);
    expect(validateNote(null).ok).toBe(true);
    expect(validateNote('').ok).toBe(true);
  });

  it('accepts a normal short note', () => {
    expect(validateNote('少油少盐').ok).toBe(true);
  });

  it('accepts exactly MAX_NOTE_LENGTH chars', () => {
    expect(validateNote('a'.repeat(MAX_NOTE_LENGTH)).ok).toBe(true);
  });

  it('rejects more than MAX_NOTE_LENGTH chars', () => {
    const r = validateNote('a'.repeat(MAX_NOTE_LENGTH + 1));
    expect(r.ok).toBe(false);
    expect(r.field).toBe('note');
    expect(r.reason).toContain(String(MAX_NOTE_LENGTH));
  });
});

// ---------- T-030 新增：构造提交体 ----------
describe('buildSubmitBody', () => {
  it('maps SelectedDish and preserves imageUrl', () => {
    const s = addDish(addDish(baseState, dishA), dishB);
    const body = buildSubmitBody(s);
    expect(body.date).toBe(TODAY);
    expect(body.mealType).toBe('lunch');
    expect(body.items).toEqual([
      { dishId: 'a', name: '红烧肉', imageUrl: undefined },
      { dishId: 'b', name: '凉拌黄瓜', imageUrl: 'cloud://img-b' },
    ]);
    expect(body.note).toBeUndefined();
    expect(body.version).toBeUndefined();
  });

  it('includes note only when provided and non-empty', () => {
    const s = addDish(baseState, dishA);
    expect(buildSubmitBody(s, { note: '少油' }).note).toBe('少油');
    expect(buildSubmitBody(s, { note: '' }).note).toBeUndefined();
  });

  it('does not mutate input state', () => {
    const s = addDish(baseState, dishA);
    const before = JSON.stringify(s);
    buildSubmitBody(s, { note: 'x' });
    expect(JSON.stringify(s)).toBe(before);
  });
});

// ---------- T-030 新增：切换确认 ----------
describe('shouldConfirmOnSwitch', () => {
  it('returns false when selection is empty', () => {
    expect(shouldConfirmOnSwitch(baseState, { date: TOMORROW_DATE })).toBe(false);
    expect(shouldConfirmOnSwitch(baseState, { mealType: 'dinner' })).toBe(false);
  });

  it('returns false when target equals current (no real change)', () => {
    const s = addDish(baseState, dishA);
    expect(shouldConfirmOnSwitch(s, { date: s.date, mealType: s.mealType })).toBe(false);
  });

  it('returns true when changing date with unsaved items', () => {
    const s = addDish(baseState, dishA);
    expect(shouldConfirmOnSwitch(s, { date: TOMORROW_DATE })).toBe(true);
  });

  it('returns true when changing mealType with unsaved items', () => {
    const s = addDish(baseState, dishA);
    expect(shouldConfirmOnSwitch(s, { mealType: 'dinner' })).toBe(true);
  });

  it('returns false when checking date but items are empty (only mealType provided)', () => {
    // 提供 mealType 但与当前相同,所以无须确认
    expect(shouldConfirmOnSwitch(baseState, { mealType: 'lunch' })).toBe(false);
  });
});
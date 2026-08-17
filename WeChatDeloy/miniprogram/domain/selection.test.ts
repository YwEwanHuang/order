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
} from './selection';

const baseState = createInitialState('2026-08-17', 'lunch');

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
    expect(next.date).toBe('2026-08-17');
    expect(next.mealType).toBe('lunch');
  });
});

describe('changeDate', () => {
  it('updates date and clears items', () => {
    const next = changeDate(addDish(baseState, dishA), '2026-08-18');
    expect(next).toEqual({ date: '2026-08-18', mealType: 'lunch', items: [] });
  });
});

describe('changeMealType', () => {
  it('updates mealType and clears items', () => {
    const next = changeMealType(addDish(baseState, dishA), 'dinner');
    expect(next).toEqual({ date: '2026-08-17', mealType: 'dinner', items: [] });
  });
});
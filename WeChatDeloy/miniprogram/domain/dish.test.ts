import { describe, it, expect } from 'vitest';
import { activeOnly, sortDishes, groupByCategory } from './dish';

const dishes = [
  { id: 1, name: 'A', category: 'hot', is_active: 1, sort_order: 2, created_at: '' },
  { id: 2, name: 'B', category: 'cold', is_active: 0, sort_order: 3, created_at: '' },
  { id: 3, name: 'C', category: 'hot', is_active: 1, sort_order: 1, created_at: '' },
];

describe('activeOnly', () => {
  it('仅保留启用', () => {
    expect(activeOnly(dishes).map((d) => d.id)).toEqual([1, 3]);
  });
});

describe('sortDishes', () => {
  it('sort_order ASC, id ASC', () => {
    expect(sortDishes(dishes).map((d) => d.id)).toEqual([3, 1, 2]);
  });
});

describe('groupByCategory', () => {
  it('按 category 分组', () => {
    const groups = groupByCategory(activeOnly(dishes));
    expect(groups.map((g) => g.category)).toEqual(['hot', 'hot']);
  });
});
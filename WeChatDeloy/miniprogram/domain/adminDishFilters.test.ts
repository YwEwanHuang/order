/**
 * adminDishFilters 单元测试
 */
import { describe, it, expect } from 'vitest';
import { filterDishes } from './adminDishFilters';
import type { Dish } from './types';

function makeDish(overrides: Partial<Dish> = {}): Dish {
  return {
    id: 'd',
    name: '宫保鸡丁',
    category: 'hot',
    isActive: true,
    sortOrder: 0,
    ...overrides,
  };
}

describe('filterDishes', () => {
  const dishes: Dish[] = [
    makeDish({ id: '1', name: '宫保鸡丁', category: 'hot' }),
    makeDish({ id: '2', name: '凉拌黄瓜', category: 'cold' }),
    makeDish({ id: '3', name: '番茄蛋汤', category: 'soup' }),
    makeDish({ id: '4', name: '白米饭', category: 'staple' }),
    makeDish({ id: '5', name: '红豆糕', category: 'dessert' }),
  ];

  it('returns all when keyword and category are empty', () => {
    expect(filterDishes(dishes, '', '').map(d => d.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('filters by category', () => {
    expect(filterDishes(dishes, '', 'hot').map(d => d.id)).toEqual(['1']);
    expect(filterDishes(dishes, '', 'cold').map(d => d.id)).toEqual(['2']);
  });

  it('filters by keyword (case-insensitive)', () => {
    expect(filterDishes(dishes, '红', '').map(d => d.id)).toEqual(['5']);
    // 英文/拼音风格名称也应大小写不敏感
    const withEnglish: Dish[] = [
      makeDish({ id: 'en1', name: 'Mapo Tofu', category: 'hot' }),
    ];
    expect(filterDishes(withEnglish, 'mapo', '').map(d => d.id)).toEqual(['en1']);
    expect(filterDishes(withEnglish, 'MAPO', '').map(d => d.id)).toEqual(['en1']);
    expect(filterDishes(withEnglish, 'MaPo', '').map(d => d.id)).toEqual(['en1']);
  });

  it('keyword trims surrounding whitespace', () => {
    expect(filterDishes(dishes, '  红豆  ', '').map(d => d.id)).toEqual(['5']);
  });

  it('keyword and category combine with AND', () => {
    expect(filterDishes(dishes, '红', 'hot').map(d => d.id)).toEqual([]);
    // 关键词 '豆' 在第 5 条红豆糕，分类 hot 不匹配
    expect(filterDishes(dishes, '糕', 'dessert').map(d => d.id)).toEqual(['5']);
  });

  it('returns empty when no matches', () => {
    expect(filterDishes(dishes, '不存在的菜名', '')).toEqual([]);
  });

  it('does not mutate input', () => {
    const before = JSON.stringify(dishes);
    filterDishes(dishes, '红', 'dessert');
    expect(JSON.stringify(dishes)).toBe(before);
  });

  it('handles empty input list', () => {
    expect(filterDishes([], '', '')).toEqual([]);
    expect(filterDishes([], '红', 'hot')).toEqual([]);
  });

  it('keyword matching is substring (not exact)', () => {
    expect(filterDishes(dishes, '蛋汤', '').map(d => d.id)).toEqual(['3']);
  });

  it('empty keyword with all-categories returns full list', () => {
    expect(filterDishes(dishes, '', '')).toHaveLength(dishes.length);
  });
});
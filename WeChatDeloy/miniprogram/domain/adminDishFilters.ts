/**
 * 管理员菜品列表的客户端筛选逻辑（纯函数，无副作用）
 */
import type { Dish } from './types';

/**
 * 按关键字（名称包含）和分类同时过滤。
 * @param dishes 原始列表
 * @param keyword 名称关键字；空字符串 = 不过滤
 * @param category 分类；空字符串 = 不过滤
 * @returns 过滤后的新数组（不修改输入）
 */
export function filterDishes(dishes: Dish[], keyword: string, category: string): Dish[] {
  const kw = keyword.trim().toLowerCase();
  return dishes.filter(d => {
    if (category && d.category !== category) return false;
    if (kw && !d.name.toLowerCase().includes(kw)) return false;
    return true;
  });
}
/**
 * domain/types.ts
 *
 * 本文件目前只保留 selection.ts / pages/*.js 仍在使用的"旧 UI-shape"类型
 * （MealType / DishCategory / 旧 Dish / SelectedDish / MealPlanSubmit）。
 *
 * 新 API 层类型（Dish / MealPlan / ApiException）已内联在 services/api.ts。
 *
 * 计划：
 * - Phase 8 替换 pages/*.js 并删除 selection.ts 时一并清空本文件。
 */

/**
 * 餐次枚举
 */
export type MealType = 'breakfast' | 'lunch' | 'dinner';

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
};

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

export function isValidMealType(value: unknown): value is MealType {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner';
}

/**
 * 菜品分类
 */
export type DishCategory = 'hot' | 'cold' | 'soup' | 'staple' | 'dessert';

export const DISH_CATEGORY_LABELS: Record<DishCategory, string> = {
  hot: '热菜',
  cold: '凉菜',
  soup: '汤类',
  staple: '主食',
  dessert: '甜点',
};

export const DISH_CATEGORIES: DishCategory[] = ['hot', 'cold', 'soup', 'staple', 'dessert'];

/**
 * 菜品（旧 UI-shape，selection.ts / pages/*.js 仍在用；
 * Phase 8 替换 pages 时一并清理；不要在新代码里使用）
 */
export interface Dish {
  id: string;
  name: string;
  category: DishCategory;
  description?: string;
  imageUrl?: string; // cloud:// fileID
  isActive: boolean;
  sortOrder: number;
}

/**
 * 选择篮中的单项（仅 selection.ts 内部使用）
 */
export interface SelectedDish {
  dishId: string;
  name: string;
  imageUrl?: string;
}

/**
 * 点菜提交请求体（旧 POST /api/v1/meal-plans body；新 API 用 PUT + dish_ids）
 */
export interface MealPlanSubmit {
  date: string;       // YYYY-MM-DD
  mealType: MealType;
  items: SelectedDish[];
  note?: string;
}
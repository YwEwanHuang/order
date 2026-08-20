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
 * 菜品
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
 * 选择篮中的单项
 */
export interface SelectedDish {
  dishId: string;
  name: string;
  imageUrl?: string;
}

/**
 * 点菜提交请求体
 */
export interface MealPlanSubmit {
  date: string;       // YYYY-MM-DD
  mealType: MealType;
  items: SelectedDish[];
  note?: string;
}

/**
 * 点菜记录（查询返回）
 */
export interface MealPlan {
  id: string;
  date: string;
  mealType: MealType;
  items: SelectedDish[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * API 统一响应 / 错误
 */
export interface ApiResponse<T> {
  data: T;
  requestId: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
  requestId: string;
}

/**
 * 当前用户角色
 */
export type UserRole = 'user' | 'admin' | 'unknown';

export interface CurrentUser {
  role: UserRole;
}
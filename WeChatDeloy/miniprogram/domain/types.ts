/**
 * 餐次枚举
 */
export type MealType = 'breakfast' | 'lunch' | 'dinner';

/** 餐次中文展示 */
export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
};

/** 餐次列表（有序） */
export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

/**
 * 菜品分类枚举
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
  imageUrl?: string; // 占位图或云存储 URL
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
 * 点菜提交/修改请求体
 */
export interface MealPlanSubmit {
  date: string; // YYYY-MM-DD
  mealType: MealType;
  items: SelectedDish[];
  note?: string;
  version?: number; // 修改时传入，用于乐观锁
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
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * API 统一响应
 */
export interface ApiResponse<T> {
  data: T;
  requestId: string;
}

/**
 * API 错误响应
 */
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

/**
 * 当前用户信息
 */
export interface CurrentUser {
  role: UserRole;
}
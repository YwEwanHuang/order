/**
 * 选择篮状态管理（纯函数，无副作用）
 * 选择篮与当前日期/餐次绑定，切换时需要确认是否保留
 */

import { MealType, SelectedDish, Dish } from './types';

export interface SelectionState {
  date: string; // YYYY-MM-DD
  mealType: MealType;
  items: SelectedDish[]; // 已选菜品列表
}

/**
 * 从已有状态添加一道菜
 */
export function addDish(state: SelectionState, dish: Dish): SelectionState {
  const exists = state.items.some(item => item.dishId === dish.id);
  if (exists) return state; // 防止重复添加
  return {
    ...state,
    items: [
      ...state.items,
      { dishId: dish.id, name: dish.name, imageUrl: dish.imageUrl },
    ],
  };
}

/**
 * 从已有状态移除一道菜
 */
export function removeDish(state: SelectionState, dishId: string): SelectionState {
  return {
    ...state,
    items: state.items.filter(item => item.dishId !== dishId),
  };
}

/**
 * 检查某道菜是否已被选
 */
export function isSelected(state: SelectionState, dishId: string): boolean {
  return state.items.some(item => item.dishId === dishId);
}

/**
 * 获取已选数量
 */
export function getSelectedCount(state: SelectionState): number {
  return state.items.length;
}

/**
 * 切换选择某道菜（已选则移除，未选则添加）
 */
export function toggleDish(state: SelectionState, dish: Dish): SelectionState {
  if (isSelected(state, dish.id)) {
    return removeDish(state, dish.id);
  }
  return addDish(state, dish);
}

/**
 * 切换日期/餐次时检查是否有未提交的选择
 */
export function hasUnsavedChanges(state: SelectionState): boolean {
  return state.items.length > 0;
}

/**
 * 清空选择篮
 */
export function clearSelection(state: SelectionState): SelectionState {
  return { ...state, items: [] };
}

/**
 * 切换日期
 */
export function changeDate(state: SelectionState, newDate: string): SelectionState {
  return { ...state, date: newDate, items: [] };
}

/**
 * 切换餐次
 */
export function changeMealType(state: SelectionState, newMealType: MealType): SelectionState {
  return { ...state, mealType: newMealType, items: [] };
}

/**
 * 初始状态（默认今天，早餐）
 */
export function createInitialState(date: string, mealType: MealType): SelectionState {
  return { date, mealType, items: [] };
}
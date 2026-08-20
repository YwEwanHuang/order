/**
 * 选择篮状态管理（纯函数，无副作用）
 * 选择篮与当前日期/餐次绑定，切换时需要确认是否保留
 */

import { MealType, SelectedDish, Dish, MealPlanSubmit } from './types';
import { ValidationResult, validateDateForMealPlan } from './date';

/** 至少 1 道菜才能提交 */
export const MIN_SELECTION_ITEMS = 1;
/** 单次最多 20 道菜（与后端 meal_plans.items 长度限制一致） */
export const MAX_SELECTION_ITEMS = 20;
/** 备注最长字符数 */
export const MAX_NOTE_LENGTH = 100;

export interface SelectionState {
  date: string; // YYYY-MM-DD
  mealType: MealType;
  items: SelectedDish[]; // 已选菜品列表
  note?: string; // 编辑回填的备注
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

/**
 * 校验选择篮是否可提交（数量范围 + 日期范围）
 * @returns 当 ok=false 时,reason 可直接展示给用户
 */
export function validateSelectionForSubmit(state: SelectionState): ValidationResult {
  const dateCheck = validateDateForMealPlan(state.date);
  if (!dateCheck.ok) return dateCheck;

  if (state.items.length < MIN_SELECTION_ITEMS) {
    return { ok: false, field: 'items', reason: '请至少选择一道菜' };
  }
  if (state.items.length > MAX_SELECTION_ITEMS) {
    return {
      ok: false,
      field: 'items',
      reason: `一次最多选择 ${MAX_SELECTION_ITEMS} 道菜`,
    };
  }
  return { ok: true };
}

/**
 * 校验备注长度
 * @param note undefined 或空字符串都视为合法
 */
export function validateNote(note: string | undefined | null): ValidationResult {
  if (note === undefined || note === null || note.length === 0) return { ok: true };
  if (note.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      field: 'note',
      reason: `备注最多 ${MAX_NOTE_LENGTH} 个字`,
    };
  }
  return { ok: true };
}

/**
 * 构造提交给后端的 MealPlanSubmit 请求体
 * - 不校验内容；调用方应先跑 validateSelectionForSubmit
 * - 不复制 date 之外的无关字段
 */
export function buildSubmitBody(
  state: SelectionState,
  opts: { note?: string; version?: number } = {}
): MealPlanSubmit {
  const body: MealPlanSubmit = {
    date: state.date,
    mealType: state.mealType,
    items: state.items.map(({ dishId, name, imageUrl }) => ({
      dishId,
      name,
      imageUrl,
    })),
  };
  if (typeof opts.note === 'string' && opts.note.length > 0) {
    body.note = opts.note;
  }
  if (typeof opts.version === 'number' && Number.isFinite(opts.version)) {
    body.version = opts.version;
  }
  return body;
}

/**
 * 切换日期/餐次前是否需要弹"保留并切换 / 取消"确认
 * 仅当选择篮有未提交项, 且目标与当前不同时返回 true
 */
export function shouldConfirmOnSwitch(
  state: SelectionState,
  next: { date?: string; mealType?: MealType }
): boolean {
  if (!hasUnsavedChanges(state)) return false;
  if (next.date !== undefined && next.date !== state.date) return true;
  if (next.mealType !== undefined && next.mealType !== state.mealType) return true;
  return false;
}

/**
 * 生成幂等键（Idempotency-Key）。
 * 与后端契约对齐：相同 date/mealType/items/note → 相同 key。
 * - items 顺序无关（按 dishId 排序）
 * - 不含 openid（避免把 openid 落到日志或链路里）
 */
export function generateIdempotencyKey(input: {
  date: string;
  mealType: MealType;
  items: SelectedDish[];
  note?: string;
}): string {
  const itemsKey = itemsFingerprint(input.items);
  const noteKey = typeof input.note === 'string' ? input.note : '';
  return `mp:${input.date}:${input.mealType}:${itemsKey}:${noteKey}`;
}

/**
 * items 的稳定指纹（与顺序无关）
 * 暴露给测试，不作为 API
 */
export function itemsFingerprint(items: SelectedDish[]): string {
  return [...items]
    .sort((a, b) => (a.dishId < b.dishId ? -1 : a.dishId > b.dishId ? 1 : 0))
    .map(i => `${i.dishId}@${i.name}`)
    .join(',');
}
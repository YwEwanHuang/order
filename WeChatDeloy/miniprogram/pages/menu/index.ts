// pages/menu/index.ts
import {
  getToday,
  inferMealTypeFromTime,
  getPickerDateBounds,
  isPastDate,
  isDateInRange,
} from '../../domain/date';
import {
  SelectionState,
  createInitialState,
  toggleDish,
  changeDate,
  changeMealType,
  hasUnsavedChanges,
  getSelectedCount,
} from '../../domain/selection';
import type { MealType, Dish } from '../../domain/types';
import { fetchDishes, ApiException } from '../../services/api';

type DishWithSelected = Dish & { selected: boolean };

interface IMenuGlobalData {
  lastMealType?: MealType;
  lastCategory?: string;
}

interface IMenuApp {
  globalData: IMenuGlobalData & Record<string, unknown>;
}

Page({
  data: {
    loading: false,
    error: '',
    errorRequestId: '',
    selection: {} as SelectionState,
    selectedCount: 0,
    dishes: [] as DishWithSelected[],
    currentCategory: 'hot',
    showSwitchConfirm: false,
    pendingSwitch: null as { type: 'date' | 'mealType'; value: string } | null,
    dateBounds: { start: '', end: '' } as { start: string; end: string },
    /** 首次加载完成后才显示，避免空白闪烁；冷启动显示骨架 */
    initialLoaded: false,
  },

  onLoad() {
    const bounds = getPickerDateBounds();
    const app = getApp<IMenuApp>();
    const lastMealType = app.globalData.lastMealType;
    const lastCategory = app.globalData.lastCategory;

    const today = getToday();
    // 优先使用上次的餐次；若当前时间已过该餐次窗口（例如上午重新打开）
    // 才回退到根据时间推断的默认值
    const defaultMealType =
      lastMealType && isMealType(lastMealType) ? lastMealType : inferMealTypeFromTime();

    const selection = createInitialState(today, defaultMealType);
    const initialCategory = typeof lastCategory === 'string' ? lastCategory : 'hot';

    this.setData({
      selection,
      selectedCount: 0,
      currentCategory: initialCategory,
      dateBounds: bounds,
    });
    this.loadDishes(true);
  },

  // 只在从其他 tab 切回时刷新，避免不必要的请求
  onShow() {
    if (this.data.initialLoaded && !this.data.error) {
      this.loadDishes(false);
    }
  },

  async loadDishes(silent = false) {
    if (!silent) {
      this.setData({ loading: true });
    }
    this.setData({ error: '', errorRequestId: '' });
    try {
      const dishes = await fetchDishes(this.data.currentCategory);
      const decorated = this.markSelected(dishes);
      this.setData({
        dishes: decorated,
        loading: false,
        initialLoaded: true,
      });
    } catch (e: unknown) {
      console.error('[menu] loadDishes failed:', e);
      const code = e instanceof ApiException ? e.code : '';
      const reqId = e instanceof ApiException ? e.requestId || '' : '';
      const msg = e instanceof Error ? e.message : '加载失败';
      const errorText = code ? `${code}：${msg}` : msg;
      this.setData({
        error: errorText,
        errorRequestId: reqId,
        loading: false,
      });
    }
  },

  markSelected(dishes: Dish[]): DishWithSelected[] {
    const { selection } = this.data;
    const selectedIds = new Set(selection.items.map(i => i.dishId));
    return dishes.map(d => ({ ...d, selected: selectedIds.has(d.id) }));
  },

  onCategoryChange(e: any) {
    const category = e.currentTarget.dataset.category as string;
    if (category === this.data.currentCategory) return;
    this.setData({ currentCategory: category });
    const app = getApp<IMenuApp>();
    app.globalData.lastCategory = category;
    this.loadDishes(false);
  },

  onDateChange(e: any) {
    const newDate = e.detail.value as string;
    const { selection } = this.data;

    // 双层校验：picker 边界 + domain 校验
    if (isPastDate(newDate)) {
      wx.showToast({ title: '不能选择过去的日期', icon: 'none' });
      return;
    }
    if (!isDateInRange(newDate)) {
      wx.showToast({ title: '仅支持未来 30 天内', icon: 'none' });
      return;
    }

    if (hasUnsavedChanges(selection)) {
      this.setData({
        showSwitchConfirm: true,
        pendingSwitch: { type: 'date', value: newDate },
      });
    } else {
      this.doChangeDate(newDate);
    }
  },

  onMealTypeChange(e: any) {
    const newMealType = e.detail.value as MealType;
    if (!isMealType(newMealType)) return;
    const { selection } = this.data;

    if (hasUnsavedChanges(selection)) {
      this.setData({
        showSwitchConfirm: true,
        pendingSwitch: { type: 'mealType', value: newMealType },
      });
    } else {
      this.doChangeMealType(newMealType);
    }
  },

  onDishTap(e: any) {
    const dish = e.currentTarget.dataset.dish as Dish;
    const { selection, dishes } = this.data;
    const newSelection = toggleDish(selection, dish);
    const selectedIds = new Set(newSelection.items.map(i => i.dishId));
    const newDishes = dishes.map(d => ({
      ...d,
      selected: selectedIds.has(d.id),
    }));
    this.setData({
      selection: newSelection,
      dishes: newDishes,
      selectedCount: getSelectedCount(newSelection),
    });
  },

  onPullDownRefresh() {
    this.loadDishes(false).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  onConfirmSwitch() {
    const { pendingSwitch } = this.data;
    if (!pendingSwitch) return;

    if (pendingSwitch.type === 'date') {
      this.doChangeDate(pendingSwitch.value);
    } else {
      this.doChangeMealType(pendingSwitch.value as MealType);
    }
    this.setData({ showSwitchConfirm: false, pendingSwitch: null });
  },

  onCancelSwitch() {
    this.setData({ showSwitchConfirm: false, pendingSwitch: null });
  },

  doChangeDate(newDate: string) {
    const selection = changeDate(this.data.selection, newDate);
    const dishes = this.data.dishes.map(d => ({ ...d, selected: false }));
    this.setData({ selection, dishes, selectedCount: 0 });
  },

  doChangeMealType(newMealType: MealType) {
    const selection = changeMealType(this.data.selection, newMealType);
    const dishes = this.data.dishes.map(d => ({ ...d, selected: false }));
    const app = getApp<IMenuApp>();
    app.globalData.lastMealType = newMealType;
    this.setData({ selection, dishes, selectedCount: 0 });
  },

  onGoToConfirm() {
    const { selection } = this.data;
    if (getSelectedCount(selection) === 0) {
      wx.showToast({ title: '请先选择菜品', icon: 'none' });
      return;
    }
    const app = getApp<IMenuApp>();
    app.globalData.pendingSelection = selection;
    wx.navigateTo({ url: '/pages/selection/confirm' });
  },

  onCopyRequestId() {
    const { errorRequestId } = this.data;
    if (!errorRequestId) return;
    wx.setClipboardData({
      data: errorRequestId,
      success: () => wx.showToast({ title: '已复制请求 ID', icon: 'none' }),
    });
  },
});

function isMealType(v: string): v is MealType {
  return v === 'breakfast' || v === 'lunch' || v === 'dinner';
}
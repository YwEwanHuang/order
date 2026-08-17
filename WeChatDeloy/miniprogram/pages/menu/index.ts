// pages/menu/index.ts
import { getToday, inferMealTypeFromTime } from '../../domain/date';
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

Page({
  data: {
    loading: false,
    error: '',
    selection: {} as SelectionState,
    selectedCount: 0,
    dishes: [] as DishWithSelected[],
    currentCategory: 'hot',
    showSwitchConfirm: false,
    pendingSwitch: null as { type: 'date' | 'mealType'; value: string } | null,
  },

  onLoad() {
    const today = getToday();
    const defaultMealType = inferMealTypeFromTime();
    const selection = createInitialState(today, defaultMealType);
    this.setData({ selection, selectedCount: 0 });
    this.loadDishes();
  },

  onShow() {
    this.loadDishes();
  },

  async loadDishes() {
    this.setData({ loading: true, error: '' });
    try {
      const dishes = await fetchDishes(this.data.currentCategory);
      const decorated = this.markSelected(dishes);
      this.setData({ dishes: decorated, loading: false });
    } catch (e: unknown) {
      console.error('[menu] loadDishes failed:', e);
      const code = e instanceof ApiException ? e.code : '';
      const reqId = e instanceof ApiException ? e.requestId : '';
      const msg = e instanceof Error ? e.message : '加载失败';
      this.setData({
        error: code ? `${code}: ${msg}${reqId ? ` (${reqId})` : ''}` : msg,
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
    this.setData({ currentCategory: category });
    this.loadDishes();
  },

  onDateChange(e: any) {
    const newDate = e.detail.value as string;
    const { selection } = this.data;

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
    this.setData({ selection, dishes, selectedCount: 0 });
  },

  onGoToConfirm() {
    const { selection } = this.data;
    if (getSelectedCount(selection) === 0) {
      wx.showToast({ title: '请先选择菜品', icon: 'none' });
      return;
    }
    const app = getApp<{ globalData: Record<string, unknown> }>();
    app.globalData.pendingSelection = selection;
    wx.navigateTo({ url: '/pages/selection/confirm' });
  },
});
// pages/menu/index.ts
import { getToday, inferMealTypeFromTime, generateDateOptions } from '../../domain/date';
import {
  SelectionState,
  createInitialState,
  toggleDish,
  changeDate,
  changeMealType,
  hasUnsavedChanges,
  isSelected,
  getSelectedCount,
} from '../../domain/selection';
import type { MealType, Dish } from '../../domain/types';
import { fetchDishes } from '../../services/api';

Page({
  data: {
    // 页面状态
    loading: false,
    error: '',
    // 选择篮状态（共享）
    selection: {} as SelectionState,
    // 日期选择器选项
    dateOptions: generateDateOptions(),
    // 当前选中的分类
    currentCategory: 'hot',
    // 菜品列表
    dishes: [] as Dish[],
    // 是否显示切换确认弹窗
    showSwitchConfirm: false,
    pendingSwitch: null as { type: 'date' | 'mealType'; value: string } | null,
  },

  onLoad() {
    const today = getToday();
    const defaultMealType = inferMealTypeFromTime();
    const selection = createInitialState(today, defaultMealType);
    this.setData({ selection });
    this.loadDishes();
  },

  onShow() {
    // 每次打开页面刷新菜品列表
    this.loadDishes();
  },

  async loadDishes() {
    this.setData({ loading: true, error: '' });
    try {
      const dishes = await fetchDishes(this.data.currentCategory);
      this.setData({ dishes, loading: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载失败';
      this.setData({ error: msg, loading: false });
    }
  },

  onCategoryChange(e: WechatMiniprogram.ComponentInstance) {
    const category = e.currentTarget.dataset.category as string;
    this.setData({ currentCategory: category });
    this.loadDishes();
  },

  onDateChange(e: WechatMiniprogram.ComponentInstance) {
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

  onMealTypeChange(e: WechatMiniprogram.ComponentInstance) {
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

  onDishTap(e: WechatMiniprogram.ComponentInstance) {
    const dish = e.currentTarget.dataset.dish as Dish;
    const { selection } = this.data;
    const newSelection = toggleDish(selection, dish);
    this.setData({ selection: newSelection });
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
    this.setData({ selection });
  },

  doChangeMealType(newMealType: MealType) {
    const selection = changeMealType(this.data.selection, newMealType);
    this.setData({ selection });
  },

  onGoToConfirm() {
    const { selection } = this.data;
    if (getSelectedCount(selection) === 0) {
      wx.showToast({ title: '请先选择菜品', icon: 'none' });
      return;
    }
    // 将选择篮状态通过事件传递（也可通过 getCurrentPages 共享）
    const app = getApp();
    app.globalData.pendingSelection = selection;
    wx.navigateTo({ url: '/pages/selection/confirm' });
  },

  isSelected(dishId: string): boolean {
    return isSelected(this.data.selection, dishId);
  },

  getSelectedCount(): number {
    return getSelectedCount(this.data.selection);
  },
});
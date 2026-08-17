// pages/admin/dishes/index.ts
import type { Dish, DishCategory } from '../../../domain/types';
import { DISH_CATEGORY_LABELS } from '../../../domain/types';
import { filterDishes } from '../../../domain/adminDishFilters';
import { fetchAdminDishes, updateDish, ApiException } from '../../../services/api';

interface PendingToggle {
  dish: Dish;
  nextActive: boolean;
}

Page({
  data: {
    loading: false,
    error: '',
    errorRequestId: '',
    dishes: [] as Dish[],
    filteredDishes: [] as Dish[],
    /** 客户端搜索关键字（按名称过滤） */
    searchKeyword: '',
    /** 客户端分类筛选（空 = 全部） */
    filterCategory: '',
    /** 待确认的启停切换 */
    pendingToggle: null as PendingToggle | null,
    /** 是否首次加载完成（控制空态 vs 加载态） */
    initialLoaded: false,
  },

  onShow() {
    if (!this.data.initialLoaded || this.data.error) {
      this.loadDishes();
    }
  },

  onPullDownRefresh() {
    this.loadDishes().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadDishes() {
    this.setData({ loading: true, error: '', errorRequestId: '' });
    try {
      const dishes = await fetchAdminDishes();
      const filtered = filterDishes(dishes, this.data.searchKeyword, this.data.filterCategory);
      this.setData({
        dishes,
        filteredDishes: filtered,
        loading: false,
        initialLoaded: true,
      });
    } catch (e: unknown) {
      console.error('[admin/dishes] loadDishes failed:', e);
      const code = e instanceof ApiException ? e.code : '';
      const reqId = e instanceof ApiException ? e.requestId || '' : '';
      const msg = e instanceof ApiException
        ? e.message
        : e instanceof Error ? e.message : '加载失败';
      const errorText = code ? `${code}：${msg}` : msg;
      this.setData({
        error: errorText,
        errorRequestId: reqId,
        loading: false,
        initialLoaded: true,
      });
    }
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/admin/dish-edit/index' });
  },

  onEditTap(e: any) {
    const dish = e.currentTarget.dataset.dish as Dish;
    wx.navigateTo({ url: `/pages/admin/dish-edit/index?id=${dish.id}` });
  },

  onToggleActiveRequest(e: any) {
    const dish = e.currentTarget.dataset.dish as Dish;
    const nextActive = !dish.isActive;
    this.setData({
      pendingToggle: { dish, nextActive },
    });
  },

  onCancelToggle() {
    this.setData({ pendingToggle: null });
  },

  async onConfirmToggle() {
    const { pendingToggle } = this.data;
    if (!pendingToggle) return;
    const { dish, nextActive } = pendingToggle;
    this.setData({ pendingToggle: null });
    try {
      await updateDish(dish.id, { isActive: nextActive });
      wx.showToast({ title: nextActive ? '已启用' : '已停用', icon: 'success' });
      this.loadDishes();
    } catch (e: unknown) {
      const msg = e instanceof ApiException ? e.message : '操作失败';
      wx.showToast({ title: msg, icon: 'none' });
    }
  },

  onSearchInput(e: any) {
    const keyword = e.detail.value as string;
    const filtered = filterDishes(this.data.dishes, keyword, this.data.filterCategory);
    this.setData({ searchKeyword: keyword, filteredDishes: filtered });
  },

  onClearSearch() {
    const filtered = filterDishes(this.data.dishes, '', this.data.filterCategory);
    this.setData({ searchKeyword: '', filteredDishes: filtered });
  },

  onFilterCategory(e: any) {
    const category = e.currentTarget.dataset.category as string;
    const next = category === this.data.filterCategory ? '' : category;
    const filtered = filterDishes(this.data.dishes, this.data.searchKeyword, next);
    this.setData({ filterCategory: next, filteredDishes: filtered });
  },

  onCopyRequestId() {
    const { errorRequestId } = this.data;
    if (!errorRequestId) return;
    wx.setClipboardData({
      data: errorRequestId,
      success: () => wx.showToast({ title: '已复制请求 ID', icon: 'none' }),
    });
  },

  getCategoryLabel(cat: DishCategory): string {
    return DISH_CATEGORY_LABELS[cat] || cat;
  },
});
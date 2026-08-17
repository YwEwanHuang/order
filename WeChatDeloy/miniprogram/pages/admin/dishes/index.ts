// pages/admin/dishes/index.ts
import type { Dish } from '../../../domain/types';
import { fetchAdminDishes, updateDish, ApiException } from '../../../services/api';

Page({
  data: {
    loading: false,
    error: '',
    dishes: [] as Dish[],
    filterCategory: '' as string,
  },

  onShow() {
    this.loadDishes();
  },

  async loadDishes() {
    this.setData({ loading: true, error: '' });
    try {
      const dishes = await fetchAdminDishes();
      this.setData({ dishes, loading: false });
    } catch (e) {
      const msg = e instanceof ApiException && e.code === 'FORBIDDEN'
        ? '无权限访问'
        : '加载失败';
      this.setData({ error: msg, loading: false });
    }
  },

  onAddTap() {
    wx.navigateTo({ url: '/pages/admin/dish-edit/index' });
  },

  onEditTap(e: WechatMiniprogram.TouchEvent & { currentTarget: { dataset: { dish: Dish } } }) {
    wx.navigateTo({ url: `/pages/admin/dish-edit/index?id=${e.currentTarget.dataset.dish.id}` });
  },

  async onToggleActive(e: WechatMiniprogram.TouchEvent & { currentTarget: { dataset: { dish: Dish } } }) {
    const dish = e.currentTarget.dataset.dish;
    const newActive = !dish.sortOrder; // sortOrder used as isActive proxy since no isActive field
    try {
      await updateDish(dish.id, { sortOrder: newActive ? 1 : 0 });
      this.loadDishes();
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
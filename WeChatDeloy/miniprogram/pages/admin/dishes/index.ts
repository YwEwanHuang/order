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

  onEditTap(e: any) {
    const dish = e.currentTarget.dataset.dish as Dish;
    wx.navigateTo({ url: `/pages/admin/dish-edit/index?id=${dish.id}` });
  },

  async onToggleActive(e: any) {
    const dish = e.currentTarget.dataset.dish as Dish;
    try {
      await updateDish(dish.id, { isActive: !dish.isActive });
      this.loadDishes();
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onFilterCategory(e: any) {
    const category = e.currentTarget.dataset.category as string;
    this.setData({ filterCategory: category === this.data.filterCategory ? '' : category });
  },
});
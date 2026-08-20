// pages/profile/index.ts
import { fetchCurrentUser, ApiException } from '../../services/api';

Page({
  data: {
    loading: false,
    userRole: 'unknown' as 'user' | 'admin' | 'unknown',
  },

  onShow() {
    this.loadRole();
  },

  async loadRole() {
    this.setData({ loading: true });
    try {
      const user = await fetchCurrentUser();
      this.setData({ userRole: user.role, loading: false });
    } catch (e) {
      if (e instanceof ApiException && e.code === 'UNAUTHORIZED') {
        this.setData({ userRole: 'unknown', loading: false });
      } else {
        this.setData({ loading: false });
      }
    }
  },

  onBoardTap() {
    if (this.data.userRole !== 'admin') {
      wx.showToast({ title: '仅管理员可用', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/admin/notifications/index' });
  },

  onDishManagementTap() {
    if (this.data.userRole !== 'admin') {
      wx.showToast({ title: '仅管理员可用', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/admin/dishes/index' });
  },
});
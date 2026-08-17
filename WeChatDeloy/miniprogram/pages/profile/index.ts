// pages/profile/index.ts
import { fetchCurrentUser } from '../../services/api';
import { ApiException } from '../../services/api';

Page({
  data: {
    loading: false,
    userRole: 'unknown' as 'user' | 'admin' | 'unknown',
    subscriptionEnabled: false,
    remainingQuota: 0,
    showSubscriptionTip: false,
  },

  onShow() {
    this.checkUserRole();
  },

  async checkUserRole() {
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

  onSubscribeTap() {
    wx.requestSubscribeMessage({
      tmplIds: [this.getTemplateId()],
      success: (res: Record<string, string>) => {
        if (res[this.getTemplateId()] === 'accept') {
          this.setData({ subscriptionEnabled: true, remainingQuota: 1 });
          wx.showToast({ title: '订阅成功', icon: 'success' });
        } else {
          this.setData({ subscriptionEnabled: false });
          this.setData({ showSubscriptionTip: true });
        }
      },
      fail: () => {
        this.setData({ showSubscriptionTip: true });
      },
    });
  },

  onNotificationTap() {
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

  getTemplateId(): string {
    // 实际模板 ID 从环境变量或后端获取
    return 'TEMPLATE_ID_PLACEHOLDER';
  },
});
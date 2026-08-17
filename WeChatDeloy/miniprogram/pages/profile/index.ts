// pages/profile/index.ts
import { fetchCurrentUser, recordSubscription, ApiException } from '../../services/api';

Page({
  data: {
    loading: false,
    userRole: 'unknown' as 'user' | 'admin' | 'unknown',
    subscribeTemplateId: '',
    subscriptionEnabled: false,
    remainingQuota: 0,
    showSubscriptionTip: false,
    showTemplateMissingTip: false,
  },

  onShow() {
    this.checkUserRole();
  },

  async checkUserRole() {
    this.setData({ loading: true });
    try {
      const user = await fetchCurrentUser();
      this.setData({
        userRole: user.role,
        subscribeTemplateId: user.subscribeTemplateId || '',
        loading: false,
      });
    } catch (e) {
      if (e instanceof ApiException && e.code === 'UNAUTHORIZED') {
        this.setData({ userRole: 'unknown', loading: false });
      } else {
        this.setData({ loading: false });
      }
    }
  },

  async onSubscribeTap() {
    const { subscribeTemplateId, userRole } = this.data;

    if (!subscribeTemplateId) {
      this.setData({ showTemplateMissingTip: true });
      return;
    }
    if (userRole !== 'admin') {
      wx.showToast({ title: '仅管理员可订阅提醒', icon: 'none' });
      return;
    }

    try {
      const res = await new Promise<Record<string, string>>((resolve, reject) => {
        wx.requestSubscribeMessage({
          tmplIds: [subscribeTemplateId],
          success: (r) => resolve(r as Record<string, string>),
          fail: (err) => reject(err),
        });
      });
      const accepted = res[subscribeTemplateId] === 'accept';
      if (accepted) {
        try {
          await recordSubscription(subscribeTemplateId, 1);
          this.setData({
            subscriptionEnabled: true,
            remainingQuota: 1,
            showSubscriptionTip: false,
          });
          wx.showToast({ title: '订阅成功', icon: 'success' });
        } catch (e) {
          wx.showToast({ title: '记录订阅失败', icon: 'none' });
        }
      } else {
        this.setData({
          subscriptionEnabled: false,
          showSubscriptionTip: true,
        });
      }
    } catch (e) {
      this.setData({ showSubscriptionTip: true });
    }
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

  onDismissTip() {
    this.setData({ showSubscriptionTip: false, showTemplateMissingTip: false });
  },
});
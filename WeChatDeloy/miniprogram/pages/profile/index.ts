// pages/profile/index.ts
import { fetchCurrentUser, fetchQuota, recordSubscription, ApiException } from '../../services/api';

Page({
  data: {
    loading: false,
    userRole: 'unknown' as 'user' | 'admin' | 'unknown',
    /** 订阅提醒是否已授权（quota > 0） */
    subscriptionEnabled: false,
    /** 后端配置的通知模板 ID（来自 /me） */
    subscribeTemplateId: '',
    /** 当前剩余配额 */
    remainingQuota: 0,
    /** 后端是否配置了模板 */
    templateConfigured: false,
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
      const templateId = user.subscribeTemplateId || '';
      this.setData({
        userRole: user.role,
        subscribeTemplateId: templateId,
        templateConfigured: templateId.length > 0,
        loading: false,
      });
      // 加载配额（仅管理员有实际意义）
      this.loadQuota();
    } catch (e) {
      if (e instanceof ApiException && e.code === 'UNAUTHORIZED') {
        this.setData({ userRole: 'unknown', loading: false });
      } else {
        this.setData({ loading: false });
      }
    }
  },

  /** 从后端拉取当前用户的订阅配额 */
  async loadQuota() {
    try {
      const quota = await fetchQuota();
      this.setData({
        remainingQuota: quota.remainingQuota,
        subscriptionEnabled: quota.hasSubscription && quota.remainingQuota > 0,
      });
    } catch (e) {
      // 配额查询失败不影响主流程，静默忽略
    }
  },

  async onSubscribeTap() {
    const { subscribeTemplateId, userRole, templateConfigured } = this.data;

    if (!templateConfigured) {
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
          // 授权成功后向后端记录，额度由后端根据实际订阅结果确定
          await recordSubscription(subscribeTemplateId, 1);
          // 重新拉取配额以同步最新数字
          await this.loadQuota();
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
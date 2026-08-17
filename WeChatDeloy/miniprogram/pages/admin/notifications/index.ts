// pages/admin/notifications/index.ts
import type { Notification, NotificationStatus } from '../../../domain/types';
import { fetchAdminNotifications, retryNotification, ApiException } from '../../../services/api';

interface NotificationView extends Notification {
  statusLabel: string;
  statusClass: string;
  channelLabel: string;
  dateLabel: string;
  retryable: boolean;
}

Page({
  data: {
    loading: false,
    refreshing: false,
    error: '',
    notifications: [] as NotificationView[],
  },

  onShow() {
    this.loadNotifications();
  },

  onPullDownRefresh() {
    this.loadNotifications(true);
  },

  async loadNotifications(fromRefresh: boolean = false) {
    if (fromRefresh) {
      this.setData({ refreshing: true });
    } else {
      this.setData({ loading: true, error: '' });
    }
    try {
      const list = await fetchAdminNotifications();
      const decorated = list.map((n) => this.decorate(n));
      this.setData({ notifications: decorated, loading: false, refreshing: false });
    } catch (e) {
      const msg = e instanceof ApiException && e.code === 'FORBIDDEN'
        ? '无权限访问'
        : '加载失败';
      this.setData({ error: msg, loading: false, refreshing: false });
    } finally {
      (wx as any).stopPullDownRefresh();
    }
  },

  decorate(n: Notification): NotificationView {
    const statusMap: Record<NotificationStatus, { label: string; cls: string; retryable: boolean }> = {
      pending:  { label: '待发送',     cls: 'pending',  retryable: false },
      sent:     { label: '微信已送达', cls: 'sent',     retryable: false },
      no_quota: { label: '无订阅额度', cls: 'no-quota', retryable: false },
      rejected: { label: '已拒绝订阅', cls: 'rejected', retryable: false },
      failed:   { label: '送达失败',   cls: 'failed',   retryable: true  },
    };
    const meta = statusMap[n.status];
    return {
      ...n,
      statusLabel: meta.label,
      statusClass: meta.cls,
      retryable: meta.retryable,
      channelLabel: n.channel === 'in_app' ? '站内' : '微信',
      dateLabel: this.formatDate(n.createdAt),
    };
  },

  formatDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  async onRetryTap(e: any) {
    const id = e.currentTarget.dataset.id as string;
    try {
      await retryNotification(id);
      wx.showToast({ title: '已重新发送', icon: 'success' });
      this.loadNotifications();
    } catch (e) {
      const msg = e instanceof ApiException ? e.message : '重试失败';
      wx.showToast({ title: msg, icon: 'none' });
    }
  },
});
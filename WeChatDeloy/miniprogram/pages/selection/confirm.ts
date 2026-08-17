// pages/selection/confirm.ts
import type { SelectionState } from '../../domain/selection';
import type { MealPlan, MealPlanSubmit, NotificationStatus } from '../../domain/types';
import { MEAL_TYPE_LABELS } from '../../domain/types';
import {
  submitMealPlan,
  updateMealPlan,
  generateIdempotencyKey,
  fetchCurrentUser,
  fetchAdminNotifications,
  ApiException,
} from '../../services/api';

interface SubmitResult {
  success: boolean;
  message: string;
  notificationLabel?: string;
  notificationClass?: string;
}

const NOTIFICATION_LABELS: Record<NotificationStatus, { label: string; cls: string }> = {
  pending: { label: '微信提醒: 待发送', cls: 'pending' },
  sent: { label: '微信提醒: 已送达', cls: 'sent' },
  no_quota: { label: '微信提醒: 无可用订阅额度', cls: 'no-quota' },
  rejected: { label: '微信提醒: 未授权订阅', cls: 'rejected' },
  failed: { label: '微信提醒: 送达失败', cls: 'failed' },
};

Page({
  data: {
    selection: null as SelectionState | null,
    submitting: false,
    note: '',
    submitResult: null as SubmitResult | null,
    existingPlanId: null as string | null,
    existingVersion: 0,
  },

  onLoad(options: { planId?: string; version?: string }) {
    const app = getApp<{ globalData: Record<string, unknown> }>();
    const selection = app.globalData.pendingSelection as SelectionState | undefined;

    if (!selection || selection.items.length === 0) {
      wx.showToast({ title: '没有选择菜品', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({
      selection,
      existingPlanId: options.planId || null,
      existingVersion: parseInt(options.version || '0', 10),
    });
  },

  onNoteInput(e: any) {
    const value = e.detail.value as string;
    // 最多 100 字
    if (value.length > 100) return;
    this.setData({ note: value });
  },

  async onSubmit() {
    const { selection, submitting, note, existingPlanId, existingVersion } = this.data;
    if (!selection || submitting) return;

    this.setData({ submitting: true, submitResult: null });

    const body: MealPlanSubmit = {
      date: selection.date,
      mealType: selection.mealType,
      items: selection.items,
      note: note.trim() || undefined,
      version: existingPlanId ? existingVersion : undefined,
    };

    let savedPlan: MealPlan | null = null;
    try {
      if (existingPlanId) {
        savedPlan = await updateMealPlan(existingPlanId, body);
      } else {
        savedPlan = await submitMealPlan(body, generateIdempotencyKey());
      }
      // 成功后清除全局 pendingSelection
      const app = getApp<{ globalData: Record<string, unknown> }>();
      app.globalData.pendingSelection = null;

      const notification = await this.loadNotificationStatus(savedPlan.id);
      this.setData({
        submitResult: {
          success: true,
          message: '点菜已保存',
          notificationLabel: notification?.label,
          notificationClass: notification?.cls,
        },
      });
    } catch (e) {
      let message = '提交失败';
      if (e instanceof ApiException) {
        if (e.code === 'VERSION_CONFLICT') {
          message = '版本冲突，请刷新后重试';
        } else if (e.code === 'IDEMPOTENCY_CONFLICT') {
          message = '请勿重复提交';
        } else {
          message = e.message;
        }
      }
      this.setData({ submitResult: { success: false, message } });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /**
   * 仅管理员提交时返回本次点菜的最新通知状态；普通用户返回 null
   */
  async loadNotificationStatus(mealPlanId: string): Promise<{ label: string; cls: string } | null> {
    try {
      const user = await fetchCurrentUser();
      if (user.role !== 'admin') return null;
      const notifications = await fetchAdminNotifications();
      const match = notifications.find((n) => n.mealPlanId === mealPlanId);
      if (!match) return null;
      return NOTIFICATION_LABELS[match.status];
    } catch (e) {
      // 取不到通知状态不影响主结果
      return null;
    }
  },

  onGoBack() {
    wx.navigateBack();
  },

  getMealTypeLabel(mealType: string): string {
    return MEAL_TYPE_LABELS[mealType as keyof typeof MEAL_TYPE_LABELS] || mealType;
  },
});
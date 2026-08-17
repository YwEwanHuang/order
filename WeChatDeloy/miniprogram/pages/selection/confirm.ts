// pages/selection/confirm.ts
import type { SelectionState } from '../../domain/selection';
import type { MealPlanSubmit } from '../../domain/types';
import { MEAL_TYPE_LABELS } from '../../domain/types';
import { submitMealPlan, updateMealPlan, generateIdempotencyKey, ApiException } from '../../services/api';

Page({
  data: {
    selection: null as SelectionState | null,
    submitting: false,
    note: '',
    submitResult: null as { success: boolean; message: string } | null,
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

    try {
      if (existingPlanId) {
        await updateMealPlan(existingPlanId, body);
      } else {
        await submitMealPlan(body, generateIdempotencyKey());
      }
      this.setData({ submitResult: { success: true, message: '点菜已保存' } });
      // 成功后清除全局 pendingSelection
      const app = getApp<{ globalData: Record<string, unknown> }>();
      app.globalData.pendingSelection = null;
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

  onGoBack() {
    wx.navigateBack();
  },

  getMealTypeLabel(mealType: string): string {
    return MEAL_TYPE_LABELS[mealType as keyof typeof MEAL_TYPE_LABELS] || mealType;
  },
});
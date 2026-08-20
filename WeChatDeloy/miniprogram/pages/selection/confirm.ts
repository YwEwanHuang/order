// pages/selection/confirm.ts
import type { SelectionState } from '../../domain/selection';
import type { MealPlanSubmit } from '../../domain/types';
import { MEAL_TYPE_LABELS } from '../../domain/types';
import { submitMealPlan, ApiException } from '../../services/api';

interface SubmitResult {
  success: boolean;
  message: string;
}

Page({
  data: {
    selection: null as SelectionState | null,
    submitting: false,
    note: '',
    submitResult: null as SubmitResult | null,
  },

  onLoad(_options: Record<string, string>) {
    const app = getApp<{ globalData: Record<string, unknown> }>();
    const selection = app.globalData.pendingSelection as SelectionState | undefined;

    if (!selection || selection.items.length === 0) {
      wx.showToast({ title: '没有选择菜品', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.setData({
      selection,
      note: selection.note || '',
    });
  },

  onNoteInput(e: any) {
    const value = e.detail.value as string;
    if (value.length > 100) return;
    this.setData({ note: value });
  },

  async onSubmit() {
    const { selection, submitting, note } = this.data;
    if (!selection || submitting) return;

    this.setData({ submitting: true, submitResult: null });

    const body: MealPlanSubmit = {
      date: selection.date,
      mealType: selection.mealType,
      items: selection.items,
      note: note.trim() || undefined,
    };

    try {
      await submitMealPlan(body);
      const app = getApp<{ globalData: Record<string, unknown> }>();
      app.globalData.pendingSelection = null;
      this.setData({
        submitResult: { success: true, message: '点菜已保存' },
      });
    } catch (e) {
      const message = e instanceof ApiException ? e.message : '提交失败';
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
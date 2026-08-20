// pages/meal-plans/index.ts
import type { MealPlan } from '../../domain/types';
import { MEAL_TYPE_LABELS } from '../../domain/types';
import { fetchMealPlans, ApiException } from '../../services/api';

Page({
  data: {
    loading: false,
    error: '',
    plans: [] as MealPlan[],
  },

  onShow() {
    this.loadPlans();
  },

  async loadPlans() {
    this.setData({ loading: true, error: '' });
    try {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 60);
      const fromStr = from.toISOString().split('T')[0];
      const toStr = to.toISOString().split('T')[0];

      const plans = await fetchMealPlans(fromStr, toStr);
      this.setData({ plans, loading: false });
    } catch (e: unknown) {
      const msg = e instanceof ApiException ? e.message : '加载失败';
      this.setData({ error: msg, loading: false });
    }
  },

  onModifyTap(e: any & { currentTarget: { dataset: { plan: MealPlan } } }) {
    const plan = e.currentTarget.dataset.plan;
    const app = getApp<{ globalData: Record<string, unknown> }>();
    app.globalData.pendingSelection = {
      date: plan.date,
      mealType: plan.mealType,
      items: plan.items,
      note: plan.note || undefined,
    };
    // POST /meal-plans 是 upsert，所以修改不需要单独传 id
    wx.navigateTo({ url: '/pages/selection/confirm' });
  },

  getMealTypeLabel(mealType: string): string {
    return MEAL_TYPE_LABELS[mealType as keyof typeof MEAL_TYPE_LABELS] || mealType;
  },
});
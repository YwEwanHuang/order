// pages/meal-plans/index.ts
import type { MealPlan } from '../../domain/types';
import { MEAL_TYPE_LABELS } from '../../domain/types';
import { fetchMealPlans, ApiException } from '../../services/api';

Page({
  data: {
    loading: false,
    error: '',
    plans: [] as MealPlan[],
    groupedPlans: {} as Record<string, MealPlan[]>,
  },

  onShow() {
    this.loadPlans();
  },

  async loadPlans() {
    this.setData({ loading: true, error: '' });
    try {
      // 查询最近 60 天的记录
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 60);
      const fromStr = from.toISOString().split('T')[0];
      const toStr = to.toISOString().split('T')[0];

      const plans = await fetchMealPlans(fromStr, toStr);
      const grouped = this.groupByDate(plans);
      this.setData({ plans, groupedPlans: grouped, loading: false });
    } catch (e: unknown) {
      const msg = e instanceof ApiException ? e.message : '加载失败';
      this.setData({ error: msg, loading: false });
    }
  },

  groupByDate(plans: MealPlan[]): Record<string, MealPlan[]> {
    const grouped: Record<string, MealPlan[]> = {};
    for (const plan of plans) {
      if (!grouped[plan.date]) grouped[plan.date] = [];
      grouped[plan.date].push(plan);
    }
    return grouped;
  },

  onModifyTap(e: any & { currentTarget: { dataset: { plan: MealPlan } } }) {
    const plan = e.currentTarget.dataset.plan;
    const app = getApp<{ globalData: Record<string, unknown> }>();
    app.globalData.pendingSelection = {
      date: plan.date,
      mealType: plan.mealType,
      items: plan.items,
    };
    wx.navigateTo({
      url: `/pages/selection/confirm?planId=${plan.id}&version=${plan.version}`,
    });
  },

  getMealTypeLabel(mealType: string): string {
    return MEAL_TYPE_LABELS[mealType as keyof typeof MEAL_TYPE_LABELS] || mealType;
  },
});
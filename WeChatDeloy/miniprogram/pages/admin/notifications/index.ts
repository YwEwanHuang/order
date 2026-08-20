// pages/admin/notifications/index.ts
// 点菜看板：管理员视角查看所有用户近 7 天的点菜记录
import type { MealPlan } from '../../../domain/types';
import { MEAL_TYPE_LABELS } from '../../../domain/types';
import { fetchAdminMealPlans, ApiException } from '../../../services/api';

interface MealPlanView extends MealPlan {
  mealTypeLabel: string;
  itemsLabel: string;
  timeLabel: string;
}

interface DayGroup {
  date: string;
  total: number;
  plans: MealPlanView[];
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

Page({
  data: {
    loading: false,
    refreshing: false,
    error: '',
    rangeLabel: '',
    groups: [] as DayGroup[],
  },

  onShow() {
    this.loadBoard();
  },

  onPullDownRefresh() {
    this.loadBoard(true);
  },

  async loadBoard(fromRefresh: boolean = false) {
    if (fromRefresh) {
      this.setData({ refreshing: true });
    } else {
      this.setData({ loading: true, error: '' });
    }
    const from = todayPlus(0);
    const to = todayPlus(6);
    try {
      const list = await fetchAdminMealPlans(from, to);
      const groups = groupByDate(list, from, to);
      this.setData({
        rangeLabel: `${formatDate(from)} - ${formatDate(to)}`,
        groups,
        loading: false,
        refreshing: false,
      });
    } catch (e) {
      const msg = e instanceof ApiException && e.code === 'FORBIDDEN'
        ? '无权限访问'
        : '加载失败';
      this.setData({ error: msg, loading: false, refreshing: false });
    } finally {
      (wx as any).stopPullDownRefresh();
    }
  },
});

function groupByDate(list: MealPlan[], from: string, to: string): DayGroup[] {
  const dayMap = new Map<string, MealPlan[]>();
  const days: string[] = [];
  for (let d = new Date(from); isoDate(d) <= to; d.setDate(d.getDate() + 1)) {
    const k = isoDate(d);
    days.push(k);
    dayMap.set(k, []);
  }
  for (const plan of list) {
    const bucket = dayMap.get(plan.date);
    if (bucket) bucket.push(plan);
  }
  return days.map((date) => {
    const plans = (dayMap.get(date) || []).map((p): MealPlanView => ({
      ...p,
      mealTypeLabel: MEAL_TYPE_LABELS[p.mealType] || p.mealType,
      itemsLabel: (p.items || []).map((it) => it.name).join('、') || '（未选）',
      timeLabel: formatTime(p.updatedAt),
    }));
    return { date, total: plans.length, plans };
  });
}
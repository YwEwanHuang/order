import { api, ApiException, Dish, MealPlan } from '../../services/api';
import { todayISO, shiftISO, formatDisplay } from '../../domain/date';
import { maskOpenid } from '../../domain/mealPlan';

interface PageData {
  date: string;
  today: string;
  maxDate: string;
  dateLabel: string;
  loading: boolean;
  error: string;
  plan: MealPlan | null;
  dishNames: string[];
  note: string;
  editorLabel: string;
  updatedAtLabel: string;
  dishMap: Record<number, Dish>;
}

Page<PageData, any>({
  data: {
    date: '',
    today: '',
    maxDate: '',
    dateLabel: '',
    loading: false,
    error: '',
    plan: null,
    dishNames: [],
    note: '',
    editorLabel: '',
    updatedAtLabel: '',
    dishMap: {},
  },

  onLoad() {
    const today = todayISO();
    this.setData({
      date: today,
      today,
      maxDate: shiftISO(today, 6),
      dateLabel: formatDisplay(today),
    });
    this.loadAll();
  },

  onShow() {
    if (this.data.date) this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true, error: '' });
    try {
      const [dishes, plan] = await Promise.all([
        api.listDishes(true),
        api.getMealPlan(this.data.date),
      ]);
      const dishMap: Record<number, Dish> = {};
      for (const d of dishes) dishMap[d.id] = d;
      const dishNames = plan
        ? plan.dish_ids.map((id) => dishMap[id]?.name || '已删除菜品')
        : [];
      const updatedAtLabel = plan
        ? new Date(plan.updated_at).toLocaleString('zh-CN', { hour12: false })
        : '';
      this.setData({
        dishMap,
        plan,
        dishNames,
        note: plan?.note || '',
        editorLabel: maskOpenid(plan?.updated_by),
        updatedAtLabel,
        loading: false,
      });
    } catch (e) {
      const msg = e instanceof ApiException ? `加载失败：${e.code}` : '加载失败';
      this.setData({ loading: false, error: msg });
    }
  },

  onDateChange(e: WechatMiniprogram.PickerChange) {
    const date = e.detail.value;
    this.setData({ date, dateLabel: formatDisplay(date) });
    this.loadAll();
  },

  goSelect() {
    wx.navigateTo({ url: `/pages/select/index?date=${this.data.date}` });
  },

  goDishes() {
    wx.navigateTo({ url: '/pages/dishes/index' });
  },
});

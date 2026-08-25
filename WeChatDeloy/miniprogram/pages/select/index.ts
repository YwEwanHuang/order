import { api, ApiException, Dish } from '../../services/api';
import { formatDisplay } from '../../domain/date';
import { buildPayload, validateNote, validateDishCount } from '../../domain/mealPlan';

const CATEGORY_LABEL: Record<string, string> = {
  hot: '热菜', cold: '凉菜', soup: '汤', staple: '主食',
};

interface PageData {
  date: string;
  titleLabel: string;
  loading: boolean;
  saving: boolean;
  error: string;
  note: string;
  categories: Array<{ key: string; label: string; dishes: Dish[] }>;
  selectedIds: number[];
  selectedMap: Record<number, boolean>;
}

Page<PageData, any>({
  data: {
    date: '',
    titleLabel: '',
    loading: true,
    saving: false,
    error: '',
    note: '',
    categories: [],
    selectedIds: [],
    selectedMap: {},
  },

  onLoad(query: Record<string, string>) {
    const date = query.date;
    this.setData({ date, titleLabel: `${formatDisplay(date)} · 晚餐` });
    this.loadAll();
  },

  async loadAll() {
    try {
      const [dishes, plan] = await Promise.all([
        api.listDishes(true),
        api.getMealPlan(this.data.date),
      ]);
      const active = dishes.filter((d) => d.is_active === 1).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      const grouped = new Map<string, Dish[]>();
      for (const d of active) {
        if (!grouped.has(d.category)) grouped.set(d.category, []);
        grouped.get(d.category)!.push(d);
      }
      const categories = Array.from(grouped.entries()).map(([key, ds]) => ({
        key,
        label: CATEGORY_LABEL[key] || key,
        dishes: ds,
      }));
      const ids = plan?.dish_ids || [];
      const selectedMap: Record<number, boolean> = {};
      for (const id of ids) selectedMap[id] = true;
      this.setData({
        loading: false,
        categories,
        selectedIds: ids,
        selectedMap,
        note: plan?.note || '',
      });
    } catch (e) {
      this.setData({ loading: false, error: e instanceof Error ? e.message : '加载失败' });
    }
  },

  toggleDish(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id: number }).id);
    const selectedMap = { ...this.data.selectedMap };
    let selectedIds = [...this.data.selectedIds];
    if (selectedMap[id]) {
      delete selectedMap[id];
      selectedIds = selectedIds.filter((x) => x !== id);
    } else {
      if (selectedIds.length >= 20) {
        wx.showToast({ title: '最多 20 道', icon: 'none' });
        return;
      }
      selectedMap[id] = true;
      selectedIds.push(id);
    }
    this.setData({ selectedMap, selectedIds });
  },

  onNoteInput(e: WechatMiniprogram.TextareaInput) {
    this.setData({ note: e.detail.value });
  },

  async save() {
    const { date, selectedIds, note } = this.data;
    const payload = buildPayload(date, selectedIds, note);
    const countErr = validateDishCount(payload.dish_ids);
    if (countErr) return this.setData({ error: countErr });
    const noteErr = validateNote(payload.note);
    if (noteErr) return this.setData({ error: noteErr });

    this.setData({ saving: true, error: '' });
    try {
      await api.putMealPlan({ date, dish_ids: payload.dish_ids, note: payload.note });
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      const msg = e instanceof ApiException ? e.code : '保存失败';
      this.setData({ saving: false, error: msg });
    }
  },
});

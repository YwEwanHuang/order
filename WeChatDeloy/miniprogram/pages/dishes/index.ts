import { api, ApiException, Dish } from '../../services/api';

const CATEGORY_LABEL: Record<string, string> = {
  hot: '热菜', cold: '凉菜', soup: '汤', staple: '主食',
};
const CATEGORY_OPTIONS = [
  { key: 'hot', label: '热菜' },
  { key: 'cold', label: '凉菜' },
  { key: 'soup', label: '汤' },
  { key: 'staple', label: '主食' },
];

interface EditState {
  id: number | null;
  name: string;
  category: string;
}

interface PageData {
  loading: boolean;
  error: string;
  items: Dish[];
  categoryLabel: Record<string, string>;
  categoryOptions: typeof CATEGORY_OPTIONS;
  editing: EditState | null;
  editError: string;
}

Page<PageData, any>({
  data: {
    loading: true,
    error: '',
    items: [],
    categoryLabel: CATEGORY_LABEL,
    categoryOptions: CATEGORY_OPTIONS,
    editing: null,
    editError: '',
  },

  onLoad() { this.load(); },
  onShow() { this.load(); },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const items = await api.listDishes(true);
      this.setData({ items, loading: false });
    } catch (e) {
      this.setData({
        loading: false,
        error: e instanceof ApiException ? e.code : '加载失败',
      });
    }
  },

  async toggleActive(e: WechatMiniprogram.SwitchChange) {
    const id = Number((e.currentTarget.dataset as { id: number }).id);
    const next = e.detail.value;
    try {
      const updated = await api.updateDish(id, { is_active: next });
      const items = this.data.items.map((d) => (d.id === id ? updated : d));
      this.setData({ items });
    } catch (err) {
      wx.showToast({ title: err instanceof ApiException ? err.code : '更新失败', icon: 'none' });
      this.load();
    }
  },

  openCreate() {
    this.setData({ editing: { id: null, name: '', category: 'hot' }, editError: '' });
  },

  openEdit(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id: number }).id);
    const target = this.data.items.find((d) => d.id === id);
    if (!target) return;
    this.setData({ editing: { id, name: target.name, category: target.category }, editError: '' });
  },

  closeEdit() { this.setData({ editing: null, editError: '' }); },

  onNameInput(e: WechatMiniprogram.Input) {
    if (!this.data.editing) return;
    this.setData({ editing: { ...this.data.editing, name: e.detail.value } });
  },

  pickCategory(e: WechatMiniprogram.BaseEvent) {
    if (!this.data.editing) return;
    const key = (e.currentTarget.dataset as { key: string }).key;
    this.setData({ editing: { ...this.data.editing, category: key } });
  },

  async submitEdit() {
    const ed = this.data.editing;
    if (!ed) return;
    if (!ed.name || ed.name.length > 16) return this.setData({ editError: '菜名 1-16 字' });
    if (!CATEGORY_OPTIONS.find((c) => c.key === ed.category)) return this.setData({ editError: '分类无效' });
    try {
      if (ed.id) {
        const updated = await api.updateDish(ed.id, { name: ed.name, category: ed.category });
        const items = this.data.items.map((d) => (d.id === ed.id ? updated : d));
        this.setData({ items, editing: null });
      } else {
        const created = await api.createDish({ name: ed.name, category: ed.category });
        this.setData({ items: [...this.data.items, created], editing: null });
      }
    } catch (err) {
      this.setData({ editError: err instanceof ApiException ? err.code : '保存失败' });
    }
  },

  confirmDelete(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id: number }).id);
    wx.showModal({
      title: '删除菜品',
      content: '历史记录里该菜会显示为「已删除菜品」。确认？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.deleteDish(id);
          this.setData({ items: this.data.items.filter((d) => d.id !== id) });
        } catch (err) {
          wx.showToast({ title: err instanceof ApiException ? err.code : '删除失败', icon: 'none' });
        }
      },
    });
  },
});

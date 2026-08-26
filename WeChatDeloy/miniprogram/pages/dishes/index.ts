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
const DEFAULT_IMAGE = '/images/default-goods-image.png';
const CLOUD_STORAGE_FOLDER = 'manmanorder/dishes';

interface EditState {
  id: number | null;
  name: string;
  category: string;
  image_url: string | null;
}

interface PageData {
  loading: boolean;
  error: string;
  items: Dish[];
  categories: Array<{ key: string; label: string; dishes: Dish[] }>;
  activeCategory: string;
  categoryLabel: Record<string, string>;
  categoryOptions: typeof CATEGORY_OPTIONS;
  editing: EditState | null;
  editError: string;
  uploading: boolean;
  defaultImage: string;
}

Page<PageData, any>({
  data: {
    loading: true,
    error: '',
    items: [],
    categories: [],
    activeCategory: 'hot',
    categoryLabel: CATEGORY_LABEL,
    categoryOptions: CATEGORY_OPTIONS,
    editing: null,
    editError: '',
    uploading: false,
    defaultImage: DEFAULT_IMAGE,
  },

  onLoad() { this.load(); },
  onShow() { this.load(); },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      const items = await api.listDishes(true);
      const grouped = new Map<string, Dish[]>();
      for (const d of items) {
        if (!grouped.has(d.category)) grouped.set(d.category, []);
        grouped.get(d.category)!.push(d);
      }
      const categories = CATEGORY_OPTIONS
        .filter((opt) => grouped.has(opt.key))
        .map((opt) => ({
          key: opt.key,
          label: opt.label,
          dishes: (grouped.get(opt.key) || []).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
        }));
      this.setData({
        items,
        categories,
        activeCategory: this.data.activeCategory && grouped.has(this.data.activeCategory)
          ? this.data.activeCategory
          : (categories[0]?.key || 'hot'),
        loading: false,
      });
    } catch (e) {
      this.setData({
        loading: false,
        error: e instanceof ApiException ? e.code : '加载失败',
      });
    }
  },

  onCategoryTap(e: WechatMiniprogram.BaseEvent) {
    const key = (e.currentTarget.dataset as { key: string }).key;
    this.setData({ activeCategory: key });
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
    this.setData({ editing: { id: null, name: '', category: 'hot', image_url: null }, editError: '' });
  },

  openEdit(e: WechatMiniprogram.BaseEvent) {
    const id = Number((e.currentTarget.dataset as { id: number }).id);
    const target = this.data.items.find((d) => d.id === id);
    if (!target) return;
    this.setData({
      editing: {
        id,
        name: target.name,
        category: target.category,
        image_url: target.image_url ?? null,
      },
      editError: '',
    });
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

  pickImage() {
    if (this.data.uploading) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles[0];
        if (!file) return;
        this.uploadToCloud(file.tempFilePath, file.size);
      },
      fail: (e) => {
        if (!/cancel/.test(e.errMsg || '')) {
          wx.showToast({ title: '选图失败', icon: 'none' });
        }
      },
    });
  },

  uploadToCloud(filePath: string, size: number) {
    // wx.chooseMedia 已传入 sizeType: ['compressed']；超过 1MB 再用 wx.compressImage 再压一次。
    const doUpload = (localPath: string) => {
      const ext = (localPath.match(/\.(jpe?g|png|webp|gif)$/i)?.[1] || 'jpg').toLowerCase();
      const cloudPath = `${CLOUD_STORAGE_FOLDER}/${Date.now()}.${ext}`;
      this.setData({ uploading: true });
      wx.cloud.uploadFile({
        cloudPath,
        filePath: localPath,
        success: (res) => {
          if (!this.data.editing) return;
          this.setData({
            editing: { ...this.data.editing, image_url: res.fileID },
            uploading: false,
          });
        },
        fail: () => {
          this.setData({ uploading: false });
          wx.showToast({ title: '上传失败', icon: 'none' });
        },
      });
    };

    if (size > 1024 * 1024) {
      wx.compressImage({
        src: filePath,
        quality: 70,
        success: (res) => doUpload(res.tempFilePath),
        fail: () => doUpload(filePath),
      });
    } else {
      doUpload(filePath);
    }
  },

  clearImage() {
    if (!this.data.editing) return;
    this.setData({ editing: { ...this.data.editing, image_url: null } });
  },

  async submitEdit() {
    const ed = this.data.editing;
    if (!ed) return;
    if (!ed.name || ed.name.length > 16) return this.setData({ editError: '菜名 1-16 字' });
    if (!CATEGORY_OPTIONS.find((c) => c.key === ed.category)) return this.setData({ editError: '分类无效' });
    try {
      if (ed.id) {
        const updated = await api.updateDish(ed.id, {
          name: ed.name,
          category: ed.category,
          image_url: ed.image_url,
        });
        const items = this.data.items.map((d) => (d.id === ed.id ? updated : d));
        this.setData({ items, editing: null });
      } else {
        const created = await api.createDish({
          name: ed.name,
          category: ed.category,
          image_url: ed.image_url,
        });
        this.setData({ items: [...this.data.items, created], editing: null });
      }
      this.load();
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
          this.load();
        } catch (err) {
          wx.showToast({ title: err instanceof ApiException ? err.code : '删除失败', icon: 'none' });
        }
      },
    });
  },
});
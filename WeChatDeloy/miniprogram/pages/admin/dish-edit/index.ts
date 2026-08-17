// pages/admin/dish-edit/index.ts
import type { Dish, DishCategory } from '../../../domain/types';
import { DISH_CATEGORY_LABELS, DISH_CATEGORIES } from '../../../domain/types';
import { createDish, updateDish, uploadDishImage, ApiException } from '../../../services/api';

Page({
  data: {
    isEdit: false,
    dishId: '',
    name: '',
    category: 'hot' as DishCategory,
    description: '',
    imageFileId: '',
    imageTempPath: '',
    sortOrder: 0,
    saving: false,
    error: '',
    categories: DISH_CATEGORIES,
  },

  onLoad(options: { id?: string }) {
    if (options.id) {
      this.setData({ isEdit: true, dishId: options.id });
      // TODO: 加载已有菜品数据
    }
  },

  onNameInput(e: WechatMiniprogram.Input) {
    this.setData({ name: e.detail.value });
  },

  onDescriptionInput(e: WechatMiniprogram.Input) {
    this.setData({ description: e.detail.value });
  },

  onCategoryChange(e: WechatMiniprogram.Picker) {
    const index = e.detail.value as number;
    this.setData({ category: DISH_CATEGORIES[index] });
  },

  async onChooseImage() {
    const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'] });
    const tempFilePath = res.tempFilePaths[0];
    this.setData({ imageTempPath: tempFilePath });
  },

  async onSave() {
    const { name, category, description, imageTempPath, saving, isEdit, dishId } = this.data;
    if (!name.trim()) {
      wx.showToast({ title: '请输入菜品名称', icon: 'none' });
      return;
    }
    if (name.trim().length > 30) {
      wx.showToast({ title: '名称不能超过30字', icon: 'none' });
      return;
    }

    this.setData({ saving: true, error: '' });

    try {
      let imageFileId = '';
      if (imageTempPath) {
        imageFileId = await uploadDishImage(imageTempPath);
      }

      const body = {
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        imageUrl: imageFileId || undefined,
        sortOrder: 0,
      };

      if (isEdit) {
        await updateDish(dishId, body);
      } else {
        await createDish(body);
      }

      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (e) {
      const msg = e instanceof ApiException ? e.message : '保存失败';
      this.setData({ error: msg, saving: false });
    }
  },

  getCategoryLabel(cat: DishCategory): string {
    return DISH_CATEGORY_LABELS[cat];
  },
});
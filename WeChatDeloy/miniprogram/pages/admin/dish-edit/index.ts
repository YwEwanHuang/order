// pages/admin/dish-edit/index.ts
import type { Dish, DishCategory } from '../../../domain/types';
import { DISH_CATEGORY_LABELS, DISH_CATEGORIES } from '../../../domain/types';
import {
  createDish,
  updateDish,
  uploadDishImage,
  fetchDishById,
  ApiException,
} from '../../../services/api';

const DESCRIPTION_MAX_LENGTH = 100;
const NAME_MAX_LENGTH = 30;
const UNSAVED_ALERT_MESSAGE = '当前修改尚未保存，确定要离开吗？';

Page({
  data: {
    isEdit: false,
    dishId: '',
    name: '',
    category: 'hot' as DishCategory,
    categoryIndex: 0,
    description: '',
    imageUrl: '',
    imageTempPath: '',
    sortOrder: 0,
    isActive: true,
    saving: false,
    uploading: false,
    error: '',
    errorRequestId: '',
    categoryOptions: DISH_CATEGORIES.map(c => DISH_CATEGORY_LABELS[c]),
    descriptionCount: 0,
    descriptionMaxLength: DESCRIPTION_MAX_LENGTH,
  },

  async onLoad(options: { id?: string }) {
    if (options.id) {
      this.setData({ isEdit: true, dishId: options.id });
      try {
        const dish = await fetchDishById(options.id);
        this.setData({
          name: dish.name,
          category: dish.category,
          categoryIndex: DISH_CATEGORIES.indexOf(dish.category),
          description: dish.description || '',
          imageUrl: dish.imageUrl || '',
          sortOrder: dish.sortOrder,
          isActive: dish.isActive,
          descriptionCount: (dish.description || '').length,
        });
      } catch (e: unknown) {
        const code = e instanceof ApiException ? e.code : '';
        const reqId = e instanceof ApiException ? e.requestId || '' : '';
        const msg = e instanceof ApiException ? e.message : '加载菜品失败';
        this.setData({
          error: code ? `${code}：${msg}` : msg,
          errorRequestId: reqId,
        });
      }
    }

    // 安装未保存提示：离开页面（返回/重定向/重启）时若表单 dirty 则弹窗
    // 注：miniprogram API `wx.enableAlertBeforeUnload` 必须在 onLoad 调用
    wx.enableAlertBeforeUnload({ message: UNSAVED_ALERT_MESSAGE });
  },

  onUnload() {
    wx.disableAlertBeforeUnload();
  },

  onNameInput(e: any) {
    this.setData({ name: e.detail.value });
  },

  onDescriptionInput(e: any) {
    const value = e.detail.value as string;
    // 硬截断：textarea maxlength 仅在中文输入法下表现稳定；保险起见手动限制
    const truncated = value.length > DESCRIPTION_MAX_LENGTH ? value.slice(0, DESCRIPTION_MAX_LENGTH) : value;
    this.setData({
      description: truncated,
      descriptionCount: truncated.length,
    });
  },

  onCategoryChange(e: any) {
    const index = e.detail.value as number;
    this.setData({ category: DISH_CATEGORIES[index], categoryIndex: index });
  },

  onSortOrderInput(e: any) {
    const raw = e.detail.value as string;
    const value = Number(raw);
    // 允许空（视作 0），避免负数和极大值
    if (raw === '' || raw === '-') {
      this.setData({ sortOrder: 0 });
      return;
    }
    if (Number.isFinite(value)) {
      this.setData({ sortOrder: Math.max(0, Math.min(9999, Math.trunc(value))) });
    }
  },

  onActiveToggle(e: any) {
    this.setData({ isActive: e.detail.value });
  },

  async onChooseImage() {
    try {
      const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'] });
      const tempFilePath = res.tempFilePaths[0];
      if (!tempFilePath) return;
      // 选择后立即清空旧 URL，避免预览错乱；上传在 onSave 时进行
      this.setData({ imageTempPath: tempFilePath, imageUrl: '' });
    } catch (e: unknown) {
      // 用户取消不报错
      if (e instanceof Error && !/cancel/i.test(e.message)) {
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      }
    }
  },

  onRemoveImage() {
    this.setData({ imageTempPath: '', imageUrl: '' });
  },

  async onSave() {
    const {
      name,
      category,
      description,
      imageTempPath,
      saving,
      isEdit,
      dishId,
      isActive,
      sortOrder,
      imageUrl,
    } = this.data;

    if (saving) return;

    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      wx.showToast({ title: '请输入菜品名称', icon: 'none' });
      return;
    }
    if (trimmedName.length > NAME_MAX_LENGTH) {
      wx.showToast({ title: `名称不能超过${NAME_MAX_LENGTH}字`, icon: 'none' });
      return;
    }

    this.setData({ saving: true, error: '', errorRequestId: '' });

    try {
      let imageFileId = imageUrl || '';
      if (imageTempPath) {
        this.setData({ uploading: true });
        try {
          imageFileId = await uploadDishImage(imageTempPath);
        } finally {
          this.setData({ uploading: false });
        }
      }

      const body = {
        name: trimmedName,
        category,
        description: (description || '').trim() || undefined,
        imageUrl: imageFileId || undefined,
        isActive,
        sortOrder,
      };

      if (isEdit) {
        await updateDish(dishId, body);
      } else {
        await createDish(body as Omit<Dish, 'id'>);
      }

      // 保存成功后再关闭未保存提示，避免 toast 期间仍弹确认
      wx.disableAlertBeforeUnload();

      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (e: unknown) {
      const code = e instanceof ApiException ? e.code : '';
      const reqId = e instanceof ApiException ? e.requestId || '' : '';
      const msg = e instanceof ApiException ? e.message : '保存失败';
      this.setData({
        error: code ? `${code}：${msg}` : msg,
        errorRequestId: reqId,
        saving: false,
      });
    }
  },

  onCopyRequestId() {
    const { errorRequestId } = this.data;
    if (!errorRequestId) return;
    wx.setClipboardData({
      data: errorRequestId,
      success: () => wx.showToast({ title: '已复制请求 ID', icon: 'none' }),
    });
  },
});
// pages/admin/notifications/index.ts
// TODO: 通知记录页（管理员查看站内通知和送达状态）
// 目前后端 API 尚未实现，页面骨架已建立
Page({
  data: {
    loading: false,
    notifications: [],
    error: '',
  },

  onShow() {
    // TODO: 实现通知列表加载
    this.setData({ notifications: [] });
  },
});
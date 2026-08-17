// app.ts

App({
  globalData: {
    // 云托管配置（由微信云托管网关注入，客户端代码不包含真实值）
    // 真实值通过环境变量配置在云托管侧
    cloudEnvId: '',       // 填空字符串，callContainer 使用 cloud.DYNAMIC_CURRENT_ENV 时会自动读取
    cloudServiceName: '', // 留空，通过 X-WX-SERVICE header 指定
    cloudBaseUrl: '',
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      // 云环境由 callContainer 配置决定，此处初始化云能力（主要用到 callContainer）
      wx.cloud.init({
        traceUser: true,
      });
    }
  },
});
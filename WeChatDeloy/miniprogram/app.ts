// app.ts

App({
  globalData: {
    // 云托管部署标识（不是密钥，对应 DECISIONS.md M0-D007）。
    // envId 决定 callContainer 走哪个云开发环境，serviceName 决定 Cloud Run 路由到哪个服务。
    cloudEnvId: 'prod-d8gkzjj6ub74bba3b',
    cloudServiceName: 'express-stvz',
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
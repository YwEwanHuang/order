# 云开发 quickstart

这是云开发的快速启动指引，其中演示了如何上手使用云开发的三大基础能力：

- 数据库：一个既可在小程序前端操作，也能在云函数中读写的 JSON 文档型数据库
- 文件存储：在小程序前端直接上传/下载云端文件，在云开发控制台可视化管理
- 云函数：在云端运行的代码，微信私有协议天然鉴权，开发者只需编写业务逻辑代码

## 参考文档

- [云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)

## 通过微信云托管 CLI 部署云托管服务

本项目的云托管服务源码位于 `WeChatDeloy/server`。微信云托管 CLI 从本地源码构建，因此无需绑定 GitHub 仓库，私有仓库的可见性不会影响此部署方式。

服务保持现有运行约定：监听 `PORT` 环境变量（未设置时为 `8080`），Dockerfile 暴露 `8080` 端口，并提供 `/health` 健康检查接口。

先安装并确认 [微信云托管 CLI](https://cloud.weixin.qq.com/cli/guide)：

```sh
npm install --global @wxcloud/cli
wxcloud --version
wxcloud run:deploy --help
```

登录前，在微信云托管控制台的「服务设置 → CLI 密钥」创建 CLI 密钥，取得 AppID 和 CLI 私钥。由拥有相应权限的操作者在自己的终端执行以下 zsh 片段；私钥会静默读入临时变量，不会作为命令字面量出现：

```zsh
(
  umask 077
  read -r -s "WX_CLOUD_CLI_PRIVATE_KEY?请输入 CLI 私钥: "
  print
  if wxcloud login --appId '<WECHAT_APP_ID>' --privateKey "$WX_CLOUD_CLI_PRIVATE_KEY"; then
    if [[ -f "$HOME/.wxcloudconfig" ]]; then
      chmod 600 "$HOME/.wxcloudconfig"
    fi
  fi
  unset WX_CLOUD_CLI_PRIVATE_KEY
)
```

不要将 CLI 私钥、登录状态或环境配置提交到仓库。完成操作后执行 `wxcloud logout` 清理 CLI 登录状态。登录后可查询环境和服务名称：

```sh
wxcloud env:list
wxcloud service:list --envId '<WX_CLOUD_ENV_ID>'
```

以下命令会执行真实部署，必须在获得后续明确授权、确认目标云环境和服务名称后才可运行。`WeChatDeloy/server` 是相对于仓库根目录的路径，因此必须从本仓库根目录运行：

```sh
wxcloud run:deploy WeChatDeloy/server \
  --envId '<WX_CLOUD_ENV_ID>' \
  --serviceName '<WX_CLOUD_SERVICE_NAME>' \
  --containerPort 8080 \
  --dockerfile Dockerfile
```

执行前请核对 CLI 帮助输出和目标环境；部署后的版本切换或回滚应在云托管控制台中由有权限的操作者完成。

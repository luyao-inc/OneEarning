# OneEarning

Paperclip 的 **Electron 桌面封装**：子进程运行上游 `paperclipai`，主窗口加载本地 `http://127.0.0.1:<port>/`。**不修改** `paperclip` 源码；中文界面通过 preload 注入词典实现。

## 开发

```bash
pnpm install
pnpm dev
```

首次启动会在 `userData/paperclip` 下生成最小配置并执行 `paperclipai doctor`，然后 `paperclipai run`。需本机已安装 **Node.js 20+**（与 `embedded-postgres` 等 native 模块 ABI 一致）。

## 打包

```bash
pnpm run bundle:paperclip   # 生成 build/paperclip/
pnpm run bundle:postgres    # 复制 embedded-postgres 到 resources/postgres（可选）
pnpm run build              # vite build + bundle + electron-builder
```

Windows 安装包若需捆绑独立 Node（避免依赖用户 PATH）：

```bash
pnpm run prep:node:win
pnpm run build:win
```

## 配置

- 更新源：设置环境变量 `ONEEARNING_UPDATE_URL` 或通过 `electron-builder.yml` 修改 `publish`。
- 强制 Node 路径：`ONEEARNING_NODE=/path/to/node`。

## 文档

- [中文字典维护](docs/i18n-maintenance.md)

## 许可

MIT（Paperclip 相关依赖遵循其各自许可证）。

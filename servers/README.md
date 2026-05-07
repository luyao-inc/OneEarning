# 平行服务端（OneEarning 自研，不修改上游 Paperclip）

本目录放置与内嵌 `paperclipai` 子进程**解耦**的 HTTP 服务：由 Electron 在本地拉起，经 `GET/POST /api/oneearning/...` 由主进程代理到各子服务。

## pnpm 工作区

子目录（如 `clawhub/`）已列入仓库根目录 [pnpm-workspace.yaml](../pnpm-workspace.yaml)（`servers/*`）。依赖应在**仓库根**执行 `pnpm install` 统一安装；不要在 `servers/<pkg>/` 里单独跑 `pnpm install`，否则会与根的虚拟存储配置冲突（例如 `ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF`）。

构建侧车：`pnpm run build:clawhub`、`pnpm run build:knowledge`（仅编译，不触发子目录单独 install）。

## 路由与端口

| 相对路径（渲染进程 `fetch`） | 本机子服务 | 默认端口 |
|------------------------------|------------|----------|
| `/api/oneearning/clawhub/*` | [clawhub](./clawhub/) 侧车 | 启动时 `getPort()` 动态分配 |
| `/api/oneearning/knowledge/*` | [knowledge](./knowledge/) 侧车 | 启动时 `getPort()` 动态分配 |

> 不要写死端口号。主进程将 `PORT` 环境变量传入子进程，并在 [paperclip-proxy.ts](../electron/main/paperclip-proxy.ts) 中把上述路径转发到 `http://127.0.0.1:<port>`。

## 新增能力时

1. 在 `servers/<name>/` 下新建独立 `package.json` 与入口（可构建为单文件 bundle 便于打包）。
2. 更新本表与 [electron-builder.yml](../electron-builder.yml) 的 `extraResources`（若需随安装包分发）。
3. 在 `electron/main` 中注册启动/停止逻辑，并扩展代理白名单与路径映射。

## Clawhub Registry（事实摘要）

- 技能元数据：`GET {registry}/api/v1/skills/{slug}`（registry 默认 `https://clawhub.ai`）
- 技能 zip：`GET {registry}/api/v1/download?slug=...&version=...`（与官方 `clawhub` CLI 一致）
- 参考：官方 CLI 包 `clawhub` 内 `ApiRoutes.download` 与 `downloadZip` 实现。

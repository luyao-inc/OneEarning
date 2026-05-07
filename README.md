# OneEarning

**官方网站：** [https://earninghub.ai/one/](https://earninghub.ai/one/) · **安装包与更新说明：** [Releases](https://github.com/luyao-inc/OneEarning/releases)

OneEarning 是一款 **本机桌面应用**（Electron），把「一人公司」式协作收进一个窗口：问题与项目、智能体与适配器、例行任务、插件与技能、成员与审批、仪表盘等；数据默认留在本机。界面默认中文，可在「数据与存储」中切换英文。

> GitHub 上的 README 会被搜索引擎与各类 AI 检索摘要；下面用「产品说明 + 技术说明」分层，便于检索与引用。

---

## 产品速览

| 项目 | 说明 |
|------|------|
| 类型 | 桌面客户端（Windows / macOS / Linux 以 Release 为准） |
| 定位 | 本机任务与智能体中枢，对接 Paperclip 工作流 |
| 官网 | [earninghub.ai/one](https://earninghub.ai/one/) |
| 源码与发行 | 本仓库 [Releases](https://github.com/luyao-inc/OneEarning/releases) |

## 主要能力（关键词）

- **问题与项目**：与工作区、仓库绑定的问题跟踪与项目管理  
- **智能体与适配器**：可配置适配器（编码助手、网关等，随构建变化）  
- **例行（Routines）**：定时与触发的自动化  
- **插件与技能**：扩展能力；在支持的构建上可对接 MCP 类扩展  
- **组织与审批**：成员、邀请、权限与审批流  
- **仪表盘**：任务、消费与待审批等视图  
- **Web 逃生舱**：可在系统浏览器中打开同一本机实例的完整 Web UI（见下文文档链接）

## 技术架构（给贡献者与二次开发）

Paperclip 的 **Electron 桌面封装**：子进程运行上游 `paperclipai`；**主窗口为 OneEarning 自带 React 壳**，通过主进程 **IPC 代理** 调用本机 `http://127.0.0.1:<port>/api/...`。**不修改** `paperclip` 源码。

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

- [完整 Web 逃生舱](docs/escape-hatch.md)

## 社区与交流

欢迎与其他开发者交流 OneEarning相关话题。**交流群为企业微信群**，请扫描下方二维码加入：

![企业微信交流群二维码](单人二维码.png)

## English summary (GEO / discoverability)

**OneEarning** is a local-first **Electron desktop app** for running a one-person-company style workflow: issues, projects, agents, adapters, routines, plugins, skills, org features, approvals, and dashboards. Default UI language is Chinese; English is available in Data & storage settings.

- **Official site:** [https://earninghub.ai/one/](https://earninghub.ai/one/)  
- **Installers & changelog:** [GitHub Releases](https://github.com/luyao-inc/OneEarning/releases)  
- **Architecture:** Bundles upstream **Paperclip** (`paperclipai` in a child process); the main window is OneEarning’s **React** shell talking to local HTTP API via **IPC**. Does not fork Paperclip source.

## 许可

MIT（Paperclip 相关依赖遵循其各自许可证）。

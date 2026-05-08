# OneEarning

**面向 Paperclip 的桌面端外壳——本机优先的「一人公司」式工作流。**

[概览](#概览) • [截图](#截图) • [为什么选择 OneEarning](#为什么选择-oneearning) • [差异化](#差异化) • [功能](#功能) • [快速开始](#快速开始) • [架构](#架构) • [适用场景](#适用场景) • [开发](#开发) • [参与贡献](#参与贡献) • [社区](#社区)

**其他语言：** [English](README.md)

**官方网站：** [earninghub.ai/one](https://earninghub.ai/one/) · **安装包：** [GitHub Releases](https://github.com/luyao-inc/OneEarning/releases)

---

## 概览

**OneEarning** 是一款 **本机优先的桌面应用**（Electron），封装 **[Paperclip](https://github.com/paperclipai/paperclip)**，把问题与项目、智能体与适配器、例行任务、插件与技能、组织与审批、仪表盘等收进 **同一窗口**。工作数据默认留在本机。

在 **上游 Paperclip 之上**，本仓库额外提供 **中英文界面**、**知识库** 侧车、**项目成果（Outcomes）** 与 **Clawhub skill** 注册表对接——结构化说明见 **[差异化](#差异化)**，路由与侧车说明见 [`servers/README.md`](servers/README.md)。

界面默认 **中文**；可在侧栏账户菜单使用「**切换英文**」等入口，或在「**数据与存储**」中调整界面语言。

> 本文结构与英文 README 对应，便于中英文检索与对照维护。

---

## 截图

配图位于仓库 [`intro/`](intro/) 目录。**差异化**相关配图（含 **`language.png`** 中英文切换、知识库、成果、Clawhub skill）集中在 **[差异化](#差异化)** 章节内的「**界面预览**」表格，与能力说明放在一起。以下为其余界面。

### 概览与收件

![概览仪表盘](intro/gailan.png)

![收件箱](intro/inbox.png)

### 任务

![任务](intro/task.png)

### 智能体

![智能体](intro/agent.png)

![智能体配置](intro/agent-config.png)

### 例行

![例行任务 Cron](intro/cron.png)

---

## 为什么选择 OneEarning

Paperclip 能力强，但未必人人都想在终端里拼装工具链。OneEarning 的思路很简单：**给上游工作流一个像样的桌面入口**，同时 **不 fork Paperclip 核心源码**。

| 痛点 | OneEarning 的做法 |
|------|-------------------|
| 上下文分散 | 同一应用内串联问题、智能体、例行与组织相关界面 |
| 数据在哪 | 默认 **本机优先**；需要时用 **Web 逃生舱** 在浏览器打开同一实例（[文档](docs/escape-hatch.md)） |
| 跟上 Paperclip | 子进程运行上游 **`paperclipai`**；本仓库 **不维护 Paperclip 分叉** |

### Paperclip 在内

OneEarning 以子进程方式运行 **`paperclipai`**，在本地暴露 Paperclip 的 HTTP API。**主窗口**为 OneEarning 自带的 **React** 壳；**Electron 主进程**通过 **IPC** 代理访问 `http://127.0.0.1:<port>/api/...`，与 Paperclip 预期的 API 形态保持一致。

---

## 差异化

OneEarning **不替代** **`paperclipai`**；在桌面壳与 **本机侧车** 上叠加能力，经主进程代理到 **`/api/oneearning/...`**（端口由启动时动态分配，见 [`servers/README.md`](servers/README.md)）。

### 相对上游 Paperclip 的增量（产品能力）

| 差异化项 | 用户可见能力 | 实现位置 |
|----------|--------------|----------|
| **中英文界面** | 全产品 **中文 / 英文** 切换（默认中文） | Electron 壳 + i18n；侧栏账户菜单「**切换英文**」等，亦可在「**数据与存储**」调整 |
| **知识库** | 在应用内对 **项目相关资料** 做入库与检索 | 侧车 [`servers/knowledge`](servers/knowledge/) · HTTP **`/api/oneearning/knowledge/*`** |
| **项目成果（Outcomes）** | 项目维度的 **交付物沉淀与回顾** | 侧车 [`servers/outcomes`](servers/outcomes/) · HTTP **`/api/oneearning/outcomes/*`** |
| **Clawhub skill** | 从公开注册表（默认 **`clawhub.ai`**）使用技能，元数据与 zip 约定与官方 **`clawhub` CLI** 一致，可与 Paperclip skill 流程协同 | 侧车 [`servers/clawhub`](servers/clawhub/) · HTTP **`/api/oneearning/clawhub/*`** |

### 界面预览（`intro/`）

将 **差异化项** 与仓库截图一一对应（便于检索与对照）。

| 差异化项 | `intro/` 文件 | 预览 |
|----------|----------------|------|
| **中英文界面** | `language.png` | ![中英文切换 — 侧栏「切换英文」](intro/language.png) |
| **知识库** | `kb.png` | ![知识库](intro/kb.png) |
| **项目成果（Outcomes）** | `outcome.png` | ![项目成果](intro/outcome.png) |
| **Clawhub skill** | `skill.png` | ![技能 / Clawhub 相关界面](intro/skill.png) |

### 路由速查（OneEarning 侧车）

| 路径前缀 | 侧车 |
|----------|------|
| `/api/oneearning/knowledge/*` | Knowledge |
| `/api/oneearning/outcomes/*` | Outcomes |
| `/api/oneearning/clawhub/*` | Clawhub |

Paperclip **核心行为**仍由 **`paperclipai`** 子进程及其既有 API 承担。

---

## 功能

下文描述 **完整产品能力**（上游 Paperclip 已有能力 **加上** [差异化](#差异化) 中的增量）。

### 问题与项目

与工作区、仓库绑定的问题跟踪与项目管理，在同一应用内完成规划与执行上下文切换。

### 智能体与适配器

配置各类 **适配器**（编码助手、网关等，具体随构建而定），在桌面端统一管理智能体，减少临时 CLI 拼凑。

### 例行（Routines）

**类 Cron 的自动化**：定时与触发任务，降低「忘了点执行」的摩擦。

### 插件与技能

通过插件与 **技能** 扩展能力；在支持的构建上可对接 MCP 类扩展。

### 组织与审批

成员、邀请、权限与 **审批流**，适合仍需轻量治理的小团队。

### 仪表盘

任务、消费/用量与待审批等视图，快速判断系统是否需要人工介入。

### Web 逃生舱

在系统浏览器中打开 **完整 Web UI**，访问同一本机实例（详见 [逃生舱文档](docs/escape-hatch.md)）。

---

## 快速开始

### 系统要求

- **操作系统：** Windows / macOS / Linux，请以 [Releases](https://github.com/luyao-inc/OneEarning/releases) 实际发布的安装包为准。
- **内存：** 建议不低于 4 GB（开发与同时运行 Electron 时 8 GB 更舒适）。
- **磁盘：** 预留应用体积、内嵌资源与本机 Paperclip 数据空间。

### 安装（推荐）

从 **[GitHub Releases](https://github.com/luyao-inc/OneEarning/releases)** 下载对应平台的最新安装包。

### 从源码运行

```bash
git clone https://github.com/luyao-inc/OneEarning.git
cd OneEarning
pnpm install
pnpm dev
```

### 首次启动（开发）

首次启动会在 `userData/paperclip` 下生成配置，执行 **`paperclipai doctor`**，随后 **`paperclipai run`**。开发环境需本机 **Node.js 20+**（与 `embedded-postgres` 等 native 模块 ABI 一致）。

### 生产级打包

```bash
pnpm run bundle:paperclip   # 生成 build/paperclip/
pnpm run bundle:postgres    # 可选：embedded-postgres 资源
pnpm run build              # vite + bundle + electron-builder
```

Windows 安装包 **默认捆绑 Node**：`pnpm run build:win` 会先执行 **`prep:node:win`** 再打包，终端用户无需单独安装 Node。若仅需重新下载 Node：单独运行 `pnpm run prep:node:win`。

```bash
pnpm run build:win
```

### 配置

- **更新源：** 环境变量 `ONEEARNING_UPDATE_URL` 或修改 `electron-builder.yml` 中的 `publish`。
- **指定 Node：** `ONEEARNING_NODE=/path/to/node`。

---

## 架构

OneEarning 将 **桌面壳** 与 **Paperclip 运行时** 分开：Electron 负责窗口与 IPC；Paperclip 负责 API 语义与持久化。

```
┌─────────────────────────────────────────────────────────────┐
│                    OneEarning（Electron）                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 主进程                                                  │  │
│  │ • 窗口生命周期、IPC、转发至本机 HTTP API                  │  │
│  └───────────────────────────┬─────────────────────────────┘  │
│                              │ IPC                            │
│  ┌───────────────────────────▼─────────────────────────────┐  │
│  │ 渲染进程（React 壳）                                      │  │
│  │ • 面向 Paperclip 的界面与桌面集成                          │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │ http://127.0.0.1:<port>/api/...
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ paperclipai（子进程）· 上游 Paperclip 运行时                  │
└─────────────────────────────────────────────────────────────┘
```

### 设计要点

- **不 fork：** 服务端行为以官方 **`paperclipai`** 为准。
- **IPC 边界：** 渲染层通过主进程暴露的路径访问 Paperclip，符合桌面壳的安全假设。

---

## 适用场景

### 单人经营者

问题、智能体、例行任务集中在同一桌面，减少「切工具」成本。

### 小团队治理

需要多人参与智能体、预算或敏感流程时，使用组织与审批能力。

### 重集成工作流

通过适配器与技能对接常用编码工具，Paperclip 仍作为编排与协作中枢。

---

## 开发

### 前置条件

- **Node.js：** 20+
- **pnpm：** 9+（见根目录 `package.json` 的 `packageManager`）

### 仓库结构（概览）

```text
OneEarning/
├── electron/           # 主进程、preload、IPC / 代理 Paperclip
├── src/                # React 渲染层（Paperclip UI 壳与集成）
├── servers/            # 辅助本地服务（如 knowledge、outcomes）
├── scripts/            # 打包、vendor、构建脚本
├── docs/               # 深度文档（如 Web 逃生舱）
└── intro/              # README 配图
```

### 常用命令

```bash
pnpm dev              # Vite + Electron 开发
pnpm run build:vite   # 仅构建前端
pnpm run package      # 打包 Paperclip、辅助服务与资源（正式打包前步骤）
pnpm run build        # 完整生产构建（electron-builder）
pnpm run typecheck    # TypeScript 检查（--noEmit）
```

按平台打包：`pnpm run build:win` · `pnpm run build:mac` · `pnpm run build:linux`。

---

## 参与贡献

欢迎提交 Issue 与 PR——缺陷修复、文档、翻译与小范围改进都很有价值。

1. **Fork** 本仓库  
2. 从 `main` 检出功能分支（`feature/…` 或 `fix/…`）  
3. **提交**信息清晰说明动机与影响  
4. 发起 **Pull Request**  

改动尽量聚焦；涉及 TypeScript 时请运行 **`pnpm run typecheck`**。

---

## 致谢

- **[Paperclip](https://github.com/paperclipai/paperclip)** / **`paperclipai`** — 编排运行时与 API  
- **[Electron](https://www.electronjs.org/)** — 跨平台桌面壳  
- **[React](https://react.dev/)** — 渲染层 UI  

上游与第三方依赖仍遵循各自许可证。

---

## 社区

欢迎与其他开发者交流 OneEarning 相关话题。**企业微信群**如下：

![企业微信交流群二维码](intro/单人二维码.png)

---

## 许可

本项目以 **[MIT License](LICENSE)** 发布。Paperclip 及相关第三方组件遵循其各自许可证。

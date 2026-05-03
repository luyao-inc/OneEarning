# 中文字典维护说明（OneEarning）

Paperclip 上游 UI 无 i18n 接口，OneEarning 通过 `electron/preload/zh-injector.ts` 在运行时替换 DOM 文本与部分属性（`placeholder`、`title`、`aria-label`、`alt`）。

## 词典位置

- 主界面（Paperclip Web）：[`locales/zh-CN/paperclip.json`](../locales/zh-CN/paperclip.json)
- Electron 壳（菜单/托盘）：[`locales/zh-CN/shell.json`](../locales/zh-CN/shell.json)

`paperclip.json` 结构：

```json
{
  "exact": { "英文原文": "中文译文" },
  "regex": [{ "pattern": "^…$", "replace": "…$1…" }]
}
```

## 增补流程

1. 在开发模式运行应用，打开未翻译页面。
2. 在 Paperclip 地址后加查询参数 `?i18n-dump=1`，打开 DevTools 控制台，关注 `[i18n-miss]` 输出的英文短语（仅 ASCII 可见字符，减少噪音）。
3. 将短语以 **trim 后的完整短句** 作为 `exact` 的 key 加入 `paperclip.json`（避免子串误伤）。
4. 对含数字/时间的动态文案使用 `regex` 条目。
5. 提交前在主要页面点一遍回归（登录、看板、工单、设置）。

## 上游升级回归

- 升级 `paperclipai` 依赖版本后，英文文案可能变化，导致 `exact` 失效。
- 建议：在 CI 或发版前跑一遍手测清单（主导航 + 创建工单 + 例行任务 + 设置）。
- 长期可选：对关键路由做 Playwright 截图对比（本仓库未默认开启）。

## 已知限制

- Canvas / SVG `<text>` 内文案无法通过 DOM 文本节点替换。
- 富文本编辑器内部结构复杂时，可能需更细粒度词典或接受部分英文。

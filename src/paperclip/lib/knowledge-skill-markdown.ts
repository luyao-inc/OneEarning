export const ONEEARNING_KNOWLEDGE_SKILL_SLUG = "oneearning-knowledge";

/**
 * 公司级共享技能：知识按「公司 + 智能体」分目录。
 *
 * 注意：**Paperclip HTTP 端口（如 :3100）不会转发** `/api/oneearning/knowledge/*`；
 * 只有 Electron 壳内 `fetch(/api/...)` 会经主进程转到知识侧车。
 * 终端 / Heartbeat 里 `curl` 必须直连侧车：`http://127.0.0.1:<侧车端口>/search`（端口见控制台
 * `Knowledge sidecar started`，开发环境常见优先使用 **38741**）。
 */
export function buildKnowledgeSkillMarkdown(params: { baseUrl: string }): string {
  const { baseUrl } = params;
  const root = baseUrl.replace(/\/$/, "");
  /** 壳内相对路径，由 Electron 代理到侧车（勿把此前缀接到 Paperclip 端口上做 curl） */
  const proxiedSearchPath = "/api/oneearning/knowledge/search";
  return `# OneEarning 知识库检索

这是**公司共享**技能：任意智能体可挂载。检索时必须使用**当前执行任务**的智能体及其公司的 UUID。

- \`companyId\`：与上下文 \`{{companyId}}\` 一致。
- \`agentId\`：与 \`{{agent.id}}\` 一致（知识文件按「公司 + 智能体」隔离）。

## 调用方式（两条路径，勿混用）

### A. 在本应用 / 与 UI 同源的请求（推荐 Heartbeat 内用脚本调同源）

使用**相对路径**（勿手写 Paperclip 的 \`:3100\` 主机）：

\`\`\`http
POST ${proxiedSearchPath}
Content-Type: application/json
\`\`\`

请求体 JSON 字段：\`companyId\`、\`agentId\`、\`q\`、可选 \`topK\`。

### B. 在独立终端里使用 curl（不经 Electron）

**禁止**：\`curl http://127.0.0.1:3100${proxiedSearchPath}\` — Paperclip 进程**不提供** OneEarning 知识代理，会得到错误或 500。

**正确**：直连知识侧车（启动日志一行 \`Knowledge sidecar started http://127.0.0.1:<端口>\`），路径为 **\`/search\`**（端口占用时会变，以日志为准；常见开发端口 **38741**）。

\`\`\`bash
curl -s -X POST "http://127.0.0.1:38741/search" \\
  -H "Content-Type: application/json" \\
  -d "{\\"companyId\\":\\"{{companyId}}\\",\\"agentId\\":\\"{{agent.id}}\\",\\"q\\":\\"关键词\\",\\"topK\\":12}"
\`\`\`

说明：上面示例主机仅为占位；若 \`38741\` 不可用，请用控制台打印的实际端口替换。

---

参考绝对 URL（仅当 shell 已正确代理时）：\`${root}${proxiedSearchPath}\` — **仅供在已实现 fetch 桥的环境使用**；裸 \`curl\` 到 \`${root}\` 通常无效。

响应 \`hits\`：\`docPath\`、\`snippet\`、\`chunkIdx\`、\`score\`。

请在桌面端该智能体的「知识」页完成导入与索引；侧车未启动时请求失败。
`;
}

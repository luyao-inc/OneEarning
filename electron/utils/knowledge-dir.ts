import { join } from 'node:path';
import type { App } from 'electron';

/** 知识库根：`userData/oneearning/knowledge`（与 Paperclip `userData/paperclip` 隔离） */
export function getOneEarningKnowledgeRoot(app: App): string {
  return join(app.getPath('userData'), 'oneearning', 'knowledge');
}

export function getAgentKnowledgeDir(app: App, companyId: string, agentId: string): string {
  const cid = typeof companyId === 'string' ? companyId.trim() : '';
  const aid = typeof agentId === 'string' ? agentId.trim() : '';
  return join(getOneEarningKnowledgeRoot(app), cid, aid);
}

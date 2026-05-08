import { join } from "node:path";

export function outcomesDbPath(root: string, companyId: string): string {
  const cid = companyId.trim();
  return join(root.trim(), cid, "outcomes.sqlite");
}

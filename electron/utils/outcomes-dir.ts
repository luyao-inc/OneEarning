import { join } from "node:path";
import type { App } from "electron";

/** 成果侧车数据根：`userData/oneearning/outcomes`（与 knowledge 并列） */
export function getOneEarningOutcomesRoot(app: App): string {
  return join(app.getPath("userData"), "oneearning", "outcomes");
}

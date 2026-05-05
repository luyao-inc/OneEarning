import type { TFunction } from "i18next";

/** 将 API 的 goal.level 枚举（company/team/agent/task）显示为 i18n 文案 */
export function goalLevelLabel(level: string, t: TFunction): string {
  const keys: Record<string, string> = {
    company: "paperclip.newGoalDialog.levelCompany",
    team: "paperclip.newGoalDialog.levelTeam",
    agent: "paperclip.newGoalDialog.levelAgent",
    task: "paperclip.newGoalDialog.levelTask",
  };
  const key = keys[level];
  return key ? t(key) : level;
}

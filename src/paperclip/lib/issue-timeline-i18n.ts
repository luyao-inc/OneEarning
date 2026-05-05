import type { Agent } from "@paperclipai/shared";
import type { TFunction } from "i18next";
import { formatAssigneeUserLabel } from "./assignees";
import type { IssueTimelineAssignee } from "./issue-timeline-events";

export function translateTimelineIssueStatus(value: string | null, t: TFunction): string {
  if (value === null || value === "") {
    return t("paperclip.issueChat.activityValueNone");
  }
  return t(`paperclip.issueStatus.${value}`, { defaultValue: value.replace(/_/g, " ") });
}

export function displayTimelineActorName(
  actorType: string | undefined | null,
  rawActorName: string,
  t: TFunction,
): string {
  if (actorType === "system") {
    return t("paperclip.issueChat.activityActorSystem");
  }
  if (rawActorName === "Board") {
    return t("paperclip.issueChat.activityActorBoard");
  }
  return rawActorName;
}

export function formatTimelineAssigneeForDisplay(
  assignee: IssueTimelineAssignee,
  t: TFunction,
  agentMap?: Map<string, Agent>,
  currentUserId?: string | null,
  userLabelMap?: ReadonlyMap<string, string> | null,
): string {
  if (assignee.agentId) {
    return agentMap?.get(assignee.agentId)?.name ?? assignee.agentId.slice(0, 8);
  }
  if (assignee.userId) {
    return (
      formatAssigneeUserLabel(assignee.userId, currentUserId, userLabelMap) ??
      t("paperclip.issueChat.activityActorBoard")
    );
  }
  return t("paperclip.issueChat.activityUnassigned");
}

import type { TFunction } from "i18next";
import type { Agent } from "@paperclipai/shared";
import type { CompanyUserProfile } from "./company-members";

type ActivityDetails = Record<string, unknown> | null | undefined;

type ActivityParticipant = {
  type: "agent" | "user";
  agentId?: string | null;
  userId?: string | null;
};

type ActivityIssueReference = {
  id?: string | null;
  identifier?: string | null;
  title?: string | null;
};

interface ActivityFormatOptions {
  agentMap?: Map<string, Agent>;
  userProfileMap?: Map<string, CompanyUserProfile>;
  currentUserId?: string | null;
}

const ACTIVITY_ROW_VERBS: Record<string, string> = {
  "issue.created": "created",
  "issue.updated": "updated",
  "issue.checked_out": "checked out",
  "issue.released": "released",
  "issue.comment_added": "commented on",
  "issue.comment_cancelled": "cancelled a queued comment on",
  "issue.attachment_added": "attached file to",
  "issue.attachment_removed": "removed attachment from",
  "issue.document_created": "created document for",
  "issue.document_updated": "updated document on",
  "issue.document_deleted": "deleted document from",
  "issue.commented": "commented on",
  "issue.deleted": "deleted",
  "agent.created": "created",
  "agent.updated": "updated",
  "agent.paused": "paused",
  "agent.resumed": "resumed",
  "agent.terminated": "terminated",
  "agent.key_created": "created API key for",
  "agent.budget_updated": "updated budget for",
  "agent.runtime_session_reset": "reset session for",
  "heartbeat.invoked": "invoked heartbeat for",
  "heartbeat.cancelled": "cancelled heartbeat for",
  "approval.created": "requested approval",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
  "project.created": "created",
  "project.updated": "updated",
  "project.deleted": "deleted",
  "goal.created": "created",
  "goal.updated": "updated",
  "goal.deleted": "deleted",
  "cost.reported": "reported cost for",
  "cost.recorded": "recorded cost for",
  "company.created": "created company",
  "company.updated": "updated company",
  "company.archived": "archived",
  "company.budget_updated": "updated budget for",
  "issue.read_marked": "marked as read",
  "asset.created": "created asset",
  "environment_lease.released": "released environment lease for",
  "environment_lease.acquired": "acquired environment lease for",
};

const ISSUE_ACTIVITY_LABELS: Record<string, string> = {
  "issue.created": "created the issue",
  "issue.updated": "updated the issue",
  "issue.checked_out": "checked out the issue",
  "issue.released": "released the issue",
  "issue.comment_added": "added a comment",
  "issue.comment_cancelled": "cancelled a queued comment",
  "issue.feedback_vote_saved": "saved feedback on an AI output",
  "issue.attachment_added": "added an attachment",
  "issue.attachment_removed": "removed an attachment",
  "issue.document_created": "created a document",
  "issue.document_updated": "updated a document",
  "issue.document_deleted": "deleted a document",
  "issue.deleted": "deleted the issue",
  "agent.created": "created an agent",
  "agent.updated": "updated the agent",
  "agent.paused": "paused the agent",
  "agent.resumed": "resumed the agent",
  "agent.terminated": "terminated the agent",
  "heartbeat.invoked": "invoked a heartbeat",
  "heartbeat.cancelled": "cancelled a heartbeat",
  "approval.created": "requested approval",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "none");
  return value.replace(/_/g, " ");
}

function isActivityParticipant(value: unknown): value is ActivityParticipant {
  const record = asRecord(value);
  if (!record) return false;
  return record.type === "agent" || record.type === "user";
}

function isActivityIssueReference(value: unknown): value is ActivityIssueReference {
  return asRecord(value) !== null;
}

function readParticipants(details: ActivityDetails, key: string): ActivityParticipant[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isActivityParticipant);
}

function readIssueReferences(details: ActivityDetails, key: string): ActivityIssueReference[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isActivityIssueReference);
}

function formatUserLabel(userId: string | null | undefined, options: ActivityFormatOptions = {}, t?: TFunction): string {
  if (!userId || userId === "local-board") return t ? t("paperclip.activity.actorBoard") : "Board";
  if (options.currentUserId && userId === options.currentUserId) return t ? t("paperclip.activity.issueDetail.you") : "You";
  const profile = options.userProfileMap?.get(userId);
  if (profile) return profile.label;
  return `user ${userId.slice(0, 5)}`;
}

function formatParticipantLabel(participant: ActivityParticipant, options: ActivityFormatOptions, t?: TFunction): string {
  if (participant.type === "agent") {
    const agentId = participant.agentId ?? "";
    return (
      options.agentMap?.get(agentId)?.name ?? (t ? t("paperclip.activity.issueDetail.agentFallback") : "agent")
    );
  }
  return formatUserLabel(participant.userId, options, t);
}

function formatIssueReferenceLabel(reference: ActivityIssueReference): string {
  if (reference.identifier) return reference.identifier;
  if (reference.title) return reference.title;
  if (reference.id) return reference.id.slice(0, 8);
  return "issue";
}

function formatChangedEntityLabel(
  singular: string,
  plural: string,
  labels: string[],
): string {
  if (labels.length <= 0) return plural;
  if (labels.length === 1) return `${singular} ${labels[0]}`;
  return `${labels.length} ${plural}`;
}

function labelIssueEnumField(kind: "issueStatus" | "issuePriority", value: unknown, t?: TFunction): string {
  if (typeof value !== "string") return String(value ?? "");
  if (t) {
    const key = `paperclip.${kind === "issueStatus" ? "issueStatus" : "issuePriority"}.${value}`;
    return t(key, { defaultValue: humanizeValue(value) });
  }
  return humanizeValue(value);
}

function formatIssueUpdatedVerb(details: ActivityDetails, t?: TFunction): string | null {
  if (!details) return null;
  const previous = asRecord(details._previous) ?? {};
  if (details.status !== undefined) {
    const from = previous.status;
    return from
      ? t
        ? t("paperclip.activity.issueStatusFromToOn", {
            from: labelIssueEnumField("issueStatus", from, t),
            to: labelIssueEnumField("issueStatus", details.status, t),
          })
        : `changed status from ${humanizeValue(from)} to ${humanizeValue(details.status)} on`
      : t
        ? t("paperclip.activity.issueStatusToOn", { to: labelIssueEnumField("issueStatus", details.status, t) })
        : `changed status to ${humanizeValue(details.status)} on`;
  }
  if (details.priority !== undefined) {
    const from = previous.priority;
    return from
      ? t
        ? t("paperclip.activity.issuePriorityFromToOn", {
            from: labelIssueEnumField("issuePriority", from, t),
            to: labelIssueEnumField("issuePriority", details.priority, t),
          })
        : `changed priority from ${humanizeValue(from)} to ${humanizeValue(details.priority)} on`
      : t
        ? t("paperclip.activity.issuePriorityToOn", { to: labelIssueEnumField("issuePriority", details.priority, t) })
        : `changed priority to ${humanizeValue(details.priority)} on`;
  }
  return null;
}

function formatAssigneeName(details: ActivityDetails, options: ActivityFormatOptions, t?: TFunction): string | null {
  if (!details) return null;
  const agentId = details.assigneeAgentId;
  const userId = details.assigneeUserId;
  if (typeof agentId === "string" && agentId) {
    return options.agentMap?.get(agentId)?.name ?? (t ? t("paperclip.activity.issueDetail.agentFallback") : "agent");
  }
  if (typeof userId === "string" && userId) {
    return formatUserLabel(userId, options, t);
  }
  return null;
}

function formatIssueUpdatedAction(
  details: ActivityDetails,
  options: ActivityFormatOptions = {},
  t?: TFunction,
): string | null {
  if (!details) return null;
  const previous = asRecord(details._previous) ?? {};
  const parts: string[] = [];

  if (t) {
    if (details.status !== undefined) {
      const from = previous.status;
      parts.push(
        from
          ? t("paperclip.activity.issueDetail.statusFromTo", {
              from: labelIssueEnumField("issueStatus", from, t),
              to: labelIssueEnumField("issueStatus", details.status, t),
            })
          : t("paperclip.activity.issueDetail.statusTo", {
              to: labelIssueEnumField("issueStatus", details.status, t),
            }),
      );
    }
    if (details.priority !== undefined) {
      const from = previous.priority;
      parts.push(
        from
          ? t("paperclip.activity.issueDetail.priorityFromTo", {
              from: labelIssueEnumField("issuePriority", from, t),
              to: labelIssueEnumField("issuePriority", details.priority, t),
            })
          : t("paperclip.activity.issueDetail.priorityTo", {
              to: labelIssueEnumField("issuePriority", details.priority, t),
            }),
      );
    }
    if (details.assigneeAgentId !== undefined || details.assigneeUserId !== undefined) {
      const assigneeName = formatAssigneeName(details, options, t);
      parts.push(
        assigneeName ? t("paperclip.activity.issueDetail.assignedTo", { name: assigneeName }) : t("paperclip.activity.issueDetail.unassigned"),
      );
    }
    if (details.title !== undefined) parts.push(t("paperclip.activity.issueDetail.titleUpdated"));
    if (details.description !== undefined) parts.push(t("paperclip.activity.issueDetail.descriptionUpdated"));
    return parts.length > 0 ? parts.join(", ") : null;
  }

  if (details.status !== undefined) {
    const from = previous.status;
    parts.push(
      from
        ? `changed the status from ${humanizeValue(from)} to ${humanizeValue(details.status)}`
        : `changed the status to ${humanizeValue(details.status)}`,
    );
  }
  if (details.priority !== undefined) {
    const from = previous.priority;
    parts.push(
      from
        ? `changed the priority from ${humanizeValue(from)} to ${humanizeValue(details.priority)}`
        : `changed the priority to ${humanizeValue(details.priority)}`,
    );
  }
  if (details.assigneeAgentId !== undefined || details.assigneeUserId !== undefined) {
    const assigneeName = formatAssigneeName(details, options);
    parts.push(assigneeName ? `assigned the issue to ${assigneeName}` : "unassigned the issue");
  }
  if (details.title !== undefined) parts.push("updated the title");
  if (details.description !== undefined) parts.push("updated the description");

  return parts.length > 0 ? parts.join(", ") : null;
}

function buildStructEntityPhrase(
  labels: string[],
  singularKey: "blocker" | "reviewer" | "approver",
  pluralKey: "blockers" | "reviewers" | "approvers",
  t: TFunction,
): string {
  if (labels.length <= 0) return t(`paperclip.activity.struct.${pluralKey}`);
  if (labels.length === 1) {
    return t("paperclip.activity.struct.entityLineOne", {
      entity: t(`paperclip.activity.struct.${singularKey}`),
      name: labels[0] ?? "",
    });
  }
  return t("paperclip.activity.struct.entityLineMany", {
    count: labels.length,
    entity: t(`paperclip.activity.struct.${pluralKey}`),
  });
}

function formatStructuredIssueChange(input: {
  action: string;
  details: ActivityDetails;
  options: ActivityFormatOptions;
  forIssueDetail: boolean;
  t?: TFunction;
}): string | null {
  const details = input.details;
  if (!details) return null;
  const { t } = input;

  if (t && input.action === "issue.blockers_updated") {
    const added = readIssueReferences(details, "addedBlockedByIssues").map(formatIssueReferenceLabel);
    const removed = readIssueReferences(details, "removedBlockedByIssues").map(formatIssueReferenceLabel);
    if (added.length > 0 && removed.length === 0) {
      const what = buildStructEntityPhrase(added, "blocker", "blockers", t);
      return input.forIssueDetail
        ? t("paperclip.activity.struct.addedDetail", { what })
        : t("paperclip.activity.struct.addedTo", { what });
    }
    if (removed.length > 0 && added.length === 0) {
      const what = buildStructEntityPhrase(removed, "blocker", "blockers", t);
      return input.forIssueDetail
        ? t("paperclip.activity.struct.removedDetail", { what })
        : t("paperclip.activity.struct.removedFrom", { what });
    }
    return input.forIssueDetail
      ? t("paperclip.activity.struct.updatedBlockersDetail")
      : t("paperclip.activity.struct.updatedBlockersOn");
  }

  if (
    t &&
    (input.action === "issue.reviewers_updated" || input.action === "issue.approvers_updated")
  ) {
    const isReviewers = input.action === "issue.reviewers_updated";
    const singularKey = isReviewers ? ("reviewer" as const) : ("approver" as const);
    const pluralKey = isReviewers ? ("reviewers" as const) : ("approvers" as const);
    const added = readParticipants(details, "addedParticipants").map((participant) => formatParticipantLabel(participant, input.options, t));
    const removed = readParticipants(details, "removedParticipants").map((participant) =>
      formatParticipantLabel(participant, input.options, t),
    );
    if (added.length > 0 && removed.length === 0) {
      const what = buildStructEntityPhrase(added, singularKey, pluralKey, t);
      return input.forIssueDetail
        ? t("paperclip.activity.struct.addedDetail", { what })
        : t("paperclip.activity.struct.addedTo", { what });
    }
    if (removed.length > 0 && added.length === 0) {
      const what = buildStructEntityPhrase(removed, singularKey, pluralKey, t);
      return input.forIssueDetail
        ? t("paperclip.activity.struct.removedDetail", { what })
        : t("paperclip.activity.struct.removedFrom", { what });
    }
    return input.forIssueDetail
      ? isReviewers
        ? t("paperclip.activity.struct.updatedReviewersDetail")
        : t("paperclip.activity.struct.updatedApproversDetail")
      : isReviewers
        ? t("paperclip.activity.struct.updatedReviewersOn")
        : t("paperclip.activity.struct.updatedApproversOn");
  }

  if (input.action === "issue.blockers_updated") {
    const added = readIssueReferences(details, "addedBlockedByIssues").map(formatIssueReferenceLabel);
    const removed = readIssueReferences(details, "removedBlockedByIssues").map(formatIssueReferenceLabel);
    if (added.length > 0 && removed.length === 0) {
      const changed = formatChangedEntityLabel("blocker", "blockers", added);
      return input.forIssueDetail ? `added ${changed}` : `added ${changed} to`;
    }
    if (removed.length > 0 && added.length === 0) {
      const changed = formatChangedEntityLabel("blocker", "blockers", removed);
      return input.forIssueDetail ? `removed ${changed}` : `removed ${changed} from`;
    }
    return input.forIssueDetail ? "updated blockers" : "updated blockers on";
  }

  if (input.action === "issue.reviewers_updated" || input.action === "issue.approvers_updated") {
    const added = readParticipants(details, "addedParticipants").map((participant) => formatParticipantLabel(participant, input.options));
    const removed = readParticipants(details, "removedParticipants").map((participant) => formatParticipantLabel(participant, input.options));
    const singular = input.action === "issue.reviewers_updated" ? "reviewer" : "approver";
    const plural = input.action === "issue.reviewers_updated" ? "reviewers" : "approvers";
    if (added.length > 0 && removed.length === 0) {
      const changed = formatChangedEntityLabel(singular, plural, added);
      return input.forIssueDetail ? `added ${changed}` : `added ${changed} to`;
    }
    if (removed.length > 0 && added.length === 0) {
      const changed = formatChangedEntityLabel(singular, plural, removed);
      return input.forIssueDetail ? `removed ${changed}` : `removed ${changed} from`;
    }
    return input.forIssueDetail ? `updated ${plural}` : `updated ${plural} on`;
  }

  return null;
}

export function formatActivityVerb(
  action: string,
  details?: Record<string, unknown> | null,
  options: ActivityFormatOptions = {},
  t?: TFunction,
): string {
  if (action === "issue.updated") {
    const issueUpdatedVerb = formatIssueUpdatedVerb(details, t);
    if (issueUpdatedVerb) return issueUpdatedVerb;
  }

  const structuredChange = formatStructuredIssueChange({
    action,
    details,
    options,
    forIssueDetail: false,
    t,
  });
  if (structuredChange) return structuredChange;

  if (t) {
    const tk = `paperclip.activity.verbs.${action.replace(/\./g, "_")}`;
    return t(tk, { defaultValue: ACTIVITY_ROW_VERBS[action] ?? action.replace(/[._]/g, " ") });
  }
  return ACTIVITY_ROW_VERBS[action] ?? action.replace(/[._]/g, " ");
}

export function formatIssueActivityAction(
  action: string,
  details?: Record<string, unknown> | null,
  options: ActivityFormatOptions = {},
  t?: TFunction,
): string {
  if (action === "issue.updated") {
    const issueUpdatedAction = formatIssueUpdatedAction(details, options, t);
    if (issueUpdatedAction) return issueUpdatedAction;
  }

  const structuredChange = formatStructuredIssueChange({
    action,
    details,
    options,
    forIssueDetail: true,
    t,
  });
  if (structuredChange) return structuredChange;

  if (
    (action === "issue.document_created" || action === "issue.document_updated" || action === "issue.document_deleted") &&
    details
  ) {
    const key = typeof details.key === "string" ? details.key : "document";
    const title = typeof details.title === "string" && details.title ? ` (${details.title})` : "";
    return `${ISSUE_ACTIVITY_LABELS[action] ?? action} ${key}${title}`;
  }

  return ISSUE_ACTIVITY_LABELS[action] ?? action.replace(/[._]/g, " ");
}

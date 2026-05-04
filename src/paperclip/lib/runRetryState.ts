import type { TFunction } from "i18next";
import { formatDateTime } from "./utils";

type RetryAwareRun = {
  status: string;
  retryOfRunId?: string | null;
  scheduledRetryAt?: string | Date | null;
  scheduledRetryAttempt?: number | null;
  scheduledRetryReason?: string | null;
  retryExhaustedReason?: string | null;
};

export type RunRetryStateSummary = {
  kind: "scheduled" | "exhausted" | "attempted";
  badgeLabel: string;
  tone: string;
  detail: string | null;
  secondary: string | null;
  retryOfRunId: string | null;
};

const RETRY_REASON_LABELS: Record<string, string> = {
  transient_failure: "Transient failure",
  missing_issue_comment: "Missing issue comment",
  process_lost: "Process lost",
  assignment_recovery: "Assignment recovery",
  issue_continuation_needed: "Continuation needed",
};

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function joinFragments(parts: Array<string | null>) {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? filtered.join(" · ") : null;
}

export function formatRetryReason(reason: string | null | undefined, t?: TFunction) {
  const normalized = readNonEmptyString(reason);
  if (!normalized) return null;
  const fallback = RETRY_REASON_LABELS[normalized] ?? normalized.replace(/_/g, " ");
  if (t) {
    const key = `paperclip.issueRunLedger.retryReason.${normalized}`;
    return t(key, { defaultValue: fallback });
  }
  return fallback;
}

export function describeRunRetryState(run: RetryAwareRun, t?: TFunction): RunRetryStateSummary | null {
  const attempt =
    typeof run.scheduledRetryAttempt === "number" && Number.isFinite(run.scheduledRetryAttempt) && run.scheduledRetryAttempt > 0
      ? run.scheduledRetryAttempt
      : null;
  const attemptLabel = attempt
    ? t
      ? t("paperclip.issueRunLedger.retryState.attempt", { count: attempt })
      : `Attempt ${attempt}`
    : null;
  const reasonLabel = formatRetryReason(run.scheduledRetryReason, t);
  const retryOfRunId = readNonEmptyString(run.retryOfRunId);
  const exhaustedReason = readNonEmptyString(run.retryExhaustedReason);
  const dueAt = run.scheduledRetryAt ? formatDateTime(run.scheduledRetryAt) : null;
  const hasRetryMetadata =
    Boolean(retryOfRunId)
    || Boolean(reasonLabel)
    || Boolean(dueAt)
    || Boolean(attemptLabel)
    || Boolean(exhaustedReason);

  if (!hasRetryMetadata) return null;

  if (run.status === "scheduled_retry") {
    return {
      kind: "scheduled",
      badgeLabel: t ? t("paperclip.issueRunLedger.retryState.badgeScheduled") : "Retry scheduled",
      tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
      detail: joinFragments([attemptLabel, reasonLabel]),
      secondary: dueAt
        ? t
          ? t("paperclip.issueRunLedger.retryState.nextRetryAt", { at: dueAt })
          : `Next retry ${dueAt}`
        : t
          ? t("paperclip.issueRunLedger.retryState.nextRetryPending")
          : "Next retry pending schedule",
      retryOfRunId,
    };
  }

  if (exhaustedReason) {
    const exhaustedFragment = t
      ? t("paperclip.issueRunLedger.retryState.autoRetriesExhausted")
      : "Automatic retries exhausted";
    const manualSuffix = t
      ? t("paperclip.issueRunLedger.retryState.manualInterventionSuffix")
      : " Manual intervention required.";
    return {
      kind: "exhausted",
      badgeLabel: t ? t("paperclip.issueRunLedger.retryState.badgeExhausted") : "Retry exhausted",
      tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      detail: joinFragments([attemptLabel, reasonLabel, exhaustedFragment]),
      secondary: exhaustedReason.includes("Manual intervention required")
        ? exhaustedReason
        : `${exhaustedReason}${manualSuffix}`,
      retryOfRunId,
    };
  }

  return {
    kind: "attempted",
    badgeLabel: t ? t("paperclip.issueRunLedger.retryState.badgeAttempted") : "Retried run",
    tone: "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300",
    detail: joinFragments([attemptLabel, reasonLabel]),
    secondary: null,
    retryOfRunId,
  };
}

import { useState } from "react";
import type { IssueBlockerAttention } from "@paperclipai/shared";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { issueStatusIcon, issueStatusIconDefault } from "../lib/status-colors";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

const allStatuses = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"];

function statusLabelFallback(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface StatusIconProps {
  status: string;
  blockerAttention?: IssueBlockerAttention | null;
  onChange?: (status: string) => void;
  className?: string;
  showLabel?: boolean;
}

function blockedAttentionLabel(
  blockerAttention: IssueBlockerAttention | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!blockerAttention || blockerAttention.state === "none") return t("paperclip.issueStatus.blocked");

  if (blockerAttention.reason === "active_child") {
    const count = blockerAttention.coveredBlockerCount;
    if (count === 1 && blockerAttention.sampleBlockerIdentifier) {
      return t("paperclip.issueStatus.blockedWaitingSubIssue", {
        identifier: blockerAttention.sampleBlockerIdentifier,
      });
    }
    if (count === 1) return t("paperclip.issueStatus.blockedWaitingOneSubIssue");
    return t("paperclip.issueStatus.blockedWaitingSubIssues", { count });
  }

  if (blockerAttention.reason === "active_dependency") {
    const count = blockerAttention.coveredBlockerCount;
    if (count === 1 && blockerAttention.sampleBlockerIdentifier) {
      return t("paperclip.issueStatus.blockedCoveredDep", {
        identifier: blockerAttention.sampleBlockerIdentifier,
      });
    }
    if (count === 1) return t("paperclip.issueStatus.blockedCoveredOneDep");
    return t("paperclip.issueStatus.blockedCoveredDeps", { count });
  }

  if (blockerAttention.reason === "stalled_review") {
    const count = blockerAttention.stalledBlockerCount;
    const leaf = blockerAttention.sampleStalledBlockerIdentifier ?? blockerAttention.sampleBlockerIdentifier;
    if (count === 1 && leaf) return t("paperclip.issueStatus.blockedReviewStalledOn", { identifier: leaf });
    if (count === 1) return t("paperclip.issueStatus.blockedReviewStalledOne");
    return t("paperclip.issueStatus.blockedReviewStalledMany", { count });
  }

  if (blockerAttention.reason === "attention_required") {
    const count = blockerAttention.unresolvedBlockerCount;
    return count === 1
      ? t("paperclip.issueStatus.blockedAttentionOne", { count })
      : t("paperclip.issueStatus.blockedAttentionMany", { count });
  }

  return t("paperclip.issueStatus.blocked");
}

export function StatusIcon({ status, blockerAttention, onChange, className, showLabel }: StatusIconProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const isCoveredBlocked = status === "blocked" && blockerAttention?.state === "covered";
  const isStalledBlocked = status === "blocked" && blockerAttention?.state === "stalled";
  const colorClass = isCoveredBlocked
    ? "text-cyan-600 border-cyan-600 dark:text-cyan-400 dark:border-cyan-400"
    : isStalledBlocked
      ? "text-amber-600 border-amber-600 dark:text-amber-400 dark:border-amber-400"
      : issueStatusIcon[status] ?? issueStatusIconDefault;
  const isDone = status === "done";
  const statusText = (s: string) =>
    t(`paperclip.issueStatus.${s}`, { defaultValue: statusLabelFallback(s) });
  const ariaLabel = status === "blocked" ? blockedAttentionLabel(blockerAttention, t) : statusText(status);
  const blockerAttentionState = isCoveredBlocked
    ? "covered"
    : isStalledBlocked
      ? "stalled"
      : undefined;

  const circle = (
    <span
      className={cn(
        "relative inline-flex h-4 w-4 rounded-full border-2 shrink-0",
        colorClass,
        onChange && !showLabel && "cursor-pointer",
        className
      )}
      data-blocker-attention-state={blockerAttentionState}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {isDone && (
        <span className="absolute inset-0 m-auto h-2 w-2 rounded-full bg-current" />
      )}
      {isCoveredBlocked && (
        <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-current" />
      )}
      {isStalledBlocked && (
        <span className="absolute inset-0 m-auto h-1.5 w-1.5 rounded-full bg-current" />
      )}
    </span>
  );

  if (!onChange) return showLabel ? <span className="inline-flex items-center gap-1.5">{circle}<span className="text-sm">{statusText(status)}</span></span> : circle;

  const trigger = showLabel ? (
    <button className="inline-flex items-center gap-1.5 cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 py-0.5 transition-colors">
      {circle}
      <span className="text-sm">{statusText(status)}</span>
    </button>
  ) : circle;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="start">
        {allStatuses.map((s) => (
          <Button
            key={s}
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-2 text-xs", s === status && "bg-accent")}
            onClick={() => {
              onChange(s);
              setOpen(false);
            }}
          >
            <StatusIcon status={s} />
            {statusText(s)}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

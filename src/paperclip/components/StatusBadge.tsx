import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";
import { statusBadge, statusBadgeDefault } from "../lib/status-colors";

const STATUS_LABEL_KEY_PREFIXES = [
  "paperclip.issueStatus",
  "paperclip.runStatusDisplay",
  "paperclip.approvalStatusDisplay",
  "paperclip.agentStatusDisplay",
  "paperclip.goalStatusDisplay",
] as const;

function resolveStatusLabel(status: string, exists: (key: string) => boolean, t: (key: string) => string): string {
  for (const prefix of STATUS_LABEL_KEY_PREFIXES) {
    const key = `${prefix}.${status}`;
    if (exists(key)) return t(key);
  }
  return status.replace(/_/g, " ");
}

export function StatusBadge({ status }: { status: string }) {
  const { t, i18n } = useTranslation();
  const label = resolveStatusLabel(status, (key) => i18n.exists(key), t);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap shrink-0",
        statusBadge[status] ?? statusBadgeDefault
      )}
    >
      {label}
    </span>
  );
}

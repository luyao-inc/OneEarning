import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { Issue } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { outcomesApi, type OutcomeItemRow } from "../api/outcomes";
import { issuesApi } from "../api/issues";
import { buildProjectOutcomesCorpus } from "../lib/project-outcomes-corpus";
import { queryKeys } from "../lib/queryKeys";
import { ApiError } from "../api/client";
import { RefreshCw } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";

function isSourceRef(
  v: unknown,
): v is { sourceKind: string; issueId: string | null; truncated: boolean } {
  return (
    typeof v === "object" &&
    v !== null &&
    "sourceKind" in v &&
    typeof (v as { sourceKind: unknown }).sourceKind === "string"
  );
}

function issuePathForUrl(issue: Issue | undefined, fallbackId: string | null): string {
  if (issue) return issue.identifier ?? issue.id;
  return fallbackId ?? "";
}

/** 列表中展示：优先编号（如 CMP-14），否则缩短 UUID */
function issueSourceListLabel(issue: Issue | undefined, rawIssueId: string | null): string {
  if (issue) {
    const id = issue.identifier?.trim();
    if (id) return id;
    return `${issue.id.slice(0, 8)}…`;
  }
  if (rawIssueId) return `${rawIssueId.slice(0, 8)}…`;
  return "";
}

function sourceRefHoverTitle(
  issue: Issue | undefined,
  routeLabel: string,
  t: TFunction,
): string | undefined {
  if (!issue) return undefined;
  const head = issue.title?.trim() ?? "";
  const statusLabel = t(`paperclip.issueStatus.${issue.status}`, { defaultValue: issue.status });
  const time = issue.updatedAt != null ? relativeTime(issue.updatedAt) : "";
  const meta = [routeLabel, statusLabel, time].filter(Boolean).join(" · ");
  if (head && meta) return `${head}\n${meta}`;
  if (head) return head;
  return meta || undefined;
}

function displayLabelKey(displayKind: string): string {
  switch (displayKind) {
    case "image":
      return "paperclip.projectsPage.outcomesKindImage";
    case "video":
      return "paperclip.projectsPage.outcomesKindVideo";
    case "document":
      return "paperclip.projectsPage.outcomesKindDocument";
    case "file":
      return "paperclip.projectsPage.outcomesKindFile";
    case "link":
    default:
      return "paperclip.projectsPage.outcomesKindLink";
  }
}

export function ProjectOutcomesTab({
  companyId,
  projectId,
  projectLookupRef,
}: {
  companyId: string;
  projectId: string;
  projectLookupRef: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const oe = typeof window !== "undefined" ? window.oneEarning : undefined;
  const isDesktop = Boolean(oe?.outcomesOpenPath);

  const [syncing, setSyncing] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const itemsQuery = useQuery({
    queryKey: queryKeys.outcomes.items(companyId, projectId),
    queryFn: () => outcomesApi.items(companyId, projectId),
    enabled: Boolean(companyId && projectId && isDesktop),
  });

  const projectIssuesQuery = useQuery({
    queryKey: queryKeys.issues.listByProject(companyId, projectId),
    queryFn: () => issuesApi.list(companyId, { projectId, limit: 500 }),
    enabled: Boolean(companyId && projectId && isDesktop),
  });

  const issueById = useMemo(() => {
    const m = new Map<string, Issue>();
    for (const issue of projectIssuesQuery.data ?? []) {
      m.set(issue.id, issue);
    }
    return m;
  }, [projectIssuesQuery.data]);

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    void (async () => {
      try {
        const { bundle, contentHash } = await buildProjectOutcomesCorpus(
          companyId,
          projectId,
          projectLookupRef,
        );
        if (cancelled) return;
        await outcomesApi.ingest({ companyId, projectId, contentHash, bundle });
        if (cancelled) return;
        await queryClient.invalidateQueries({ queryKey: queryKeys.outcomes.items(companyId, projectId) });
      } catch {
        /* 初次静默失败；用户可手动刷新 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, projectId, projectLookupRef, isDesktop, queryClient]);

  async function handleManualRefresh() {
    if (!isDesktop) return;
    setSyncing(true);
    setLastMessage(null);
    try {
      const { bundle, contentHash } = await buildProjectOutcomesCorpus(companyId, projectId, projectLookupRef);
      const res = await outcomesApi.ingest({ companyId, projectId, contentHash, bundle });
      await queryClient.invalidateQueries({ queryKey: queryKeys.outcomes.items(companyId, projectId) });
      if (res.skipped) {
        setLastMessage(t("paperclip.projectsPage.outcomesSkipped"));
      } else {
        setLastMessage(null);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      setLastMessage(msg);
    } finally {
      setSyncing(false);
    }
  }

  if (!isDesktop) {
    return (
      <p className="text-sm text-muted-foreground">{t("paperclip.projectsPage.outcomesBrowserOnly")}</p>
    );
  }

  const items: OutcomeItemRow[] = itemsQuery.data?.items ?? [];
  const loadError = itemsQuery.error as Error | null;
  const showSidecarError =
    (loadError && loadError.message.includes("Outcomes sidecar not running")) ||
    (lastMessage && lastMessage.includes("Outcomes sidecar not running"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={syncing}
          onClick={() => void handleManualRefresh()}
        >
          <RefreshCw className={cn("h-4 w-4 mr-1.5", syncing && "animate-spin")} />
          {t("paperclip.projectsPage.outcomesRefresh")}
        </Button>
        {syncing ? (
          <span className="text-sm text-muted-foreground">{t("paperclip.projectsPage.outcomesLoading")}</span>
        ) : null}
        {lastMessage && !showSidecarError ? (
          <span className="text-sm text-muted-foreground">{lastMessage}</span>
        ) : null}
      </div>

      {showSidecarError ? (
        <p className="text-sm text-destructive">{t("paperclip.projectsPage.outcomesSidecarUnavailable")}</p>
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError.message}</p>
      ) : null}

      {!itemsQuery.isLoading && items.length === 0 && !loadError ? (
        <p className="text-sm text-muted-foreground">{t("paperclip.projectsPage.outcomesEmpty")}</p>
      ) : null}

      {items.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left p-2 font-medium">{t("paperclip.projectsPage.outcomesColumnKind")}</th>
                <th className="text-left p-2 font-medium">{t("paperclip.projectsPage.outcomesColumnTitle")}</th>
                <th className="text-left p-2 font-medium">{t("paperclip.projectsPage.outcomesColumnSources")}</th>
                <th className="text-right p-2 font-medium w-[140px]">{t("paperclip.projectsPage.outcomesActions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, idx) => (
                <OutcomeRowView key={`${row.canonical}-${idx}`} row={row} issueById={issueById} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function OutcomeRowView({
  row,
  issueById,
}: {
  row: OutcomeItemRow;
  issueById: ReadonlyMap<string, Issue>;
}) {
  const { t } = useTranslation();
  const oe = typeof window !== "undefined" ? window.oneEarning : undefined;

  const refs: unknown[] = Array.isArray(row.sourceRefs) ? row.sourceRefs : [];
  const titleLine = row.title?.trim() || row.canonical;

  const openPrimary = () => {
    if (row.kind === "local_path") {
      void oe?.outcomesOpenPath?.(row.canonical);
      return;
    }
    void oe?.outcomesOpenUrl?.(row.canonical);
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-2 align-top whitespace-nowrap">{t(displayLabelKey(row.displayKind))}</td>
      <td className="p-2 align-top break-all">
        <div className="font-medium">{titleLine}</div>
        {row.snippet ? (
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{row.snippet}</div>
        ) : null}
      </td>
      <td className="p-2 align-top text-xs text-muted-foreground">
        {refs.filter(isSourceRef).length === 0 ? (
          "—"
        ) : (
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            {refs.filter(isSourceRef).map((r, i) => {
              const issue = r.issueId ? issueById.get(r.issueId) : undefined;
              const pathId = issuePathForUrl(issue, r.issueId);
              const linkLabel = r.issueId
                ? issueSourceListLabel(issue, r.issueId)
                : t(`paperclip.projectsPage.outcomesSourceKind.${r.sourceKind}`, {
                    defaultValue: r.sourceKind.replace(/_/g, " "),
                  });
              const hoverTitle = r.issueId ? sourceRefHoverTitle(issue, pathId, t) : undefined;
              return (
                <span key={`${r.sourceKind}-${r.issueId ?? "x"}-${i}`}>
                  {r.issueId && pathId ? (
                    <Link
                      className="underline hover:text-foreground"
                      to={`/issues/${pathId}`}
                      title={hoverTitle}
                    >
                      {linkLabel}
                    </Link>
                  ) : (
                    <span title={r.sourceKind}>{linkLabel}</span>
                  )}
                  {r.truncated ? " *" : ""}
                </span>
              );
            })}
          </div>
        )}
      </td>
      <td className="p-2 align-top text-right whitespace-nowrap">
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => void openPrimary()}>
          {t("paperclip.projectsPage.outcomesOpen")}
        </Button>
        {row.kind === "local_path" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => void oe?.outcomesRevealPath?.(row.canonical)}
          >
            {t("paperclip.projectsPage.outcomesReveal")}
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

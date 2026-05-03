import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, UserRound } from "lucide-react";
import type { UserProfileDailyPoint, UserProfileWindowStats } from "@paperclipai/shared";
import { Link, useParams } from "@/lib/router";
import { accessApi } from "../api/access";
import { ApiError } from "../api/client";
import { userProfilesApi } from "../api/userProfiles";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { StatusBadge } from "../components/StatusBadge";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import {
  formatCents,
  formatDate,
  formatNumber,
  formatShortDate,
  formatTokens,
  issueUrl,
  providerDisplayName,
  relativeTime,
} from "../lib/utils";

const NO_COMPANY = "__none__";

function isMeProfileSlug(slug: string) {
  return slug.trim().toLowerCase() === "me";
}

/** When bundled server lacks local_implicit `me` resolution, map to a real member id (owner first). */
async function resolveMeFallbackPrincipalId(companyId: string): Promise<string | null> {
  const { members } = await accessApi.listMembers(companyId);
  const activeUsers = members.filter((m) => m.status === "active");
  const owners = activeUsers.filter((m) => m.membershipRole === "owner");
  const pick = owners[0] ?? activeUsers[0];
  return pick?.principalId ?? null;
}

function initials(name: string | null | undefined, fallback: string) {
  const value = name?.trim() || fallback;
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  return value.slice(0, 2).toUpperCase();
}

function totalTokens(stats: Pick<UserProfileWindowStats, "inputTokens" | "cachedInputTokens" | "outputTokens">) {
  return stats.inputTokens + stats.cachedInputTokens + stats.outputTokens;
}

function completionRate(stats: UserProfileWindowStats) {
  if (stats.touchedIssues === 0) return "0%";
  return `${Math.round((stats.completedIssues / stats.touchedIssues) * 100)}%`;
}

function HeroStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-2xl font-semibold tabular-nums sm:text-3xl">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground/70">{hint}</div> : null}
    </div>
  );
}

function WindowColumn({ stats }: { stats: UserProfileWindowStats }) {
  const { t } = useTranslation();
  const tokens = totalTokens(stats);
  const windowTitle = t(`paperclip.userProfile.window_${stats.key}`, { defaultValue: stats.label });
  return (
    <div className="flex min-w-0 flex-col gap-4 border-l border-border pl-5 first:border-l-0 first:pl-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{windowTitle}</h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {t("paperclip.userProfile.windowDone", { rate: completionRate(stats) })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-3">
        <Metric value={formatNumber(stats.touchedIssues)} label={t("paperclip.userProfile.metricTouched")} />
        <Metric value={formatNumber(stats.completedIssues)} label={t("paperclip.userProfile.metricCompleted")} />
        <Metric value={formatNumber(stats.commentCount)} label={t("paperclip.userProfile.metricComments")} />
        <Metric value={formatNumber(stats.activityCount)} label={t("paperclip.userProfile.metricActions")} />
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 pt-3 text-xs tabular-nums text-muted-foreground">
        <span>{t("paperclip.userProfile.metricTokens")}</span>
        <span className="text-right text-foreground">{formatTokens(tokens)}</span>
        <span>{t("paperclip.userProfile.metricSpend")}</span>
        <span className="text-right text-foreground">{formatCents(stats.costCents)}</span>
        <span>{t("paperclip.userProfile.metricCreated")}</span>
        <span className="text-right text-foreground">{formatNumber(stats.createdIssues)}</span>
        <span>{t("paperclip.userProfile.metricOpen")}</span>
        <span className="text-right text-foreground">{formatNumber(stats.assignedOpenIssues)}</span>
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function UsageChart({ points }: { points: UserProfileDailyPoint[] }) {
  const { t } = useTranslation();
  const totals = points.map((point) => totalTokens(point));
  const maxTokens = Math.max(1, ...totals);
  const maxCompleted = Math.max(1, ...points.map((point) => point.completedIssues));
  const totalTokensSum = totals.reduce((sum, value) => sum + value, 0);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-sm font-semibold">{t("paperclip.userProfile.chartLast14")}</h2>
        <div className="flex items-baseline gap-4 text-xs text-muted-foreground">
          <span className="tabular-nums text-foreground">{formatTokens(totalTokensSum)}</span>
          <span>{t("paperclip.userProfile.chartTokensTotal")}</span>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-[repeat(14,minmax(0,1fr))] items-end gap-1.5 sm:gap-2">
        {points.map((point) => {
          const tokens = totalTokens(point);
          const heightPct = tokens === 0 ? 0 : Math.max(2, Math.round((tokens / maxTokens) * 100));
          const completedPct = point.completedIssues === 0
            ? 0
            : Math.max(8, Math.round((point.completedIssues / maxCompleted) * 36));
          return (
            <div key={point.date} className="group flex h-36 flex-col justify-end">
              <div
                className="w-full bg-foreground/80 transition-opacity group-hover:bg-foreground"
                style={{ height: `${heightPct}%`, minHeight: tokens === 0 ? 1 : undefined }}
                title={t("paperclip.userProfile.chartTooltip", {
                  date: formatShortDate(point.date),
                  tokens: formatTokens(tokens),
                  completed: String(point.completedIssues),
                })}
              />
              {completedPct > 0 ? (
                <div
                  className="mt-1 w-full rounded-full bg-emerald-500/80"
                  style={{ height: 2, opacity: Math.min(1, 0.35 + completedPct / 100) }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5 text-[10px] tabular-nums text-muted-foreground sm:gap-2">
        {points.map((point, index) => (
          <div key={point.date} className="text-center">
            {index === 0 || index === 6 || index === 13 ? formatShortDate(point.date) : null}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-[10px] uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 bg-foreground/80" /> {t("paperclip.userProfile.chartLegendTokens")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded-full bg-emerald-500/80" /> {t("paperclip.userProfile.chartLegendCompletions")}
        </span>
      </div>
    </section>
  );
}

interface UsageRow {
  key: string;
  label: string;
  sublabel: string;
  costCents: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

function UsageList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: UsageRow[];
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="pt-4 text-sm text-muted-foreground">{empty}</div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.key} className="grid gap-2 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{row.label}</div>
                <div className="truncate text-xs text-muted-foreground">{row.sublabel}</div>
              </div>
              <div className="flex items-baseline gap-4 text-xs tabular-nums sm:justify-end">
                <span className="text-muted-foreground">{formatTokens(totalTokens(row))}</span>
                <span className="font-medium">{formatCents(row.costCents)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function UserProfile() {
  const { t } = useTranslation();
  const { userSlug = "" } = useParams<{ userSlug: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const companyId = selectedCompanyId ?? NO_COMPANY;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.userProfile(companyId, userSlug),
    retry: false,
    queryFn: async () => {
      const slug = userSlug.trim();
      const load = (s: string) => userProfilesApi.get(companyId, s);
      if (!isMeProfileSlug(slug)) {
        return load(slug);
      }
      try {
        return await load("me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          const principalId = await resolveMeFallbackPrincipalId(companyId);
          if (principalId) {
            return load(principalId);
          }
        }
        throw e;
      }
    },
    enabled: !!selectedCompanyId && !!userSlug,
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: t("paperclip.crumbs.users") },
      { label: data?.user.name ?? userSlug },
    ]);
  }, [data?.user.name, setBreadcrumbs, t, userSlug]);

  const allTime = data?.stats.find((entry) => entry.key === "all");
  const last7 = data?.stats.find((entry) => entry.key === "last7");
  const displayName = data?.user.name?.trim() || data?.user.email?.split("@")[0] || t("paperclip.userProfile.fallbackUser");

  const agentUsageRows = useMemo<UsageRow[]>(
    () =>
      (data?.topAgents ?? []).map((row) => ({
        key: row.agentId ?? "unknown",
        label: row.agentName ?? (row.agentId ? row.agentId.slice(0, 8) : "unknown"),
        sublabel: t("paperclip.userProfile.issueLinkedUsage"),
        costCents: row.costCents,
        inputTokens: row.inputTokens,
        cachedInputTokens: row.cachedInputTokens,
        outputTokens: row.outputTokens,
      })),
    [data?.topAgents, t],
  );

  const providerUsageRows = useMemo<UsageRow[]>(
    () =>
      (data?.topProviders ?? []).map((row) => ({
        key: `${row.provider}:${row.biller}:${row.model}`,
        label: `${providerDisplayName(row.provider)} / ${row.model}`,
        sublabel: t("paperclip.userProfile.billedThrough", { biller: providerDisplayName(row.biller) }),
        costCents: row.costCents,
        inputTokens: row.inputTokens,
        cachedInputTokens: row.cachedInputTokens,
        outputTokens: row.outputTokens,
      })),
    [data?.topProviders, t],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={UserRound} message={t("paperclip.userProfile.selectCompany")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (error || !data) {
    return <EmptyState icon={AlertCircle} message={t("paperclip.userProfile.notFound")} />;
  }

  const allTimeTokens = allTime ? totalTokens(allTime) : 0;
  const roleLabel = data.user.membershipRole
    ? t(`paperclip.companyAccessPage.membershipRole_${data.user.membershipRole}`, { defaultValue: data.user.membershipRole })
    : t("paperclip.companyAccessPage.unset");
  const statusKey = `memberStatus_${data.user.membershipStatus}`;
  const metaParts = [
    roleLabel,
    t(`paperclip.companyAccessPage.${statusKey}`, { defaultValue: data.user.membershipStatus }),
    t("paperclip.userProfile.joined", { date: formatDate(data.user.joinedAt) }),
  ];

  return (
    <div className="space-y-10 pb-10">
      <section className="flex flex-col gap-7 border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-5">
          <Avatar className="size-16 border border-border" size="lg">
            {data.user.image ? <AvatarImage src={data.user.image} alt={displayName} /> : null}
            <AvatarFallback className="text-lg font-semibold">
              {initials(displayName, t("paperclip.userProfile.fallbackUser"))}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="truncate text-2xl font-semibold">{displayName}</h1>
              <span className="text-sm text-muted-foreground">@{data.user.slug}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {data.user.email ? <span className="truncate">{data.user.email}</span> : null}
              {data.user.email ? <span aria-hidden>·</span> : null}
              <span>{metaParts.join(" · ")}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat
            label={t("paperclip.userProfile.heroAllTimeTokens")}
            value={formatTokens(allTimeTokens)}
            hint={t("paperclip.userProfile.heroSpentHint", { amount: formatCents(allTime?.costCents ?? 0) })}
          />
          <HeroStat
            label={t("paperclip.userProfile.heroCompleted")}
            value={formatNumber(allTime?.completedIssues ?? 0)}
            hint={allTime ? t("paperclip.userProfile.heroRateHint", { rate: completionRate(allTime) }) : undefined}
          />
          <HeroStat
            label={t("paperclip.userProfile.heroOpenAssigned")}
            value={formatNumber(allTime?.assignedOpenIssues ?? 0)}
            hint={t("paperclip.userProfile.heroCreatedHint", { count: allTime?.createdIssues ?? 0 })}
          />
          <HeroStat
            label={t("paperclip.userProfile.hero7DayActions")}
            value={formatNumber(last7?.activityCount ?? 0)}
            hint={t("paperclip.userProfile.heroCommentsHint", { count: last7?.commentCount ?? 0 })}
          />
        </div>
      </section>

      <section className="grid gap-8 border-b border-border pb-8 lg:grid-cols-3">
        {data.stats.map((entry) => <WindowColumn key={entry.key} stats={entry} />)}
      </section>

      <UsageChart points={data.daily} />

      <div className="grid gap-10 pt-2 xl:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
            <h2 className="text-sm font-semibold">{t("paperclip.userProfile.recentTasks")}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{data.recentIssues.length}</span>
          </div>
          {data.recentIssues.length === 0 ? (
            <div className="pt-4 text-sm text-muted-foreground">{t("paperclip.userProfile.noRecentTasks")}</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentIssues.map((issue) => (
                <li key={issue.id}>
                  <Link
                    to={issueUrl(issue)}
                    className="grid gap-2 py-2.5 transition-colors hover:bg-accent/40 sm:grid-cols-[auto_1fr_auto] sm:items-center"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{issue.identifier ?? issue.id.slice(0, 8)}</span>
                    <span className="truncate text-sm">{issue.title}</span>
                    <span className="flex items-center gap-3 sm:justify-end">
                      <StatusBadge status={issue.status} />
                      <span className="text-xs tabular-nums text-muted-foreground">{relativeTime(issue.updatedAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
            <h2 className="text-sm font-semibold">{t("paperclip.userProfile.recentActivity")}</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{data.recentActivity.length}</span>
          </div>
          {data.recentActivity.length === 0 ? (
            <div className="pt-4 text-sm text-muted-foreground">{t("paperclip.userProfile.noRecentActivity")}</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.recentActivity.map((event) => (
                <li key={event.id} className="grid gap-2 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{event.action.replaceAll("_", " ")}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {event.entityType} · {event.entityId.slice(0, 12)}
                    </div>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground sm:justify-self-end">{relativeTime(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-10 xl:grid-cols-2">
        <UsageList title={t("paperclip.userProfile.agentAttribution")} empty={t("paperclip.userProfile.agentAttributionEmpty")} rows={agentUsageRows} />
        <UsageList title={t("paperclip.userProfile.providerMix")} empty={t("paperclip.userProfile.providerMixEmpty")} rows={providerUsageRows} />
      </div>
    </div>
  );
}

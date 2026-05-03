import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, MailPlus } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";

const INVITE_HISTORY_PAGE_SIZE = 5;

const INVITE_ROLE_DEFS = [
  { value: "viewer" as const, labelKey: "roleViewerLabel", descKey: "roleViewerDesc", getsKey: "roleViewerGets" },
  { value: "operator" as const, labelKey: "roleOperatorLabel", descKey: "roleOperatorDesc", getsKey: "roleOperatorGets" },
  { value: "admin" as const, labelKey: "roleAdminLabel", descKey: "roleAdminDesc", getsKey: "roleAdminGets" },
  { value: "owner" as const, labelKey: "roleOwnerLabel", descKey: "roleOwnerDesc", getsKey: "roleOwnerGets" },
] as const;

function isInviteHistoryRow(value: unknown): value is Awaited<ReturnType<typeof accessApi.listInvites>>["invites"][number] {
  if (!value || typeof value !== "object") return false;
  return "id" in value && "state" in value && "createdAt" in value;
}

function formatInviteState(state: "active" | "accepted" | "expired" | "revoked", t: (key: string) => string) {
  return t(`paperclip.companyInvitesPage.inviteState${state.charAt(0).toUpperCase() + state.slice(1)}`);
}

function humanRoleLabel(role: string | null | undefined, t: (key: string) => string) {
  if (!role) return "—";
  const k = `paperclip.companyInvitesPage.membershipRole_${role}`;
  const translated = t(k);
  return translated === k ? role : translated;
}

export function CompanyInvites() {
  const { t } = useTranslation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [humanRole, setHumanRole] = useState<"owner" | "admin" | "operator" | "viewer">("operator");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [latestInviteCopied, setLatestInviteCopied] = useState(false);

  useEffect(() => {
    if (!latestInviteCopied) return;
    const timeout = window.setTimeout(() => {
      setLatestInviteCopied(false);
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [latestInviteCopied]);

  async function copyInviteUrl(url: string) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch {
      // Fall through to the unavailable message below.
    }

    pushToast({
      title: t("paperclip.toasts.companyInvites.clipboardUnavailableTitle"),
      body: t("paperclip.toasts.companyInvites.clipboardUnavailableBody"),
      tone: "warn",
    });
    return false;
  }

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("paperclip.crumbs.company"), href: "/dashboard" },
      { label: t("paperclip.crumbs.settings"), href: "/company/settings" },
      { label: t("paperclip.crumbs.companyInvites") },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs, t]);

  const inviteHistoryQueryKey = queryKeys.access.invites(selectedCompanyId ?? "", "all", INVITE_HISTORY_PAGE_SIZE);
  const invitesQuery = useInfiniteQuery({
    queryKey: inviteHistoryQueryKey,
    queryFn: ({ pageParam }) =>
      accessApi.listInvites(selectedCompanyId!, {
        limit: INVITE_HISTORY_PAGE_SIZE,
        offset: pageParam,
      }),
    enabled: !!selectedCompanyId,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
  const inviteHistory = useMemo(
    () =>
      invitesQuery.data?.pages.flatMap((page) =>
        Array.isArray(page?.invites) ? page.invites.filter(isInviteHistoryRow) : [],
      ) ?? [],
    [invitesQuery.data?.pages],
  );

  const inviteRoleOptions = useMemo(
    () =>
      INVITE_ROLE_DEFS.map((def) => ({
        value: def.value,
        label: t(`paperclip.companyInvitesPage.${def.labelKey}`),
        description: t(`paperclip.companyInvitesPage.${def.descKey}`),
        gets: t(`paperclip.companyInvitesPage.${def.getsKey}`),
      })),
    [t],
  );

  const createInviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(selectedCompanyId!, {
        allowedJoinTypes: "human",
        humanRole,
        agentMessage: null,
      }),
    onSuccess: async (invite) => {
      setLatestInviteUrl(invite.inviteUrl);
      setLatestInviteCopied(false);
      const copied = await copyInviteUrl(invite.inviteUrl);

      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({
        title: t("paperclip.toasts.companyInvites.inviteCreated"),
        body: copied
          ? t("paperclip.toasts.companyInvites.inviteCreatedBodyWithCopy")
          : t("paperclip.toasts.companyInvites.inviteCreatedBodyNoCopy"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("paperclip.toasts.companyInvites.createInviteFailed"),
        body: error instanceof Error ? error.message : t("paperclip.toasts.common.unknownError"),
        tone: "error",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => accessApi.revokeInvite(inviteId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({ title: t("paperclip.toasts.companyInvites.revoked"), tone: "success" });
    },
    onError: (error) => {
      pushToast({
        title: t("paperclip.toasts.companyInvites.revokeInviteFailed"),
        body: error instanceof Error ? error.message : t("paperclip.toasts.common.unknownError"),
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">{t("paperclip.companyInvitesPage.selectCompany")}</div>;
  }

  if (invitesQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("paperclip.companyInvitesPage.loading")}</div>;
  }

  if (invitesQuery.error) {
    const message =
      invitesQuery.error instanceof ApiError && invitesQuery.error.status === 403
        ? t("paperclip.companyInvitesPage.error403")
        : invitesQuery.error instanceof Error
          ? invitesQuery.error.message
          : t("paperclip.companyInvitesPage.errorLoad");
    return <div className="text-sm text-destructive">{message}</div>;
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MailPlus className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("paperclip.companyInvitesPage.title")}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("paperclip.companyInvitesPage.intro")}</p>
      </div>

      <section className="space-y-4 rounded-xl border border-border p-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{t("paperclip.companyInvitesPage.createTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("paperclip.companyInvitesPage.createIntro")}</p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("paperclip.companyInvitesPage.chooseRoleLegend")}</legend>
          <div className="rounded-xl border border-border">
            {inviteRoleOptions.map((option, index) => {
              const checked = humanRole === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-3 px-4 py-4 ${index > 0 ? "border-t border-border" : ""}`}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value={option.value}
                    checked={checked}
                    onChange={() => setHumanRole(option.value)}
                    className="mt-1 h-4 w-4 border-border text-foreground"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{option.label}</span>
                      {option.value === "operator" ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {t("paperclip.companyInvitesPage.defaultBadge")}
                        </span>
                      ) : null}
                    </span>
                    <span className="block max-w-2xl text-sm text-muted-foreground">{option.description}</span>
                    <span className="block text-sm text-foreground">{option.gets}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          {t("paperclip.companyInvitesPage.singleUseHint")}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => createInviteMutation.mutate()} disabled={createInviteMutation.isPending}>
            {createInviteMutation.isPending
              ? t("paperclip.companyInvitesPage.creating")
              : t("paperclip.companyInvitesPage.createInvite")}
          </Button>
          <span className="text-sm text-muted-foreground">{t("paperclip.companyInvitesPage.historyHint")}</span>
        </div>

        {latestInviteUrl ? (
          <div className="space-y-3 rounded-lg border border-border px-4 py-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{t("paperclip.companyInvitesPage.latestInviteTitle")}</div>
                {latestInviteCopied ? (
                  <div className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
                    <Check className="h-3.5 w-3.5" />
                    {t("paperclip.companyInvitesPage.copied")}
                  </div>
                ) : null}
              </div>
              <div className="text-sm text-muted-foreground">{t("paperclip.companyInvitesPage.urlHint")}</div>
            </div>
            <button
              type="button"
              onClick={async () => {
                const copied = await copyInviteUrl(latestInviteUrl);
                setLatestInviteCopied(copied);
              }}
              className="w-full rounded-md border border-border bg-muted/60 px-3 py-2 text-left text-sm break-all transition-colors hover:bg-background"
            >
              {latestInviteUrl}
            </button>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={latestInviteUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {t("paperclip.companyInvitesPage.openInvite")}
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t("paperclip.companyInvitesPage.historyTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("paperclip.companyInvitesPage.historyIntro")}</p>
          </div>
          <Link to="/inbox/requests" className="text-sm underline underline-offset-4">
            {t("paperclip.companyInvitesPage.openJoinQueue")}
          </Link>
        </div>

        {inviteHistory.length === 0 ? (
          <div className="border-t border-border px-5 py-8 text-sm text-muted-foreground">
            {t("paperclip.companyInvitesPage.emptyHistory")}
          </div>
        ) : (
          <div className="border-t border-border">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("paperclip.companyInvitesPage.thState")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("paperclip.companyInvitesPage.thRole")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("paperclip.companyInvitesPage.thInvitedBy")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("paperclip.companyInvitesPage.thCreated")}</th>
                    <th className="px-5 py-3 font-medium text-muted-foreground">{t("paperclip.companyInvitesPage.thJoinRequest")}</th>
                    <th className="px-5 py-3 text-right font-medium text-muted-foreground">{t("paperclip.companyInvitesPage.thAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {inviteHistory.map((invite) => (
                    <tr key={invite.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-3 align-top">
                        <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          {formatInviteState(invite.state, t)}
                        </span>
                      </td>
                      <td className="px-5 py-3 align-top">{humanRoleLabel(invite.humanRole, t)}</td>
                      <td className="px-5 py-3 align-top">
                        <div>
                          {invite.invitedByUser?.name ||
                            invite.invitedByUser?.email ||
                            t("paperclip.companyInvitesPage.unknownInviter")}
                        </div>
                        {invite.invitedByUser?.email && invite.invitedByUser.name ? (
                          <div className="text-xs text-muted-foreground">{invite.invitedByUser.email}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 align-top text-muted-foreground">
                        {new Date(invite.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 align-top">
                        {invite.relatedJoinRequestId ? (
                          <Link to="/inbox/requests" className="underline underline-offset-4">
                            {t("paperclip.companyInvitesPage.reviewRequest")}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        {invite.state === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => revokeMutation.mutate(invite.id)}
                            disabled={revokeMutation.isPending}
                          >
                            {t("paperclip.companyInvitesPage.revoke")}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("paperclip.companyInvitesPage.inactive")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invitesQuery.hasNextPage ? (
              <div className="flex justify-center border-t border-border px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => invitesQuery.fetchNextPage()}
                  disabled={invitesQuery.isFetchingNextPage}
                >
                  {invitesQuery.isFetchingNextPage
                    ? t("paperclip.companyInvitesPage.loadingMore")
                    : t("paperclip.companyInvitesPage.viewMore")}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

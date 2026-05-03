import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus2 } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";

function formatJoinRequestStatus(status: string, translate: (key: string) => string) {
  if (status === "pending_approval") return translate("paperclip.joinRequestQueuePage.statusLabel_pending_approval");
  if (status === "approved") return translate("paperclip.joinRequestQueuePage.statusLabel_approved");
  if (status === "rejected") return translate("paperclip.joinRequestQueuePage.statusLabel_rejected");
  return status.replace(/_/g, " ");
}

export function JoinRequestQueue() {
  const { t } = useTranslation();
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"pending_approval" | "approved" | "rejected">("pending_approval");
  const [requestType, setRequestType] = useState<"all" | "human" | "agent">("all");

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("paperclip.crumbs.company"), href: "/dashboard" },
      { label: t("paperclip.crumbs.inbox"), href: "/inbox" },
      { label: t("paperclip.crumbs.joinRequests") },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs, t]);

  const requestsQuery = useQuery({
    queryKey: queryKeys.access.joinRequests(selectedCompanyId ?? "", `${status}:${requestType}`),
    queryFn: () =>
      accessApi.listJoinRequests(
        selectedCompanyId!,
        status,
        requestType === "all" ? undefined : requestType,
      ),
    enabled: !!selectedCompanyId,
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => accessApi.approveJoinRequest(selectedCompanyId!, requestId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!, `${status}:${requestType}`) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.companyMembers(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!) });
      pushToast({ title: t("paperclip.toasts.joinRequest.approved"), tone: "success" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) => accessApi.rejectJoinRequest(selectedCompanyId!, requestId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!, `${status}:${requestType}`) });
      pushToast({ title: t("paperclip.toasts.joinRequest.rejected"), tone: "success" });
    },
  });

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">{t("paperclip.joinRequestQueuePage.selectCompany")}</div>;
  }

  if (requestsQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">{t("paperclip.joinRequestQueuePage.loading")}</div>;
  }

  if (requestsQuery.error) {
    const message =
      requestsQuery.error instanceof ApiError && requestsQuery.error.status === 403
        ? t("paperclip.joinRequestQueuePage.error403")
        : requestsQuery.error instanceof Error
          ? requestsQuery.error.message
          : t("paperclip.joinRequestQueuePage.errorGeneric");
    return <div className="text-sm text-destructive">{message}</div>;
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus2 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("paperclip.joinRequestQueuePage.title")}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("paperclip.joinRequestQueuePage.intro")}
        </p>
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
        <label className="space-y-2 text-sm">
          <span className="font-medium">{t("paperclip.joinRequestQueuePage.filterStatus")}</span>
          <select
            className="rounded-md border border-border bg-background px-3 py-2"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "pending_approval" | "approved" | "rejected")
            }
          >
            <option value="pending_approval">{t("paperclip.joinRequestQueuePage.statusPending")}</option>
            <option value="approved">{t("paperclip.joinRequestQueuePage.statusApproved")}</option>
            <option value="rejected">{t("paperclip.joinRequestQueuePage.statusRejected")}</option>
          </select>
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium">{t("paperclip.joinRequestQueuePage.filterType")}</span>
          <select
            className="rounded-md border border-border bg-background px-3 py-2"
            value={requestType}
            onChange={(event) =>
              setRequestType(event.target.value as "all" | "human" | "agent")
            }
          >
            <option value="all">{t("paperclip.joinRequestQueuePage.typeAll")}</option>
            <option value="human">{t("paperclip.joinRequestQueuePage.typeHuman")}</option>
            <option value="agent">{t("paperclip.joinRequestQueuePage.typeAgent")}</option>
          </select>
        </label>
      </div>

      <div className="space-y-4">
        {(requestsQuery.data ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            {t("paperclip.joinRequestQueuePage.empty")}
          </div>
        ) : (
          requestsQuery.data!.map((request) => (
            <div key={request.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={request.status === "pending_approval" ? "secondary" : request.status === "approved" ? "outline" : "destructive"}>
                      {formatJoinRequestStatus(request.status, t)}
                    </Badge>
                    <Badge variant="outline">{request.requestType}</Badge>
                    {request.adapterType ? <Badge variant="outline">{request.adapterType}</Badge> : null}
                  </div>
                  <div>
                    <div className="text-base font-medium">
                      {request.requestType === "human"
                        ? request.requesterUser?.name || request.requestEmailSnapshot || request.requestingUserId || t("paperclip.joinRequestQueuePage.unknownHuman")
                        : request.agentName || t("paperclip.joinRequestQueuePage.unknownAgent")}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {request.requestType === "human"
                        ? request.requesterUser?.email || request.requestEmailSnapshot || request.requestingUserId
                        : request.capabilities || request.requestIp}
                    </div>
                  </div>
                </div>

                {request.status === "pending_approval" ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => rejectMutation.mutate(request.id)}
                      disabled={rejectMutation.isPending}
                    >
                      {t("paperclip.joinRequestQueuePage.reject")}
                    </Button>
                    <Button
                      onClick={() => approveMutation.mutate(request.id)}
                      disabled={approveMutation.isPending}
                    >
                      {t("paperclip.joinRequestQueuePage.approve")}
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium uppercase tracking-wide">{t("paperclip.joinRequestQueuePage.inviteContext")}</div>
                  <div className="mt-2">
                    {request.invite
                      ? `${request.invite.allowedJoinTypes} join invite${request.invite.humanRole ? ` • default role ${request.invite.humanRole}` : ""}`
                      : t("paperclip.joinRequestQueuePage.inviteUnavailable")}
                  </div>
                  {request.invite?.inviteMessage ? (
                    <div className="mt-2 text-foreground">{request.invite.inviteMessage}</div>
                  ) : null}
                </div>
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-xs font-medium uppercase tracking-wide">{t("paperclip.joinRequestQueuePage.requestDetails")}</div>
                  <div className="mt-2">
                    {t("paperclip.joinRequestQueuePage.submittedAt", { datetime: new Date(request.createdAt).toLocaleString() })}
                  </div>
                  <div>{t("paperclip.joinRequestQueuePage.sourceIp", { ip: request.requestIp })}</div>
                  {request.requestType === "agent" && request.capabilities ? <div>{request.capabilities}</div> : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

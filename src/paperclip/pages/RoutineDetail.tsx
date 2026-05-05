import { useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Play,
  RefreshCw,
  Repeat,
  Save,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import { routinesApi, type RoutineTriggerResponse, type RotateRoutineTriggerResponse } from "../api/routines";
import { heartbeatsApi } from "../api/heartbeats";
import { LiveRunWidget } from "../components/LiveRunWidget";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { accessApi } from "../api/access";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToastActions } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { buildRoutineTriggerPatch } from "../lib/routine-trigger-patch";
import { buildMarkdownMentionOptions } from "../lib/company-members";
import { timeAgo } from "../lib/timeAgo";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { InlineEntitySelector, type InlineEntityOption } from "../components/InlineEntitySelector";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "../components/MarkdownEditor";
import {
  RoutineRunVariablesDialog,
  type RoutineRunDialogSubmitData,
} from "../components/RoutineRunVariablesDialog";
import { RoutineVariablesEditor, RoutineVariablesHint } from "../components/RoutineVariablesEditor";
import { ScheduleEditor } from "../components/ScheduleEditor";
import { RunButton } from "../components/AgentActionButtons";
import { getRecentAssigneeIds, sortAgentsByRecency, trackRecentAssignee } from "../lib/recent-assignees";
import { getRecentProjectIds, trackRecentProject } from "../lib/recent-projects";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { RoutineTrigger, RoutineVariable } from "@paperclipai/shared";

const concurrencyPolicies = ["coalesce_if_active", "always_enqueue", "skip_if_active"];
const catchUpPolicies = ["skip_missed", "enqueue_missed_with_cap"];
const triggerKinds = ["schedule", "webhook"];
const signingModes = ["bearer", "hmac_sha256", "github_hmac", "none"];
const routineTabs = ["triggers", "runs", "activity"] as const;
const SIGNING_MODES_WITHOUT_REPLAY_WINDOW = new Set(["github_hmac", "none"]);

type RoutineTab = (typeof routineTabs)[number];

type SecretMessage = {
  title: string;
  webhookUrl: string;
  webhookSecret: string;
};

function autoResizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function isRoutineTab(value: string | null): value is RoutineTab {
  return value !== null && routineTabs.includes(value as RoutineTab);
}

function getRoutineTabFromSearch(search: string): RoutineTab {
  const tab = new URLSearchParams(search).get("tab");
  return isRoutineTab(tab) ? tab : "triggers";
}

const AP_BASE = "paperclip.routinesPage.activityPanel";

function translateRoutineActivityAction(action: string, t: TFunction): string {
  const slug = action.replace(/\./g, "_");
  return t(`${AP_BASE}.actions.${slug}`, { defaultValue: action.replace(/\./g, " ") });
}

function translateActivityDetailKey(key: string, t: TFunction): string {
  return t(`${AP_BASE}.detailKeys.${key}`, { defaultValue: key.replace(/_/g, " ") });
}

function translateRoutineRunSource(source: string, t: TFunction): string {
  return t(`paperclip.routinesPage.runsList.source.${source}`, { defaultValue: source });
}

function translateRoutineRunStatus(status: string, t: TFunction): string {
  const slug = status.replace(/\./g, "_");
  return t(`paperclip.routinesPage.runsList.status.${slug}`, { defaultValue: status.replaceAll("_", " ") });
}

function translateActivityDetailValue(fieldKey: string, value: unknown, t: TFunction): string {
  if (value === null) return t(`${AP_BASE}.valueNull`);
  if (typeof value === "string") {
    return t(`${AP_BASE}.detailValues.${fieldKey}.${value}`, { defaultValue: value });
  }
  if (typeof value === "number" || typeof value === "boolean") {
    const s = String(value);
    return t(`${AP_BASE}.detailValues.${fieldKey}.${s}`, { defaultValue: s });
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : value.map((item) => translateActivityDetailValue(fieldKey, item, t)).join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return t(`${AP_BASE}.valueUnserializable`);
    }
  }
  return String(value);
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function buildRoutineMutationPayload(input: {
  title: string;
  description: string;
  projectId: string;
  assigneeAgentId: string;
  priority: string;
  concurrencyPolicy: string;
  catchUpPolicy: string;
  variables: RoutineVariable[];
}) {
  return {
    ...input,
    description: input.description.trim() || null,
    projectId: input.projectId || null,
    assigneeAgentId: input.assigneeAgentId || null,
  };
}

function TriggerEditor({
  trigger,
  onSave,
  onRotate,
  onDelete,
}: {
  trigger: RoutineTrigger;
  onSave: (id: string, patch: Record<string, unknown>) => void;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({
    label: trigger.label ?? "",
    cronExpression: trigger.cronExpression ?? "",
    signingMode: trigger.signingMode ?? "bearer",
    replayWindowSec: String(trigger.replayWindowSec ?? 300),
  });

  useEffect(() => {
    setDraft({
      label: trigger.label ?? "",
      cronExpression: trigger.cronExpression ?? "",
      signingMode: trigger.signingMode ?? "bearer",
      replayWindowSec: String(trigger.replayWindowSec ?? 300),
    });
  }, [trigger]);

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          {trigger.kind === "schedule" ? <Clock3 className="h-3.5 w-3.5" /> : trigger.kind === "webhook" ? <Webhook className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
          {trigger.label ?? trigger.kind}
        </div>
        <span className="text-xs text-muted-foreground">
          {trigger.kind === "schedule" && trigger.nextRunAt
            ? t("paperclip.routinesPage.detail.triggerNextRun", {
                datetime: new Date(trigger.nextRunAt).toLocaleString(),
              })
            : trigger.kind === "webhook"
              ? t("paperclip.routinesPage.detail.triggerKindWebhook")
              : t("paperclip.routinesPage.detail.triggerKindApi")}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("paperclip.routinesPage.detail.triggerFieldLabel")}</Label>
          <Input
            value={draft.label}
            onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
          />
        </div>
        {trigger.kind === "schedule" && (
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs">{t("paperclip.routinesPage.detail.scheduleLabel")}</Label>
            <ScheduleEditor
              value={draft.cronExpression}
              onChange={(cronExpression) => setDraft((current) => ({ ...current, cronExpression }))}
            />
          </div>
        )}
        {trigger.kind === "webhook" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("paperclip.routinesPage.detail.signingModeFieldLabel")}</Label>
              <Select
                value={draft.signingMode}
                onValueChange={(signingMode) => setDraft((current) => ({ ...current, signingMode }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {signingModes.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`paperclip.routinesPage.signingModeLabels.${mode}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!SIGNING_MODES_WITHOUT_REPLAY_WINDOW.has(draft.signingMode) && (
              <div className="space-y-1.5">
                <Label className="text-xs">{t("paperclip.routinesPage.detail.replayWindowLabel")}</Label>
                <Input
                  value={draft.replayWindowSec}
                  onChange={(event) => setDraft((current) => ({ ...current, replayWindowSec: event.target.value }))}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {trigger.lastResult && (
          <span className="text-xs text-muted-foreground">
            {t("paperclip.routinesPage.detail.triggerLastPrefix", { result: trigger.lastResult })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {trigger.kind === "webhook" && (
            <Button variant="outline" size="sm" onClick={() => onRotate(trigger.id)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t("paperclip.routinesPage.detail.rotateSecret")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSave(trigger.id, buildRoutineTriggerPatch(trigger, draft, getLocalTimezone()))}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {t("paperclip.routinesPage.detail.saveTrigger")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(trigger.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RoutineDetail() {
  const { t } = useTranslation();
  const { routineId } = useParams<{ routineId: string }>();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { pushToast } = useToastActions();
  const hydratedRoutineIdRef = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);
  const assigneeSelectorRef = useRef<HTMLButtonElement | null>(null);
  const projectSelectorRef = useRef<HTMLButtonElement | null>(null);
  const [secretMessage, setSecretMessage] = useState<SecretMessage | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [runVariablesOpen, setRunVariablesOpen] = useState(false);
  const [newTrigger, setNewTrigger] = useState({
    kind: "schedule",
    cronExpression: "0 10 * * *",
    signingMode: "bearer",
    replayWindowSec: "300",
  });
  const [editDraft, setEditDraft] = useState<{
    title: string;
    description: string;
    projectId: string;
    assigneeAgentId: string;
    priority: string;
    concurrencyPolicy: string;
    catchUpPolicy: string;
    variables: RoutineVariable[];
  }>({
    title: "",
    description: "",
    projectId: "",
    assigneeAgentId: "",
    priority: "medium",
    concurrencyPolicy: "coalesce_if_active",
    catchUpPolicy: "skip_missed",
    variables: [],
  });
  const activeTab = useMemo(() => getRoutineTabFromSearch(location.search), [location.search]);

  const { data: routine, isLoading, error } = useQuery({
    queryKey: queryKeys.routines.detail(routineId!),
    queryFn: () => routinesApi.get(routineId!),
    enabled: !!routineId,
  });
  const activeIssueId = routine?.activeIssue?.id;
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.issues.liveRuns(activeIssueId!),
    queryFn: () => heartbeatsApi.liveRunsForIssue(activeIssueId!),
    enabled: !!activeIssueId,
    refetchInterval: 3000,
  });
  const hasLiveRun = (liveRuns ?? []).length > 0;
  const { data: routineRuns } = useQuery({
    queryKey: queryKeys.routines.runs(routineId!),
    queryFn: () => routinesApi.listRuns(routineId!),
    enabled: !!routineId,
    refetchInterval: hasLiveRun ? 3000 : false,
  });
  const relatedActivityIds = useMemo(
    () => ({
      triggerIds: routine?.triggers.map((trigger) => trigger.id) ?? [],
      runIds: routineRuns?.map((run) => run.id) ?? [],
    }),
    [routine?.triggers, routineRuns],
  );
  const { data: activity } = useQuery({
    queryKey: [
      ...queryKeys.routines.activity(selectedCompanyId!, routineId!),
      relatedActivityIds.triggerIds.join(","),
      relatedActivityIds.runIds.join(","),
    ],
    queryFn: () => routinesApi.activity(selectedCompanyId!, routineId!, relatedActivityIds),
    enabled: !!selectedCompanyId && !!routineId && !!routine,
  });
  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const { data: companyMembers } = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const routineDefaults = useMemo(
    () =>
      routine
        ? {
            title: routine.title,
            description: routine.description ?? "",
            projectId: routine.projectId ?? "",
            assigneeAgentId: routine.assigneeAgentId ?? "",
            priority: routine.priority,
            concurrencyPolicy: routine.concurrencyPolicy,
            catchUpPolicy: routine.catchUpPolicy,
            variables: routine.variables,
          }
        : null,
    [routine],
  );
  const isEditDirty = useMemo(() => {
    if (!routineDefaults) return false;
    return (
      editDraft.title !== routineDefaults.title ||
      editDraft.description !== routineDefaults.description ||
      editDraft.projectId !== routineDefaults.projectId ||
      editDraft.assigneeAgentId !== routineDefaults.assigneeAgentId ||
      editDraft.priority !== routineDefaults.priority ||
      editDraft.concurrencyPolicy !== routineDefaults.concurrencyPolicy ||
      editDraft.catchUpPolicy !== routineDefaults.catchUpPolicy ||
      JSON.stringify(editDraft.variables) !== JSON.stringify(routineDefaults.variables)
    );
  }, [editDraft, routineDefaults]);

  useEffect(() => {
    if (!routine) return;
    setBreadcrumbs([{ label: t("paperclip.crumbs.routines"), href: "/routines" }, { label: routine.title }]);
    if (!routineDefaults) return;

    const changedRoutine = hydratedRoutineIdRef.current !== routine.id;
    if (changedRoutine || !isEditDirty) {
      setEditDraft(routineDefaults);
      hydratedRoutineIdRef.current = routine.id;
    }
  }, [routine, routineDefaults, isEditDirty, setBreadcrumbs, t]);

  useEffect(() => {
    autoResizeTextarea(titleInputRef.current);
  }, [editDraft.title, routine?.id]);

  const copySecretValue = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      pushToast({ title: t("paperclip.toasts.routineDetail.copied", { label }), tone: "success" });
    } catch (error) {
      pushToast({
        title: t("paperclip.toasts.routineDetail.copyFailedTitle", { label: label.toLowerCase() }),
        body: error instanceof Error ? error.message : t("paperclip.toasts.routineDetail.copyDeniedBody"),
        tone: "error",
      });
    }
  };

  const setActiveTab = (value: string) => {
    if (!routineId || !isRoutineTab(value)) return;
    const params = new URLSearchParams(location.search);
    if (value === "triggers") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    const search = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
      },
      { replace: true },
    );
  };

  const saveRoutine = useMutation({
    mutationFn: () => {
      return routinesApi.update(routineId!, buildRoutineMutationPayload(editDraft));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: t("paperclip.toasts.routineDetail.saveFailed"),
        body: error instanceof Error ? error.message : t("paperclip.toasts.routineDetail.saveFailedBody"),
        tone: "error",
      });
    },
  });

  const runRoutine = useMutation({
    mutationFn: (data?: RoutineRunDialogSubmitData) =>
      routinesApi.run(routineId!, {
        ...(data?.variables && Object.keys(data.variables).length > 0 ? { variables: data.variables } : {}),
        ...(data?.assigneeAgentId !== undefined ? { assigneeAgentId: data.assigneeAgentId } : {}),
        ...(data?.projectId !== undefined ? { projectId: data.projectId } : {}),
        ...(data?.executionWorkspaceId !== undefined ? { executionWorkspaceId: data.executionWorkspaceId } : {}),
        ...(data?.executionWorkspacePreference !== undefined
          ? { executionWorkspacePreference: data.executionWorkspacePreference }
          : {}),
        ...(data?.executionWorkspaceSettings !== undefined
          ? { executionWorkspaceSettings: data.executionWorkspaceSettings }
          : {}),
      }),
    onSuccess: async () => {
      pushToast({ title: t("paperclip.toasts.routineDetail.runStarted"), tone: "success" });
      setRunVariablesOpen(false);
      setActiveTab("runs");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.runs(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: t("paperclip.toasts.routineDetail.runFailed"),
        body: error instanceof Error ? error.message : t("paperclip.toasts.routineDetail.runFailedBody"),
        tone: "error",
      });
    },
  });

  const updateRoutineStatus = useMutation({
    mutationFn: (status: string) => routinesApi.update(routineId!, { status }),
    onSuccess: async (_data, status) => {
      pushToast({
        title: t("paperclip.toasts.routineDetail.saved"),
        body: status === "paused"
          ? t("paperclip.toasts.routineDetail.automationPausedBody")
          : t("paperclip.toasts.routineDetail.automationEnabledBody"),
        tone: "success",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: t("paperclip.toasts.routineDetail.updateFailed"),
        body: error instanceof Error ? error.message : t("paperclip.toasts.routineDetail.updateFailedBody"),
        tone: "error",
      });
    },
  });

  const createTrigger = useMutation({
    mutationFn: async (): Promise<RoutineTriggerResponse> => {
      const existingOfKind = (routine?.triggers ?? []).filter((t) => t.kind === newTrigger.kind).length;
      const autoLabel = existingOfKind > 0 ? `${newTrigger.kind}-${existingOfKind + 1}` : newTrigger.kind;
      return routinesApi.createTrigger(routineId!, {
        kind: newTrigger.kind,
        label: autoLabel,
        ...(newTrigger.kind === "schedule"
          ? { cronExpression: newTrigger.cronExpression.trim(), timezone: getLocalTimezone() }
          : {}),
        ...(newTrigger.kind === "webhook"
          ? {
            signingMode: newTrigger.signingMode,
            replayWindowSec: Number(newTrigger.replayWindowSec || "300"),
          }
          : {}),
      });
    },
    onSuccess: async (result) => {
      if (result.secretMaterial) {
        setSecretMessage({
          title: t("paperclip.toasts.routineDetail.webhookCreated"),
          webhookUrl: result.secretMaterial.webhookUrl,
          webhookSecret: result.secretMaterial.webhookSecret,
        });
      } else {
        pushToast({
          title: t("paperclip.toasts.routineDetail.triggerAdded"),
          body: t("paperclip.toasts.routineDetail.triggerAddedBody"),
          tone: "success",
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: t("paperclip.toasts.routineDetail.addTriggerFailed"),
        body: error instanceof Error ? error.message : t("paperclip.toasts.routineDetail.addTriggerFailedBody"),
        tone: "error",
      });
    },
  });

  const updateTrigger = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => routinesApi.updateTrigger(id, patch),
    onSuccess: async () => {
      pushToast({
        title: t("paperclip.toasts.routineDetail.triggerSaved"),
        body: t("paperclip.toasts.routineDetail.triggerSavedBody"),
        tone: "success",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: t("paperclip.toasts.routineDetail.updateTriggerFailed"),
        body: error instanceof Error ? error.message : t("paperclip.toasts.routineDetail.updateTriggerFailedBody"),
        tone: "error",
      });
    },
  });

  const deleteTrigger = useMutation({
    mutationFn: (id: string) => routinesApi.deleteTrigger(id),
    onSuccess: async () => {
      pushToast({
        title: t("paperclip.toasts.routineDetail.triggerDeleted"),
        tone: "success",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: t("paperclip.toasts.routineDetail.deleteTriggerFailed"),
        body: error instanceof Error ? error.message : t("paperclip.toasts.routineDetail.deleteTriggerFailedBody"),
        tone: "error",
      });
    },
  });

  const rotateTrigger = useMutation({
    mutationFn: (id: string): Promise<RotateRoutineTriggerResponse> => routinesApi.rotateTriggerSecret(id),
    onSuccess: async (result) => {
      setSecretMessage({
        title: t("paperclip.toasts.routineDetail.secretRotated"),
        webhookUrl: result.secretMaterial.webhookUrl,
        webhookSecret: result.secretMaterial.webhookSecret,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(routineId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.activity(selectedCompanyId!, routineId!) }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: t("paperclip.toasts.routineDetail.rotateSecretFailed"),
        body: error instanceof Error ? error.message : t("paperclip.toasts.routineDetail.rotateSecretFailedBody"),
        tone: "error",
      });
    },
  });

  const agentById = useMemo(
    () => new Map((agents ?? []).map((agent) => [agent.id, agent])),
    [agents],
  );
  const projectById = useMemo(
    () => new Map((projects ?? []).map((project) => [project.id, project])),
    [projects],
  );
  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [routine?.id]);
  const recentProjectIds = useMemo(() => getRecentProjectIds(), [routine?.id]);
  const assigneeOptions = useMemo<InlineEntityOption[]>(
    () =>
      sortAgentsByRecency(
        (agents ?? []).filter((agent) => agent.status !== "terminated"),
        recentAssigneeIds,
      ).map((agent) => ({
        id: agent.id,
        label: agent.name,
        searchText: `${agent.name} ${agent.role} ${agent.title ?? ""}`,
      })),
    [agents, recentAssigneeIds],
  );
  const projectOptions = useMemo<InlineEntityOption[]>(
    () =>
      (projects ?? []).map((project) => ({
        id: project.id,
        label: project.name,
        searchText: project.description ?? "",
      })),
    [projects],
  );
  const mentionOptions = useMemo<MentionOption[]>(() => {
    return buildMarkdownMentionOptions({
      agents,
      projects,
      members: companyMembers?.users,
    });
  }, [agents, companyMembers?.users, projects]);
  const currentAssignee = editDraft.assigneeAgentId ? agentById.get(editDraft.assigneeAgentId) ?? null : null;
  const currentProject = editDraft.projectId ? projectById.get(editDraft.projectId) ?? null : null;

  if (!selectedCompanyId) {
    return <EmptyState icon={Repeat} message={t("paperclip.routinesPage.selectCompany")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="issues-list" />;
  }

  if (error || !routine) {
    return (
      <p className="pt-6 text-sm text-destructive">
        {error instanceof Error ? error.message : t("paperclip.routinesPage.detail.routineNotFound")}
      </p>
    );
  }

  const automationEnabled = routine.status === "active";
  const selectedProject = routine.projectId ? (projects?.find((project) => project.id === routine.projectId) ?? null) : null;
  const automationToggleDisabled = updateRoutineStatus.isPending || routine.status === "archived";
  const automationLabel = routine.status === "archived"
    ? t("paperclip.routinesPage.detail.statusArchived")
    : !routine.assigneeAgentId
      ? t("paperclip.routinesPage.detail.statusDraft")
      : automationEnabled
        ? t("paperclip.routinesPage.detail.statusActive")
        : t("paperclip.routinesPage.detail.statusPaused");
  const automationLabelClassName = routine.status === "archived"
    ? "text-muted-foreground"
    : automationEnabled
      ? "text-emerald-400"
      : "text-muted-foreground";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header: editable title + actions */}
      <div className="flex items-start gap-4">
        <textarea
          ref={titleInputRef}
          className="flex-1 min-w-0 resize-none overflow-hidden bg-transparent text-xl font-bold outline-none placeholder:text-muted-foreground/50"
          placeholder={t("paperclip.routinesPage.routineTitlePlaceholder")}
          rows={1}
          value={editDraft.title}
          onChange={(event) => {
            setEditDraft((current) => ({ ...current, title: event.target.value }));
            autoResizeTextarea(event.target);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              descriptionEditorRef.current?.focus();
              return;
            }
            if (event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              if (editDraft.assigneeAgentId) {
                if (editDraft.projectId) {
                  descriptionEditorRef.current?.focus();
                } else {
                  projectSelectorRef.current?.focus();
                }
              } else {
                assigneeSelectorRef.current?.focus();
              }
            }
          }}
        />
        <div className="flex shrink-0 items-center gap-3 pt-1">
          <RunButton
            onClick={() => {
              setRunVariablesOpen(true);
            }}
            disabled={runRoutine.isPending}
          />
          <ToggleSwitch
            size="lg"
            checked={automationEnabled}
            onCheckedChange={() => {
              if (!automationEnabled && !routine.assigneeAgentId) {
                pushToast({
                  title: t("paperclip.toasts.routineDetail.defaultAgentTitle"),
                  body: t("paperclip.toasts.routineDetail.defaultAgentBody"),
                  tone: "warn",
                });
                return;
              }
              updateRoutineStatus.mutate(automationEnabled ? "paused" : "active");
            }}
            disabled={automationToggleDisabled}
            aria-label={
              automationEnabled
                ? t("paperclip.routinesPage.detail.ariaPauseAutomation")
                : t("paperclip.routinesPage.detail.ariaEnableAutomation")
            }
          />
          <span className={`min-w-[3.75rem] text-sm font-medium ${automationLabelClassName}`}>
            {automationLabel}
          </span>
        </div>
      </div>

      {/* Secret message banner */}
      {secretMessage && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3 text-sm">
          <div>
            <p className="font-medium">{secretMessage.title}</p>
            <p className="text-xs text-muted-foreground">{t("paperclip.routinesPage.detail.secretSaveBanner")}</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input value={secretMessage.webhookUrl} readOnly className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copySecretValue(t("paperclip.routinesPage.detail.copyWebhookUrl"), secretMessage.webhookUrl)}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                {t("paperclip.routinesPage.detail.copyUrlShort")}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input value={secretMessage.webhookSecret} readOnly className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copySecretValue(t("paperclip.routinesPage.detail.copyWebhookSecret"), secretMessage.webhookSecret)
                }
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                {t("paperclip.routinesPage.detail.copySecretShort")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!routine.assigneeAgentId ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-900 dark:text-amber-200">
          {t("paperclip.routinesPage.detail.defaultAgentBanner")}
        </div>
      ) : null}

      {/* Assignment row */}
      <div className="overflow-x-auto overscroll-x-contain">
        <div className="inline-flex min-w-full flex-wrap items-center gap-2 text-sm text-muted-foreground sm:min-w-max sm:flex-nowrap">
          <span>{t("paperclip.routinesPage.forLabel")}</span>
          <InlineEntitySelector
            ref={assigneeSelectorRef}
            value={editDraft.assigneeAgentId}
            options={assigneeOptions}
            recentOptionIds={recentAssigneeIds}
            placeholder={t("paperclip.routinesPage.assigneePlaceholder")}
            noneLabel={t("paperclip.routinesPage.noAssignee")}
            searchPlaceholder={t("paperclip.routinesPage.searchAssignees")}
            emptyMessage={t("paperclip.routinesPage.emptyAssignees")}
            onChange={(assigneeAgentId) => {
              if (assigneeAgentId) trackRecentAssignee(assigneeAgentId);
              setEditDraft((current) => ({ ...current, assigneeAgentId }));
            }}
            onConfirm={() => {
              if (editDraft.projectId) {
                descriptionEditorRef.current?.focus();
              } else {
                projectSelectorRef.current?.focus();
              }
            }}
            renderTriggerValue={(option) =>
              option ? (
                currentAssignee ? (
                  <>
                    <AgentIcon icon={currentAssignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{option.label}</span>
                  </>
                ) : (
                  <span className="truncate">{option.label}</span>
                )
              ) : (
                <span className="text-muted-foreground">{t("paperclip.routinesPage.assigneePlaceholder")}</span>
              )
            }
            renderOption={(option) => {
              if (!option.id) return <span className="truncate">{option.label}</span>;
              const assignee = agentById.get(option.id);
              return (
                <>
                  {assignee ? <AgentIcon icon={assignee.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                  <span className="truncate">{option.label}</span>
                </>
              );
            }}
          />
          <span>{t("paperclip.routinesPage.inLabel")}</span>
          <InlineEntitySelector
            ref={projectSelectorRef}
            value={editDraft.projectId}
            options={projectOptions}
            recentOptionIds={recentProjectIds}
            placeholder={t("paperclip.routinesPage.projectPlaceholder")}
            noneLabel={t("paperclip.routinesPage.noProject")}
            searchPlaceholder={t("paperclip.routinesPage.searchProjects")}
            emptyMessage={t("paperclip.routinesPage.emptyProjects")}
            onChange={(projectId) => {
              if (projectId) trackRecentProject(projectId);
              setEditDraft((current) => ({ ...current, projectId }));
            }}
            onConfirm={() => descriptionEditorRef.current?.focus()}
            renderTriggerValue={(option) =>
              option && currentProject ? (
                <>
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: currentProject.color ?? "#64748b" }}
                  />
                  <span className="truncate">{option.label}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{t("paperclip.routinesPage.projectPlaceholder")}</span>
              )
            }
            renderOption={(option) => {
              if (!option.id) return <span className="truncate">{option.label}</span>;
              const project = projectById.get(option.id);
              return (
                <>
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: project?.color ?? "#64748b" }}
                  />
                  <span className="truncate">{option.label}</span>
                </>
              );
            }}
          />
        </div>
      </div>

      {/* Instructions */}
      <MarkdownEditor
        ref={descriptionEditorRef}
        value={editDraft.description}
        onChange={(description) => setEditDraft((current) => ({ ...current, description }))}
        placeholder={t("paperclip.routinesPage.instructionsPlaceholder")}
        bordered={false}
        contentClassName="min-h-[120px] text-[15px] leading-7"
        mentions={mentionOptions}
        onSubmit={() => {
          if (!saveRoutine.isPending && editDraft.title.trim()) {
            saveRoutine.mutate();
          }
        }}
      />
      <RoutineVariablesHint />
      <RoutineVariablesEditor
        title={editDraft.title}
        description={editDraft.description}
        value={editDraft.variables}
        onChange={(variables) => setEditDraft((current) => ({ ...current, variables }))}
      />

      {/* Advanced delivery settings */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <span className="text-sm font-medium">{t("paperclip.routinesPage.advancedTitle")}</span>
          {advancedOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {t("paperclip.routinesPage.sectionConcurrency")}
              </p>
              <Select
                value={editDraft.concurrencyPolicy}
                onValueChange={(concurrencyPolicy) => setEditDraft((current) => ({ ...current, concurrencyPolicy }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {concurrencyPolicies.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`paperclip.routinesPage.concurrencyPolicyLabels.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t(`paperclip.routinesPage.concurrencyPolicyDescriptions.${editDraft.concurrencyPolicy}`)}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {t("paperclip.routinesPage.sectionCatchUp")}
              </p>
              <Select
                value={editDraft.catchUpPolicy}
                onValueChange={(catchUpPolicy) => setEditDraft((current) => ({ ...current, catchUpPolicy }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {catchUpPolicies.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`paperclip.routinesPage.catchUpPolicyLabels.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t(`paperclip.routinesPage.catchUpPolicyDescriptions.${editDraft.catchUpPolicy}`)}
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Save bar */}
      <div className="flex items-center justify-between">
        {isEditDirty ? (
          <span className="text-xs text-amber-600">{t("paperclip.routinesPage.detail.unsavedChanges")}</span>
        ) : (
          <span />
        )}
        <Button
          onClick={() => saveRoutine.mutate()}
          disabled={saveRoutine.isPending || !editDraft.title.trim()}
        >
          <Save className="mr-2 h-4 w-4" />
          {t("paperclip.routinesPage.detail.saveRoutine")}
        </Button>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList variant="line" className="w-full justify-start gap-1">
          <TabsTrigger value="triggers" className="gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            {t("paperclip.routinesPage.detail.tabTriggers")}
          </TabsTrigger>
          <TabsTrigger value="runs" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            {t("paperclip.routinesPage.detail.tabRuns")}
            {hasLiveRun && <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />}
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <ActivityIcon className="h-3.5 w-3.5" />
            {t("paperclip.routinesPage.detail.tabActivity")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="triggers" className="space-y-4">
          {/* Add trigger form */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm font-medium">{t("paperclip.routinesPage.detail.addTriggerTitle")}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("paperclip.routinesPage.detail.triggerKindLabel")}</Label>
                <Select value={newTrigger.kind} onValueChange={(kind) => setNewTrigger((current) => ({ ...current, kind }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {triggerKinds.map((kind) => (
                      <SelectItem key={kind} value={kind} disabled={kind === "webhook"}>
                        {t(`paperclip.routinesPage.detail.triggerKind_${kind}`)}
                        {kind === "webhook" ? t("paperclip.routinesPage.detail.webhookComingSoonSuffix") : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newTrigger.kind === "schedule" && (
                <div className="md:col-span-2 space-y-1.5">
                  <Label className="text-xs">{t("paperclip.routinesPage.detail.scheduleLabel")}</Label>
                  <ScheduleEditor
                    value={newTrigger.cronExpression}
                    onChange={(cronExpression) => setNewTrigger((current) => ({ ...current, cronExpression }))}
                  />
                </div>
              )}
              {newTrigger.kind === "webhook" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("paperclip.routinesPage.detail.signingModeFieldLabel")}</Label>
                    <Select value={newTrigger.signingMode} onValueChange={(signingMode) => setNewTrigger((current) => ({ ...current, signingMode }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {signingModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {t(`paperclip.routinesPage.signingModeLabels.${mode}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t(`paperclip.routinesPage.signingModeDescriptions.${newTrigger.signingMode}`)}
                    </p>
                  </div>
                  {!SIGNING_MODES_WITHOUT_REPLAY_WINDOW.has(newTrigger.signingMode) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("paperclip.routinesPage.detail.replayWindowLabel")}</Label>
                      <Input value={newTrigger.replayWindowSec} onChange={(event) => setNewTrigger((current) => ({ ...current, replayWindowSec: event.target.value }))} />
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-end">
              <Button size="sm" onClick={() => createTrigger.mutate()} disabled={createTrigger.isPending}>
                {createTrigger.isPending
                  ? t("paperclip.routinesPage.detail.addingTrigger")
                  : t("paperclip.routinesPage.detail.addTriggerButton")}
              </Button>
            </div>
          </div>

          {/* Existing triggers */}
          {routine.triggers.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("paperclip.routinesPage.detail.noTriggersConfigured")}</p>
          ) : (
            <div className="space-y-3">
              {routine.triggers.map((trigger) => (
                <TriggerEditor
                  key={trigger.id}
                  trigger={trigger}
                  onSave={(id, patch) => updateTrigger.mutate({ id, patch })}
                  onRotate={(id) => rotateTrigger.mutate(id)}
                  onDelete={(id) => deleteTrigger.mutate(id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          {hasLiveRun && activeIssueId && routine && (
            <LiveRunWidget issueId={activeIssueId} companyId={routine.companyId} />
          )}
          {(routineRuns ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("paperclip.routinesPage.detail.noRunsYet")}</p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {(routineRuns ?? []).map((run) => (
                <div key={run.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="shrink-0">{translateRoutineRunSource(run.source, t)}</Badge>
                    <Badge variant={run.status === "failed" ? "destructive" : "secondary"} className="shrink-0">
                      {translateRoutineRunStatus(run.status, t)}
                    </Badge>
                    {run.trigger && (
                      <span className="text-muted-foreground truncate">
                        {run.trigger.label
                          ?? t(`paperclip.routinesPage.detail.triggerKind_${run.trigger.kind}`, {
                            defaultValue: run.trigger.kind,
                          })}
                      </span>
                    )}
                    {run.linkedIssue && (
                      <Link to={`/issues/${run.linkedIssue.identifier ?? run.linkedIssue.id}`} className="text-muted-foreground hover:underline truncate">
                        {run.linkedIssue.identifier ?? run.linkedIssue.id.slice(0, 8)}
                      </Link>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">{timeAgo(run.triggeredAt)}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity">
          {(activity ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("paperclip.routinesPage.detail.noActivityYet")}</p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {(activity ?? []).map((event) => (
                <div key={event.id} className="flex items-center justify-between px-3 py-2 text-xs gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-foreground/90 shrink-0">
                      {translateRoutineActivityAction(event.action, t)}
                    </span>
                    {event.details && Object.keys(event.details).length > 0 && (
                      <span className="text-muted-foreground truncate">
                        {Object.entries(event.details).slice(0, 3).map(([key, value], i) => (
                          <span key={key}>
                            {i > 0 && <span className="mx-1 text-border">·</span>}
                            <span className="text-muted-foreground/70">{translateActivityDetailKey(key, t)}:</span>{" "}
                            {translateActivityDetailValue(key, value, t)}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground/60 shrink-0">{timeAgo(event.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <RoutineRunVariablesDialog
        open={runVariablesOpen}
        onOpenChange={setRunVariablesOpen}
        companyId={routine.companyId}
        routineName={routine.title}
        agents={agents ?? []}
        projects={projects ?? []}
        defaultProjectId={routine.projectId}
        defaultAssigneeAgentId={routine.assigneeAgentId}
        variables={routine.variables ?? []}
        isPending={runRoutine.isPending}
        onSubmit={(data) => runRoutine.mutate(data)}
      />
    </div>
  );
}

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "@/lib/router";
import { ArrowUpDown, Check, ChevronDown, ChevronRight, Layers, MoreHorizontal, Plus, Repeat } from "lucide-react";
import { routinesApi } from "../api/routines";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { heartbeatsApi } from "../api/heartbeats";
import { accessApi } from "../api/access";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToastActions } from "../context/ToastContext";
import { buildMarkdownMentionOptions } from "../lib/company-members";
import { queryKeys } from "../lib/queryKeys";
import { groupBy } from "../lib/groupBy";
import { createIssueDetailLocationState } from "../lib/issueDetailBreadcrumb";
import { collectLiveIssueIds } from "../lib/liveIssueIds";
import { getRecentAssigneeIds, sortAgentsByRecency, trackRecentAssignee } from "../lib/recent-assignees";
import { getRecentProjectIds, trackRecentProject } from "../lib/recent-projects";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { EmptyState } from "../components/EmptyState";
import { IssuesList } from "../components/IssuesList";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { AgentIcon } from "../components/AgentIconPicker";
import { InlineEntitySelector, type InlineEntityOption } from "../components/InlineEntitySelector";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "../components/MarkdownEditor";
import {
  RoutineRunVariablesDialog,
  type RoutineRunDialogSubmitData,
} from "../components/RoutineRunVariablesDialog";
import { RoutineVariablesEditor, RoutineVariablesHint } from "../components/RoutineVariablesEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { RoutineListItem, RoutineVariable } from "@paperclipai/shared";

const concurrencyPolicies = ["coalesce_if_active", "always_enqueue", "skip_if_active"] as const;
const catchUpPolicies = ["skip_missed", "enqueue_missed_with_cap"] as const;

function autoResizeTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function formatLastRunTimestamp(value: Date | string | null | undefined, tr: TFunction) {
  if (!value) return tr("paperclip.routinesPage.lastRunNever");
  return new Date(value).toLocaleString();
}

function nextRoutineStatus(currentStatus: string, enabled: boolean) {
  if (currentStatus === "archived" && enabled) return "active";
  return enabled ? "active" : "paused";
}

type RoutinesTab = "routines" | "runs";
type RoutineGroupBy = "none" | "project" | "assignee";
type RoutineSortField = "updated" | "created" | "title" | "lastRun";
type RoutineSortDir = "asc" | "desc";

type RoutineViewState = {
  sortField: RoutineSortField;
  sortDir: RoutineSortDir;
  groupBy: RoutineGroupBy;
  collapsedGroups: string[];
};

type RoutineGroup = {
  key: string;
  label: string | null;
  items: RoutineListItem[];
};

const defaultRoutineViewState: RoutineViewState = {
  sortField: "updated",
  sortDir: "desc",
  groupBy: "none",
  collapsedGroups: [],
};

function getRoutineViewState(key: string): RoutineViewState {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { ...defaultRoutineViewState, ...JSON.parse(raw) };
  } catch {
    // Ignore malformed local state and fall back to defaults.
  }
  return { ...defaultRoutineViewState };
}

function saveRoutineViewState(key: string, state: RoutineViewState) {
  localStorage.setItem(key, JSON.stringify(state));
}

function timestampValue(value: Date | string | null | undefined) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function compareNullableText(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "", undefined, { sensitivity: "base" });
}

function formatRoutineRunStatus(value: string | null | undefined) {
  if (!value) return null;
  return value.replaceAll("_", " ");
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

export function buildRoutineGroups(
  routines: RoutineListItem[],
  groupByValue: RoutineGroupBy,
  projectById: Map<string, { name: string }>,
  agentById: Map<string, { name: string }>,
  tr?: TFunction,
): RoutineGroup[] {
  const noProject = tr ? tr("paperclip.routinesPage.groupEmptyNoProject") : "No project";
  const unassigned = tr ? tr("paperclip.routinesPage.groupEmptyUnassigned") : "Unassigned";
  const unknownProject = tr ? tr("paperclip.routinesPage.groupUnknownProject") : "Unknown project";
  const unknownAgent = tr ? tr("paperclip.routinesPage.groupUnknownAgent") : "Unknown agent";

  if (groupByValue === "none") {
    return [{ key: "__all", label: null, items: routines }];
  }

  if (groupByValue === "project") {
    const groups = groupBy(routines, (routine) => routine.projectId ?? "__no_project");
    return Object.keys(groups)
      .sort((left, right) => {
        const leftLabel = left === "__no_project" ? noProject : (projectById.get(left)?.name ?? unknownProject);
        const rightLabel = right === "__no_project" ? noProject : (projectById.get(right)?.name ?? unknownProject);
        return leftLabel.localeCompare(rightLabel);
      })
      .map((key) => ({
        key,
        label: key === "__no_project" ? noProject : (projectById.get(key)?.name ?? unknownProject),
        items: groups[key]!,
      }));
  }

  const groups = groupBy(routines, (routine) => routine.assigneeAgentId ?? "__unassigned");
  return Object.keys(groups)
    .sort((left, right) => {
      const leftLabel = left === "__unassigned" ? unassigned : (agentById.get(left)?.name ?? unknownAgent);
      const rightLabel = right === "__unassigned" ? unassigned : (agentById.get(right)?.name ?? unknownAgent);
      return leftLabel.localeCompare(rightLabel);
    })
    .map((key) => ({
      key,
      label: key === "__unassigned" ? unassigned : (agentById.get(key)?.name ?? unknownAgent),
      items: groups[key]!,
    }));
}

export function sortRoutines(
  routines: RoutineListItem[],
  sortField: RoutineSortField,
  sortDir: RoutineSortDir,
): RoutineListItem[] {
  const direction = sortDir === "asc" ? 1 : -1;
  return [...routines].sort((left, right) => {
    let result = 0;

    if (sortField === "title") {
      result = compareNullableText(left.title, right.title);
    } else if (sortField === "created") {
      result = timestampValue(left.createdAt) - timestampValue(right.createdAt);
    } else if (sortField === "lastRun") {
      result = timestampValue(left.lastRun?.triggeredAt ?? left.lastTriggeredAt) -
        timestampValue(right.lastRun?.triggeredAt ?? right.lastTriggeredAt);
    } else {
      result = timestampValue(left.updatedAt) - timestampValue(right.updatedAt);
    }

    if (result !== 0) return result * direction;
    return compareNullableText(left.title, right.title);
  });
}

function buildRoutinesTabHref(tab: RoutinesTab) {
  return tab === "runs" ? "/routines?tab=runs" : "/routines";
}

function RoutineListRow({
  routine,
  projectById,
  agentById,
  runningRoutineId,
  statusMutationRoutineId,
  href,
  onRunNow,
  onToggleEnabled,
  onToggleArchived,
  t,
}: {
  routine: RoutineListItem;
  projectById: Map<string, { name: string; color?: string | null }>;
  agentById: Map<string, { name: string; icon?: string | null }>;
  runningRoutineId: string | null;
  statusMutationRoutineId: string | null;
  href: string;
  onRunNow: (routine: RoutineListItem) => void;
  onToggleEnabled: (routine: RoutineListItem, enabled: boolean) => void;
  onToggleArchived: (routine: RoutineListItem) => void;
  t: TFunction;
}) {
  const enabled = routine.status === "active";
  const isArchived = routine.status === "archived";
  const isStatusPending = statusMutationRoutineId === routine.id;
  const project = routine.projectId ? projectById.get(routine.projectId) ?? null : null;
  const agent = routine.assigneeAgentId ? agentById.get(routine.assigneeAgentId) ?? null : null;
  const isDraft = !isArchived && !routine.assigneeAgentId;

  return (
    <Link
      to={href}
      className="group flex flex-col gap-3 border-b border-border px-3 py-3 transition-colors hover:bg-accent/50 last:border-b-0 sm:flex-row sm:items-center no-underline text-inherit"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{routine.title}</span>
          {(isArchived || routine.status === "paused" || isDraft) ? (
            <span className="text-xs text-muted-foreground">
              {isArchived ? t("paperclip.routinesPage.rowStatusArchived") : isDraft ? t("paperclip.routinesPage.rowStatusDraft") : t("paperclip.routinesPage.rowStatusPaused")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: project?.color ?? "#64748b" }}
            />
            <span>{routine.projectId ? (project?.name ?? t("paperclip.routinesPage.rowUnknownProject")) : t("paperclip.routinesPage.rowNoProject")}</span>
          </span>
          <span className="flex items-center gap-2">
            {agent?.icon ? <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0" /> : null}
            <span>{routine.assigneeAgentId ? (agent?.name ?? t("paperclip.routinesPage.rowUnknownAgent")) : t("paperclip.routinesPage.rowNoDefaultAgent")}</span>
          </span>
          <span>
            {formatLastRunTimestamp(routine.lastRun?.triggeredAt, t)}
            {routine.lastRun ? ` · ${formatRoutineRunStatus(routine.lastRun.status)}` : ""}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
        <div className="flex items-center gap-3">
          <ToggleSwitch
            size="lg"
            checked={enabled}
            onCheckedChange={() => onToggleEnabled(routine, enabled)}
            disabled={isStatusPending || isArchived}
            aria-label={enabled ? t("paperclip.routinesPage.ariaDisableRoutine", { title: routine.title }) : t("paperclip.routinesPage.ariaEnableRoutine", { title: routine.title })}
          />
          <span className="w-12 text-xs text-muted-foreground">
            {isArchived ? t("paperclip.routinesPage.rowToggleArchived") : isDraft ? t("paperclip.routinesPage.rowToggleDraft") : enabled ? t("paperclip.routinesPage.rowToggleOn") : t("paperclip.routinesPage.rowToggleOff")}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("paperclip.routinesPage.ariaMoreRoutine", { title: routine.title })}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={href}>{t("paperclip.routinesPage.rowEdit")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={runningRoutineId === routine.id || isArchived}
              onClick={() => onRunNow(routine)}
            >
              {runningRoutineId === routine.id ? t("paperclip.routinesPage.rowRunning") : t("paperclip.routinesPage.rowRunNow")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onToggleEnabled(routine, enabled)}
              disabled={isStatusPending || isArchived}
            >
              {enabled ? t("paperclip.routinesPage.rowPause") : t("paperclip.routinesPage.rowEnable")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onToggleArchived(routine)}
              disabled={isStatusPending}
            >
              {routine.status === "archived" ? t("paperclip.routinesPage.rowRestore") : t("paperclip.routinesPage.rowArchive")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Link>
  );
}

export function Routines() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pushToast } = useToastActions();
  const descriptionEditorRef = useRef<MarkdownEditorRef>(null);
  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const assigneeSelectorRef = useRef<HTMLButtonElement | null>(null);
  const projectSelectorRef = useRef<HTMLButtonElement | null>(null);
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);
  const [statusMutationRoutineId, setStatusMutationRoutineId] = useState<string | null>(null);
  const [runDialogRoutine, setRunDialogRoutine] = useState<RoutineListItem | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const activeTab: RoutinesTab = searchParams.get("tab") === "runs" ? "runs" : "routines";
  const [draft, setDraft] = useState<{
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
  const routineViewStateKey = selectedCompanyId
    ? `paperclip:routines-view:${selectedCompanyId}`
    : "paperclip:routines-view";
  const [routineViewState, setRoutineViewState] = useState<RoutineViewState>(() => getRoutineViewState(routineViewStateKey));

  useEffect(() => {
    setBreadcrumbs([{ label: t("paperclip.crumbs.routines") }]);
  }, [setBreadcrumbs, t]);

  useEffect(() => {
    setRoutineViewState(getRoutineViewState(routineViewStateKey));
  }, [routineViewStateKey]);

  const { data: routines, isLoading, error } = useQuery({
    queryKey: queryKeys.routines.list(selectedCompanyId!),
    queryFn: () => routinesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
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
  const { data: routineExecutionIssues, isLoading: recentRunsLoading, error: recentRunsError } = useQuery({
    queryKey: [...queryKeys.issues.list(selectedCompanyId!), "routine-executions"],
    queryFn: () => issuesApi.list(selectedCompanyId!, { originKind: "routine_execution" }),
    enabled: !!selectedCompanyId && activeTab === "runs",
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId && activeTab === "runs",
    refetchInterval: 5000,
  });

  useEffect(() => {
    autoResizeTextarea(titleInputRef.current);
  }, [draft.title, composerOpen]);

  const mentionOptions = useMemo<MentionOption[]>(() => {
    return buildMarkdownMentionOptions({
      agents,
      projects,
      members: companyMembers?.users,
    });
  }, [agents, companyMembers?.users, projects]);

  const createRoutine = useMutation({
    mutationFn: () =>
      routinesApi.create(selectedCompanyId!, buildRoutineMutationPayload(draft)),
    onSuccess: async (routine) => {
      setDraft({
        title: "",
        description: "",
        projectId: "",
        assigneeAgentId: "",
        priority: "medium",
        concurrencyPolicy: "coalesce_if_active",
        catchUpPolicy: "skip_missed",
        variables: [],
      });
      setComposerOpen(false);
      setAdvancedOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) });
      pushToast({
        title: t("paperclip.toasts.routines.created"),
        body: routine.assigneeAgentId
          ? t("paperclip.toasts.routines.createdBodyWithAssignee")
          : t("paperclip.toasts.routines.createdBodyDraft"),
        tone: "success",
      });
      navigate(`/routines/${routine.id}?tab=triggers`);
    },
  });
  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      issuesApi.update(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [...queryKeys.issues.list(selectedCompanyId!), "routine-executions"] });
    },
  });

  const updateRoutineStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => routinesApi.update(id, { status }),
    onMutate: ({ id }) => {
      setStatusMutationRoutineId(id);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(variables.id) }),
      ]);
    },
    onSettled: () => {
      setStatusMutationRoutineId(null);
    },
    onError: (mutationError) => {
      pushToast({
        title: t("paperclip.toasts.routines.updateFailed"),
        body: mutationError instanceof Error ? mutationError.message : t("paperclip.toasts.routines.updateFailedBody"),
        tone: "error",
      });
    },
  });

  const runRoutine = useMutation({
    mutationFn: ({ id, data }: { id: string; data?: RoutineRunDialogSubmitData }) => routinesApi.run(id, {
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
    onMutate: ({ id }) => {
      setRunningRoutineId(id);
    },
    onSuccess: async (_, { id }) => {
      setRunDialogRoutine(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.list(selectedCompanyId!) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.routines.detail(id) }),
      ]);
    },
    onSettled: () => {
      setRunningRoutineId(null);
    },
    onError: (mutationError) => {
      pushToast({
        title: t("paperclip.toasts.routines.runFailed"),
        body: mutationError instanceof Error ? mutationError.message : t("paperclip.toasts.routines.runFailedBody"),
        tone: "error",
      });
    },
  });

  const recentAssigneeIds = useMemo(() => getRecentAssigneeIds(), [composerOpen]);
  const recentProjectIds = useMemo(() => getRecentProjectIds(), [composerOpen]);
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
  const agentById = useMemo(
    () => new Map((agents ?? []).map((agent) => [agent.id, agent])),
    [agents],
  );
  const projectById = useMemo(
    () => new Map((projects ?? []).map((project) => [project.id, project])),
    [projects],
  );
  const liveIssueIds = useMemo(() => collectLiveIssueIds(liveRuns), [liveRuns]);
  const sortedRoutines = useMemo(
    () => sortRoutines(routines ?? [], routineViewState.sortField, routineViewState.sortDir),
    [routineViewState.sortDir, routineViewState.sortField, routines],
  );
  const routineGroups = useMemo(
    () => buildRoutineGroups(sortedRoutines, routineViewState.groupBy, projectById, agentById, t),
    [agentById, projectById, routineViewState.groupBy, sortedRoutines, t],
  );
  const recentRunsIssueLinkState = useMemo(
    () =>
      createIssueDetailLocationState(
        t("paperclip.routinesPage.issueLinkRecentRuns"),
        buildRoutinesTabHref("runs"),
        "issues",
      ),
    [t],
  );
  const currentAssignee = draft.assigneeAgentId ? agentById.get(draft.assigneeAgentId) ?? null : null;
  const currentProject = draft.projectId ? projectById.get(draft.projectId) ?? null : null;

  function updateRoutineView(patch: Partial<RoutineViewState>) {
    setRoutineViewState((current) => {
      const next = { ...current, ...patch };
      saveRoutineViewState(routineViewStateKey, next);
      return next;
    });
  }

  function handleTabChange(tab: string) {
    const nextTab = tab === "runs" ? "runs" : "routines";
    startTransition(() => {
      navigate(buildRoutinesTabHref(nextTab));
    });
  }

  function handleRunNow(routine: RoutineListItem) {
    setRunDialogRoutine(routine);
  }

  function handleToggleEnabled(routine: RoutineListItem, enabled: boolean) {
    if (!enabled && !routine.assigneeAgentId) {
      pushToast({
        title: t("paperclip.toasts.routines.defaultAgentTitle"),
        body: t("paperclip.toasts.routines.defaultAgentBody"),
        tone: "warn",
      });
      return;
    }
    updateRoutineStatus.mutate({
      id: routine.id,
      status: nextRoutineStatus(routine.status, !enabled),
    });
  }

  function handleToggleArchived(routine: RoutineListItem) {
    updateRoutineStatus.mutate({
      id: routine.id,
      status: routine.status === "archived" ? "active" : "archived",
    });
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={Repeat} message={t("paperclip.routinesPage.selectCompany")} />;
  }

  if (isLoading) {
    return <PageSkeleton variant="issues-list" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("paperclip.routinesPage.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("paperclip.routinesPage.subtitle")}
          </p>
        </div>
        <Button onClick={() => setComposerOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("paperclip.routinesPage.createRoutine")}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <PageTabBar
          align="start"
          value={activeTab}
          onValueChange={handleTabChange}
          items={[
            { value: "routines", label: t("paperclip.crumbs.routines") },
            { value: "runs", label: t("paperclip.crumbs.recentRuns") },
          ]}
        />
        <TabsContent value="routines" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {t("paperclip.routinesPage.routineCount", { count: (routines ?? []).length })}
            </p>
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs" title={t("paperclip.routinesPage.sortLabel")}>
                    <ArrowUpDown className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                    <span className="hidden sm:inline">{t("paperclip.routinesPage.sortLabel")}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-44 p-0">
                  <div className="p-2 space-y-0.5">
                    {([
                      ["updated", "paperclip.routinesPage.sortUpdated"],
                      ["created", "paperclip.routinesPage.sortCreated"],
                      ["lastRun", "paperclip.routinesPage.sortLastRun"],
                      ["title", "paperclip.routinesPage.sortTitle"],
                    ] as const).map(([field, labelKey]) => (
                      <button
                        key={field}
                        className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm ${
                          routineViewState.sortField === field
                            ? "bg-accent/50 text-foreground"
                            : "text-muted-foreground hover:bg-accent/50"
                        }`}
                        onClick={() => {
                          updateRoutineView(
                            routineViewState.sortField === field
                              ? { sortDir: routineViewState.sortDir === "asc" ? "desc" : "asc" }
                              : { sortField: field, sortDir: field === "title" ? "asc" : "desc" },
                          );
                        }}
                      >
                        <span>{t(labelKey)}</span>
                        {routineViewState.sortField === field ? (
                          <span className="text-xs text-muted-foreground">
                            {routineViewState.sortDir === "asc" ? t("paperclip.routinesPage.sortAsc") : t("paperclip.routinesPage.sortDesc")}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-xs" title={t("paperclip.routinesPage.groupLabel")}>
                    <Layers className="h-3.5 w-3.5 sm:h-3 sm:w-3 sm:mr-1" />
                    <span className="hidden sm:inline">{t("paperclip.routinesPage.groupLabel")}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-44 p-0">
                  <div className="p-2 space-y-0.5">
                    {([
                      ["project", "paperclip.routinesPage.groupProject"],
                      ["assignee", "paperclip.routinesPage.groupAgent"],
                      ["none", "paperclip.routinesPage.groupNone"],
                    ] as const).map(([value, labelKey]) => (
                      <button
                        key={value}
                        className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm ${
                          routineViewState.groupBy === value
                            ? "bg-accent/50 text-foreground"
                            : "text-muted-foreground hover:bg-accent/50"
                        }`}
                        onClick={() => updateRoutineView({ groupBy: value, collapsedGroups: [] })}
                      >
                        <span>{t(labelKey)}</span>
                        {routineViewState.groupBy === value ? <Check className="h-3.5 w-3.5" /> : null}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="runs">
          <IssuesList
            issues={routineExecutionIssues ?? []}
            isLoading={recentRunsLoading}
            error={recentRunsError as Error | null}
            agents={agents}
            projects={projects}
            liveIssueIds={liveIssueIds}
            viewStateKey="paperclip:routine-recent-runs-view"
            issueLinkState={recentRunsIssueLinkState}
            onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
          />
        </TabsContent>
      </Tabs>

      <Dialog
        open={composerOpen}
        onOpenChange={(open) => {
          if (!createRoutine.isPending) {
            setComposerOpen(open);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0"
        >
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{t("paperclip.routinesPage.composerEyebrow")}</p>
              <p className="text-sm text-muted-foreground">
                {t("paperclip.routinesPage.composerIntro")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setComposerOpen(false);
                setAdvancedOpen(false);
              }}
              disabled={createRoutine.isPending}
            >
              {t("paperclip.routinesPage.cancel")}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-5 pt-5 pb-3">
              <textarea
                ref={titleInputRef}
                className="w-full resize-none overflow-hidden bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground/50"
                placeholder={t("paperclip.routinesPage.routineTitlePlaceholder")}
                rows={1}
                value={draft.title}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, title: event.target.value }));
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
                    if (draft.assigneeAgentId) {
                      if (draft.projectId) {
                        descriptionEditorRef.current?.focus();
                      } else {
                        projectSelectorRef.current?.focus();
                      }
                    } else {
                      assigneeSelectorRef.current?.focus();
                    }
                  }
                }}
                autoFocus
              />
            </div>

            <div className="px-5 pb-3">
              <div className="overflow-x-auto overscroll-x-contain">
                <div className="inline-flex min-w-full flex-wrap items-center gap-2 text-sm text-muted-foreground sm:min-w-max sm:flex-nowrap">
                  <span>{t("paperclip.routinesPage.forLabel")}</span>
                  <InlineEntitySelector
                    ref={assigneeSelectorRef}
                    value={draft.assigneeAgentId}
                    options={assigneeOptions}
                    recentOptionIds={recentAssigneeIds}
                    placeholder={t("paperclip.routinesPage.assigneePlaceholder")}
                    noneLabel={t("paperclip.routinesPage.noAssignee")}
                    searchPlaceholder={t("paperclip.routinesPage.searchAssignees")}
                    emptyMessage={t("paperclip.routinesPage.emptyAssignees")}
                    onChange={(assigneeAgentId) => {
                      if (assigneeAgentId) trackRecentAssignee(assigneeAgentId);
                      setDraft((current) => ({ ...current, assigneeAgentId }));
                    }}
                    onConfirm={() => {
                      if (draft.projectId) {
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
                    value={draft.projectId}
                    options={projectOptions}
                    recentOptionIds={recentProjectIds}
                    placeholder={t("paperclip.routinesPage.projectPlaceholder")}
                    noneLabel={t("paperclip.routinesPage.noProject")}
                    searchPlaceholder={t("paperclip.routinesPage.searchProjects")}
                    emptyMessage={t("paperclip.routinesPage.emptyProjects")}
                    onChange={(projectId) => {
                      if (projectId) trackRecentProject(projectId);
                      setDraft((current) => ({ ...current, projectId }));
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
            </div>

            <div className="border-t border-border/60 px-5 py-4">
              <MarkdownEditor
                ref={descriptionEditorRef}
                value={draft.description}
                onChange={(description) => setDraft((current) => ({ ...current, description }))}
                placeholder={t("paperclip.routinesPage.instructionsPlaceholder")}
                bordered={false}
                contentClassName="min-h-[160px] text-sm text-muted-foreground"
                mentions={mentionOptions}
                onSubmit={() => {
                  if (!createRoutine.isPending && draft.title.trim() && draft.projectId && draft.assigneeAgentId) {
                    createRoutine.mutate();
                  }
                }}
              />
            </div>

            <div className="border-t border-border/60 px-5 py-3">
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                  <div>
                    <p className="text-sm font-medium">{t("paperclip.routinesPage.advancedTitle")}</p>
                    <p className="text-sm text-muted-foreground">{t("paperclip.routinesPage.advancedHint")}</p>
                  </div>
                  {advancedOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t("paperclip.routinesPage.sectionConcurrency")}</p>
                      <Select
                        value={draft.concurrencyPolicy}
                        onValueChange={(concurrencyPolicy) => setDraft((current) => ({ ...current, concurrencyPolicy }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {concurrencyPolicies.map((value) => (
                            <SelectItem key={value} value={value}>{t(`paperclip.routinesPage.concurrencyPolicyLabels.${value}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{t(`paperclip.routinesPage.concurrencyPolicyDescriptions.${draft.concurrencyPolicy}`)}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{t("paperclip.routinesPage.sectionCatchUp")}</p>
                      <Select
                        value={draft.catchUpPolicy}
                        onValueChange={(catchUpPolicy) => setDraft((current) => ({ ...current, catchUpPolicy }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {catchUpPolicies.map((value) => (
                            <SelectItem key={value} value={value}>{t(`paperclip.routinesPage.catchUpPolicyLabels.${value}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{t(`paperclip.routinesPage.catchUpPolicyDescriptions.${draft.catchUpPolicy}`)}</p>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>

          <div className="shrink-0 flex flex-col gap-3 border-t border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {t("paperclip.routinesPage.footerHint")}
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <Button
                onClick={() => createRoutine.mutate()}
                disabled={
                  createRoutine.isPending ||
                  !draft.title.trim()
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {createRoutine.isPending ? t("paperclip.routinesPage.creatingRoutine") : t("paperclip.routinesPage.createRoutine")}
              </Button>
              {createRoutine.isError ? (
                <p className="text-sm text-destructive">
                  {createRoutine.error instanceof Error ? createRoutine.error.message : t("paperclip.routinesPage.failedCreateRoutine")}
                </p>
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">
            {error instanceof Error ? error.message : t("paperclip.routinesPage.failedLoadRoutines")}
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "routines" ? (
        <div>
          {(routines ?? []).length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={Repeat}
                message={t("paperclip.routinesPage.emptyList")}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border">
              {routineGroups.map((group) => (
                <Collapsible
                  key={group.key}
                  open={!routineViewState.collapsedGroups.includes(group.key)}
                  onOpenChange={(open) => {
                    updateRoutineView({
                      collapsedGroups: open
                        ? routineViewState.collapsedGroups.filter((item) => item !== group.key)
                        : [...routineViewState.collapsedGroups, group.key],
                    });
                  }}
                >
                  {group.label ? (
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                      <CollapsibleTrigger className="flex items-center gap-1.5">
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-90" />
                        <span className="text-sm font-semibold uppercase tracking-wide">
                          {group.label}
                        </span>
                      </CollapsibleTrigger>
                      <span className="text-xs text-muted-foreground">
                        {group.items.length}
                      </span>
                    </div>
                  ) : null}
                  <CollapsibleContent>
                    {group.items.map((routine) => (
                      <RoutineListRow
                        key={routine.id}
                        routine={routine}
                        projectById={projectById}
                        agentById={agentById}
                        runningRoutineId={runningRoutineId}
                        statusMutationRoutineId={statusMutationRoutineId}
                        href={`/routines/${routine.id}`}
                        onRunNow={handleRunNow}
                        onToggleEnabled={handleToggleEnabled}
                        onToggleArchived={handleToggleArchived}
                        t={t}
                      />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <RoutineRunVariablesDialog
        open={runDialogRoutine !== null}
        onOpenChange={(next) => {
          if (!next) setRunDialogRoutine(null);
        }}
        companyId={selectedCompanyId}
        routineName={runDialogRoutine?.title ?? null}
        agents={agents ?? []}
        projects={projects ?? []}
        defaultProjectId={runDialogRoutine?.projectId ?? null}
        defaultAssigneeAgentId={runDialogRoutine?.assigneeAgentId ?? null}
        variables={runDialogRoutine?.variables ?? []}
        isPending={runRoutine.isPending}
        onSubmit={(data) => {
          if (!runDialogRoutine) return;
          runRoutine.mutate({ id: runDialogRoutine.id, data });
        }}
      />
    </div>
  );
}

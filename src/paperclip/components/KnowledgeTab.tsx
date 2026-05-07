import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { companySkillsApi } from "../api/companySkills";
import { knowledgeApi } from "../api/knowledge";
import { useToastActions } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import {
  ONEEARNING_KNOWLEDGE_SKILL_SLUG,
  buildKnowledgeSkillMarkdown,
} from "../lib/knowledge-skill-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { cn, relativeTime } from "../lib/utils";

function formatKbSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function knowledgeFileLabel(relPath: string): string {
  const n = relPath.replace(/\\/g, "/").split("/").pop()?.trim();
  return n && n.length > 0 ? n : relPath;
}
import { Loader2, FolderOpen, Upload, RefreshCw, Trash2 } from "lucide-react";

interface KnowledgeTabProps {
  agent: Agent;
  companyId?: string;
}

export function KnowledgeTab({ agent, companyId }: KnowledgeTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const oe = typeof window !== "undefined" ? window.oneEarning : undefined;
  const isElectron = Boolean(oe?.knowledgeListFiles);

  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const tmr = window.setTimeout(() => setDebouncedQ(searchQ.trim()), 320);
    return () => window.clearTimeout(tmr);
  }, [searchQ]);

  const { data: skillSnapshot } = useQuery({
    queryKey: queryKeys.agents.skills(agent.id),
    queryFn: () => agentsApi.skills(agent.id, companyId),
    enabled: Boolean(companyId),
  });

  const { data: companySkills } = useQuery({
    queryKey: queryKeys.companySkills.list(companyId ?? ""),
    queryFn: () => companySkillsApi.list(companyId!),
    enabled: Boolean(companyId),
  });

  const knowledgeSkill = useMemo(
    () => companySkills?.find((s) => s.slug === ONEEARNING_KNOWLEDGE_SKILL_SLUG) ?? null,
    [companySkills],
  );

  const refEnabled = Boolean(
    knowledgeSkill && skillSnapshot?.desiredSkills.includes(knowledgeSkill.key),
  );

  const { data: kbFiles, refetch: refetchFiles } = useQuery({
    queryKey: queryKeys.knowledge.files(companyId ?? "", agent.id),
    queryFn: async () => {
      const list = await oe?.knowledgeListFiles?.({ companyId: companyId!, agentId: agent.id });
      return list ?? [];
    },
    enabled: Boolean(companyId && isElectron),
  });

  const { data: status, isError: statusQueryError } = useQuery({
    queryKey: queryKeys.knowledge.status(companyId ?? "", agent.id),
    queryFn: () => knowledgeApi.status(companyId!, agent.id),
    enabled: Boolean(companyId),
    refetchInterval: 15_000,
    retry: 1,
  });

  const { data: info } = useQuery({
    queryKey: queryKeys.knowledge.info(companyId ?? "", agent.id),
    queryFn: () => knowledgeApi.info(companyId!, agent.id),
    enabled: Boolean(companyId),
  });

  const { data: searchResult } = useQuery({
    queryKey: queryKeys.knowledge.search(companyId ?? "", agent.id, debouncedQ),
    queryFn: () => knowledgeApi.search({ companyId: companyId!, agentId: agent.id, q: debouncedQ, topK: 12 }),
    enabled: Boolean(companyId && debouncedQ.length > 0),
  });

  const reindexMutation = useMutation({
    mutationFn: () => knowledgeApi.reindex({ companyId: companyId!, agentId: agent.id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.status(companyId!, agent.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.info(companyId!, agent.id) });
    },
  });

  const toggleRefMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!companyId) throw new Error("no company");
      let key = knowledgeSkill?.key ?? null;
      if (!key) {
        const baseUrl = (await oe?.getPaperclipBaseUrl?.()) ?? "";
        const created = await companySkillsApi.create(companyId, {
          name: t("paperclip.knowledge.skillName"),
          slug: ONEEARNING_KNOWLEDGE_SKILL_SLUG,
          description: t("paperclip.knowledge.skillDescription"),
          markdown: buildKnowledgeSkillMarkdown({
            baseUrl: baseUrl || "http://127.0.0.1:3100",
          }),
        });
        key = created.key;
        await queryClient.invalidateQueries({ queryKey: queryKeys.companySkills.list(companyId) });
      }
      const snap = await agentsApi.skills(agent.id, companyId);
      const desired = snap.desiredSkills;
      const nextDesired = next
        ? Array.from(new Set([...desired, key!]))
        : desired.filter((k) => k !== key);
      await agentsApi.syncSkills(agent.id, nextDesired, companyId);
      /** 重建索引可能较慢；勿阻塞 mutation，否则 isPending 过长会导致开关长时间 disabled、无法再次点击 */
      if (next) {
        void knowledgeApi
          .reindex({ companyId, agentId: agent.id })
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.status(companyId, agent.id) });
            void queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.info(companyId, agent.id) });
          })
          .catch(() => {
            /* 侧车异常时技能仍已挂上；索引可稍后手动「重建索引」 */
          });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents.skills(agent.id) });
    },
    onError: (e) => {
      pushToast({
        title: t("paperclip.knowledge.toggleRefFailed", {
          message: e instanceof Error ? e.message : String(e),
        }),
        tone: "error",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (relPath: string) => {
      await oe?.knowledgeDeleteDiskFile?.({ companyId: companyId!, agentId: agent.id, relPath });
      await knowledgeApi.removeFromIndex({ companyId: companyId!, agentId: agent.id, relPath });
    },
    onSuccess: () => {
      void refetchFiles();
      void queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.status(companyId!, agent.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.info(companyId!, agent.id) });
    },
  });

  const statusByPath = useMemo(() => {
    const m = new Map<string, { status: string; error: string | null }>();
    for (const f of status?.files ?? []) {
      m.set(f.path.replace(/\\/g, "/"), { status: f.status, error: f.error });
    }
    return m;
  }, [status?.files]);

  const openFolder = useCallback(async () => {
    if (!companyId) return;
    await oe?.knowledgeOpenDir?.({ companyId, agentId: agent.id });
  }, [oe, companyId, agent.id]);

  const openKnowledgeFile = useCallback(
    async (relPath: string) => {
      if (!companyId) return;
      const fn = oe?.knowledgeOpenFile;
      if (!fn) {
        pushToast({ title: t("paperclip.knowledge.desktopOnly"), tone: "warn" });
        return;
      }
      try {
        await fn({ companyId, agentId: agent.id, relPath });
      } catch (e) {
        pushToast({
          title: t("paperclip.knowledge.openFileFailed", {
            message: e instanceof Error ? e.message : String(e),
          }),
          tone: "error",
        });
      }
    },
    [agent.id, companyId, oe, pushToast, t],
  );

  const importFiles = useCallback(async () => {
    if (!companyId) return;
    const r = await oe?.knowledgeImportDialog?.({ companyId, agentId: agent.id });
    if (!r?.imported?.length) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.files(companyId, agent.id) });
    await queryClient.refetchQueries({ queryKey: queryKeys.knowledge.files(companyId, agent.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.status(companyId, agent.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.info(companyId, agent.id) });
    try {
      await reindexMutation.mutateAsync();
    } catch {
      /* 侧车未启动或重建失败时，磁盘文件列表仍应已更新 */
    }
  }, [oe, companyId, agent.id, queryClient, reindexMutation]);

  const unsupportedSkills = skillSnapshot?.mode === "unsupported";

  if (!companyId) {
    return <p className="text-sm text-muted-foreground">{t("paperclip.knowledge.needCompany")}</p>;
  }

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      {!isElectron && (
        <div className="rounded-md border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
          {t("paperclip.knowledge.desktopOnly")}
        </div>
      )}

      {unsupportedSkills && (
        <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          {t("paperclip.knowledge.skillsUnsupported")}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!isElectron} onClick={() => void openFolder()}>
          <FolderOpen className="h-3.5 w-3.5 sm:mr-1" />
          <span>{t("paperclip.knowledge.openFolder")}</span>
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!isElectron} onClick={() => void importFiles()}>
          <Upload className="h-3.5 w-3.5 sm:mr-1" />
          <span>{t("paperclip.knowledge.import")}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={reindexMutation.isPending}
          onClick={() => reindexMutation.mutate()}
        >
          {reindexMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 sm:mr-1" />
          )}
          <span>{t("paperclip.knowledge.reindex")}</span>
        </Button>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">{t("paperclip.knowledge.referenceToggle")}</span>
          <ToggleSwitch
            checked={refEnabled}
            disabled={unsupportedSkills || toggleRefMutation.isPending}
            onCheckedChange={(v) => toggleRefMutation.mutate(v)}
          />
        </div>
      </div>

      {statusQueryError && (
        <p className="text-xs text-amber-200/90 rounded-md border border-amber-500/40 bg-amber-950/25 px-3 py-2">
          {t("paperclip.knowledge.sidecarUnavailable")}
        </p>
      )}

      {info && (
        <p className="text-xs text-muted-foreground">
          {t("paperclip.knowledge.statsLine", {
            indexed: info.indexedCount,
            total: info.docCount,
            pending: info.pendingCount,
            failed: info.failedCount,
            unsupported: info.unsupportedCount,
          })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-md"
          placeholder={t("paperclip.knowledge.searchPlaceholder")}
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
      </div>

      {debouncedQ.length > 0 && searchResult?.hits?.length ? (
        <ul className="space-y-2 text-sm border border-border rounded-md p-3">
          {searchResult.hits.map((h, i) => (
            <li key={`${h.docPath}-${h.chunkIdx}-${i}`} className="border-b border-border/60 pb-2 last:border-0">
              <div className="font-mono text-xs text-muted-foreground">{h.docPath}</div>
              <div
                className="mt-1 prose prose-invert max-w-none text-sm"
                // snippet contains <mark> from FTS
                dangerouslySetInnerHTML={{ __html: h.snippet }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {debouncedQ.length > 0 && searchResult?.hits?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("paperclip.knowledge.noHits")}</p>
      ) : null}

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">{t("paperclip.knowledge.colFileName")}</th>
              <th className="p-2 w-24">{t("paperclip.knowledge.colSize")}</th>
              <th className="p-2 w-40">{t("paperclip.knowledge.colMtime")}</th>
              <th className="p-2 w-28">{t("paperclip.knowledge.colStatus")}</th>
              <th className="p-2 w-16" />
            </tr>
          </thead>
          <tbody>
            {(kbFiles ?? []).map((f) => {
              const norm = f.relPath.replace(/\\/g, "/");
              const st = statusByPath.get(norm) ?? statusByPath.get(f.relPath);
              const statusLabel =
                st?.status != null && st.status !== ""
                  ? t(`paperclip.knowledge.statusValues.${st.status}`, { defaultValue: st.status })
                  : t("paperclip.knowledge.statusUnknown");
              return (
                <tr key={f.relPath} className="border-t border-border/60">
                  <td className="p-2 min-w-0">
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left font-mono text-xs break-all rounded-sm px-0.5 -mx-0.5",
                        isElectron
                          ? "text-primary hover:underline cursor-pointer"
                          : "text-foreground cursor-default",
                      )}
                      title={f.relPath}
                      disabled={!isElectron}
                      onClick={() => void openKnowledgeFile(f.relPath)}
                    >
                      {knowledgeFileLabel(f.relPath)}
                    </button>
                  </td>
                  <td className="p-2 text-xs">{formatKbSize(f.size)}</td>
                  <td className="p-2 text-xs text-muted-foreground">{relativeTime(new Date(f.mtimeMs))}</td>
                  <td className="p-2 text-xs">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5",
                        st?.status === "indexed" && "bg-emerald-950/50 text-emerald-200",
                        st?.status === "failed" && "bg-red-950/50 text-red-200",
                        st?.status === "unsupported" && "bg-zinc-800 text-zinc-300",
                        (!st || st.status === "pending" || st.status === "extracting") && "bg-zinc-800 text-zinc-300",
                      )}
                      title={st?.error ?? undefined}
                    >
                      {statusLabel}
                    </span>
                  </td>
                  <td className="p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={!isElectron || deleteMutation.isPending}
                      onClick={() => {
                        if (window.confirm(t("paperclip.knowledge.confirmDelete", { path: f.relPath }))) {
                          deleteMutation.mutate(f.relPath);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {isElectron && (kbFiles?.length ?? 0) === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">{t("paperclip.knowledge.emptyFiles")}</div>
        ) : null}
      </div>
    </div>
  );
}

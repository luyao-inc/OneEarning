/**
 * 本地启动 servers/outcomes 侧车（动态端口），供渲染进程经 /api/oneearning/outcomes/* 访问。
 */
import { type ChildProcess, fork } from "node:child_process";
import { basename, dirname } from "node:path";
import type { App } from "electron";
import getPort from "get-port";
import { setOutcomesSidecarBaseUrl } from "./paperclip-proxy.js";
import { getOneEarningOutcomesRoot } from "../utils/outcomes-dir.js";
import { resolveNodeExecutable } from "../utils/node-resolve.js";
import { resolveSidecarEntryScript } from "../utils/resolve-sidecar-entry.js";

function resolveEntryScript(app: App): string | null {
  return resolveSidecarEntryScript(app, "outcomes");
}

export class OutcomesSidecarManager {
  private child: ChildProcess | null = null;

  private baseUrl: string | null = null;

  async start(app: App): Promise<void> {
    await this.stop();
    const script = resolveEntryScript(app);
    if (!script) {
      console.warn("[OneEarning] Outcomes sidecar script not found; project outcomes disabled.");
      setOutcomesSidecarBaseUrl(null);
      return;
    }

    const port = await getPort({ port: 38742 });
    /** dev: …/outcomes/dist/index.js → cwd=outcomes；packaged: …/outcomes/index.js → cwd=outcomes（勿用 dirname×2，否则会落到 servers/） */
    const scriptDir = dirname(script);
    const cwd = basename(scriptDir) === "dist" ? dirname(scriptDir) : scriptDir;
    const root = getOneEarningOutcomesRoot(app);
    this.child = fork(script, [], {
      cwd,
      execPath: resolveNodeExecutable(app),
      env: {
        ...process.env,
        PORT: String(port),
        ONEEARNING_OUTCOMES_ROOT: root,
      },
      /** Windows：silent:false 易弹出空白控制台；true 则 stdio 走管道 */
      silent: true,
      execArgv: [],
    });
    this.child.stdout?.resume();
    this.child.stderr?.resume();

    this.baseUrl = `http://127.0.0.1:${port}`;
    setOutcomesSidecarBaseUrl(this.baseUrl);

    this.child.on("exit", (code, signal) => {
      console.warn("[OneEarning] Outcomes sidecar exited", code, signal);
      if (this.child?.pid === undefined) return;
      this.child = null;
      this.baseUrl = null;
      setOutcomesSidecarBaseUrl(null);
    });

    this.child.on("error", (err) => {
      console.error("[OneEarning] Outcomes sidecar error", err);
    });

    console.error("[OneEarning] Outcomes sidecar started", this.baseUrl, script);
  }

  async stop(): Promise<void> {
    setOutcomesSidecarBaseUrl(null);
    if (!this.child) return;
    try {
      this.child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    this.child = null;
    this.baseUrl = null;
  }

  getBaseUrl(): string | null {
    return this.baseUrl;
  }
}

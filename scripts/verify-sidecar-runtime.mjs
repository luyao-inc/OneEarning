/**
 * 在「与安装包一致」的目录布局下短启动侧车并拉 /health，避免仅开发机可解析的依赖
 *（根目录 node_modules、pnpm 抬升等）在打包后才发现 MODULE_NOT_FOUND。
 *
 * staging 放在系统临时目录（而非仓库 build/ 下），否则 Node 会沿路径走到 monorepo 根的
 * node_modules，出现「verify 通过、安装包仍缺包」的假阴性。
 *
 * 要求已执行：tsc 各侧车、materialize-sidecar-node-modules（build/sidecar-node-modules 存在）。
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      const p = typeof a === "object" && a && "port" in a ? a.port : 0;
      s.close(() => resolve(p));
    });
    s.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function rmStagingSafe(dir) {
  for (let i = 0; i < 8; i++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      const code = /** @type {NodeJS.ErrnoException} */ (e).code;
      if (code !== "EBUSY" && code !== "EPERM") {
        throw e;
      }
      await sleep(150 * (i + 1));
    }
  }
}

/**
 * 模拟 resources/servers/<name>/：index.js + 同目录 node_modules
 */
async function smoke(name, envExtra) {
  const materialNm = join(root, "build", "sidecar-node-modules", name, "node_modules");
  const distDir = join(root, "servers", name, "dist");
  const staging = mkdtempSync(join(tmpdir(), `oe-sidecar-smoke-${name}-`));

  if (!existsSync(materialNm)) {
    throw new Error(`缺少 ${materialNm}，请先运行 node scripts/materialize-sidecar-node-modules.mjs`);
  }
  if (!existsSync(distDir)) {
    throw new Error(`缺少 ${distDir}，请先构建对应侧车 (pnpm run build:${name})`);
  }

  try {
    cpSync(materialNm, join(staging, "node_modules"), { recursive: true, dereference: true });
    cpSync(distDir, staging, { recursive: true });

    const port = await getFreePort();
    const env = {
      ...process.env,
      PORT: String(port),
      ...envExtra,
    };

    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["index.js"], {
        cwd: staging,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    let stderr = "";
    let settled = false;

    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    child.stdout?.on("data", () => {});

    const finishOk = () => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      resolve();
    };

    const finishErr = (msg) => {
      if (settled) return;
      settled = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      reject(new Error(msg));
    };

    child.on("error", (e) => {
      finishErr(`${name} spawn error: ${e.message}`);
    });

    child.on("exit", (code) => {
      if (settled) return;
      if (code !== 0 && code !== null) {
        settled = true;
        reject(
          new Error(
            `${name} 进程启动失败或立即退出 (exit ${code})，常见于安装包内缺少某 npm 依赖。\n--- stderr ---\n${stderr.slice(-12_000)}`,
          ),
        );
      }
    });

    const deadline = Date.now() + 12_000;
    (async () => {
      while (Date.now() < deadline && !settled) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/health`);
          if (r.ok) {
            const j = await r.json();
            if (j && j.ok === true) {
              finishOk();
              await sleep(400);
              return;
            }
          }
        } catch {
          /* 尚未监听 */
        }
        await sleep(120);
      }
      if (!settled) {
        finishErr(
          `${name} 12s 内 /health 不可用。\n--- stderr ---\n${stderr.slice(-8000)}`,
        );
      }
    })();
    });
  } finally {
    await sleep(200);
    await rmStagingSafe(staging);
  }
}

async function main() {
  const kbRoot = mkdtempSync(join(tmpdir(), "oe-verify-kb-"));
  const ocRoot = mkdtempSync(join(tmpdir(), "oe-verify-oc-"));

  await smoke("clawhub", {});
  console.log("[verify-sidecars] clawhub OK");

  await smoke("knowledge", { ONEEARNING_KB_ROOT: kbRoot });
  console.log("[verify-sidecars] knowledge OK");

  await smoke("outcomes", { ONEEARNING_OUTCOMES_ROOT: ocRoot });
  console.log("[verify-sidecars] outcomes OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

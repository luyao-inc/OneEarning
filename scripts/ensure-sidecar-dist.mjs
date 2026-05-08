/**
 * pnpm dev 时主进程要 fork 各 servers/<侧车名>/dist/index.js；若未先跑过 tsc（或删了 dist），
 * 侧车入口不存在。在 predev 中若缺任一侧车 dist 则补一次 build，保证开发即跑通。
 */
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sidecars = ["clawhub", "knowledge", "outcomes"];

for (const name of sidecars) {
  const entry = join(root, "servers", name, "dist", "index.js");
  if (existsSync(entry)) {
    continue;
  }
  console.log(`[ensure-sidecar-dist] 缺少 ${entry}，正在 tsc 构建…`);
  execSync(`pnpm --dir "servers/${name}" run build`, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
}

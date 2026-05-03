import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildVendor = path.join(root, "scripts", "build-vendor.mjs");

execFileSync(process.execPath, [buildVendor], { cwd: root, stdio: "inherit" });

// 同步 pnpm 对 file: 依赖的虚拟目录（需 dist）；用 shell 以便在 Windows 上找到 pnpm.cmd
execSync("pnpm install --ignore-scripts", {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

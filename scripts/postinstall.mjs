import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildVendor = path.join(root, "scripts", "build-vendor.mjs");

// 先同步 file: 依赖到 node_modules，再编译 vendor（否则 tsc 无法解析 @paperclipai/*）
execSync("pnpm install --ignore-scripts", {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
});

execFileSync(process.execPath, [buildVendor], { cwd: root, stdio: "inherit" });

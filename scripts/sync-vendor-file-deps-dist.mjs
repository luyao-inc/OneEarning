#!/usr/bin/env node
/**
 * pnpm 对 file: 依赖会在安装时把内容拷入虚拟 store；之后在 vendor 里新增/编译出的 dist 文件
 * 不会自动同步到 node_modules/.pnpm/...，会导致运行时缺模块（例如 adapter-cursor-local/dist/server/local-command.js）。
 * 在 build-vendor（tsc）之后执行本脚本，把各 vendor 包的 dist 覆盖同步到当前解析到的安装路径。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const overrides = pkg.pnpm?.overrides ?? {};

function dependencyInstallDir(depName) {
  const parts = depName.startsWith("@") ? depName.split("/") : [depName];
  if (parts.length < 2 || !parts[0].startsWith("@")) {
    return path.join(root, "node_modules", depName);
  }
  return path.join(root, "node_modules", parts[0], parts[1]);
}

for (const [depName, spec] of Object.entries(overrides)) {
  if (typeof spec !== "string" || !spec.startsWith("file:")) continue;
  const rel = spec.slice("file:".length);
  const vendorRoot = path.resolve(root, rel);
  const vendorDist = path.join(vendorRoot, "dist");
  if (!fs.existsSync(vendorDist)) continue;

  const installedRoot = dependencyInstallDir(depName);
  const pkgJson = path.join(installedRoot, "package.json");
  if (!fs.existsSync(pkgJson)) continue;

  const installedDist = path.join(installedRoot, "dist");
  fs.rmSync(installedDist, { recursive: true, force: true });
  fs.cpSync(vendorDist, installedDist, { recursive: true });
}

#!/usr/bin/env node
/**
 * electron-builder / BrowserWindow 在 Windows 与 Linux 上依赖 PNG；仓库若仅有 icon.icns，
 * 会在 mac 上用 sips 生成 icon.png，避免打包与运行时退回 Electron 默认图标。
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const icns = path.join(root, "resources", "icons", "icon.icns");
const png = path.join(root, "resources", "icons", "icon.png");

if (!existsSync(icns)) {
  console.warn("[ensure-icon-png] skip: missing resources/icons/icon.icns");
  process.exit(0);
}
if (existsSync(png)) {
  process.exit(0);
}

if (process.platform !== "darwin") {
  console.warn(
    "[ensure-icon-png] skip: no icon.png and not on macOS (install ImageMagick/sips equivalent or add resources/icons/icon.png manually)",
  );
  process.exit(0);
}

try {
  execFileSync("sips", ["-s", "format", "png", icns, "--out", png], { stdio: "inherit" });
  console.log(`[ensure-icon-png] wrote ${png}`);
} catch (e) {
  console.error("[ensure-icon-png] sips failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}

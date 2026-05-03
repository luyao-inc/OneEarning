import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsc = path.join(root, "node_modules", "typescript", "lib", "tsc.js");

const configs = [
  "vendor/paperclip-shared/tsconfig.json",
  "vendor/paperclip-adapter-utils/tsconfig.json",
  "vendor/adapter-acpx-local/tsconfig.json",
  "vendor/adapter-claude-local/tsconfig.json",
  "vendor/adapter-codex-local/tsconfig.json",
  "vendor/adapter-cursor-local/tsconfig.json",
  "vendor/adapter-gemini-local/tsconfig.json",
  "vendor/adapter-openclaw-gateway/tsconfig.json",
  "vendor/adapter-opencode-local/tsconfig.json",
  "vendor/adapter-pi-local/tsconfig.json",
];

for (const rel of configs) {
  const configPath = path.join(root, rel);
  execFileSync(process.execPath, [tsc, "-p", configPath], {
    cwd: root,
    stdio: "inherit",
  });
}

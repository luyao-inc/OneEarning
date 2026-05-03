#!/usr/bin/env zx
/**
 * 将 paperclipai 及其 pnpm 传递依赖打成扁平 node_modules，供 electron-builder extraResources 使用。
 * 逻辑改编自 EarningClaw 的 bundle-openclaw.mjs。
 */
import 'zx/globals';

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'build', 'paperclip');
const NODE_MODULES = path.join(ROOT, 'node_modules');

function normWin(p) {
  if (process.platform !== 'win32') return p;
  if (p.startsWith('\\\\?\\')) return p;
  return '\\\\?\\' + p.replace(/\//g, '\\');
}

echo`📦 Bundling paperclipai for electron-builder...`;

const pkgLink = path.join(NODE_MODULES, 'paperclipai');
if (!fs.existsSync(pkgLink)) {
  echo`❌ node_modules/paperclipai not found. Run pnpm install first.`;
  process.exit(1);
}

const pkgReal = fs.realpathSync(pkgLink);
echo`   paperclipai resolved: ${pkgReal}`;

if (fs.existsSync(OUTPUT)) fs.rmSync(OUTPUT, { recursive: true });
fs.mkdirSync(OUTPUT, { recursive: true });

fs.cpSync(pkgReal, OUTPUT, { recursive: true, dereference: true });

function getVirtualStoreNodeModules(realPkgPath) {
  let dir = realPkgPath;
  while (dir !== path.dirname(dir)) {
    if (path.basename(dir) === 'node_modules') {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function listPackages(nodeModulesDir) {
  const result = [];
  const nDir = normWin(nodeModulesDir);
  if (!fs.existsSync(nDir)) return result;

  for (const entry of fs.readdirSync(nDir)) {
    if (entry === '.bin') continue;
    const entryPath = path.join(nodeModulesDir, entry);
    if (entry.startsWith('@')) {
      try {
        for (const sub of fs.readdirSync(normWin(entryPath))) {
          result.push({ name: `${entry}/${sub}`, fullPath: path.join(entryPath, sub) });
        }
      } catch {
        /* skip */
      }
    } else {
      result.push({ name: entry, fullPath: entryPath });
    }
  }
  return result;
}

const collected = new Map();
const queue = [];
const paperclipVirtualNM = getVirtualStoreNodeModules(pkgReal);
if (!paperclipVirtualNM) {
  echo`❌ Could not determine pnpm virtual store for paperclipai`;
  process.exit(1);
}
echo`   Virtual store root: ${paperclipVirtualNM}`;
queue.push({ nodeModulesDir: paperclipVirtualNM, skipPkg: 'paperclipai' });

const SKIP_PACKAGES = new Set(['typescript', '@playwright/test']);
const SKIP_SCOPES = ['@types/', '@cloudflare/'];

while (queue.length > 0) {
  const { nodeModulesDir, skipPkg } = queue.shift();
  const packages = listPackages(nodeModulesDir);
  for (const { name, fullPath } of packages) {
    if (name === skipPkg) continue;
    if (SKIP_PACKAGES.has(name) || SKIP_SCOPES.some((s) => name.startsWith(s))) continue;
    let realPath;
    try {
      realPath = fs.realpathSync(fullPath);
    } catch {
      continue;
    }
    if (collected.has(realPath)) continue;
    collected.set(realPath, name);
    const depVirtualNM = getVirtualStoreNodeModules(realPath);
    if (depVirtualNM && depVirtualNM !== nodeModulesDir) {
      queue.push({ nodeModulesDir: depVirtualNM, skipPkg: name });
    }
  }
}

echo`   Found ${collected.size} packages (transitive)`;

const outputNodeModules = path.join(OUTPUT, 'node_modules');
fs.mkdirSync(outputNodeModules, { recursive: true });
const copiedNames = new Set();
let copiedCount = 0;
let skippedDupes = 0;

for (const [realPath, pkgName] of collected) {
  if (copiedNames.has(pkgName)) {
    skippedDupes++;
    continue;
  }
  copiedNames.add(pkgName);
  const dest = path.join(outputNodeModules, pkgName);
  try {
    fs.mkdirSync(normWin(path.dirname(dest)), { recursive: true });
    fs.cpSync(normWin(realPath), normWin(dest), { recursive: true, dereference: true });
    copiedCount++;
  } catch (err) {
    echo`   ⚠️  Skipped ${pkgName}: ${err.message}`;
  }
}

echo`   Copied ${copiedCount} packages, skipped ${skippedDupes} duplicate names`;
echo`✅ Output: ${OUTPUT}`;

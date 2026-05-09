/**
 * pnpm 在 workspace 下把各 servers 子目录的 node_modules 做成指向根目录 .pnpm 的 junction，
 * electron-builder 拷贝 extraResources 时常保留 junction，安装包内指向失效。
 * 构建时用 fs.cp(..., { dereference: true }) 复制真实文件树供打包。
 *
 * macOS codesign --strict 仍会拒绝「指向 bundle 外」的 symlink（invalid destination for symbolic link）。
 * pnpm 顶层依赖常为指向 store 的 symlink；cpSync 在某些层级仍会保留链接，故需在输出树上再实体化一层
 * （逻辑对齐 scripts/prepare-server-bundle.mjs 的 materializeSymlinks）。
 */
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, statSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sidecars = ["clawhub", "knowledge", "outcomes"];
const outRoot = join(root, "build", "sidecar-node-modules");

const DEV_HINT =
  "请先在各目录执行 pnpm install，并运行 build:clawhub / build:knowledge / build:outcomes。";

function normWin(p) {
  if (process.platform !== "win32") return p;
  if (p.startsWith("\\\\?\\")) return p;
  return "\\\\?\\" + p.replace(/\//g, "\\");
}

/**
 * 将 rootDir 下所有 symlink 替换为指向目标的真实文件/目录（递归复制）。
 */
function materializeSymlinks(rootDir) {
  const rootPath = resolve(rootDir);
  const stack = [rootPath];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(normWin(dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const p = join(dir, ent.name);
      let st;
      try {
        st = lstatSync(normWin(p));
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) {
        let linkTarget;
        try {
          linkTarget = readlinkSync(normWin(p));
        } catch {
          continue;
        }
        const resolved = isAbsolute(linkTarget) ? linkTarget : resolve(dirname(p), linkTarget);
        if (!existsSync(normWin(resolved))) continue;
        try {
          unlinkSync(normWin(p));
          const targetStat = statSync(normWin(resolved));
          if (targetStat.isDirectory()) {
            cpSync(normWin(resolved), normWin(p), { recursive: true, dereference: true });
          } else {
            mkdirSync(normWin(dirname(p)), { recursive: true });
            copyFileSync(normWin(resolved), normWin(p));
          }
        } catch {
          /* best-effort */
        }
      } else if (st.isDirectory()) {
        stack.push(p);
      }
    }
  }
}

/** 若某依赖仅在 monorepo 根的 node_modules 可解析、侧车目录下没有，打包后会 MODULE_NOT_FOUND；
 *  应在对应 servers/<侧车>/package.json 中声明为直接依赖；pnpm run verify:sidecars 会拦截。 */

function materialize(name) {
  const src = join(root, "servers", name, "node_modules");
  const dst = join(outRoot, name, "node_modules");
  if (!existsSync(src)) {
    console.error(`[materialize-sidecars] 缺少 ${src}。${DEV_HINT}`);
    process.exit(1);
  }
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true, dereference: true });
  materializeSymlinks(dst);
  console.log("[materialize-sidecars]", name, "→", dst);
}

mkdirSync(outRoot, { recursive: true });
for (const name of sidecars) {
  materialize(name);
}

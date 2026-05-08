/**
 * pnpm 在 workspace 下把各 servers 子目录的 node_modules 做成指向根目录 .pnpm 的 junction，
 * electron-builder 拷贝 extraResources 时常保留 junction，安装包内指向失效。
 * 构建时用 fs.cp(..., { dereference: true }) 复制真实文件树供打包。
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sidecars = ["clawhub", "knowledge", "outcomes"];
const outRoot = join(root, "build", "sidecar-node-modules");

const DEV_HINT =
  "请先在各目录执行 pnpm install，并运行 build:clawhub / build:knowledge / build:outcomes。";

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
  console.log("[materialize-sidecars]", name, "→", dst);
}

mkdirSync(outRoot, { recursive: true });
for (const name of sidecars) {
  materialize(name);
}

此目录存放打包用 **捆绑 Node**（不进 Git）。

- **Windows**：`pnpm run build:win` 已内置执行 `prep:node:win`，一般无需单独下载；仅更新 Node 时再跑 `pnpm run prep:node:win`。
- **macOS**：打包前请执行 `pnpm run prep:node:mac`（或直接使用 `pnpm run build:mac`，脚本已包含）。

产物路径需满足 `electron/utils/node-resolve.ts` 中的约定（例如 `win32-x64/node.exe`、`darwin-arm64/node`）。

此目录存放打包用 **捆绑 Node**（不进 Git）。构建前请执行：

- Windows：`pnpm run prep:node:win`
- macOS：`pnpm run prep:node:mac`

产物路径需满足 `electron/utils/node-resolve.ts` 中的约定（例如 `darwin-arm64/node`）。

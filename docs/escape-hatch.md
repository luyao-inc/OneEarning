# 完整 Paperclip Web（逃生舱）

壳内尚未覆盖的功能，可通过以下方式使用上游 Paperclip Web UI：

1. 侧栏底部的 **「在浏览器中打开完整 Paperclip」**，会在系统浏览器中打开当前本机实例的根地址（与壳共用同一 Paperclip 进程与数据）。
2. 若浏览器拒绝打开 `127.0.0.1`，请检查系统默认浏览器与本机防火墙设置。

API 仍仅允许访问 `127.0.0.1` / `localhost` 的 loopback 地址（见主进程 `open-external-safe` 与 `paperclip-fetch` 白名单）。

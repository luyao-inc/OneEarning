/**
 * 轮询 Paperclip HTTP 健康检查，直到服务就绪或超时。
 * GET /api/health — 200 即视为就绪（503 表示进程已起来但 DB 未就绪，继续等）。
 *
 * @param getPort 每次重试重新取端口：Paperclip 在请求端口被占用时会换端口，需与日志解析结果对齐。
 * @returns 最终探测成功的端口（用于 loadURL）
 */
export async function waitForPaperclipHealth(
  getPort: () => number,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    getAbortReason?: () => string | null;
  } = {},
): Promise<number> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 400;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const abort = options.getAbortReason?.();
    if (abort) throw new Error(abort);

    const port = getPort();
    const url = `http://127.0.0.1:${port}/api/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (res.ok) return port;
    } catch {
      /* 连接拒绝或超时：继续 */
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const lastPort = getPort();
  throw new Error(
    `Paperclip 健康检查超时（${timeoutMs}ms）：http://127.0.0.1:${lastPort}/api/health`,
  );
}

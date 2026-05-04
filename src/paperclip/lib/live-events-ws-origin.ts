/**
 * Live event WebSocket 需要 `ws://host`；`file:` 页面没有 `location.host`，Electron 下用 Paperclip 基址。
 */
export async function resolveLiveEventsWsBase(): Promise<string | null> {
  const secure = window.location.protocol === "https:";
  const wsProto = secure ? "wss" : "ws";
  const host = window.location.host;
  if (host) {
    return `${wsProto}://${host}`;
  }
  const getBase = window.oneEarning?.getPaperclipBaseUrl;
  if (typeof getBase !== "function") {
    return null;
  }
  try {
    const httpBase = await getBase();
    const u = new URL(httpBase);
    if (!u.hostname) return null;
    return `${wsProto}://${u.host}`;
  } catch {
    return null;
  }
}

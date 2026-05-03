export const DEFAULT_INSTANCE_SETTINGS_PATH = "/instance/settings/general";

/** 与 InstanceSidebar 中条目一致，用于「记住上次实例设置页」与账户菜单目标路径。 */
const ALLOWED_INSTANCE_SETTINGS_PATHNAMES = new Set([
  "/instance/settings/profile",
  "/instance/settings/general",
  "/instance/settings/access",
  "/instance/settings/heartbeats",
  "/instance/settings/experimental",
  "/instance/settings/plugins",
  "/instance/settings/adapters",
]);

export function normalizeRememberedInstanceSettingsPath(rawPath: string | null): string {
  if (!rawPath) return DEFAULT_INSTANCE_SETTINGS_PATH;

  const match = rawPath.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  const pathname = match?.[1] ?? rawPath;
  const search = match?.[2] ?? "";
  const hash = match?.[3] ?? "";

  if (ALLOWED_INSTANCE_SETTINGS_PATHNAMES.has(pathname)) {
    return `${pathname}${search}${hash}`;
  }

  if (/^\/instance\/settings\/plugins\/[^/?#]+$/.test(pathname)) {
    return `${pathname}${search}${hash}`;
  }

  return DEFAULT_INSTANCE_SETTINGS_PATH;
}

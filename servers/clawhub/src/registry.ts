const DEFAULT_REGISTRY = "https://clawhub.ai";

export function normalizeRegistry(input: string | undefined): string {
  const raw = (input ?? process.env.CLAWHUB_REGISTRY ?? process.env.CLAWDHUB_REGISTRY ?? DEFAULT_REGISTRY).trim();
  if (!raw.length) return DEFAULT_REGISTRY;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function registryUrl(registry: string, path: string): string {
  const base = registry.endsWith("/") ? registry : `${registry}/`;
  const rel = path.startsWith("/") ? path.slice(1) : path;
  return new URL(rel, base).toString();
}

export async function fetchSkillMetadata(registry: string, slug: string, token: string | null): Promise<{
  latestVersion: string | null;
  moderation: { isMalwareBlocked?: boolean; isSuspicious?: boolean };
  raw: unknown;
}> {
  const url = registryUrl(registry, `/api/v1/skills/${encodeURIComponent(slug)}`);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Registry HTTP ${res.status}`);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  const latest = raw?.latestVersion as { version?: string } | undefined;
  const mod = raw?.moderation as { isMalwareBlocked?: boolean; isSuspicious?: boolean } | undefined;
  return {
    latestVersion: typeof latest?.version === "string" ? latest.version : null,
    moderation: mod ?? {},
    raw,
  };
}

export async function downloadSkillZip(
  registry: string,
  slug: string,
  version: string,
  token: string | null,
): Promise<Uint8Array> {
  const u = new URL(registryUrl(registry, "/api/v1/download"));
  u.searchParams.set("slug", slug);
  u.searchParams.set("version", version);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(u.toString(), { method: "GET", headers });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Download HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

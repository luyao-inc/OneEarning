/**
 * Single source of truth for adapter display metadata.
 *
 * Built-in adapters have entries in `adapterDisplayMap`. External (plugin)
 * adapters get sensible defaults derived from their type string via
 * `getAdapterDisplay()`.
 */
import type { TFunction } from "i18next";
import type { ComponentType } from "react";
import {
  Bot,
  Code,
  Gem,
  MousePointer2,
  Sparkles,
  Terminal,
  Cpu,
} from "lucide-react";
import { OpenCodeLogoIcon } from "@/components/OpenCodeLogoIcon";
import { HermesIcon } from "@/components/HermesIcon";

// ---------------------------------------------------------------------------
// Type suffix parsing
// ---------------------------------------------------------------------------

const TYPE_SUFFIXES: Record<string, string> = {
  _local: "local",
  _gateway: "gateway",
};

function getTypeSuffix(type: string): string | null {
  for (const [suffix, mode] of Object.entries(TYPE_SUFFIXES)) {
    if (type.endsWith(suffix)) return mode;
  }
  return null;
}

function withSuffix(label: string, suffix: string | null): string {
  return suffix ? `${label} (${suffix})` : label;
}

// ---------------------------------------------------------------------------
// Display metadata per adapter type
// ---------------------------------------------------------------------------

export interface AdapterDisplayInfo {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  recommended?: boolean;
  comingSoon?: boolean;
  disabledLabel?: string;
  experimental?: boolean;
  hideFromVisualSelection?: boolean;
}

const adapterDisplayMap: Record<string, AdapterDisplayInfo> = {
  acpx_local: {
    label: "ACPX",
    description: "Experimental local ACPX multi-agent adapter",
    icon: Bot,
    experimental: true,
    hideFromVisualSelection: true,
  },
  claude_local: {
    label: "Claude Code",
    description: "Local Claude agent",
    icon: Sparkles,
    recommended: true,
  },
  codex_local: {
    label: "Codex",
    description: "Local Codex agent",
    icon: Code,
    recommended: true,
  },
  gemini_local: {
    label: "Gemini CLI",
    description: "Local Gemini agent",
    icon: Gem,
  },
  opencode_local: {
    label: "OpenCode",
    description: "Local multi-provider agent",
    icon: OpenCodeLogoIcon,
  },
  hermes_local: {
    label: "Hermes Agent",
    description: "Local Hermes CLI agent",
    icon: HermesIcon,
  },
  pi_local: {
    label: "Pi",
    description: "Local Pi agent",
    icon: Terminal,
  },
  cursor: {
    label: "Cursor",
    description: "Local Cursor agent",
    icon: MousePointer2,
  },
  openclaw_gateway: {
    label: "OpenClaw Gateway",
    description: "Invoke OpenClaw via gateway protocol",
    icon: Bot,
    comingSoon: true,
    disabledLabel: "Configure OpenClaw within the App",
  },
  process: {
    label: "Process",
    description: "Internal process adapter",
    icon: Cpu,
    comingSoon: true,
  },
  http: {
    label: "HTTP",
    description: "Internal HTTP adapter",
    icon: Cpu,
    comingSoon: true,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function humanizeType(type: string): string {
  // Strip known type suffixes so "droid_local" → "Droid", not "Droid Local"
  let base = type;
  for (const suffix of Object.keys(TYPE_SUFFIXES)) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getAdapterLabel(type: string): string {
  const base = adapterDisplayMap[type]?.label ?? humanizeType(type);
  return withSuffix(base, getTypeSuffix(type));
}

export function getAdapterLabels(): Record<string, string> {
  const suffixed: Record<string, string> = {};
  for (const [type, info] of Object.entries(adapterDisplayMap)) {
    suffixed[type] = withSuffix(info.label, getTypeSuffix(type));
  }
  return suffixed;
}

export function getAdapterDisplay(type: string): AdapterDisplayInfo {
  const known = adapterDisplayMap[type];
  if (known) return known;

  const suffix = getTypeSuffix(type);
  const label = withSuffix(humanizeType(type), suffix);
  return {
    label,
    description: suffix ? `External ${suffix} adapter` : "External adapter",
    icon: Cpu,
  };
}

/** 下拉等场景：与 `getAdapterLabel` 一致，对 `_local` / `_gateway` 等后缀追加本地化说明 */
export function translateAdapterLabel(t: TFunction, type: string): string {
  const suffix = getTypeSuffix(type);
  const baseEn = adapterDisplayMap[type]?.label ?? humanizeType(type);
  const translated = t(`paperclip.adapterDisplay.types.${type}.label`, { defaultValue: baseEn });
  return withSuffix(translated, suffix);
}

/** 卡片/网格：翻译名称与描述（含 `disabledLabel`） */
export function translateAdapterDisplay(t: TFunction, type: string): AdapterDisplayInfo {
  const base = getAdapterDisplay(type);
  const label = t(`paperclip.adapterDisplay.types.${type}.label`, { defaultValue: base.label });
  const description = t(`paperclip.adapterDisplay.types.${type}.description`, {
    defaultValue: base.description,
  });
  const disabledLabel =
    base.disabledLabel !== undefined
      ? t(`paperclip.adapterDisplay.types.${type}.disabledLabel`, { defaultValue: base.disabledLabel })
      : undefined;
  return { ...base, label, description, disabledLabel };
}

export function isKnownAdapterType(type: string): boolean {
  return type in adapterDisplayMap;
}

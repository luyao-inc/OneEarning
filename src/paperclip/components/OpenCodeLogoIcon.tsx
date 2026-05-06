import { cn } from "../lib/utils";

interface OpenCodeLogoIconProps {
  className?: string;
}

/** 与 Vite `base: './'` 及 Electron `file://` 一致，避免生产包中 `/brands/...` 指向错误盘符根路径 */
function brandSrc(file: string): string {
  const base = import.meta.env.BASE_URL;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}brands/${file}`;
}

export function OpenCodeLogoIcon({ className }: OpenCodeLogoIconProps) {
  return (
    <>
      <img
        src={brandSrc("opencode-logo-light-square.svg")}
        alt="OpenCode"
        className={cn("dark:hidden", className)}
      />
      <img
        src={brandSrc("opencode-logo-dark-square.svg")}
        alt="OpenCode"
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}

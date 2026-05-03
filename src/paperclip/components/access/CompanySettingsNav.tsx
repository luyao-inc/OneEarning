import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PageTabBar } from "@/components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { useLocation, useNavigate } from "@/lib/router";

const COMPANY_SETTINGS_ROUTES = [
  { value: "general", href: "/company/settings" },
  { value: "environments", href: "/company/settings/environments" },
  { value: "access", href: "/company/settings/access" },
  { value: "invites", href: "/company/settings/invites" },
] as const;

type CompanySettingsTab = (typeof COMPANY_SETTINGS_ROUTES)[number]["value"];

const TAB_LABEL_KEYS: Record<CompanySettingsTab, string> = {
  general: "navGeneral",
  environments: "navEnvironments",
  access: "navAccess",
  invites: "navInvites",
};

export function getCompanySettingsTab(pathname: string): CompanySettingsTab {
  if (pathname.includes("/company/settings/environments")) {
    return "environments";
  }

  if (pathname.includes("/company/settings/access")) {
    return "access";
  }

  if (pathname.includes("/company/settings/invites")) {
    return "invites";
  }

  return "general";
}

export function CompanySettingsNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getCompanySettingsTab(location.pathname);

  const items = useMemo(
    () =>
      COMPANY_SETTINGS_ROUTES.map((row) => ({
        value: row.value,
        href: row.href,
        label: t(`paperclip.companySettingsPage.${TAB_LABEL_KEYS[row.value]}`),
      })),
    [t],
  );

  function handleTabChange(value: string) {
    const nextTab = items.find((item) => item.value === value);
    if (!nextTab || nextTab.value === activeTab) return;
    navigate(nextTab.href);
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <PageTabBar
        items={items.map(({ value, label }) => ({ value, label }))}
        value={activeTab}
        onValueChange={handleTabChange}
        align="start"
      />
    </Tabs>
  );
}

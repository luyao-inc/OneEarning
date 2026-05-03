import { PageTabBar } from "@/components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { useNavigate } from "@/lib/router";

const items = [
  { value: "general", label: "General", href: "/company/settings" },
] as const;

type CompanySettingsTab = (typeof items)[number]["value"];

/** OneEarning: company settings tabs other than General are hidden in the shell. */
export function getCompanySettingsTab(_pathname: string): CompanySettingsTab {
  return "general";
}

export function CompanySettingsNav() {
  const navigate = useNavigate();
  const activeTab: CompanySettingsTab = "general";

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

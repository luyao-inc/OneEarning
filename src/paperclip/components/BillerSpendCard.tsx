import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CostByBiller, CostByProviderModel } from "@paperclipai/shared";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { QuotaBar } from "./QuotaBar";
import { billingTypeDisplayName, formatCents, formatTokens, providerDisplayName } from "@/lib/utils";

interface BillerSpendCardProps {
  row: CostByBiller;
  weekSpendCents: number;
  budgetMonthlyCents: number;
  totalCompanySpendCents: number;
  providerRows: CostByProviderModel[];
}

export function BillerSpendCard({
  row,
  weekSpendCents,
  budgetMonthlyCents,
  totalCompanySpendCents,
  providerRows,
}: BillerSpendCardProps) {
  const { t } = useTranslation();

  const providerBreakdown = useMemo(() => {
    const map = new Map<string, { provider: string; costCents: number; inputTokens: number; outputTokens: number }>();
    for (const entry of providerRows) {
      const current = map.get(entry.provider) ?? {
        provider: entry.provider,
        costCents: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      current.costCents += entry.costCents;
      current.inputTokens += entry.inputTokens + entry.cachedInputTokens;
      current.outputTokens += entry.outputTokens;
      map.set(entry.provider, current);
    }
    return Array.from(map.values()).sort((a, b) => b.costCents - a.costCents);
  }, [providerRows]);

  const billingTypeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of providerRows) {
      map.set(entry.billingType, (map.get(entry.billingType) ?? 0) + entry.costCents);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [providerRows]);

  const providerBudgetShare =
    budgetMonthlyCents > 0 && totalCompanySpendCents > 0
      ? (row.costCents / totalCompanySpendCents) * budgetMonthlyCents
      : budgetMonthlyCents;
  const budgetPct =
    providerBudgetShare > 0
      ? Math.min(100, (row.costCents / providerBudgetShare) * 100)
      : 0;

  const inTok = formatTokens(row.inputTokens + row.cachedInputTokens);
  const outTok = formatTokens(row.outputTokens);

  const meteredLine =
    row.apiRunCount > 0
      ? t("paperclip.costsPage.costCardMeteredRuns", { count: row.apiRunCount })
      : t("paperclip.costsPage.costCardMeteredRunsZero");
  const subLine =
    row.subscriptionRunCount > 0
      ? t("paperclip.costsPage.costCardSubRuns", { count: row.subscriptionRunCount })
      : t("paperclip.costsPage.costCardSubRunsZero");

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-0 gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">
              {providerDisplayName(row.biller)}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {t("paperclip.costsPage.costCardTokensInOut", { inTok, outTok })}
              {" · "}
              {t("paperclip.costsPage.costCardProvider", { count: row.providerCount })}
              {" · "}
              {t("paperclip.costsPage.costCardModel", { count: row.modelCount })}
            </CardDescription>
          </div>
          <span className="text-xl font-bold tabular-nums shrink-0">
            {formatCents(row.costCents)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-3 space-y-4">
        {budgetMonthlyCents > 0 && (
          <QuotaBar
            label={t("paperclip.costsPage.costCardPeriodSpend")}
            percentUsed={budgetPct}
            leftLabel={formatCents(row.costCents)}
            rightLabel={t("paperclip.costsPage.costCardAllocationPct", { pct: Math.round(budgetPct) })}
          />
        )}

        <div className="text-xs text-muted-foreground">
          {meteredLine}
          {" · "}
          {subLine}
          {" · "}
          {t("paperclip.costsPage.costCardWeekSpend", { amount: formatCents(weekSpendCents) })}
        </div>

        {billingTypeBreakdown.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("paperclip.costsPage.costCardBillingTypes")}
              </p>
              <div className="space-y-1.5">
                {billingTypeBreakdown.map(([billingType, costCents]) => (
                  <div key={billingType} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{billingTypeDisplayName(billingType as never)}</span>
                    <span className="font-medium tabular-nums">{formatCents(costCents)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {providerBreakdown.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {t("paperclip.costsPage.costCardUpstreamProviders")}
              </p>
              <div className="space-y-1.5">
                {providerBreakdown.map((entry) => (
                  <div key={entry.provider} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{providerDisplayName(entry.provider)}</span>
                    <div className="text-right tabular-nums">
                      <div className="font-medium">{formatCents(entry.costCents)}</div>
                      <div className="text-muted-foreground">
                        {formatTokens(entry.inputTokens + entry.outputTokens)} tok
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

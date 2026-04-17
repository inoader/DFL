"use client";

import type { MarketAccount } from "@dfl/sdk";
import {
  shortenAddress,
  formatBps,
  formatTokenAmount,
  marketStatusLabel,
} from "../lib/format";
import { useLanguage } from "./providers";
import { Card, CardContent } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { TokenLabel } from "./token-pair-label";

type BodyProps = {
  market: MarketAccount;
  collateralDecimals: number | null;
  debtDecimals: number | null;
};

export function MarketDetailBody({
  market,
  collateralDecimals,
  debtDecimals,
}: BodyProps) {
  const colDec = collateralDecimals ?? 9;
  const dbtDec = debtDecimals ?? 6;
  const { copy, language } = useLanguage();

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={copy.marketDetail.totalCollateral}
          value={formatTokenAmount(market.totalCollateralAmount, colDec)}
        />
        <StatCard
          label={copy.marketDetail.totalDebt}
          value={formatTokenAmount(market.totalDebtPrincipal, dbtDec)}
        />
        <StatCard
          label={copy.marketDetail.reserves}
          value={formatTokenAmount(market.totalReserves, dbtDec)}
        />
        <StatCard
          label={copy.marketDetail.badDebt}
          value={formatTokenAmount(market.totalBadDebt, dbtDec)}
        />
      </div>

      <Tabs defaultValue="risk">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="risk">{copy.marketDetail.riskParameters}</TabsTrigger>
          <TabsTrigger value="interest">
            {copy.marketDetail.interestRateModel}
          </TabsTrigger>
          <TabsTrigger value="addresses">
            {copy.marketDetail.keyAddresses}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="risk">
          <Card className="border-slate-200 bg-slate-50/90 shadow-none dark:border-slate-700 dark:bg-slate-800/80">
            <CardContent className="p-5">
              <ul className="space-y-3 text-sm">
                <ParamItem
                  label={copy.marketDetail.maxLtv}
                  value={formatBps(market.maxLtvBps)}
                />
                <ParamItem
                  label={copy.marketDetail.liquidationThreshold}
                  value={formatBps(market.liquidationThresholdBps)}
                />
                <ParamItem
                  label={copy.marketDetail.liquidationBonus}
                  value={formatBps(market.liquidationBonusBps)}
                />
                <ParamItem
                  label={copy.marketDetail.closeFactor}
                  value={formatBps(market.closeFactorBps)}
                />
                <ParamItem
                  label={copy.marketDetail.reserveFactor}
                  value={formatBps(market.reserveFactorBps)}
                />
                <ParamItem
                  label={copy.marketDetail.minBorrow}
                  value={formatTokenAmount(market.minBorrowAmount, dbtDec)}
                />
                <ParamItem
                  label={copy.marketDetail.minCollateral}
                  value={formatTokenAmount(market.minCollateralAmount, colDec)}
                />
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interest">
          <Card className="border-slate-200 bg-slate-50/90 shadow-none dark:border-slate-700 dark:bg-slate-800/80">
            <CardContent className="p-5">
              <ul className="space-y-3 text-sm">
                <ParamItem
                  label={copy.marketDetail.baseRate}
                  value={formatBps(market.baseRateBps)}
                />
                <ParamItem
                  label={copy.marketDetail.kinkUtilization}
                  value={formatBps(market.kinkUtilizationBps)}
                />
                <ParamItem
                  label={copy.marketDetail.slope1}
                  value={formatBps(market.slope1Bps)}
                />
                <ParamItem
                  label={copy.marketDetail.slope2}
                  value={formatBps(market.slope2Bps)}
                />
                <ParamItem
                  label={copy.marketDetail.borrowCap}
                  value={formatTokenAmount(market.borrowCap, dbtDec)}
                />
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="addresses">
          <Card className="border-slate-200 bg-slate-50/90 shadow-none dark:border-slate-700 dark:bg-slate-800/80">
            <CardContent className="p-5">
              <ul className="space-y-3 text-sm">
                <ParamItem
                  label={copy.marketDetail.marketAddress}
                  value={shortenAddress(market.address, 8)}
                />
                <ParamItemRich label={copy.marketDetail.collateralMint}>
                  <TokenLabel mint={market.collateralMint} showMint />
                </ParamItemRich>
                <ParamItemRich label={copy.marketDetail.debtMint}>
                  <TokenLabel mint={market.debtMint} showMint />
                </ParamItemRich>
                <ParamItem
                  label={copy.marketDetail.oracleStaleness}
                  value={`${market.oracleStalenessSeconds.toString()} ${copy.marketDetail.seconds}`}
                />
                <ParamItem
                  label={copy.marketDetail.marketStatus}
                  value={marketStatusLabel(market.marketStatus, language)}
                />
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ParamItem({ label, value }: { label: string; value: string }) {
  return (
    <li className="border-b border-slate-200/70 pb-3 last:border-b-0 last:pb-0 dark:border-slate-700/80">
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-right font-semibold text-slate-900 dark:text-slate-100">{value}</span>
      </div>
    </li>
  );
}

function ParamItemRich({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="border-b border-slate-200/70 pb-3 last:border-b-0 last:pb-0 dark:border-slate-700/80">
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-right font-semibold text-slate-900 dark:text-slate-100">
          {children}
        </span>
      </div>
    </li>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-slate-200 bg-white shadow-none dark:border-slate-700 dark:bg-slate-950/70">
      <CardContent className="p-4">
        <span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span>
        <span className="mt-1 block text-lg font-semibold text-slate-900 dark:text-slate-100">
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

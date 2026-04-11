"use client";

import type { MarketAccount } from "@dfl/sdk";
import {
  shortenAddress,
  formatBps,
  marketStatusLabel,
  statusBadgeClass,
} from "../lib/format";
import { useLanguage } from "./providers";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

type Props = {
  markets: MarketAccount[];
  loading: boolean;
  selectedAddress: string | null;
  onSelect: (market: MarketAccount) => void;
  onRefresh: () => void;
};

export function MarketList({
  markets,
  loading,
  selectedAddress,
  onSelect,
  onRefresh,
}: Props) {
  const { copy, language } = useLanguage();

  return (
    <section className="mt-8">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {copy.marketList.title}
        </h2>
        <Button
          variant="secondary"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? copy.marketList.loading : copy.marketList.refresh}
        </Button>
      </div>

      {loading ? (
        <Card className="border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-900/70">
          <CardContent className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
            <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600 align-[-2px] dark:border-slate-700 dark:border-t-teal-400" />
            {copy.marketList.loadingMarkets}
          </CardContent>
        </Card>
      ) : markets.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white/70 dark:border-slate-700 dark:bg-slate-900/60">
          <CardContent className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
            <p>{copy.marketList.emptyTitle}</p>
            <p className="mt-2 text-sm">{copy.marketList.emptyDescription}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {markets.map((market) => (
            <Card
              key={market.address}
              className={[
                "group cursor-pointer overflow-hidden border-white/70 bg-white/90 text-left transition duration-200 hover:-translate-y-1 hover:border-teal-300 hover:shadow-[0_22px_60px_-34px_rgba(13,148,136,0.5)] dark:border-slate-800/80 dark:bg-slate-900/80 dark:hover:border-teal-700 dark:hover:shadow-[0_22px_60px_-34px_rgba(20,184,166,0.28)]",
                market.address === selectedAddress
                  ? "border-teal-300 ring-2 ring-teal-100 dark:border-teal-700 dark:ring-teal-900/50"
                  : "",
              ].join(" ")}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(market)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(market);
                }
              }}
            >
              <CardHeader className="pb-4">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <CardTitle className="text-base">
                    {shortenAddress(market.collateralMint, 4)} /{" "}
                    {shortenAddress(market.debtMint, 4)}
                  </CardTitle>
                  <Badge className={statusBadgeClass(market.marketStatus)}>
                    {marketStatusLabel(market.marketStatus, language)}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {shortenAddress(market.address, 6)}
                </p>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50/90 p-3 transition group-hover:bg-teal-50/80 dark:bg-slate-800/80 dark:group-hover:bg-slate-800">
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {copy.marketList.maxLtv}
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900 dark:text-slate-100">
                    {formatBps(market.maxLtvBps)}
                  </span>
                </div>
                <div className="rounded-2xl bg-slate-50/90 p-3 transition group-hover:bg-teal-50/80 dark:bg-slate-800/80 dark:group-hover:bg-slate-800">
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {copy.marketList.liquidationThreshold}
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900 dark:text-slate-100">
                    {formatBps(market.liquidationThresholdBps)}
                  </span>
                </div>
                <div className="rounded-2xl bg-slate-50/90 p-3 transition group-hover:bg-teal-50/80 dark:bg-slate-800/80 dark:group-hover:bg-slate-800">
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {copy.marketList.baseRate}
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900 dark:text-slate-100">
                    {formatBps(market.baseRateBps)}
                  </span>
                </div>
                <div className="rounded-2xl bg-slate-50/90 p-3 transition group-hover:bg-teal-50/80 dark:bg-slate-800/80 dark:group-hover:bg-slate-800">
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {copy.marketList.liquidationBonus}
                  </span>
                  <span className="mt-1 block font-semibold text-slate-900 dark:text-slate-100">
                    {formatBps(market.liquidationBonusBps)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

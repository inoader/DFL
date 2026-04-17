"use client";

import { ChevronDown } from "lucide-react";
import type { MarketAccount, PositionAccount } from "@dfl/sdk";
import {
  shortenAddress,
  formatBps,
  marketStatusLabel,
  statusBadgeClass,
} from "../lib/format";
import { useLanguage } from "./providers";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { TokenPairLabel } from "./token-pair-label";
import { MarketDetailBody } from "./market-detail";
import { PositionPanel, type ActionType } from "./position-panel";

type Props = {
  markets: MarketAccount[];
  loading: boolean;
  selectedAddress: string | null;
  collateralDecimals: number | null;
  debtDecimals: number | null;
  position: PositionAccount | null;
  positionLoading: boolean;
  walletConnected: boolean;
  onSelect: (market: MarketAccount) => void;
  onRefresh: () => void;
  onAction: (type: ActionType) => void;
};

export function MarketList({
  markets,
  loading,
  selectedAddress,
  collateralDecimals,
  debtDecimals,
  position,
  positionLoading,
  walletConnected,
  onSelect,
  onRefresh,
  onAction,
}: Props) {
  const { copy, language } = useLanguage();

  return (
    <section className="mt-8">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {copy.marketList.title}
        </h2>
        <Button variant="secondary" onClick={onRefresh} disabled={loading}>
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
        <>
          <div className="mb-2 hidden items-center gap-4 px-5 text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:flex sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-6">
              <div className="w-[220px] shrink-0">
                <span>{copy.marketList.marketColumn}</span>
              </div>
              <div className="grid flex-1 grid-cols-4 gap-x-8">
                <span>{copy.marketList.maxLtv}</span>
                <span>{copy.marketList.liquidationThreshold}</span>
                <span>{copy.marketList.baseRate}</span>
                <span>{copy.marketList.liquidationBonus}</span>
              </div>
            </div>
            <div className="size-5 shrink-0" aria-hidden />
          </div>
          <ul className="space-y-3">
          {markets.map((market) => {
            const isOpen = market.address === selectedAddress;
            return (
              <li key={market.address}>
                <Card
                  className={[
                    "overflow-hidden border-white/70 bg-white/90 transition duration-200 dark:border-slate-800/80 dark:bg-slate-900/80",
                    isOpen
                      ? "border-teal-300 shadow-[0_22px_60px_-34px_rgba(13,148,136,0.5)] dark:border-teal-700 dark:shadow-[0_22px_60px_-34px_rgba(20,184,166,0.28)]"
                      : "hover:border-teal-300 hover:shadow-[0_18px_48px_-30px_rgba(13,148,136,0.45)] dark:hover:border-teal-700",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(market)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left sm:px-6"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-6">
                      <div className="flex min-w-0 flex-col gap-1 sm:w-[220px] sm:shrink-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            <TokenPairLabel
                              collateralMint={market.collateralMint}
                              debtMint={market.debtMint}
                              size="md"
                            />
                          </span>
                          <Badge className={statusBadgeClass(market.marketStatus)}>
                            {marketStatusLabel(market.marketStatus, language)}
                          </Badge>
                        </div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {shortenAddress(market.address, 6)}
                        </span>
                      </div>

                      <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 sm:gap-x-8">
                        <Metric
                          label={copy.marketList.maxLtv}
                          value={formatBps(market.maxLtvBps)}
                        />
                        <Metric
                          label={copy.marketList.liquidationThreshold}
                          value={formatBps(market.liquidationThresholdBps)}
                        />
                        <Metric
                          label={copy.marketList.baseRate}
                          value={formatBps(market.baseRateBps)}
                        />
                        <Metric
                          label={copy.marketList.liquidationBonus}
                          value={formatBps(market.liquidationBonusBps)}
                        />
                      </div>
                    </div>

                    <ChevronDown
                      className={[
                        "size-5 shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500",
                        isOpen ? "rotate-180" : "",
                      ].join(" ")}
                      aria-hidden
                    />
                  </button>

                  {isOpen && (
                    <div className="space-y-8 border-t border-slate-200/80 bg-slate-50/60 px-5 py-6 dark:border-slate-700/70 dark:bg-slate-900/40 sm:px-6">
                      <MarketDetailBody
                        market={market}
                        collateralDecimals={collateralDecimals}
                        debtDecimals={debtDecimals}
                      />
                      <div className="border-t border-slate-200/80 pt-6 dark:border-slate-700/70">
                        <PositionPanel
                          market={market}
                          position={position}
                          positionLoading={positionLoading}
                          collateralDecimals={collateralDecimals ?? 9}
                          debtDecimals={debtDecimals ?? 6}
                          onAction={onAction}
                          walletConnected={walletConnected}
                        />
                      </div>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
          </ul>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-slate-500 dark:text-slate-400 sm:hidden">
        {label}
      </span>
      <span className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100 sm:mt-0">
        {value}
      </span>
    </div>
  );
}

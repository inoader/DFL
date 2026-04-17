"use client";

import dynamic from "next/dynamic";
import { useState, useCallback, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { MarketAccount } from "@dfl/sdk";
import { Header } from "../components/header";
import { MarketList } from "../components/market-list";
import type { ActionType } from "../components/position-panel";
import { ActionModal } from "../components/action-modal";
import {
  useLendingClient,
  useMarkets,
  usePosition,
  useTokenDecimals,
} from "../hooks/use-lending";
import { shortenAddress } from "../lib/format";
import { useLanguage } from "../components/providers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

const BaseWalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.BaseWalletMultiButton,
    ),
  { ssr: false },
);

export default function HomePage() {
  const { publicKey } = useWallet();
  const { copy } = useLanguage();
  const client = useLendingClient();
  const { markets, loading: marketsLoading, refresh: refreshMarkets } =
    useMarkets(client);

  const [selectedMarket, setSelectedMarket] =
    useState<MarketAccount | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);

  const {
    position,
    loading: positionLoading,
    refresh: refreshPosition,
  } = usePosition(client, selectedMarket?.address ?? null);

  const colDecimals = useTokenDecimals(
    selectedMarket?.collateralMint ?? null,
  );
  const dbtDecimals = useTokenDecimals(selectedMarket?.debtMint ?? null);

  const handleMarketSelect = useCallback((market: MarketAccount) => {
    setSelectedMarket((current) =>
      current?.address === market.address ? null : market,
    );
  }, []);

  const handleAction = useCallback((type: ActionType) => {
    setActionType(type);
  }, []);

  const handleActionSuccess = useCallback(() => {
    refreshPosition();
    refreshMarkets();
  }, [refreshPosition, refreshMarkets]);

  const activeCount = markets.filter(
    (m) => m.marketStatus === "Active",
  ).length;

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <Card className="border-white/70 bg-white/88 dark:border-slate-800/80 dark:bg-slate-900/75">
          <CardHeader className="px-6 py-8 sm:px-8">
            <CardTitle className="text-3xl sm:text-5xl dark:text-slate-50">
              {copy.home.heroTitle}
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-7 sm:text-base dark:text-slate-300">
              {copy.home.heroDescription}
            </CardDescription>
          </CardHeader>
        </Card>

        <section className="relative z-30 mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatHeroCard
            label={copy.home.totalMarkets}
            value={String(markets.length)}
          />
          <StatHeroCard
            label={copy.home.activeMarkets}
            value={String(activeCount)}
          />
          <WalletHeroCard
            label={copy.home.wallet}
            value={
              publicKey
                ? shortenAddress(publicKey.toBase58(), 6)
                : copy.home.walletDisconnected
            }
            valueClassName={publicKey ? "font-mono tracking-tight" : ""}
            button={
              <BaseWalletMultiButton
                className="h-11 justify-center rounded-2xl px-5 shadow-sm"
                labels={{
                  "no-wallet": copy.header.wallet.noWallet,
                  "has-wallet": copy.header.wallet.hasWallet,
                  connecting: copy.header.wallet.connecting,
                  "copy-address": copy.header.wallet.copyAddress,
                  copied: copy.header.wallet.copied,
                  "change-wallet": copy.header.wallet.changeWallet,
                  disconnect: copy.header.wallet.disconnect,
                }}
              />
            }
          />
        </section>

        <MarketList
          markets={markets}
          loading={marketsLoading}
          selectedAddress={selectedMarket?.address ?? null}
          collateralDecimals={colDecimals}
          debtDecimals={dbtDecimals}
          position={position}
          positionLoading={positionLoading}
          walletConnected={!!publicKey}
          onSelect={handleMarketSelect}
          onRefresh={refreshMarkets}
          onAction={handleAction}
        />

        {actionType && selectedMarket && (
          <ActionModal
            actionType={actionType}
            market={selectedMarket}
            collateralDecimals={colDecimals ?? 9}
            debtDecimals={dbtDecimals ?? 6}
            onClose={() => setActionType(null)}
            onSuccess={handleActionSuccess}
          />
        )}

        <footer className="mt-14 border-t border-slate-200 px-2 pt-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <p>{copy.home.footerTitle}</p>
          <p className="mt-1">{copy.home.footerDescription}</p>
        </footer>
      </main>
    </>
  );
}

function StatHeroCard({
  label,
  value,
  compact = false,
  valueClassName = "",
}: {
  label: string;
  value: string;
  compact?: boolean;
  valueClassName?: string;
}) {
  return (
    <Card className="border-white/70 bg-white/90 dark:border-slate-800/80 dark:bg-slate-900/80">
      <CardContent className="p-5">
        <span className="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span
          className={[
            "mt-2 block font-semibold text-slate-900 dark:text-slate-100",
            compact ? "text-base" : "text-3xl",
            valueClassName,
          ].join(" ")}
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}

function WalletHeroCard({
  label,
  value,
  valueClassName = "",
  button,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  button: ReactNode;
}) {
  return (
    <Card className="border-white/70 bg-white/90 dark:border-slate-800/80 dark:bg-slate-900/80">
      <CardContent className="flex min-h-[116px] flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <span className="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </span>
          <span
            className={[
              "mt-2 block truncate text-base font-semibold text-slate-900 dark:text-slate-100",
              valueClassName,
            ].join(" ")}
          >
            {value}
          </span>
        </div>
        <div className="shrink-0">{button}</div>
      </CardContent>
    </Card>
  );
}

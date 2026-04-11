"use client";

import { useMemo, useState } from "react";
import type { MarketAccount, PositionAccount } from "@dfl/sdk";
import { buildPositionRiskSnapshot, type PriceContext } from "@dfl/sdk";
import { formatTokenAmount, dollarToWad } from "../lib/format";
import { HealthIndicator } from "./health-indicator";
import { useLanguage } from "./providers";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";

export type ActionType =
  | "open_position"
  | "deposit"
  | "borrow"
  | "repay"
  | "withdraw"
  | "liquidate";

type Props = {
  market: MarketAccount;
  position: PositionAccount | null;
  positionLoading: boolean;
  collateralDecimals: number;
  debtDecimals: number;
  onAction: (type: ActionType) => void;
  walletConnected: boolean;
};

export function PositionPanel({
  market,
  position,
  positionLoading,
  collateralDecimals,
  debtDecimals,
  onAction,
  walletConnected,
}: Props) {
  const { copy } = useLanguage();
  const [colPriceInput, setColPriceInput] = useState("150");
  const [debtPriceInput, setDebtPriceInput] = useState("1");

  const riskSnapshot = useMemo(() => {
    if (!position || position.debtPrincipal === 0n) return null;

    const colPrice = parseFloat(colPriceInput);
    const dPrice = parseFloat(debtPriceInput);
    if (isNaN(colPrice) || isNaN(dPrice) || colPrice <= 0 || dPrice <= 0)
      return null;

    try {
      const prices: PriceContext = {
        collateralPriceWad: dollarToWad(colPriceInput),
        debtPriceWad: dollarToWad(debtPriceInput),
        collateralDecimals,
        debtDecimals,
      };
      return buildPositionRiskSnapshot(position, market, prices);
    } catch {
      return null;
    }
  }, [
    position,
    market,
    colPriceInput,
    debtPriceInput,
    collateralDecimals,
    debtDecimals,
  ]);

  if (!walletConnected) {
    return (
      <Card className="mt-8 border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/80">
        <CardContent className="p-6">
          <div className="rounded-3xl border border-dashed border-slate-300 px-6 py-10 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <p>{copy.position.connectPrompt}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (positionLoading) {
    return (
      <Card className="mt-8 border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/80">
        <CardContent className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600 align-[-2px] dark:border-slate-700 dark:border-t-teal-400" />
          {copy.position.loading}
        </CardContent>
      </Card>
    );
  }

  if (!position) {
    return (
      <Card className="mt-8 border-white/70 bg-white/90 dark:border-slate-800/80 dark:bg-slate-900/80">
        <CardHeader>
          <CardTitle>{copy.position.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-3xl border border-dashed border-slate-300 px-6 py-10 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <p>{copy.position.empty}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => onAction("open_position")}>
              {copy.position.openPosition}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasDebt = position.debtPrincipal > 0n;

  return (
    <Card className="mt-8 border-white/70 bg-white/90 dark:border-slate-800/80 dark:bg-slate-900/80">
      <CardHeader className="pb-4">
        <CardTitle>{copy.position.title}</CardTitle>
        <CardDescription>{copy.position.riskDescription}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-slate-200 bg-slate-50 shadow-none dark:border-slate-700 dark:bg-slate-800/80">
            <CardContent className="p-4">
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {copy.position.collateralDeposited}
              </span>
              <span className="mt-1 block text-xl font-semibold text-slate-900 dark:text-slate-100">
                {formatTokenAmount(position.collateralAmount, collateralDecimals)}
              </span>
            </CardContent>
          </Card>
          <Card className="border-slate-200 bg-slate-50 shadow-none dark:border-slate-700 dark:bg-slate-800/80">
            <CardContent className="p-4">
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {copy.position.debtPrincipal}
              </span>
              <span className="mt-1 block text-xl font-semibold text-slate-900 dark:text-slate-100">
                {formatTokenAmount(position.debtPrincipal, debtDecimals)}
              </span>
            </CardContent>
          </Card>
        </div>

        {hasDebt && (
          <Card className="mt-6 border-slate-200 bg-slate-50 shadow-none dark:border-slate-700 dark:bg-slate-800/80">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">
                {copy.position.riskCalculator}
              </CardTitle>
              <CardDescription>
                {copy.position.riskDescription}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
                    {copy.position.collateralPrice}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={colPriceInput}
                    onChange={(e) => setColPriceInput(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">
                    {copy.position.debtPrice}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={debtPriceInput}
                    onChange={(e) => setDebtPriceInput(e.target.value)}
                  />
                </div>
              </div>

              {riskSnapshot && (
                <>
                  <HealthIndicator healthFactorWad={riskSnapshot.healthFactorWad} />
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Card className="border-slate-200 bg-white shadow-none dark:border-slate-700 dark:bg-slate-950/70">
                      <CardContent className="p-4">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {copy.position.borrowLimit}
                        </span>
                        <span className="mt-1 block font-semibold text-slate-900 dark:text-slate-100">
                          ${formatWadDollar(riskSnapshot.borrowLimitValueWad)}
                        </span>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 bg-white shadow-none dark:border-slate-700 dark:bg-slate-950/70">
                      <CardContent className="p-4">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {copy.position.currentDebtValue}
                        </span>
                        <span className="mt-1 block font-semibold text-slate-900 dark:text-slate-100">
                          ${formatWadDollar(riskSnapshot.debtValueWad)}
                        </span>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 bg-white shadow-none dark:border-slate-700 dark:bg-slate-950/70">
                      <CardContent className="p-4">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {copy.position.remainingCapacity}
                        </span>
                        <span className="mt-1 block font-semibold text-slate-900 dark:text-slate-100">
                          ${formatWadDollar(riskSnapshot.remainingBorrowValueWad)}
                        </span>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 bg-white shadow-none dark:border-slate-700 dark:bg-slate-950/70">
                      <CardContent className="p-4">
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {copy.position.liquidatable}
                        </span>
                        <span
                          className="mt-1 block font-semibold"
                          style={{
                            color: riskSnapshot.isLiquidatable ? "#dc2626" : "#16a34a",
                          }}
                        >
                          {riskSnapshot.isLiquidatable
                            ? copy.position.yes
                            : copy.position.no}
                        </span>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => onAction("deposit")}>
            {copy.position.deposit}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onAction("borrow")}
            disabled={market.marketStatus !== "Active"}
          >
            {copy.position.borrow}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onAction("repay")}
            disabled={!hasDebt}
          >
            {copy.position.repay}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onAction("withdraw")}
            disabled={position.collateralAmount === 0n}
          >
            {copy.position.withdraw}
          </Button>
          <Button variant="danger" onClick={() => onAction("liquidate")}>
            {copy.position.liquidate}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const WAD = 1_000_000_000_000_000_000n;

function formatWadDollar(wad: bigint): string {
  const integer = wad / WAD;
  const frac = ((wad % WAD) * 100n) / WAD;
  return `${integer.toLocaleString()}.${frac.toString().padStart(2, "0")}`;
}

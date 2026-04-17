"use client";

import { useTokenInfo } from "../hooks/use-token-info";
import { shortenAddress } from "../lib/format";

type Props = {
  collateralMint: string;
  debtMint: string;
  size?: "sm" | "md" | "lg";
  showAddress?: boolean;
};

export function TokenPairLabel({
  collateralMint,
  debtMint,
  size = "md",
  showAddress = false,
}: Props) {
  const collateral = useTokenInfo(collateralMint);
  const debt = useTokenInfo(debtMint);

  const chars = size === "lg" ? 6 : size === "md" ? 4 : 3;
  const collateralSymbol = collateral?.symbol ?? shortenAddress(collateralMint, chars);
  const debtSymbol = debt?.symbol ?? shortenAddress(debtMint, chars);

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="font-semibold tracking-tight">
        {collateralSymbol}
        <span className="mx-1 text-slate-400 dark:text-slate-500">/</span>
        {debtSymbol}
      </span>
      {showAddress && (
        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
          {shortenAddress(collateralMint, 3)} · {shortenAddress(debtMint, 3)}
        </span>
      )}
    </span>
  );
}

type SingleProps = {
  mint: string;
  fallbackChars?: number;
  showMint?: boolean;
  className?: string;
};

export function TokenLabel({
  mint,
  fallbackChars = 4,
  showMint = false,
  className,
}: SingleProps) {
  const info = useTokenInfo(mint);
  const symbol = info?.symbol ?? shortenAddress(mint, fallbackChars);
  const name = info?.name;

  return (
    <span className={className}>
      <span className="font-semibold">{symbol}</span>
      {name && info?.symbol !== name && (
        <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">({name})</span>
      )}
      {showMint && (
        <span className="ml-2 text-xs font-mono text-slate-400 dark:text-slate-500">
          {shortenAddress(mint, 4)}
        </span>
      )}
    </span>
  );
}

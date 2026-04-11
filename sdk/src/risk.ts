import {
  amountFromValueRoundDown,
  amountFromValueRoundUp,
  applyBorrowIndex,
  borrowLimit,
  healthFactor,
  liquidationLimit,
  mulDiv,
  valueFromAmount,
} from "./math";
import { BPS_DENOMINATOR, WAD, type MarketAccount, type PositionAccount } from "./types";

export type PriceContext = {
  collateralPriceWad: bigint;
  debtPriceWad: bigint;
  collateralDecimals: number;
  debtDecimals: number;
};

export type PositionRiskSnapshot = {
  currentDebtAmount: bigint;
  collateralValueWad: bigint;
  debtValueWad: bigint;
  borrowLimitValueWad: bigint;
  liquidationLimitValueWad: bigint;
  healthFactorWad: bigint;
  remainingBorrowValueWad: bigint;
  isLiquidatable: boolean;
};

export type LiquidationQuote = {
  requestedRepayAmount: bigint;
  actualRepayAmount: bigint;
  seizedCollateralAmount: bigint;
  repayValueWad: bigint;
  seizeValueWad: bigint;
  remainingDebtAmount: bigint;
  remainingCollateralAmount: bigint;
  badDebtAmount: bigint;
};

export function currentDebtAmount(position: PositionAccount, market: MarketAccount): bigint {
  return applyBorrowIndex(
    position.debtPrincipal,
    position.lastBorrowIndex === 0n ? WAD : position.lastBorrowIndex,
    market.borrowIndex === 0n ? WAD : market.borrowIndex,
  );
}

export function buildPositionRiskSnapshot(
  position: PositionAccount,
  market: MarketAccount,
  prices: PriceContext,
): PositionRiskSnapshot {
  const currentDebt = currentDebtAmount(position, market);
  const collateralValueWad = valueFromAmount(
    position.collateralAmount,
    prices.collateralPriceWad,
    prices.collateralDecimals,
  );
  const debtValueWad = valueFromAmount(currentDebt, prices.debtPriceWad, prices.debtDecimals);
  const borrowLimitValueWad = borrowLimit(collateralValueWad, market.maxLtvBps);
  const liquidationLimitValueWad = liquidationLimit(
    collateralValueWad,
    market.liquidationThresholdBps,
  );
  const healthFactorWad = healthFactor(liquidationLimitValueWad, debtValueWad);

  return {
    currentDebtAmount: currentDebt,
    collateralValueWad,
    debtValueWad,
    borrowLimitValueWad,
    liquidationLimitValueWad,
    healthFactorWad,
    remainingBorrowValueWad:
      borrowLimitValueWad > debtValueWad ? borrowLimitValueWad - debtValueWad : 0n,
    isLiquidatable: currentDebt > 0n && healthFactorWad < WAD,
  };
}

export function quoteLiquidation(
  position: PositionAccount,
  market: MarketAccount,
  prices: PriceContext,
  requestedRepayAmount: bigint,
): LiquidationQuote {
  if (requestedRepayAmount <= 0n) {
    throw new RangeError("requestedRepayAmount must be positive");
  }

  const risk = buildPositionRiskSnapshot(position, market, prices);
  const maxCloseAmount = mulDiv(
    risk.currentDebtAmount,
    BigInt(market.closeFactorBps),
    BPS_DENOMINATOR,
  );
  const repayValueCapFromCollateral = mulDiv(
    risk.collateralValueWad,
    BPS_DENOMINATOR,
    BPS_DENOMINATOR + BigInt(market.liquidationBonusBps),
  );
  const maxRepayFromCollateral = amountFromValueRoundDown(
    repayValueCapFromCollateral,
    prices.debtPriceWad,
    prices.debtDecimals,
  );
  const actualRepayAmount = minBigint(
    requestedRepayAmount,
    risk.currentDebtAmount,
    maxCloseAmount,
    maxRepayFromCollateral,
  );

  if (actualRepayAmount <= 0n) {
    throw new RangeError("liquidation repay amount rounds to zero");
  }

  const repayValueWad = valueFromAmount(
    actualRepayAmount,
    prices.debtPriceWad,
    prices.debtDecimals,
  );
  const seizeValueWad = mulDiv(
    repayValueWad,
    BPS_DENOMINATOR + BigInt(market.liquidationBonusBps),
    BPS_DENOMINATOR,
  );
  const seizedCollateralAmount = minBigint(
    amountFromValueRoundUp(seizeValueWad, prices.collateralPriceWad, prices.collateralDecimals),
    position.collateralAmount,
  );
  const remainingDebtAmount = risk.currentDebtAmount - actualRepayAmount;
  const remainingCollateralAmount = position.collateralAmount - seizedCollateralAmount;
  const badDebtAmount = remainingCollateralAmount === 0n ? remainingDebtAmount : 0n;

  return {
    requestedRepayAmount,
    actualRepayAmount,
    seizedCollateralAmount,
    repayValueWad,
    seizeValueWad,
    remainingDebtAmount,
    remainingCollateralAmount,
    badDebtAmount,
  };
}

function minBigint(first: bigint, ...rest: bigint[]): bigint {
  return rest.reduce((minimum, value) => (value < minimum ? value : minimum), first);
}

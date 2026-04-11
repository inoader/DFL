import { BPS_DENOMINATOR, WAD } from "./types";

export type BigintInput = bigint | number | string;

function asBigInt(value: BigintInput): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

export function mulDiv(value: BigintInput, numerator: BigintInput, denominator: BigintInput): bigint {
  const denominatorValue = asBigInt(denominator);
  if (denominatorValue === 0n) {
    throw new RangeError("Division by zero");
  }

  return (asBigInt(value) * asBigInt(numerator)) / denominatorValue;
}

export function mulDivRoundUp(
  value: BigintInput,
  numerator: BigintInput,
  denominator: BigintInput,
): bigint {
  const denominatorValue = asBigInt(denominator);
  if (denominatorValue === 0n) {
    throw new RangeError("Division by zero");
  }

  const product = asBigInt(value) * asBigInt(numerator);
  return (product + denominatorValue - 1n) / denominatorValue;
}

export function applyBps(value: BigintInput, bps: number): bigint {
  if (bps < 0 || bps > Number(BPS_DENOMINATOR)) {
    throw new RangeError(`Invalid bps value: ${bps}`);
  }

  return mulDiv(value, BigInt(bps), BPS_DENOMINATOR);
}

export function valueFromAmount(
  amountRaw: BigintInput,
  priceWad: BigintInput,
  tokenDecimals: number,
): bigint {
  return mulDiv(amountRaw, priceWad, 10n ** BigInt(tokenDecimals));
}

export function amountFromValueRoundDown(
  valueWad: BigintInput,
  priceWad: BigintInput,
  tokenDecimals: number,
): bigint {
  return mulDiv(valueWad, 10n ** BigInt(tokenDecimals), priceWad);
}

export function amountFromValueRoundUp(
  valueWad: BigintInput,
  priceWad: BigintInput,
  tokenDecimals: number,
): bigint {
  return mulDivRoundUp(valueWad, 10n ** BigInt(tokenDecimals), priceWad);
}

export function borrowLimit(collateralValueWad: BigintInput, maxLtvBps: number): bigint {
  return applyBps(collateralValueWad, maxLtvBps);
}

export function liquidationLimit(
  collateralValueWad: BigintInput,
  liquidationThresholdBps: number,
): bigint {
  return applyBps(collateralValueWad, liquidationThresholdBps);
}

export function healthFactor(liquidationLimitValueWad: BigintInput, debtValueWad: BigintInput): bigint {
  const debt = asBigInt(debtValueWad);
  if (debt === 0n) {
    return (1n << 128n) - 1n;
  }

  return mulDiv(liquidationLimitValueWad, WAD, debt);
}

export function applyBorrowIndex(
  principal: BigintInput,
  oldIndex: BigintInput,
  newIndex: BigintInput,
): bigint {
  const principalValue = asBigInt(principal);
  if (principalValue === 0n) {
    return 0n;
  }

  const oldIndexValue = asBigInt(oldIndex);
  if (oldIndexValue === 0n) {
    return principalValue;
  }

  return mulDivRoundUp(principalValue, newIndex, oldIndexValue);
}

export function utilizationBps(
  totalDebtPrincipal: BigintInput,
  liquidityVaultBalance: BigintInput,
  totalReserves: BigintInput = 0n,
): number {
  const debt = asBigInt(totalDebtPrincipal);
  if (debt === 0n) {
    return 0;
  }

  const cash = asBigInt(liquidityVaultBalance) + asBigInt(totalReserves);
  const denominator = cash + debt - asBigInt(totalReserves);
  if (denominator <= 0n) {
    return 0;
  }

  const utilization = mulDiv(debt, BPS_DENOMINATOR, denominator);
  return Number(utilization > BPS_DENOMINATOR ? BPS_DENOMINATOR : utilization);
}

export function currentBorrowRateBps(args: {
  utilizationBps: number;
  baseRateBps: number;
  kinkUtilizationBps: number;
  slope1Bps: number;
  slope2Bps: number;
}): number {
  const kink = Math.max(args.kinkUtilizationBps, 1);
  if (args.utilizationBps <= kink) {
    return args.baseRateBps + Math.floor((args.slope1Bps * args.utilizationBps) / kink);
  }

  const denominator = Math.max(Number(BPS_DENOMINATOR) - kink, 1);
  const excessUtilization = args.utilizationBps - kink;
  return (
    args.baseRateBps +
    args.slope1Bps +
    Math.floor((args.slope2Bps * excessUtilization) / denominator)
  );
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatWad(valueWad: BigintInput, fractionDigits = 4): string {
  const value = asBigInt(valueWad);
  const integer = value / WAD;
  const fractional = value % WAD;
  const scale = 10n ** BigInt(fractionDigits);
  const roundedFractional = (fractional * scale + WAD / 2n) / WAD;

  return `${integer}.${roundedFractional.toString().padStart(fractionDigits, "0")}`;
}

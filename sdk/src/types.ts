export const BPS_DENOMINATOR = 10_000n;
export const WAD = 1_000_000_000_000_000_000n;

export const PROTOCOL_CONFIG_ACCOUNT_SIZE = 117;
export const MARKET_ACCOUNT_SIZE = 502;
export const POSITION_ACCOUNT_SIZE = 113;
export const PRICE_FEED_ID_SIZE = 32;

export const MARKET_STATUS_NAMES = [
  "Active",
  "ReduceOnly",
  "Frozen",
  "Settlement",
] as const;

export type MarketStatus = (typeof MARKET_STATUS_NAMES)[number];

export function marketStatusFromDiscriminant(value: number): MarketStatus {
  const status = MARKET_STATUS_NAMES[value];
  if (!status) {
    throw new RangeError(`Unknown market status discriminant: ${value}`);
  }
  return status;
}

export function marketStatusToDiscriminant(status: MarketStatus): number {
  const value = MARKET_STATUS_NAMES.indexOf(status);
  if (value < 0) {
    throw new RangeError(`Unknown market status: ${status}`);
  }
  return value;
}

export type ProtocolConfigAccount = {
  address: string;
  admin: string;
  pendingAdmin: string;
  paused: boolean;
  allowLiquidationWhenPaused: boolean;
  maxOracleStalenessSeconds: bigint;
  maxConfidenceBps: number;
  feeCollector: string;
  bump: number;
};

export type MarketAccount = {
  address: string;
  authority: string;
  collateralMint: string;
  debtMint: string;
  collateralFeedId: Uint8Array;
  debtFeedId: Uint8Array;
  collateralPriceFeed: string;
  debtPriceFeed: string;
  collateralVault: string;
  liquidityVault: string;
  feeVault: string;
  totalCollateralAmount: bigint;
  totalDebtPrincipal: bigint;
  totalReserves: bigint;
  totalBadDebt: bigint;
  borrowIndex: bigint;
  lastAccrualSlot: bigint;
  lastValidPriceSlot: bigint;
  oracleStalenessSeconds: bigint;
  maxConfidenceBps: number;
  maxLtvBps: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  closeFactorBps: number;
  reserveFactorBps: number;
  minBorrowAmount: bigint;
  minCollateralAmount: bigint;
  baseRateBps: number;
  kinkUtilizationBps: number;
  slope1Bps: number;
  slope2Bps: number;
  borrowCap: bigint;
  debtPriceLowerBoundWad: bigint;
  debtPriceUpperBoundWad: bigint;
  marketStatus: MarketStatus;
  bump: number;
};

export type PositionAccount = {
  address: string;
  owner: string;
  market: string;
  collateralAmount: bigint;
  debtPrincipal: bigint;
  lastBorrowIndex: bigint;
  bump: number;
};

export type MarketSummary = Pick<
  MarketAccount,
  | "address"
  | "collateralMint"
  | "debtMint"
  | "maxLtvBps"
  | "liquidationThresholdBps"
  | "marketStatus"
>;

export type PositionSummary = Pick<
  PositionAccount,
  "address" | "owner" | "market" | "collateralAmount" | "debtPrincipal"
>;

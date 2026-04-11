import { quoteLiquidation, buildPositionRiskSnapshot, type PriceContext } from "./risk";
import { type MarketAccount, type PositionAccount } from "./types";

export type LiquidationCandidate = {
  position: PositionAccount;
  healthFactorWad: bigint;
  currentDebtAmount: bigint;
  maxRepayAmount: bigint;
  estimatedSeizedCollateralAmount: bigint;
};

export function findLiquidationCandidates(args: {
  market: MarketAccount;
  positions: PositionAccount[];
  prices: PriceContext;
}): LiquidationCandidate[] {
  return args.positions
    .filter((position) => position.market === args.market.address)
    .map((position) => {
      const risk = buildPositionRiskSnapshot(position, args.market, args.prices);
      if (!risk.isLiquidatable) {
        return null;
      }

      const quote = quoteLiquidation(position, args.market, args.prices, risk.currentDebtAmount);
      return {
        position,
        healthFactorWad: risk.healthFactorWad,
        currentDebtAmount: risk.currentDebtAmount,
        maxRepayAmount: quote.actualRepayAmount,
        estimatedSeizedCollateralAmount: quote.seizedCollateralAmount,
      };
    })
    .filter((candidate): candidate is LiquidationCandidate => candidate !== null)
    .sort((left, right) => {
      if (left.healthFactorWad === right.healthFactorWad) {
        return left.position.address.localeCompare(right.position.address);
      }

      return left.healthFactorWad < right.healthFactorWad ? -1 : 1;
    });
}

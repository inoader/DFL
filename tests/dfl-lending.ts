import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";

import {
  WAD,
  buildPositionRiskSnapshot,
  borrowInstruction,
  createMarketInstruction,
  findLiquidationCandidates,
  findFeeVaultPda,
  findMarketPda,
  findPositionPda,
  findProtocolConfigPda,
  findVaultAuthorityPda,
  quoteLiquidation,
  type MarketAccount,
  type PositionAccount,
} from "../sdk/src";

describe("DFL non-frontend logic", () => {
  it("derives deterministic protocol PDAs", () => {
    const programId = key(99);
    const collateralMint = key(1);
    const debtMint = key(2);
    const owner = key(3);

    const [config] = findProtocolConfigPda(programId);
    const [market] = findMarketPda(collateralMint, debtMint, programId);
    const [vaultAuthority] = findVaultAuthorityPda(market, programId);
    const [feeVault] = findFeeVaultPda(market, programId);
    const [position] = findPositionPda(market, owner, programId);

    expect(config.toBase58()).to.equal(findProtocolConfigPda(programId)[0].toBase58());
    expect(market.toBase58()).to.equal(findMarketPda(collateralMint, debtMint, programId)[0].toBase58());
    expect(vaultAuthority.toBase58()).to.not.equal(feeVault.toBase58());
    expect(position.toBase58()).to.equal(findPositionPda(market, owner, programId)[0].toBase58());
  });

  it("computes healthy position risk with WAD precision", () => {
    const market = marketFixture();
    const position = positionFixture({
      collateralAmount: 2_000_000_000n,
      debtPrincipal: 100_000_000n,
    });

    const risk = buildPositionRiskSnapshot(position, market, {
      collateralPriceWad: 100n * WAD,
      debtPriceWad: WAD,
      collateralDecimals: 9,
      debtDecimals: 6,
    });

    expect(risk.currentDebtAmount).to.equal(100_000_000n);
    expect(risk.collateralValueWad).to.equal(200n * WAD);
    expect(risk.debtValueWad).to.equal(100n * WAD);
    expect(risk.borrowLimitValueWad).to.equal(150n * WAD);
    expect(risk.liquidationLimitValueWad).to.equal(170n * WAD);
    expect(risk.healthFactorWad).to.equal(17n * WAD / 10n);
    expect(risk.remainingBorrowValueWad).to.equal(50n * WAD);
    expect(risk.isLiquidatable).to.equal(false);
  });

  it("quotes partial liquidation using close factor and bonus", () => {
    const market = marketFixture();
    const position = positionFixture({
      collateralAmount: 2_000_000_000n,
      debtPrincipal: 180_000_000n,
    });

    const quote = quoteLiquidation(
      position,
      market,
      {
        collateralPriceWad: 100n * WAD,
        debtPriceWad: WAD,
        collateralDecimals: 9,
        debtDecimals: 6,
      },
      120_000_000n,
    );

    expect(quote.actualRepayAmount).to.equal(90_000_000n);
    expect(quote.repayValueWad).to.equal(90n * WAD);
    expect(quote.seizeValueWad).to.equal(94_500_000_000_000_000_000n);
    expect(quote.seizedCollateralAmount).to.equal(945_000_000n);
    expect(quote.remainingDebtAmount).to.equal(90_000_000n);
    expect(quote.remainingCollateralAmount).to.equal(1_055_000_000n);
    expect(quote.badDebtAmount).to.equal(0n);
  });

  it("filters and sorts liquidation candidates for keeper logic", () => {
    const market = marketFixture();
    const safePosition = positionFixture({
      address: key(30).toBase58(),
      collateralAmount: 2_000_000_000n,
      debtPrincipal: 100_000_000n,
    });
    const riskyPosition = positionFixture({
      address: key(31).toBase58(),
      collateralAmount: 2_000_000_000n,
      debtPrincipal: 180_000_000n,
    });
    const worsePosition = positionFixture({
      address: key(32).toBase58(),
      collateralAmount: 1_000_000_000n,
      debtPrincipal: 100_000_000n,
    });
    const otherMarketPosition = positionFixture({
      address: key(33).toBase58(),
      market: key(200).toBase58(),
      collateralAmount: 1_000_000_000n,
      debtPrincipal: 100_000_000n,
    });

    const candidates = findLiquidationCandidates({
      market,
      positions: [safePosition, riskyPosition, worsePosition, otherMarketPosition],
      prices: {
        collateralPriceWad: 100n * WAD,
        debtPriceWad: WAD,
        collateralDecimals: 9,
        debtDecimals: 6,
      },
    });

    expect(candidates.map((candidate) => candidate.position.address)).to.deep.equal([
      worsePosition.address,
      riskyPosition.address,
    ]);
    expect(candidates[0].maxRepayAmount).to.equal(50_000_000n);
    expect(candidates[1].maxRepayAmount).to.equal(90_000_000n);
  });

  it("builds Anchor-compatible instruction data and account metas", () => {
    const programId = key(99);
    const borrowIx = borrowInstruction({
      programId,
      amount: 42n,
      accounts: {
        owner: key(1),
        protocolConfig: key(2),
        market: key(3),
        position: key(4),
        collateralPriceFeed: key(5),
        debtPriceFeed: key(6),
        collateralMint: key(7),
        debtMint: key(8),
        liquidityVault: key(9),
        userDebtAccount: key(10),
        vaultAuthority: key(11),
        tokenProgram: key(12),
      },
    });

    expect([...borrowIx.data.subarray(0, 8)]).to.deep.equal([228, 253, 131, 202, 207, 116, 89, 18]);
    expect(borrowIx.data.readBigUInt64LE(8)).to.equal(42n);
    expect(borrowIx.keys).to.have.length(12);
    expect(borrowIx.keys[0]).to.include({ isSigner: true, isWritable: true });
    expect(borrowIx.keys[10]).to.include({ isSigner: false, isWritable: false });

    const createMarketIx = createMarketInstruction({
      programId,
      accounts: {
        authority: key(1),
        protocolConfig: key(2),
        market: key(3),
        vaultAuthority: key(4),
        collateralMint: key(5),
        debtMint: key(6),
        collateralPriceFeed: key(7),
        debtPriceFeed: key(8),
        collateralVault: key(9),
        liquidityVault: key(10),
        feeVault: key(11),
        tokenProgram: key(12),
        associatedTokenProgram: key(13),
        systemProgram: key(14),
      },
      params: {
        collateralFeedId: key(7).toBytes(),
        debtFeedId: key(8).toBytes(),
        collateralPriceFeed: key(7),
        debtPriceFeed: key(8),
        oracleStalenessSeconds: 60n,
        maxConfidenceBps: 100,
        maxLtvBps: 7_500,
        liquidationThresholdBps: 8_500,
        liquidationBonusBps: 500,
        closeFactorBps: 5_000,
        reserveFactorBps: 1_000,
        minBorrowAmount: 1n,
        minCollateralAmount: 1n,
        baseRateBps: 100,
        kinkUtilizationBps: 8_000,
        slope1Bps: 400,
        slope2Bps: 2_000,
        borrowCap: 0n,
        debtPriceLowerBoundWad: 0n,
        debtPriceUpperBoundWad: 0n,
        initialMarketStatus: "Active",
      },
    });

    expect([...createMarketIx.data.subarray(0, 8)]).to.deep.equal([103, 226, 97, 235, 200, 188, 251, 254]);
    expect(createMarketIx.data).to.have.length(221);
    expect(createMarketIx.keys).to.have.length(14);
    expect(createMarketIx.keys[10]).to.include({ isSigner: false, isWritable: true });
  });
});

function marketFixture(overrides: Partial<MarketAccount> = {}): MarketAccount {
  return {
    address: key(10).toBase58(),
    authority: key(11).toBase58(),
    collateralMint: key(12).toBase58(),
    debtMint: key(13).toBase58(),
    collateralFeedId: new Uint8Array(32),
    debtFeedId: new Uint8Array(32),
    collateralPriceFeed: key(14).toBase58(),
    debtPriceFeed: key(15).toBase58(),
    collateralVault: key(16).toBase58(),
    liquidityVault: key(17).toBase58(),
    feeVault: key(18).toBase58(),
    totalCollateralAmount: 0n,
    totalDebtPrincipal: 0n,
    totalReserves: 0n,
    totalBadDebt: 0n,
    borrowIndex: WAD,
    lastAccrualSlot: 0n,
    lastValidPriceSlot: 0n,
    oracleStalenessSeconds: 60n,
    maxConfidenceBps: 100,
    maxLtvBps: 7_500,
    liquidationThresholdBps: 8_500,
    liquidationBonusBps: 500,
    closeFactorBps: 5_000,
    reserveFactorBps: 1_000,
    minBorrowAmount: 1n,
    minCollateralAmount: 1n,
    baseRateBps: 100,
    kinkUtilizationBps: 8_000,
    slope1Bps: 400,
    slope2Bps: 2_000,
    borrowCap: 0n,
    debtPriceLowerBoundWad: 0n,
    debtPriceUpperBoundWad: 0n,
    marketStatus: "Active",
    bump: 255,
    ...overrides,
  };
}

function positionFixture(overrides: Partial<PositionAccount> = {}): PositionAccount {
  return {
    address: key(20).toBase58(),
    owner: key(21).toBase58(),
    market: key(10).toBase58(),
    collateralAmount: 0n,
    debtPrincipal: 0n,
    lastBorrowIndex: WAD,
    bump: 255,
    ...overrides,
  };
}

function key(seed: number): PublicKey {
  return new PublicKey(Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256));
}

import { PublicKey } from "@solana/web3.js";
import { expect } from "chai";
import { describe, it } from "mocha";

import {
  BPS_DENOMINATOR,
  MARKET_ACCOUNT_SIZE,
  POSITION_ACCOUNT_SIZE,
  PROTOCOL_CONFIG_ACCOUNT_SIZE,
  WAD,
  amountFromValueRoundDown,
  amountFromValueRoundUp,
  applyBorrowIndex,
  applyBps,
  borrowLimit,
  buildPositionRiskSnapshot,
  currentBorrowRateBps,
  currentDebtAmount,
  decodeMarketAccount,
  decodePositionAccount,
  decodeProtocolConfigAccount,
  depositCollateralInstruction,
  formatBps,
  formatWad,
  healthFactor,
  initializeProtocolInstruction,
  liquidateInstruction,
  liquidationLimit,
  marketStatusFromDiscriminant,
  marketStatusToDiscriminant,
  mulDiv,
  mulDivRoundUp,
  quoteLiquidation,
  repayInstruction,
  setProtocolPauseInstruction,
  updateMarketParamsInstruction,
  utilizationBps,
  valueFromAmount,
  withdrawCollateralInstruction,
  type MarketAccount,
  type PositionAccount,
} from "../sdk/src";

describe("SDK math primitives", () => {
  it("mulDiv rounds down and mulDivRoundUp ceilings", () => {
    expect(mulDiv(7n, 3n, 2n)).to.equal(10n);
    expect(mulDivRoundUp(7n, 3n, 2n)).to.equal(11n);
    expect(mulDiv(0n, 100n, 7n)).to.equal(0n);
  });

  it("mulDiv rejects zero denominator", () => {
    expect(() => mulDiv(1n, 1n, 0n)).to.throw(RangeError);
    expect(() => mulDivRoundUp(1n, 1n, 0n)).to.throw(RangeError);
  });

  it("applyBps clamps to 0..=10000 and rejects out-of-range", () => {
    expect(applyBps(1_000n * WAD, 7_500)).to.equal(750n * WAD);
    expect(applyBps(1_000n * WAD, 10_000)).to.equal(1_000n * WAD);
    expect(applyBps(1_000n * WAD, 0)).to.equal(0n);
    expect(() => applyBps(1n, -1)).to.throw(RangeError);
    expect(() => applyBps(1n, 10_001)).to.throw(RangeError);
  });

  it("value/amount conversions are inverse with rounding", () => {
    const price = 2n * WAD;
    expect(valueFromAmount(1_000_000n, price, 6)).to.equal(2n * WAD);
    expect(amountFromValueRoundDown(2n * WAD, price, 6)).to.equal(1_000_000n);
    expect(amountFromValueRoundUp(1n, price, 6)).to.equal(1n);
  });
});

describe("SDK interest rate model", () => {
  it("utilization returns 0 when debt is zero", () => {
    expect(utilizationBps(0n, 100n, 0n)).to.equal(0);
  });

  it("utilization excludes reserves from both sides (Compound form)", () => {
    expect(utilizationBps(50n, 50n, 10n)).to.equal(5_000);
    expect(utilizationBps(90n, 10n, 0n)).to.equal(9_000);
  });

  it("jump-rate model matches on-chain Market::current_borrow_rate_bps", () => {
    const model = {
      baseRateBps: 100,
      kinkUtilizationBps: 8_000,
      slope1Bps: 400,
      slope2Bps: 2_000,
    };

    expect(currentBorrowRateBps({ utilizationBps: 0, ...model })).to.equal(100);
    expect(currentBorrowRateBps({ utilizationBps: 5_000, ...model })).to.equal(350);
    expect(currentBorrowRateBps({ utilizationBps: 8_000, ...model })).to.equal(500);
    expect(currentBorrowRateBps({ utilizationBps: 9_000, ...model })).to.equal(1_500);
    expect(currentBorrowRateBps({ utilizationBps: 10_000, ...model })).to.equal(2_500);
  });

  it("applyBorrowIndex rounds up so debt is never understated", () => {
    expect(applyBorrowIndex(100n, WAD, WAD)).to.equal(100n);
    expect(applyBorrowIndex(100n, WAD, WAD + WAD / 10n)).to.equal(110n);
    expect(applyBorrowIndex(1n, WAD, WAD + 1n)).to.equal(2n);
  });
});

describe("SDK risk and liquidation math", () => {
  it("healthFactor returns infinity on zero debt", () => {
    expect(healthFactor(1n, 0n)).to.equal((1n << 128n) - 1n);
    expect(healthFactor(150n * WAD, 100n * WAD)).to.equal(15n * WAD / 10n);
  });

  it("marks positions liquidatable only when health factor < 1", () => {
    const market = marketFixture();
    const borderline = buildPositionRiskSnapshot(
      positionFixture({ collateralAmount: 1_000_000_000n, debtPrincipal: 85_000_000n }),
      market,
      prices(),
    );
    expect(borderline.healthFactorWad).to.equal(WAD);
    expect(borderline.isLiquidatable).to.equal(false);

    const unhealthy = buildPositionRiskSnapshot(
      positionFixture({ collateralAmount: 1_000_000_000n, debtPrincipal: 90_000_000n }),
      market,
      prices(),
    );
    expect(unhealthy.healthFactorWad < WAD).to.equal(true);
    expect(unhealthy.isLiquidatable).to.equal(true);
  });

  it("borrowLimit and liquidationLimit scale as bps of collateral value", () => {
    const value = 2_000n * WAD;
    expect(borrowLimit(value, 7_500)).to.equal(1_500n * WAD);
    expect(liquidationLimit(value, 8_500)).to.equal(1_700n * WAD);
  });

  it("liquidation quote never seizes more than available collateral", () => {
    // Deeply underwater: 10 USDC of debt against 0.01 unit of collateral (value 1 USDC)
    const market = marketFixture({ liquidationBonusBps: 500, closeFactorBps: 10_000 });
    const position = positionFixture({
      collateralAmount: 10_000_000n,
      debtPrincipal: 10_000_000n,
    });
    const quote = quoteLiquidation(position, market, prices(), 10_000_000n);

    expect(quote.seizedCollateralAmount <= position.collateralAmount).to.equal(true);
    expect(quote.remainingCollateralAmount >= 0n).to.equal(true);
    expect(quote.remainingDebtAmount > 0n).to.equal(true);
    // Conservative double-rounding in mulDiv/mulDivRoundUp prevents over-seizure, but
    // leftover debt after a single partial liquidation is expected for a deeply underwater position.
    expect(quote.actualRepayAmount < position.debtPrincipal).to.equal(true);
  });

  it("liquidation quote clamps repay by debt / close factor / collateral", () => {
    const market = marketFixture({ closeFactorBps: 2_500 });
    const position = positionFixture({
      collateralAmount: 2_000_000_000n,
      debtPrincipal: 200_000_000n,
    });
    const quote = quoteLiquidation(position, market, prices(), 500_000_000n);

    expect(quote.actualRepayAmount).to.equal(50_000_000n);
    expect(quote.remainingDebtAmount).to.equal(150_000_000n);
  });

  it("currentDebtAmount follows the borrow index", () => {
    const market = marketFixture({ borrowIndex: WAD + WAD / 10n });
    const position = positionFixture({ debtPrincipal: 100n, lastBorrowIndex: WAD });
    expect(currentDebtAmount(position, market)).to.equal(110n);
  });
});

describe("SDK instruction builders", () => {
  it("initializeProtocol encodes bool + u64 + u16 + Pubkey", () => {
    const programId = key(1);
    const ix = initializeProtocolInstruction({
      programId,
      accounts: {
        admin: key(10),
        config: key(11),
        systemProgram: key(12),
      },
      params: {
        allowLiquidationWhenPaused: true,
        maxOracleStalenessSeconds: 120n,
        maxConfidenceBps: 150,
        feeCollector: key(13),
      },
    });

    expect(ix.keys).to.have.length(3);
    expect(ix.data).to.have.length(8 + 1 + 8 + 2 + 32);
    expect(ix.data[8]).to.equal(1);
    expect(ix.data.readBigUInt64LE(9)).to.equal(120n);
    expect(ix.data.readUInt16LE(17)).to.equal(150);
  });

  it("setProtocolPause serialises two bool fields after the discriminator", () => {
    const ix = setProtocolPauseInstruction({
      programId: key(1),
      accounts: { admin: key(2), protocolConfig: key(3) },
      params: { paused: true, allowLiquidationWhenPaused: false },
    });
    expect(ix.data).to.have.length(8 + 2);
    expect(ix.data[8]).to.equal(1);
    expect(ix.data[9]).to.equal(0);
    expect(ix.keys[0].isSigner).to.equal(true);
    expect(ix.keys[1].isWritable).to.equal(true);
  });

  it("amount-encoded instructions share the 8-byte discriminator + u64 layout", () => {
    const programId = key(1);
    const common = (key1: number) => ({
      owner: key(key1),
      protocolConfig: key(2),
      market: key(3),
      position: key(4),
    });

    const deposit = depositCollateralInstruction({
      programId,
      amount: 1_000n,
      accounts: {
        owner: key(10),
        market: key(3),
        position: key(4),
        userCollateralAccount: key(5),
        collateralVault: key(6),
        tokenProgram: key(7),
      },
    });
    expect(deposit.data).to.have.length(16);
    expect(deposit.data.readBigUInt64LE(8)).to.equal(1_000n);

    const repay = repayInstruction({
      programId,
      amount: 42n,
      accounts: {
        payer: key(10),
        protocolConfig: key(2),
        market: key(3),
        position: key(4),
        payerDebtAccount: key(5),
        liquidityVault: key(6),
        feeVault: key(7),
        vaultAuthority: key(8),
        tokenProgram: key(9),
      },
    });
    expect(repay.keys).to.have.length(9);
    expect(repay.data.readBigUInt64LE(8)).to.equal(42n);

    const withdraw = withdrawCollateralInstruction({
      programId,
      amount: 7n,
      accounts: {
        owner: key(10),
        protocolConfig: key(2),
        market: key(3),
        position: key(4),
        collateralPriceFeed: key(5),
        debtPriceFeed: key(6),
        collateralMint: key(7),
        debtMint: key(8),
        liquidityVault: key(9),
        collateralVault: key(11),
        userCollateralAccount: key(12),
        vaultAuthority: key(13),
        tokenProgram: key(14),
      },
    });
    expect(withdraw.keys[8].isWritable).to.equal(false); // liquidityVault read-only in withdraw
    expect(withdraw.keys[9].isWritable).to.equal(true); // collateralVault writable

    const liquidate = liquidateInstruction({
      programId,
      repayAmount: 99n,
      accounts: {
        liquidator: key(10),
        protocolConfig: key(2),
        market: key(3),
        position: key(4),
        collateralPriceFeed: key(5),
        debtPriceFeed: key(6),
        collateralMint: key(7),
        debtMint: key(8),
        liquidatorDebtAccount: key(11),
        liquidatorCollateralAccount: key(12),
        liquidityVault: key(13),
        collateralVault: key(14),
        vaultAuthority: key(15),
        tokenProgram: key(16),
      },
    });
    expect(liquidate.data.readBigUInt64LE(8)).to.equal(99n);
    expect(liquidate.keys).to.have.length(14);
    // Omit the `owner` from the base fixture since we constructed the accounts literally above.
    expect(common(10).owner.toBase58()).to.equal(liquidate.keys[0].pubkey.toBase58());
  });

  it("updateMarketParams packs 17 typed fields after the discriminator", () => {
    const ix = updateMarketParamsInstruction({
      programId: key(1),
      accounts: {
        authority: key(2),
        protocolConfig: key(3),
        market: key(4),
        liquidityVault: key(5),
      },
      params: {
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
        borrowCap: 10_000n,
        debtPriceLowerBoundWad: 0n,
        debtPriceUpperBoundWad: 0n,
        marketStatus: "ReduceOnly",
      },
    });

    expect(ix.data).to.have.length(8 + 8 + 2 * 10 + 8 * 3 + 16 * 2 + 1);
    expect(ix.data[ix.data.length - 1]).to.equal(marketStatusToDiscriminant("ReduceOnly"));
  });
});

describe("SDK account decoders (round-trip)", () => {
  it("decodes a synthesized ProtocolConfig byte buffer", () => {
    const buffer = buildProtocolConfigBuffer({
      admin: key(1),
      pendingAdmin: key(2),
      paused: true,
      allowLiquidationWhenPaused: false,
      maxOracleStalenessSeconds: 90n,
      maxConfidenceBps: 200,
      feeCollector: key(3),
      bump: 253,
    });

    const decoded = decodeProtocolConfigAccount(key(42), buffer);
    expect(decoded.admin).to.equal(key(1).toBase58());
    expect(decoded.pendingAdmin).to.equal(key(2).toBase58());
    expect(decoded.paused).to.equal(true);
    expect(decoded.allowLiquidationWhenPaused).to.equal(false);
    expect(decoded.maxOracleStalenessSeconds).to.equal(90n);
    expect(decoded.maxConfidenceBps).to.equal(200);
    expect(decoded.feeCollector).to.equal(key(3).toBase58());
    expect(decoded.bump).to.equal(253);
  });

  it("decodes a synthesized Market byte buffer including 128-bit fields", () => {
    const buffer = buildMarketBuffer();
    const decoded = decodeMarketAccount(key(99), buffer);

    expect(decoded.marketStatus).to.equal("Active");
    expect(decoded.borrowIndex).to.equal(WAD);
    expect(decoded.totalDebtPrincipal).to.equal(12_345_678_901_234_567_890n);
    expect(decoded.totalCollateralAmount).to.equal(1_000n);
    expect(decoded.bump).to.equal(255);
  });

  it("decodes a Position buffer and maps to typed fields", () => {
    const buffer = buildPositionBuffer();
    const decoded = decodePositionAccount(key(1), buffer);

    expect(decoded.collateralAmount).to.equal(7n);
    expect(decoded.debtPrincipal).to.equal(11n);
    expect(decoded.lastBorrowIndex).to.equal(WAD);
    expect(decoded.bump).to.equal(254);
  });

  it("accepts every declared MarketStatus discriminant", () => {
    for (let i = 0; i < 4; i += 1) {
      const status = marketStatusFromDiscriminant(i);
      expect(marketStatusToDiscriminant(status)).to.equal(i);
    }
    expect(() => marketStatusFromDiscriminant(4)).to.throw(RangeError);
  });
});

describe("SDK formatting helpers", () => {
  it("formatBps renders fractional percent", () => {
    expect(formatBps(1_234)).to.equal("12.34%");
    expect(formatBps(0)).to.equal("0.00%");
  });

  it("formatWad rounds to configured digits", () => {
    expect(formatWad(WAD + WAD / 2n)).to.equal("1.5000");
    expect(formatWad(WAD / 3n, 6)).to.equal("0.333333");
  });
});

function prices(): {
  collateralPriceWad: bigint;
  debtPriceWad: bigint;
  collateralDecimals: number;
  debtDecimals: number;
} {
  return {
    collateralPriceWad: 100n * WAD,
    debtPriceWad: WAD,
    collateralDecimals: 9,
    debtDecimals: 6,
  };
}

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

function buildProtocolConfigBuffer(fields: {
  admin: PublicKey;
  pendingAdmin: PublicKey;
  paused: boolean;
  allowLiquidationWhenPaused: boolean;
  maxOracleStalenessSeconds: bigint;
  maxConfidenceBps: number;
  feeCollector: PublicKey;
  bump: number;
}): Uint8Array {
  const buffer = new Uint8Array(PROTOCOL_CONFIG_ACCOUNT_SIZE);
  const view = new DataView(buffer.buffer);
  buffer.set(new Uint8Array(8), 0); // discriminator (unused for decoding)
  buffer.set(fields.admin.toBytes(), 8);
  buffer.set(fields.pendingAdmin.toBytes(), 40);
  buffer[72] = fields.paused ? 1 : 0;
  buffer[73] = fields.allowLiquidationWhenPaused ? 1 : 0;
  view.setBigUint64(74, fields.maxOracleStalenessSeconds, true);
  view.setUint16(82, fields.maxConfidenceBps, true);
  buffer.set(fields.feeCollector.toBytes(), 84);
  buffer[116] = fields.bump;
  return buffer;
}

function buildMarketBuffer(): Uint8Array {
  const buffer = new Uint8Array(MARKET_ACCOUNT_SIZE);
  const view = new DataView(buffer.buffer);
  buffer.set(new Uint8Array(8), 0);
  buffer.set(key(1).toBytes(), 8);
  buffer.set(key(2).toBytes(), 40);
  buffer.set(key(3).toBytes(), 72);
  buffer.set(new Uint8Array(32), 104);
  buffer.set(new Uint8Array(32), 136);
  buffer.set(key(4).toBytes(), 168);
  buffer.set(key(5).toBytes(), 200);
  buffer.set(key(6).toBytes(), 232);
  buffer.set(key(7).toBytes(), 264);
  buffer.set(key(8).toBytes(), 296);
  view.setBigUint64(328, 1_000n, true);
  writeU128(view, 336, 12_345_678_901_234_567_890n);
  writeU128(view, 352, 0n);
  writeU128(view, 368, 0n);
  writeU128(view, 384, WAD);
  view.setBigUint64(400, 0n, true);
  view.setBigUint64(408, 0n, true);
  view.setBigUint64(416, 60n, true);
  view.setUint16(424, 100, true);
  view.setUint16(426, 7_500, true);
  view.setUint16(428, 8_500, true);
  view.setUint16(430, 500, true);
  view.setUint16(432, 5_000, true);
  view.setUint16(434, 1_000, true);
  view.setBigUint64(436, 1n, true);
  view.setBigUint64(444, 1n, true);
  view.setUint16(452, 100, true);
  view.setUint16(454, 8_000, true);
  view.setUint16(456, 400, true);
  view.setUint16(458, 2_000, true);
  view.setBigUint64(460, 0n, true);
  writeU128(view, 468, 0n);
  writeU128(view, 484, 0n);
  buffer[500] = marketStatusToDiscriminant("Active");
  buffer[501] = 255;
  return buffer;
}

function buildPositionBuffer(): Uint8Array {
  const buffer = new Uint8Array(POSITION_ACCOUNT_SIZE);
  const view = new DataView(buffer.buffer);
  buffer.set(new Uint8Array(8), 0);
  buffer.set(key(1).toBytes(), 8);
  buffer.set(key(2).toBytes(), 40);
  view.setBigUint64(72, 7n, true);
  writeU128(view, 80, 11n);
  writeU128(view, 96, WAD);
  buffer[112] = 254;
  return buffer;
}

function writeU128(view: DataView, offset: number, value: bigint): void {
  const mask = (1n << 64n) - 1n;
  view.setBigUint64(offset, value & mask, true);
  view.setBigUint64(offset + 8, value >> 64n, true);
}

// silence unused warnings for named imports kept available to documentation
void BPS_DENOMINATOR;

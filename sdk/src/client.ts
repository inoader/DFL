import { Connection, PublicKey, type Commitment } from "@solana/web3.js";

import {
  findFeeVaultPda,
  findMarketPda,
  findPositionPda,
  findProtocolConfigPda,
  findVaultAuthorityPda,
  toPublicKey,
  type PublicKeyInput,
} from "./pdas";
import {
  MARKET_ACCOUNT_SIZE,
  marketStatusFromDiscriminant,
  POSITION_ACCOUNT_SIZE,
  PROTOCOL_CONFIG_ACCOUNT_SIZE,
  type MarketAccount,
  type PositionAccount,
  type ProtocolConfigAccount,
} from "./types";

export type LendingClientConfig = {
  programId: PublicKeyInput;
  rpcUrl?: string;
  connection?: Connection;
  commitment?: Commitment;
};

export class LendingClient {
  readonly programId: PublicKey;
  readonly connection: Connection;

  constructor(readonly config: LendingClientConfig) {
    this.programId = toPublicKey(config.programId);
    if (config.connection) {
      this.connection = config.connection;
      return;
    }

    if (!config.rpcUrl) {
      throw new Error("Either rpcUrl or connection is required");
    }

    this.connection = new Connection(config.rpcUrl, config.commitment ?? "confirmed");
  }

  findProtocolConfigPda(): [PublicKey, number] {
    return findProtocolConfigPda(this.programId);
  }

  findMarketPda(collateralMint: PublicKeyInput, debtMint: PublicKeyInput): [PublicKey, number] {
    return findMarketPda(collateralMint, debtMint, this.programId);
  }

  findVaultAuthorityPda(market: PublicKeyInput): [PublicKey, number] {
    return findVaultAuthorityPda(market, this.programId);
  }

  findFeeVaultPda(market: PublicKeyInput): [PublicKey, number] {
    return findFeeVaultPda(market, this.programId);
  }

  findPositionPda(market: PublicKeyInput, owner: PublicKeyInput): [PublicKey, number] {
    return findPositionPda(market, owner, this.programId);
  }

  async fetchProtocolConfig(address = this.findProtocolConfigPda()[0]): Promise<ProtocolConfigAccount | null> {
    const account = await this.connection.getAccountInfo(toPublicKey(address));
    if (!account) {
      return null;
    }

    return decodeProtocolConfigAccount(toPublicKey(address), account.data);
  }

  async fetchMarket(address: PublicKeyInput): Promise<MarketAccount | null> {
    const publicKey = toPublicKey(address);
    const account = await this.connection.getAccountInfo(publicKey);
    if (!account) {
      return null;
    }

    return decodeMarketAccount(publicKey, account.data);
  }

  async fetchMarketByMints(
    collateralMint: PublicKeyInput,
    debtMint: PublicKeyInput,
  ): Promise<MarketAccount | null> {
    return this.fetchMarket(this.findMarketPda(collateralMint, debtMint)[0]);
  }

  async fetchMarkets(): Promise<MarketAccount[]> {
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [{ dataSize: MARKET_ACCOUNT_SIZE }],
    });

    return accounts.map((account) => decodeMarketAccount(account.pubkey, account.account.data));
  }

  async fetchPosition(address: PublicKeyInput): Promise<PositionAccount | null> {
    const publicKey = toPublicKey(address);
    const account = await this.connection.getAccountInfo(publicKey);
    if (!account) {
      return null;
    }

    return decodePositionAccount(publicKey, account.data);
  }

  async fetchPositionByOwner(market: PublicKeyInput, owner: PublicKeyInput): Promise<PositionAccount | null> {
    return this.fetchPosition(this.findPositionPda(market, owner)[0]);
  }
}

export function decodeProtocolConfigAccount(
  address: PublicKeyInput,
  data: Uint8Array,
): ProtocolConfigAccount {
  requireAccountSize(data, PROTOCOL_CONFIG_ACCOUNT_SIZE, "ProtocolConfig");
  const view = dataView(data);

  return {
    address: toPublicKey(address).toBase58(),
    admin: readPubkey(data, 8),
    pendingAdmin: readPubkey(data, 40),
    paused: readBool(data, 72),
    allowLiquidationWhenPaused: readBool(data, 73),
    maxOracleStalenessSeconds: readU64(view, 74),
    maxConfidenceBps: readU16(view, 82),
    feeCollector: readPubkey(data, 84),
    bump: data[116],
  };
}

export function decodeMarketAccount(address: PublicKeyInput, data: Uint8Array): MarketAccount {
  requireAccountSize(data, MARKET_ACCOUNT_SIZE, "Market");
  const view = dataView(data);

  return {
    address: toPublicKey(address).toBase58(),
    authority: readPubkey(data, 8),
    collateralMint: readPubkey(data, 40),
    debtMint: readPubkey(data, 72),
    collateralFeedId: readBytes(data, 104, 32),
    debtFeedId: readBytes(data, 136, 32),
    collateralPriceFeed: readPubkey(data, 168),
    debtPriceFeed: readPubkey(data, 200),
    collateralVault: readPubkey(data, 232),
    liquidityVault: readPubkey(data, 264),
    feeVault: readPubkey(data, 296),
    totalCollateralAmount: readU64(view, 328),
    totalDebtPrincipal: readU128(view, 336),
    totalReserves: readU128(view, 352),
    totalBadDebt: readU128(view, 368),
    borrowIndex: readU128(view, 384),
    lastAccrualSlot: readU64(view, 400),
    lastValidPriceSlot: readU64(view, 408),
    oracleStalenessSeconds: readU64(view, 416),
    maxConfidenceBps: readU16(view, 424),
    maxLtvBps: readU16(view, 426),
    liquidationThresholdBps: readU16(view, 428),
    liquidationBonusBps: readU16(view, 430),
    closeFactorBps: readU16(view, 432),
    reserveFactorBps: readU16(view, 434),
    minBorrowAmount: readU64(view, 436),
    minCollateralAmount: readU64(view, 444),
    baseRateBps: readU16(view, 452),
    kinkUtilizationBps: readU16(view, 454),
    slope1Bps: readU16(view, 456),
    slope2Bps: readU16(view, 458),
    borrowCap: readU64(view, 460),
    debtPriceLowerBoundWad: readU128(view, 468),
    debtPriceUpperBoundWad: readU128(view, 484),
    marketStatus: marketStatusFromDiscriminant(data[500]),
    bump: data[501],
  };
}

export function decodePositionAccount(address: PublicKeyInput, data: Uint8Array): PositionAccount {
  requireAccountSize(data, POSITION_ACCOUNT_SIZE, "Position");
  const view = dataView(data);

  return {
    address: toPublicKey(address).toBase58(),
    owner: readPubkey(data, 8),
    market: readPubkey(data, 40),
    collateralAmount: readU64(view, 72),
    debtPrincipal: readU128(view, 80),
    lastBorrowIndex: readU128(view, 96),
    bump: data[112],
  };
}

function requireAccountSize(data: Uint8Array, expectedSize: number, label: string): void {
  if (data.byteLength !== expectedSize) {
    throw new Error(`${label} account has ${data.byteLength} bytes, expected ${expectedSize}`);
  }
}

function dataView(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function readPubkey(data: Uint8Array, offset: number): string {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function readBytes(data: Uint8Array, offset: number, length: number): Uint8Array {
  return Uint8Array.from(data.subarray(offset, offset + length));
}

function readBool(data: Uint8Array, offset: number): boolean {
  return data[offset] !== 0;
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU64(view: DataView, offset: number): bigint {
  return view.getBigUint64(offset, true);
}

function readU128(view: DataView, offset: number): bigint {
  const low = view.getBigUint64(offset, true);
  const high = view.getBigUint64(offset + 8, true);
  return low + (high << 64n);
}

import { PublicKey, TransactionInstruction, type AccountMeta } from "@solana/web3.js";

import { toPublicKey, type PublicKeyInput } from "./pdas";
import { marketStatusToDiscriminant, type MarketStatus } from "./types";

const DISCRIMINATORS = {
  initializeProtocol: [188, 233, 252, 106, 134, 146, 202, 91],
  updateProtocolConfig: [197, 97, 123, 54, 221, 168, 11, 135],
  transferProtocolAdmin: [237, 206, 125, 27, 59, 18, 43, 102],
  acceptProtocolAdmin: [76, 35, 211, 183, 82, 72, 131, 36],
  createMarket: [103, 226, 97, 235, 200, 188, 251, 254],
  fundLiquidity: [92, 113, 223, 209, 191, 118, 31, 8],
  openPosition: [135, 128, 47, 77, 15, 152, 240, 49],
  depositCollateral: [156, 131, 142, 116, 146, 247, 162, 120],
  borrow: [228, 253, 131, 202, 207, 116, 89, 18],
  repay: [234, 103, 67, 82, 208, 234, 219, 166],
  withdrawCollateral: [115, 135, 168, 106, 139, 214, 138, 150],
  liquidate: [223, 179, 226, 125, 48, 46, 39, 74],
  updateMarketParams: [70, 117, 202, 191, 205, 174, 92, 82],
  setProtocolPause: [19, 235, 135, 250, 184, 114, 209, 89],
  setMarketPause: [118, 203, 96, 59, 170, 213, 38, 101],
  collectProtocolFee: [136, 136, 252, 221, 194, 66, 126, 89],
} as const;

export type InitializeProtocolParams = {
  allowLiquidationWhenPaused: boolean;
  maxOracleStalenessSeconds: bigint | number | string;
  maxConfidenceBps: number;
  feeCollector: PublicKeyInput;
};

export type UpdateProtocolConfigArgs = {
  maxOracleStalenessSeconds: bigint | number | string;
  maxConfidenceBps: number;
  feeCollector: PublicKeyInput;
};

export type TransferProtocolAdminArgs = {
  newAdmin: PublicKeyInput;
};

export type CreateMarketParams = {
  collateralFeedId: Uint8Array | number[];
  debtFeedId: Uint8Array | number[];
  collateralPriceFeed: PublicKeyInput;
  debtPriceFeed: PublicKeyInput;
  oracleStalenessSeconds: bigint | number | string;
  maxConfidenceBps: number;
  maxLtvBps: number;
  liquidationThresholdBps: number;
  liquidationBonusBps: number;
  closeFactorBps: number;
  reserveFactorBps: number;
  minBorrowAmount: bigint | number | string;
  minCollateralAmount: bigint | number | string;
  baseRateBps: number;
  kinkUtilizationBps: number;
  slope1Bps: number;
  slope2Bps: number;
  borrowCap: bigint | number | string;
  debtPriceLowerBoundWad: bigint | number | string;
  debtPriceUpperBoundWad: bigint | number | string;
  initialMarketStatus: MarketStatus;
};

export type UpdateMarketParamsArgs = Omit<
  CreateMarketParams,
  "collateralFeedId" | "debtFeedId" | "collateralPriceFeed" | "debtPriceFeed" | "initialMarketStatus"
> & {
  marketStatus: MarketStatus;
};

export type SetProtocolPauseArgs = {
  paused: boolean;
  allowLiquidationWhenPaused: boolean;
};

export type InstructionAccounts<T extends string> = Record<T, PublicKeyInput>;

export function initializeProtocolInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<"admin" | "config" | "systemProgram">;
  params: InitializeProtocolParams;
}): TransactionInstruction {
  const writer = data(DISCRIMINATORS.initializeProtocol);
  writer.bool(args.params.allowLiquidationWhenPaused);
  writer.u64(args.params.maxOracleStalenessSeconds);
  writer.u16(args.params.maxConfidenceBps);
  writer.publicKey(args.params.feeCollector);

  return instruction(args.programId, writer, [
    meta(args.accounts.admin, true, true),
    meta(args.accounts.config, false, true),
    meta(args.accounts.systemProgram, false, false),
  ]);
}

export function updateProtocolConfigInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<"admin" | "protocolConfig">;
  params: UpdateProtocolConfigArgs;
}): TransactionInstruction {
  const writer = data(DISCRIMINATORS.updateProtocolConfig);
  writer.u64(args.params.maxOracleStalenessSeconds);
  writer.u16(args.params.maxConfidenceBps);
  writer.publicKey(args.params.feeCollector);

  return instruction(args.programId, writer, [
    meta(args.accounts.admin, true, true),
    meta(args.accounts.protocolConfig, false, true),
  ]);
}

export function transferProtocolAdminInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<"admin" | "protocolConfig">;
  params: TransferProtocolAdminArgs;
}): TransactionInstruction {
  const writer = data(DISCRIMINATORS.transferProtocolAdmin);
  writer.publicKey(args.params.newAdmin);

  return instruction(args.programId, writer, [
    meta(args.accounts.admin, true, true),
    meta(args.accounts.protocolConfig, false, true),
  ]);
}

export function acceptProtocolAdminInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<"pendingAdmin" | "protocolConfig">;
}): TransactionInstruction {
  return instruction(args.programId, data(DISCRIMINATORS.acceptProtocolAdmin), [
    meta(args.accounts.pendingAdmin, true, false),
    meta(args.accounts.protocolConfig, false, true),
  ]);
}

export function createMarketInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<
    | "authority"
    | "protocolConfig"
    | "market"
    | "vaultAuthority"
    | "collateralMint"
    | "debtMint"
    | "collateralPriceFeed"
    | "debtPriceFeed"
    | "collateralVault"
    | "liquidityVault"
    | "feeVault"
    | "tokenProgram"
    | "associatedTokenProgram"
    | "systemProgram"
  >;
  params: CreateMarketParams;
}): TransactionInstruction {
  const writer = data(DISCRIMINATORS.createMarket);
  encodeCreateMarketParams(writer, args.params);

  return instruction(args.programId, writer, [
    meta(args.accounts.authority, true, true),
    meta(args.accounts.protocolConfig, false, false),
    meta(args.accounts.market, false, true),
    meta(args.accounts.vaultAuthority, false, false),
    meta(args.accounts.collateralMint, false, false),
    meta(args.accounts.debtMint, false, false),
    meta(args.accounts.collateralPriceFeed, false, false),
    meta(args.accounts.debtPriceFeed, false, false),
    meta(args.accounts.collateralVault, false, true),
    meta(args.accounts.liquidityVault, false, true),
    meta(args.accounts.feeVault, false, true),
    meta(args.accounts.tokenProgram, false, false),
    meta(args.accounts.associatedTokenProgram, false, false),
    meta(args.accounts.systemProgram, false, false),
  ]);
}

export function fundLiquidityInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<
    "authority" | "protocolConfig" | "market" | "fundingSource" | "liquidityVault" | "tokenProgram"
  >;
  amount: bigint | number | string;
}): TransactionInstruction {
  return amountInstruction(DISCRIMINATORS.fundLiquidity, args.programId, args.amount, [
    meta(args.accounts.authority, true, true),
    meta(args.accounts.protocolConfig, false, false),
    meta(args.accounts.market, false, true),
    meta(args.accounts.fundingSource, false, true),
    meta(args.accounts.liquidityVault, false, true),
    meta(args.accounts.tokenProgram, false, false),
  ]);
}

export function openPositionInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<"owner" | "market" | "position" | "systemProgram">;
}): TransactionInstruction {
  return instruction(args.programId, data(DISCRIMINATORS.openPosition), [
    meta(args.accounts.owner, true, true),
    meta(args.accounts.market, false, false),
    meta(args.accounts.position, false, true),
    meta(args.accounts.systemProgram, false, false),
  ]);
}

export function depositCollateralInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<
    "owner" | "market" | "position" | "userCollateralAccount" | "collateralVault" | "tokenProgram"
  >;
  amount: bigint | number | string;
}): TransactionInstruction {
  return amountInstruction(DISCRIMINATORS.depositCollateral, args.programId, args.amount, [
    meta(args.accounts.owner, true, true),
    meta(args.accounts.market, false, true),
    meta(args.accounts.position, false, true),
    meta(args.accounts.userCollateralAccount, false, true),
    meta(args.accounts.collateralVault, false, true),
    meta(args.accounts.tokenProgram, false, false),
  ]);
}

export function borrowInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<
    | "owner"
    | "protocolConfig"
    | "market"
    | "position"
    | "collateralPriceFeed"
    | "debtPriceFeed"
    | "collateralMint"
    | "debtMint"
    | "liquidityVault"
    | "userDebtAccount"
    | "vaultAuthority"
    | "tokenProgram"
  >;
  amount: bigint | number | string;
}): TransactionInstruction {
  return amountInstruction(DISCRIMINATORS.borrow, args.programId, args.amount, [
    meta(args.accounts.owner, true, true),
    meta(args.accounts.protocolConfig, false, false),
    meta(args.accounts.market, false, true),
    meta(args.accounts.position, false, true),
    meta(args.accounts.collateralPriceFeed, false, false),
    meta(args.accounts.debtPriceFeed, false, false),
    meta(args.accounts.collateralMint, false, false),
    meta(args.accounts.debtMint, false, false),
    meta(args.accounts.liquidityVault, false, true),
    meta(args.accounts.userDebtAccount, false, true),
    meta(args.accounts.vaultAuthority, false, false),
    meta(args.accounts.tokenProgram, false, false),
  ]);
}

export function repayInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<
    | "payer"
    | "protocolConfig"
    | "market"
    | "position"
    | "payerDebtAccount"
    | "liquidityVault"
    | "feeVault"
    | "vaultAuthority"
    | "tokenProgram"
  >;
  amount: bigint | number | string;
}): TransactionInstruction {
  return amountInstruction(DISCRIMINATORS.repay, args.programId, args.amount, [
    meta(args.accounts.payer, true, true),
    meta(args.accounts.protocolConfig, false, false),
    meta(args.accounts.market, false, true),
    meta(args.accounts.position, false, true),
    meta(args.accounts.payerDebtAccount, false, true),
    meta(args.accounts.liquidityVault, false, true),
    meta(args.accounts.feeVault, false, true),
    meta(args.accounts.vaultAuthority, false, false),
    meta(args.accounts.tokenProgram, false, false),
  ]);
}

export function withdrawCollateralInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<
    | "owner"
    | "protocolConfig"
    | "market"
    | "position"
    | "collateralPriceFeed"
    | "debtPriceFeed"
    | "collateralMint"
    | "debtMint"
    | "liquidityVault"
    | "collateralVault"
    | "userCollateralAccount"
    | "vaultAuthority"
    | "tokenProgram"
  >;
  amount: bigint | number | string;
}): TransactionInstruction {
  return amountInstruction(DISCRIMINATORS.withdrawCollateral, args.programId, args.amount, [
    meta(args.accounts.owner, true, true),
    meta(args.accounts.protocolConfig, false, false),
    meta(args.accounts.market, false, true),
    meta(args.accounts.position, false, true),
    meta(args.accounts.collateralPriceFeed, false, false),
    meta(args.accounts.debtPriceFeed, false, false),
    meta(args.accounts.collateralMint, false, false),
    meta(args.accounts.debtMint, false, false),
    meta(args.accounts.liquidityVault, false, false),
    meta(args.accounts.collateralVault, false, true),
    meta(args.accounts.userCollateralAccount, false, true),
    meta(args.accounts.vaultAuthority, false, false),
    meta(args.accounts.tokenProgram, false, false),
  ]);
}

export function liquidateInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<
    | "liquidator"
    | "protocolConfig"
    | "market"
    | "position"
    | "collateralPriceFeed"
    | "debtPriceFeed"
    | "collateralMint"
    | "debtMint"
    | "liquidatorDebtAccount"
    | "liquidatorCollateralAccount"
    | "liquidityVault"
    | "collateralVault"
    | "vaultAuthority"
    | "tokenProgram"
  >;
  repayAmount: bigint | number | string;
}): TransactionInstruction {
  return amountInstruction(DISCRIMINATORS.liquidate, args.programId, args.repayAmount, [
    meta(args.accounts.liquidator, true, true),
    meta(args.accounts.protocolConfig, false, false),
    meta(args.accounts.market, false, true),
    meta(args.accounts.position, false, true),
    meta(args.accounts.collateralPriceFeed, false, false),
    meta(args.accounts.debtPriceFeed, false, false),
    meta(args.accounts.collateralMint, false, false),
    meta(args.accounts.debtMint, false, false),
    meta(args.accounts.liquidatorDebtAccount, false, true),
    meta(args.accounts.liquidatorCollateralAccount, false, true),
    meta(args.accounts.liquidityVault, false, true),
    meta(args.accounts.collateralVault, false, true),
    meta(args.accounts.vaultAuthority, false, false),
    meta(args.accounts.tokenProgram, false, false),
  ]);
}

export function updateMarketParamsInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<"authority" | "protocolConfig" | "market" | "liquidityVault">;
  params: UpdateMarketParamsArgs;
}): TransactionInstruction {
  const writer = data(DISCRIMINATORS.updateMarketParams);
  encodeUpdateMarketParams(writer, args.params);

  return instruction(args.programId, writer, [
    meta(args.accounts.authority, true, true),
    meta(args.accounts.protocolConfig, false, false),
    meta(args.accounts.market, false, true),
    meta(args.accounts.liquidityVault, false, false),
  ]);
}

export function setProtocolPauseInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<"admin" | "protocolConfig">;
  params: SetProtocolPauseArgs;
}): TransactionInstruction {
  const writer = data(DISCRIMINATORS.setProtocolPause);
  writer.bool(args.params.paused);
  writer.bool(args.params.allowLiquidationWhenPaused);

  return instruction(args.programId, writer, [
    meta(args.accounts.admin, true, true),
    meta(args.accounts.protocolConfig, false, true),
  ]);
}

export function setMarketPauseInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<"authority" | "protocolConfig" | "market">;
  status: MarketStatus;
}): TransactionInstruction {
  const writer = data(DISCRIMINATORS.setMarketPause);
  writer.marketStatus(args.status);

  return instruction(args.programId, writer, [
    meta(args.accounts.authority, true, true),
    meta(args.accounts.protocolConfig, false, false),
    meta(args.accounts.market, false, true),
  ]);
}

export function collectProtocolFeeInstruction(args: {
  programId: PublicKeyInput;
  accounts: InstructionAccounts<
    "authority" | "protocolConfig" | "market" | "feeVault" | "vaultAuthority" | "feeDestination" | "tokenProgram"
  >;
  amount: bigint | number | string;
}): TransactionInstruction {
  return amountInstruction(DISCRIMINATORS.collectProtocolFee, args.programId, args.amount, [
    meta(args.accounts.authority, true, true),
    meta(args.accounts.protocolConfig, false, false),
    meta(args.accounts.market, false, true),
    meta(args.accounts.feeVault, false, true),
    meta(args.accounts.vaultAuthority, false, false),
    meta(args.accounts.feeDestination, false, true),
    meta(args.accounts.tokenProgram, false, false),
  ]);
}

function amountInstruction(
  discriminator: readonly number[],
  programId: PublicKeyInput,
  amount: bigint | number | string,
  keys: AccountMeta[],
): TransactionInstruction {
  const writer = data(discriminator);
  writer.u64(amount);
  return instruction(programId, writer, keys);
}

function instruction(
  programId: PublicKeyInput,
  writer: InstructionDataWriter,
  keys: AccountMeta[],
): TransactionInstruction {
  return new TransactionInstruction({
    programId: toPublicKey(programId),
    keys,
    data: Buffer.from(writer.bytes()),
  });
}

function meta(pubkey: PublicKeyInput, isSigner: boolean, isWritable: boolean): AccountMeta {
  return {
    pubkey: toPublicKey(pubkey),
    isSigner,
    isWritable,
  };
}

function encodeCreateMarketParams(writer: InstructionDataWriter, params: CreateMarketParams): void {
  writer.fixedBytes(params.collateralFeedId, 32);
  writer.fixedBytes(params.debtFeedId, 32);
  writer.publicKey(params.collateralPriceFeed);
  writer.publicKey(params.debtPriceFeed);
  encodeSharedMarketParams(writer, params);
  writer.marketStatus(params.initialMarketStatus);
}

function encodeUpdateMarketParams(writer: InstructionDataWriter, params: UpdateMarketParamsArgs): void {
  encodeSharedMarketParams(writer, params);
  writer.marketStatus(params.marketStatus);
}

function encodeSharedMarketParams(
  writer: InstructionDataWriter,
  params: Omit<
    CreateMarketParams,
    "collateralFeedId" | "debtFeedId" | "collateralPriceFeed" | "debtPriceFeed" | "initialMarketStatus"
  >,
): void {
  writer.u64(params.oracleStalenessSeconds);
  writer.u16(params.maxConfidenceBps);
  writer.u16(params.maxLtvBps);
  writer.u16(params.liquidationThresholdBps);
  writer.u16(params.liquidationBonusBps);
  writer.u16(params.closeFactorBps);
  writer.u16(params.reserveFactorBps);
  writer.u64(params.minBorrowAmount);
  writer.u64(params.minCollateralAmount);
  writer.u16(params.baseRateBps);
  writer.u16(params.kinkUtilizationBps);
  writer.u16(params.slope1Bps);
  writer.u16(params.slope2Bps);
  writer.u64(params.borrowCap);
  writer.u128(params.debtPriceLowerBoundWad);
  writer.u128(params.debtPriceUpperBoundWad);
}

function data(discriminator: readonly number[]): InstructionDataWriter {
  return new InstructionDataWriter(discriminator);
}

class InstructionDataWriter {
  private readonly data: number[];

  constructor(discriminator: readonly number[]) {
    this.data = [...discriminator];
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.data);
  }

  bool(value: boolean): void {
    this.data.push(value ? 1 : 0);
  }

  u16(value: number): void {
    const bytes = new Uint8Array(2);
    new DataView(bytes.buffer).setUint16(0, value, true);
    this.push(bytes);
  }

  u64(value: bigint | number | string): void {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
    this.push(bytes);
  }

  u128(value: bigint | number | string): void {
    let remaining = BigInt(value);
    if (remaining < 0n) {
      throw new RangeError("u128 cannot be negative");
    }

    for (let index = 0; index < 16; index += 1) {
      this.data.push(Number(remaining & 0xffn));
      remaining >>= 8n;
    }

    if (remaining !== 0n) {
      throw new RangeError("u128 overflow");
    }
  }

  publicKey(value: PublicKeyInput): void {
    this.push(toPublicKey(value).toBytes());
  }

  marketStatus(status: MarketStatus): void {
    this.data.push(marketStatusToDiscriminant(status));
  }

  fixedBytes(value: Uint8Array | number[], length: number): void {
    const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value);
    if (bytes.length !== length) {
      throw new RangeError(`Expected ${length} bytes, received ${bytes.length}`);
    }

    this.push(bytes);
  }

  private push(bytes: Uint8Array): void {
    for (const byte of bytes) {
      this.data.push(byte);
    }
  }
}

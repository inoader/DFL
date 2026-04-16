/**
 * Creates a market from the bootstrap snapshot, connecting collateral/debt mints
 * with the caller-supplied Pyth-compatible price feeds.
 *
 * Usage:
 *
 *   npm run script:create-market -- \
 *     --collateral-feed <PUBKEY> --debt-feed <PUBKEY>
 *
 * Optional:
 *   --collateral-feed-id <32-byte hex>   # pass-through match for Pyth price-feed identifiers
 *   --debt-feed-id       <32-byte hex>
 *
 * The script derives market / vault / fee_vault PDAs, then invokes create_market with
 * sensible defaults (LTV 75%, LT 85%, liquidation bonus 5%, close factor 50%,
 * reserve factor 10%, jump-rate 1/4/20% @ 80% kink). Tune in-line to taste.
 */
import * as path from "path";

import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import {
  createMarketInstruction,
  findFeeVaultPda,
  findMarketPda,
  findVaultAuthorityPda,
} from "../sdk/src";

import { loadContext, readJson, writeJson } from "./common";

type BootstrapSnapshot = {
  programId: string;
  protocolConfig: string;
  collateralMint: string;
  debtMint: string;
};

type CliOpts = {
  collateralFeed: PublicKey;
  debtFeed: PublicKey;
  collateralFeedId: Uint8Array;
  debtFeedId: Uint8Array;
};

const SNAPSHOT_PATH = path.join(__dirname, "..", "target", "localnet-bootstrap.json");
const OUT_PATH = path.join(__dirname, "..", "target", "localnet-market.json");

async function main(): Promise<void> {
  const ctx = loadContext();
  const snapshot = readJson<BootstrapSnapshot>(SNAPSHOT_PATH);
  const opts = parseArgs();

  const collateralMint = new PublicKey(snapshot.collateralMint);
  const debtMint = new PublicKey(snapshot.debtMint);
  const protocolConfig = new PublicKey(snapshot.protocolConfig);

  const [market] = findMarketPda(collateralMint, debtMint, ctx.programId);
  const [vaultAuthority] = findVaultAuthorityPda(market, ctx.programId);
  const [feeVault] = findFeeVaultPda(market, ctx.programId);
  const collateralVault = getAssociatedTokenAddressSync(collateralMint, vaultAuthority, true);
  const liquidityVault = getAssociatedTokenAddressSync(debtMint, vaultAuthority, true);

  const ix = createMarketInstruction({
    programId: ctx.programId,
    accounts: {
      authority: ctx.payer.publicKey,
      protocolConfig,
      market,
      vaultAuthority,
      collateralMint,
      debtMint,
      collateralPriceFeed: opts.collateralFeed,
      debtPriceFeed: opts.debtFeed,
      collateralVault,
      liquidityVault,
      feeVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    },
    params: {
      collateralFeedId: opts.collateralFeedId,
      debtFeedId: opts.debtFeedId,
      collateralPriceFeed: opts.collateralFeed,
      debtPriceFeed: opts.debtFeed,
      oracleStalenessSeconds: 60n,
      maxConfidenceBps: 150,
      maxLtvBps: 7_500,
      liquidationThresholdBps: 8_500,
      liquidationBonusBps: 500,
      closeFactorBps: 5_000,
      reserveFactorBps: 1_000,
      minBorrowAmount: 1_000_000n,
      minCollateralAmount: 0n,
      baseRateBps: 100,
      kinkUtilizationBps: 8_000,
      slope1Bps: 400,
      slope2Bps: 2_000,
      borrowCap: 10_000_000_000n,
      debtPriceLowerBoundWad: 0n,
      debtPriceUpperBoundWad: 0n,
      initialMarketStatus: "Active",
    },
  });

  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
    .add(ix);
  const signature = await ctx.connection.sendTransaction(tx, [ctx.payer]);
  await ctx.connection.confirmTransaction(signature, "confirmed");
  console.log(`create_market signature: ${signature}`);
  console.log(`market PDA: ${market.toBase58()}`);

  writeJson(OUT_PATH, {
    rpc: ctx.connection.rpcEndpoint,
    programId: ctx.programId,
    protocolConfig,
    market,
    vaultAuthority,
    feeVault,
    collateralVault,
    liquidityVault,
    collateralMint,
    debtMint,
    collateralPriceFeed: opts.collateralFeed,
    debtPriceFeed: opts.debtFeed,
  });
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const collateralFeed = flag("collateral-feed");
  const debtFeed = flag("debt-feed");
  if (!collateralFeed || !debtFeed) {
    throw new Error(
      "Missing required flags. Usage: --collateral-feed <pubkey> --debt-feed <pubkey>",
    );
  }

  const toFeedId = (hex: string | undefined): Uint8Array => {
    if (!hex) {
      return new Uint8Array(32);
    }
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (clean.length !== 64) {
      throw new Error(`Feed id must be 32 bytes (64 hex chars), received ${clean.length}`);
    }
    return Uint8Array.from(Buffer.from(clean, "hex"));
  };

  return {
    collateralFeed: new PublicKey(collateralFeed),
    debtFeed: new PublicKey(debtFeed),
    collateralFeedId: toFeedId(flag("collateral-feed-id")),
    debtFeedId: toFeedId(flag("debt-feed-id")),
  };
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  console.error(`\nCreate market failed:\n${message}`);
  process.exit(1);
});

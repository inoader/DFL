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
 * Pipeline (3 on-chain txs):
 *   1) client-side create_associated_token_account for collateral_vault & liquidity_vault
 *      (both owned by the vault_authority PDA)
 *   2) create_market — wires the market PDA to the mints/feeds/vaults
 *   3) initialize_market_fee_vault — inits the fee_vault PDA (separate ix to keep
 *      create_market's account list small enough for SBPF stack limits)
 */
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import {
  createMarketInstruction,
  findFeeVaultPda,
  findMarketPda,
  findVaultAuthorityPda,
  initializeMarketFeeVaultInstruction,
} from "../sdk/src";

import { loadContext, readJson, snapshotPath, writeJson } from "./common";

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

async function main(): Promise<void> {
  const ctx = loadContext();
  const snapshotPathIn = snapshotPath(ctx, "bootstrap");
  const outPath = snapshotPath(ctx, "market");
  const snapshot = readJson<BootstrapSnapshot>(snapshotPathIn);
  const opts = parseArgs();
  console.log(`Network ......: ${ctx.network}`);
  console.log(`RPC ..........: ${ctx.connection.rpcEndpoint}`);

  const collateralMint = new PublicKey(snapshot.collateralMint);
  const debtMint = new PublicKey(snapshot.debtMint);
  const protocolConfig = new PublicKey(snapshot.protocolConfig);

  const [market] = findMarketPda(collateralMint, debtMint, ctx.programId);
  const [vaultAuthority] = findVaultAuthorityPda(market, ctx.programId);
  const [feeVault] = findFeeVaultPda(market, ctx.programId);
  const collateralVault = getAssociatedTokenAddressSync(collateralMint, vaultAuthority, true);
  const liquidityVault = getAssociatedTokenAddressSync(debtMint, vaultAuthority, true);

  const vaultTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
  );
  const collateralVaultAccount = await ctx.connection.getAccountInfo(collateralVault);
  if (!collateralVaultAccount) {
    vaultTx.add(
      createAssociatedTokenAccountInstruction(
        ctx.payer.publicKey,
        collateralVault,
        vaultAuthority,
        collateralMint,
      ),
    );
  }
  const liquidityVaultAccount = await ctx.connection.getAccountInfo(liquidityVault);
  if (!liquidityVaultAccount) {
    vaultTx.add(
      createAssociatedTokenAccountInstruction(
        ctx.payer.publicKey,
        liquidityVault,
        vaultAuthority,
        debtMint,
      ),
    );
  }
  if (vaultTx.instructions.length > 1) {
    const vaultSignature = await ctx.connection.sendTransaction(vaultTx, [ctx.payer]);
    await ctx.connection.confirmTransaction(vaultSignature, "confirmed");
    console.log(`vault atas signature: ${vaultSignature}`);
  } else {
    console.log("vault ATAs already exist, skipping creation");
  }

  const createIx = createMarketInstruction({
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

  const marketTx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
    .add(createIx);
  const signature = await ctx.connection.sendTransaction(marketTx, [ctx.payer]);
  await ctx.connection.confirmTransaction(signature, "confirmed");
  console.log(`create_market signature: ${signature}`);
  console.log(`market PDA: ${market.toBase58()}`);

  const feeVaultInfo = await ctx.connection.getAccountInfo(feeVault);
  if (!feeVaultInfo) {
    const feeIx = initializeMarketFeeVaultInstruction({
      programId: ctx.programId,
      accounts: {
        authority: ctx.payer.publicKey,
        market,
        vaultAuthority,
        debtMint,
        feeVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      },
    });
    const feeTx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }))
      .add(feeIx);
    const feeSignature = await ctx.connection.sendTransaction(feeTx, [ctx.payer]);
    await ctx.connection.confirmTransaction(feeSignature, "confirmed");
    console.log(`initialize_market_fee_vault signature: ${feeSignature}`);
  } else {
    console.log("fee_vault already initialized, skipping");
  }

  writeJson(outPath, {
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

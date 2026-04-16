/**
 * Localnet bootstrap: initialises the DFL protocol config and mints a pair of
 * SPL tokens to serve as collateral and debt assets.
 *
 * Usage (from the repository root, after `solana-test-validator` and `anchor deploy`):
 *
 *   npm run script:bootstrap
 *
 * Environment variables:
 *   DFL_RPC_URL       - RPC endpoint (default http://127.0.0.1:8899)
 *   DFL_PROGRAM_ID    - on-chain program id (default matches Anchor.toml)
 *   DFL_WALLET        - payer keypair path (default ~/.config/solana/id.json)
 *
 * The script is idempotent; re-running will reuse any existing protocol config.
 */
import * as path from "path";

import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { createMint, createAccount, mintTo } from "@solana/spl-token";

import {
  findProtocolConfigPda,
  initializeProtocolInstruction,
} from "../sdk/src";

import { ensureSolBalance, loadContext, writeJson } from "./common";

const OUT_FILE = path.join(__dirname, "..", "target", "localnet-bootstrap.json");

async function main(): Promise<void> {
  const ctx = loadContext();
  await ensureSolBalance(ctx, ctx.payer.publicKey, 5);

  console.log(`RPC ..........: ${ctx.connection.rpcEndpoint}`);
  console.log(`Payer ........: ${ctx.payer.publicKey.toBase58()}`);
  console.log(`Program id ...: ${ctx.programId.toBase58()}`);

  const [configPda] = findProtocolConfigPda(ctx.programId);
  const existing = await ctx.connection.getAccountInfo(configPda);
  if (existing) {
    console.log(`Protocol config already exists at ${configPda.toBase58()} — skipping init.`);
  } else {
    console.log("Initialising protocol config ...");
    const ix = initializeProtocolInstruction({
      programId: ctx.programId,
      accounts: {
        admin: ctx.payer.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      },
      params: {
        allowLiquidationWhenPaused: true,
        maxOracleStalenessSeconds: 60n,
        maxConfidenceBps: 100,
        feeCollector: ctx.payer.publicKey,
      },
    });

    const tx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 250_000 }))
      .add(ix);
    const signature = await ctx.connection.sendTransaction(tx, [ctx.payer]);
    await ctx.connection.confirmTransaction(signature, "confirmed");
    console.log(`  initialize_protocol: ${signature}`);
  }

  console.log("Creating SPL mints (collateral=9 decimals, debt=6 decimals) ...");
  const collateralMint = await createMint(
    ctx.connection,
    ctx.payer,
    ctx.payer.publicKey,
    null,
    9,
  );
  const debtMint = await createMint(ctx.connection, ctx.payer, ctx.payer.publicKey, null, 6);

  const payerCollateralAta = await createAccount(
    ctx.connection,
    ctx.payer,
    collateralMint,
    ctx.payer.publicKey,
  );
  const payerDebtAta = await createAccount(ctx.connection, ctx.payer, debtMint, ctx.payer.publicKey);

  await mintTo(ctx.connection, ctx.payer, collateralMint, payerCollateralAta, ctx.payer, 1_000_000_000_000n);
  await mintTo(ctx.connection, ctx.payer, debtMint, payerDebtAta, ctx.payer, 1_000_000_000n);

  const snapshot = {
    rpc: ctx.connection.rpcEndpoint,
    programId: ctx.programId,
    admin: ctx.payer.publicKey,
    protocolConfig: configPda,
    collateralMint,
    debtMint,
    payerCollateralAta,
    payerDebtAta,
  };

  writeJson(OUT_FILE, snapshot);
  console.log("\nBootstrap complete. Snapshot written to:");
  console.log(`  ${OUT_FILE}`);
  console.log(
    "\nNext: seed Pyth-compatible price feeds, then run scripts/create-market.ts (see README).",
  );
  inspectFeedHint();
}

function inspectFeedHint(): void {
  console.log(
    "\nTo populate Pyth feeds on your local validator, start it with:\n" +
      "  solana-test-validator \\\n" +
      "    --clone <pyth-feed-pubkey> --url devnet   # e.g. SOL/USD, USDC/USD\n",
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  console.error(`\nBootstrap failed:\n${message}`);
  process.exit(1);
});

// make sure unused publickey import doesn't get trimmed by a downstream bundler
void PublicKey;

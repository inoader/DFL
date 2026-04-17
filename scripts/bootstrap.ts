/**
 * Localnet bootstrap: initialises the DFL protocol config and mints a pair of
 * SPL tokens to serve as collateral and debt assets.
 *
 * Usage (from the repository root, after `solana-test-validator` and `anchor deploy`):
 *
 *   npm run script:bootstrap
 *   npm run script:bootstrap -- --collateral-symbol tSOL --debt-symbol tUSDC
 *
 * Flags (all optional):
 *   --collateral-symbol <SYMBOL>  label shown in UI for collateral (default tSOL)
 *   --collateral-name   <NAME>    long name for collateral (default "Test SOL")
 *   --collateral-decimals <N>     decimals for collateral mint (default 9)
 *   --debt-symbol       <SYMBOL>  label shown in UI for debt (default tUSDC)
 *   --debt-name         <NAME>    long name for debt (default "Test USDC")
 *   --debt-decimals     <N>       decimals for debt mint (default 6)
 *
 * Environment variables:
 *   DFL_RPC_URL       - RPC endpoint (default http://127.0.0.1:8899)
 *   DFL_PROGRAM_ID    - on-chain program id (default matches Anchor.toml)
 *   DFL_WALLET        - payer keypair path (default ~/.config/solana/id.json)
 *   DFL_NETWORK       - snapshot namespace (auto-detected from RPC)
 *
 * The script is idempotent; re-running will reuse any existing protocol config.
 * After minting, symbols are appended to `app/public/token-registry.json` so
 * the frontend displays meaningful asset labels instead of raw addresses.
 */
import * as fs from "fs";
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

import { ensureSolBalance, loadContext, snapshotPath, writeJson } from "./common";

type TokenLabelArgs = {
  collateralSymbol: string;
  collateralName: string;
  collateralDecimals: number;
  debtSymbol: string;
  debtName: string;
  debtDecimals: number;
};

function parseTokenLabelArgs(): TokenLabelArgs {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const toNumber = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 18) {
      throw new Error(`Invalid decimals "${raw}" (expected 0..18)`);
    }
    return n;
  };
  return {
    collateralSymbol: flag("collateral-symbol") ?? "tSOL",
    collateralName: flag("collateral-name") ?? "Test SOL",
    collateralDecimals: toNumber(flag("collateral-decimals"), 9),
    debtSymbol: flag("debt-symbol") ?? "tUSDC",
    debtName: flag("debt-name") ?? "Test USDC",
    debtDecimals: toNumber(flag("debt-decimals"), 6),
  };
}

async function main(): Promise<void> {
  const ctx = loadContext();
  const labels = parseTokenLabelArgs();
  if (ctx.network === "localnet") {
    await ensureSolBalance(ctx, ctx.payer.publicKey, 5);
  }
  const outFile = snapshotPath(ctx, "bootstrap");

  console.log(`Network ......: ${ctx.network}`);
  console.log(`RPC ..........: ${ctx.connection.rpcEndpoint}`);
  console.log(`Payer ........: ${ctx.payer.publicKey.toBase58()}`);
  console.log(`Program id ...: ${ctx.programId.toBase58()}`);
  console.log(
    `Tokens .......: ${labels.collateralSymbol} (${labels.collateralDecimals}d) / ${labels.debtSymbol} (${labels.debtDecimals}d)`,
  );

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

  console.log(
    `Creating SPL mints (collateral=${labels.collateralDecimals} decimals, debt=${labels.debtDecimals} decimals) ...`,
  );
  const collateralMint = await createMint(
    ctx.connection,
    ctx.payer,
    ctx.payer.publicKey,
    null,
    labels.collateralDecimals,
  );
  const debtMint = await createMint(
    ctx.connection,
    ctx.payer,
    ctx.payer.publicKey,
    null,
    labels.debtDecimals,
  );

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

  writeJson(outFile, snapshot);
  console.log("\nBootstrap complete. Snapshot written to:");
  console.log(`  ${outFile}`);

  upsertTokenRegistry({
    [collateralMint.toBase58()]: {
      symbol: labels.collateralSymbol,
      name: labels.collateralName,
      decimals: labels.collateralDecimals,
    },
    [debtMint.toBase58()]: {
      symbol: labels.debtSymbol,
      name: labels.debtName,
      decimals: labels.debtDecimals,
    },
  });

  console.log(
    "\nNext: seed Pyth-compatible price feeds, then run scripts/create-market.ts (see README).",
  );
  inspectFeedHint();
}

function upsertTokenRegistry(
  entries: Record<string, { symbol: string; name: string; decimals: number }>,
): void {
  const registryPath = path.join(
    __dirname,
    "..",
    "app",
    "public",
    "token-registry.json",
  );
  const publicDir = path.dirname(registryPath);
  try {
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(registryPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(registryPath, "utf8"));
      } catch {
        existing = {};
      }
    }
    const merged = { ...existing, ...entries };
    fs.writeFileSync(registryPath, `${JSON.stringify(merged, null, 2)}\n`);
    console.log(`Token registry updated: ${registryPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Could not update token registry at ${registryPath}: ${msg}`);
  }
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

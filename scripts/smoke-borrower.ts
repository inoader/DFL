/**
 * End-to-end borrower smoke test: opens a position, deposits collateral, funds the
 * liquidity vault, borrows, repays, then withdraws. Requires a market created via
 * `scripts/create-market.ts` and live Pyth-compatible price feeds.
 *
 * Usage:
 *
 *   npm run script:smoke-borrower -- --deposit 2000000000 --borrow 1000000 --repay 1000000
 *
 * Flags (all in raw u64 units):
 *   --deposit <u64>  raw collateral amount deposited (default 2_000_000_000 = 2 units @ 9 decimals)
 *   --borrow  <u64>  raw debt amount borrowed
 *   --repay   <u64>  raw debt amount repaid; may exceed borrow to close position
 *   --fund    <u64>  raw debt amount the admin funds into the liquidity vault beforehand
 *
 * The borrower wallet is the same payer as bootstrap.ts — adjust DFL_WALLET to impersonate
 * a different user if needed.
 */
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import {
  borrowInstruction,
  depositCollateralInstruction,
  findPositionPda,
  fundLiquidityInstruction,
  openPositionInstruction,
  repayInstruction,
  withdrawCollateralInstruction,
} from "../sdk/src";

import { loadContext, snapshotPath } from "./common";

type MarketSnapshot = {
  programId: string;
  protocolConfig: string;
  market: string;
  vaultAuthority: string;
  feeVault: string;
  collateralVault: string;
  liquidityVault: string;
  collateralMint: string;
  debtMint: string;
  collateralPriceFeed: string;
  debtPriceFeed: string;
};

type BootstrapSnapshot = {
  payerCollateralAta: string;
  payerDebtAta: string;
};

async function main(): Promise<void> {
  const ctx = loadContext();
  console.log(`Network ......: ${ctx.network}`);
  console.log(`RPC ..........: ${ctx.connection.rpcEndpoint}`);
  const market = loadSnapshot<MarketSnapshot>(snapshotPath(ctx, "market"));
  const bootstrap = loadSnapshot<BootstrapSnapshot>(snapshotPath(ctx, "bootstrap"));
  const opts = parseArgs();

  const programId = ctx.programId;
  const marketPubkey = new PublicKey(market.market);
  const [position] = findPositionPda(marketPubkey, ctx.payer.publicKey, programId);

  const existing = await ctx.connection.getAccountInfo(position);
  const txs: Array<{ label: string; tx: Transaction }> = [];

  const payerCollateralAta = new PublicKey(bootstrap.payerCollateralAta);
  const payerDebtAta = new PublicKey(bootstrap.payerDebtAta);

  if (opts.fund > 0n) {
    txs.push({
      label: `fund_liquidity ${opts.fund}`,
      tx: singleIx(
        fundLiquidityInstruction({
          programId,
          amount: opts.fund,
          accounts: {
            authority: ctx.payer.publicKey,
            protocolConfig: new PublicKey(market.protocolConfig),
            market: marketPubkey,
            fundingSource: payerDebtAta,
            liquidityVault: new PublicKey(market.liquidityVault),
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }),
      ),
    });
  }

  if (!existing) {
    txs.push({
      label: "open_position",
      tx: singleIx(
        openPositionInstruction({
          programId,
          accounts: {
            owner: ctx.payer.publicKey,
            market: marketPubkey,
            position,
            systemProgram: SystemProgram.programId,
          },
        }),
      ),
    });
  } else {
    console.log("Position already exists; skipping open_position.");
  }

  if (opts.deposit > 0n) {
    txs.push({
      label: `deposit_collateral ${opts.deposit}`,
      tx: singleIx(
        depositCollateralInstruction({
          programId,
          amount: opts.deposit,
          accounts: {
            owner: ctx.payer.publicKey,
            market: marketPubkey,
            position,
            userCollateralAccount: payerCollateralAta,
            collateralVault: new PublicKey(market.collateralVault),
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }),
      ),
    });
  }

  if (opts.borrow > 0n) {
    txs.push({
      label: `borrow ${opts.borrow}`,
      tx: singleIx(
        borrowInstruction({
          programId,
          amount: opts.borrow,
          accounts: {
            owner: ctx.payer.publicKey,
            protocolConfig: new PublicKey(market.protocolConfig),
            market: marketPubkey,
            position,
            collateralPriceFeed: new PublicKey(market.collateralPriceFeed),
            debtPriceFeed: new PublicKey(market.debtPriceFeed),
            collateralMint: new PublicKey(market.collateralMint),
            debtMint: new PublicKey(market.debtMint),
            liquidityVault: new PublicKey(market.liquidityVault),
            userDebtAccount: payerDebtAta,
            vaultAuthority: new PublicKey(market.vaultAuthority),
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }),
      ),
    });
  }

  if (opts.repay > 0n) {
    txs.push({
      label: `repay ${opts.repay}`,
      tx: singleIx(
        repayInstruction({
          programId,
          amount: opts.repay,
          accounts: {
            payer: ctx.payer.publicKey,
            protocolConfig: new PublicKey(market.protocolConfig),
            market: marketPubkey,
            position,
            payerDebtAccount: payerDebtAta,
            liquidityVault: new PublicKey(market.liquidityVault),
            feeVault: new PublicKey(market.feeVault),
            vaultAuthority: new PublicKey(market.vaultAuthority),
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }),
      ),
    });
  }

  if (opts.withdraw > 0n) {
    txs.push({
      label: `withdraw_collateral ${opts.withdraw}`,
      tx: singleIx(
        withdrawCollateralInstruction({
          programId,
          amount: opts.withdraw,
          accounts: {
            owner: ctx.payer.publicKey,
            protocolConfig: new PublicKey(market.protocolConfig),
            market: marketPubkey,
            position,
            collateralPriceFeed: new PublicKey(market.collateralPriceFeed),
            debtPriceFeed: new PublicKey(market.debtPriceFeed),
            collateralMint: new PublicKey(market.collateralMint),
            debtMint: new PublicKey(market.debtMint),
            liquidityVault: new PublicKey(market.liquidityVault),
            collateralVault: new PublicKey(market.collateralVault),
            userCollateralAccount: payerCollateralAta,
            vaultAuthority: new PublicKey(market.vaultAuthority),
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        }),
      ),
    });
  }

  for (const entry of txs) {
    const signature = await ctx.connection.sendTransaction(entry.tx, [ctx.payer]);
    await ctx.connection.confirmTransaction(signature, "confirmed");
    console.log(`${entry.label}: ${signature}`);
  }

  console.log("\nSmoke test done.");
}

function singleIx(ix: ReturnType<typeof openPositionInstruction>): Transaction {
  return new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
    .add(ix);
}

function parseArgs(): {
  deposit: bigint;
  borrow: bigint;
  repay: bigint;
  withdraw: bigint;
  fund: bigint;
} {
  const args = process.argv.slice(2);
  const read = (name: string, fallback: bigint): bigint => {
    const index = args.indexOf(`--${name}`);
    if (index < 0) {
      return fallback;
    }
    return BigInt(args[index + 1]);
  };

  return {
    deposit: read("deposit", 2_000_000_000n),
    borrow: read("borrow", 1_000_000n),
    repay: read("repay", 1_000_000n),
    withdraw: read("withdraw", 0n),
    fund: read("fund", 0n),
  };
}

function loadSnapshot<T>(filePath: string): T {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs") as typeof import("fs");
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  console.error(`\nSmoke test failed:\n${message}`);
  process.exit(1);
});

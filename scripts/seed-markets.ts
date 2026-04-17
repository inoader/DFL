/**
 * Seeds a batch of additional test markets on top of an already-bootstrapped
 * protocol. Reuses the existing ProtocolConfig written by `scripts/bootstrap.ts`,
 * creates new SPL mints on demand (one per unique symbol), and registers each
 * pair as a market via `create_market` + `initialize_market_fee_vault`.
 *
 * Usage:
 *
 *   npm run script:seed-markets
 *   npm run script:seed-markets -- --pairs "tBTC:tUSDC,tETH:tUSDC,tSOL:tUSDT"
 *
 * Notes:
 *   - Symbols listed in the existing app/public/token-registry.json (or in a
 *     previous bootstrap snapshot) are reused; unknown symbols mint a fresh
 *     SPL token with sensible defaults (BTC/ETH/SOL = 9d, stablecoins = 6d).
 *   - Price feeds are stubbed with random pubkeys and zero feed ids, matching
 *     the approach used by `scripts/create-market.ts` for local testing.
 *     Borrow/withdraw flows still require real Pyth accounts at runtime.
 *   - Safe to re-run: markets whose PDA already exists are skipped.
 */
import * as fs from "fs";
import * as path from "path";

import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAccount,
  createAssociatedTokenAccountInstruction,
  createMint,
  getAssociatedTokenAddressSync,
  mintTo,
} from "@solana/spl-token";

import {
  createMarketInstruction,
  findFeeVaultPda,
  findMarketPda,
  findVaultAuthorityPda,
  initializeMarketFeeVaultInstruction,
} from "../sdk/src";

import {
  ensureSolBalance,
  loadContext,
  readJson,
  snapshotPath,
  writeJson,
  type ScriptContext,
} from "./common";

type BootstrapSnapshot = {
  programId: string;
  protocolConfig: string;
  collateralMint: string;
  debtMint: string;
};

type TokenMeta = {
  symbol: string;
  name: string;
  decimals: number;
};

type PairSpec = {
  collateral: TokenMeta;
  debt: TokenMeta;
};

type RegistryEntry = {
  symbol: string;
  name: string;
  decimals?: number;
  logoURI?: string;
};

const DEFAULT_PAIRS: PairSpec[] = [
  {
    collateral: { symbol: "tBTC", name: "Test BTC", decimals: 9 },
    debt: { symbol: "tUSDC", name: "Test USDC", decimals: 6 },
  },
  {
    collateral: { symbol: "tETH", name: "Test ETH", decimals: 9 },
    debt: { symbol: "tUSDC", name: "Test USDC", decimals: 6 },
  },
  {
    collateral: { symbol: "tSOL", name: "Test SOL", decimals: 9 },
    debt: { symbol: "tUSDT", name: "Test USDT", decimals: 6 },
  },
];

const TOKEN_DEFAULTS: Record<string, TokenMeta> = {
  tSOL: { symbol: "tSOL", name: "Test SOL", decimals: 9 },
  tBTC: { symbol: "tBTC", name: "Test BTC", decimals: 9 },
  tETH: { symbol: "tETH", name: "Test ETH", decimals: 9 },
  tJUP: { symbol: "tJUP", name: "Test JUP", decimals: 6 },
  tRAY: { symbol: "tRAY", name: "Test RAY", decimals: 6 },
  tUSDC: { symbol: "tUSDC", name: "Test USDC", decimals: 6 },
  tUSDT: { symbol: "tUSDT", name: "Test USDT", decimals: 6 },
};

async function main(): Promise<void> {
  const ctx = loadContext();
  if (ctx.network === "localnet") {
    await ensureSolBalance(ctx, ctx.payer.publicKey, 5);
  }

  const bootstrap = readJson<BootstrapSnapshot>(snapshotPath(ctx, "bootstrap"));
  const protocolConfig = new PublicKey(bootstrap.protocolConfig);

  const pairs = parsePairsArg() ?? DEFAULT_PAIRS;

  console.log(`Network ......: ${ctx.network}`);
  console.log(`RPC ..........: ${ctx.connection.rpcEndpoint}`);
  console.log(`Payer ........: ${ctx.payer.publicKey.toBase58()}`);
  console.log(`Program id ...: ${ctx.programId.toBase58()}`);
  console.log(`Pairs ........: ${pairs.map((p) => `${p.collateral.symbol}/${p.debt.symbol}`).join(", ")}`);

  const registry = loadRegistry();
  const symbolToMint = buildSymbolIndex(registry);

  // Seed well-known bootstrap mints into the symbol index so we don't re-mint
  // a tSOL/tUSDC if those symbols were used by bootstrap.ts.
  if (bootstrap.collateralMint && !symbolToMint.has("tSOL")) {
    const entry = registry[bootstrap.collateralMint];
    if (entry) symbolToMint.set(entry.symbol, new PublicKey(bootstrap.collateralMint));
  }
  if (bootstrap.debtMint && !symbolToMint.has("tUSDC")) {
    const entry = registry[bootstrap.debtMint];
    if (entry) symbolToMint.set(entry.symbol, new PublicKey(bootstrap.debtMint));
  }

  const marketRecords: Array<Record<string, unknown>> = [];

  for (const pair of pairs) {
    const col = pair.collateral;
    const debt = pair.debt;
    console.log(`\n=== ${col.symbol} / ${debt.symbol} ===`);

    const collateralMint = await ensureMint(ctx, col, registry, symbolToMint);
    const debtMint = await ensureMint(ctx, debt, registry, symbolToMint);

    if (collateralMint.equals(debtMint)) {
      console.warn(`  skipping: collateral and debt resolved to the same mint (${col.symbol}=${debt.symbol})`);
      continue;
    }

    const [market] = findMarketPda(collateralMint, debtMint, ctx.programId);
    const [vaultAuthority] = findVaultAuthorityPda(market, ctx.programId);
    const [feeVault] = findFeeVaultPda(market, ctx.programId);
    const collateralVault = getAssociatedTokenAddressSync(collateralMint, vaultAuthority, true);
    const liquidityVault = getAssociatedTokenAddressSync(debtMint, vaultAuthority, true);

    const marketExists = await ctx.connection.getAccountInfo(market);
    if (marketExists) {
      console.log(`  market already exists at ${market.toBase58()} — skipping create`);
      marketRecords.push(
        serialiseMarketRecord({
          ctx,
          pair,
          market,
          vaultAuthority,
          feeVault,
          collateralVault,
          liquidityVault,
          collateralMint,
          debtMint,
          collateralPriceFeed: null,
          debtPriceFeed: null,
        }),
      );
      continue;
    }

    await ensureVaultAtas(ctx, {
      collateralVault,
      liquidityVault,
      vaultAuthority,
      collateralMint,
      debtMint,
    });

    const collateralPriceFeed = Keypair.generate().publicKey;
    const debtPriceFeed = Keypair.generate().publicKey;

    const createIx = createMarketInstruction({
      programId: ctx.programId,
      accounts: {
        authority: ctx.payer.publicKey,
        protocolConfig,
        market,
        vaultAuthority,
        collateralMint,
        debtMint,
        collateralPriceFeed,
        debtPriceFeed,
        collateralVault,
        liquidityVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      },
      params: {
        collateralFeedId: new Uint8Array(32),
        debtFeedId: new Uint8Array(32),
        collateralPriceFeed,
        debtPriceFeed,
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

    const createTx = new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }))
      .add(createIx);
    const createSig = await ctx.connection.sendTransaction(createTx, [ctx.payer]);
    await ctx.connection.confirmTransaction(createSig, "confirmed");
    console.log(`  create_market: ${createSig}`);

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
    const feeSig = await ctx.connection.sendTransaction(feeTx, [ctx.payer]);
    await ctx.connection.confirmTransaction(feeSig, "confirmed");
    console.log(`  initialize_market_fee_vault: ${feeSig}`);

    console.log(`  market PDA: ${market.toBase58()}`);
    console.log(`  collateral feed (stub): ${collateralPriceFeed.toBase58()}`);
    console.log(`  debt feed (stub): ${debtPriceFeed.toBase58()}`);

    marketRecords.push(
      serialiseMarketRecord({
        ctx,
        pair,
        market,
        vaultAuthority,
        feeVault,
        collateralVault,
        liquidityVault,
        collateralMint,
        debtMint,
        collateralPriceFeed,
        debtPriceFeed,
      }),
    );
  }

  persistRegistry(registry);
  const marketsSnapshotPath = snapshotPath(ctx, "markets");
  writeJson(marketsSnapshotPath, { rpc: ctx.connection.rpcEndpoint, markets: marketRecords });
  console.log(`\nSeed complete. Markets snapshot: ${marketsSnapshotPath}`);
}

async function ensureVaultAtas(
  ctx: ScriptContext,
  opts: {
    collateralVault: PublicKey;
    liquidityVault: PublicKey;
    vaultAuthority: PublicKey;
    collateralMint: PublicKey;
    debtMint: PublicKey;
  },
): Promise<void> {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }));
  const collateralInfo = await ctx.connection.getAccountInfo(opts.collateralVault);
  if (!collateralInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        ctx.payer.publicKey,
        opts.collateralVault,
        opts.vaultAuthority,
        opts.collateralMint,
      ),
    );
  }
  const liquidityInfo = await ctx.connection.getAccountInfo(opts.liquidityVault);
  if (!liquidityInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        ctx.payer.publicKey,
        opts.liquidityVault,
        opts.vaultAuthority,
        opts.debtMint,
      ),
    );
  }
  if (tx.instructions.length > 1) {
    const sig = await ctx.connection.sendTransaction(tx, [ctx.payer]);
    await ctx.connection.confirmTransaction(sig, "confirmed");
    console.log(`  vault ATAs: ${sig}`);
  }
}

async function ensureMint(
  ctx: ScriptContext,
  meta: TokenMeta,
  registry: Record<string, RegistryEntry>,
  symbolToMint: Map<string, PublicKey>,
): Promise<PublicKey> {
  const existing = symbolToMint.get(meta.symbol);
  if (existing) {
    console.log(`  reusing ${meta.symbol}: ${existing.toBase58()}`);
    return existing;
  }

  const mint = await createMint(ctx.connection, ctx.payer, ctx.payer.publicKey, null, meta.decimals);
  const ata = await createAccount(ctx.connection, ctx.payer, mint, ctx.payer.publicKey);
  const supply = 10n ** BigInt(meta.decimals) * 1_000_000n; // 1M units of the token
  await mintTo(ctx.connection, ctx.payer, mint, ata, ctx.payer, supply);
  console.log(`  minted ${meta.symbol}: ${mint.toBase58()} (supply ${supply})`);

  registry[mint.toBase58()] = {
    symbol: meta.symbol,
    name: meta.name,
    decimals: meta.decimals,
  };
  symbolToMint.set(meta.symbol, mint);
  return mint;
}

function serialiseMarketRecord(args: {
  ctx: ScriptContext;
  pair: PairSpec;
  market: PublicKey;
  vaultAuthority: PublicKey;
  feeVault: PublicKey;
  collateralVault: PublicKey;
  liquidityVault: PublicKey;
  collateralMint: PublicKey;
  debtMint: PublicKey;
  collateralPriceFeed: PublicKey | null;
  debtPriceFeed: PublicKey | null;
}): Record<string, unknown> {
  return {
    programId: args.ctx.programId,
    collateralSymbol: args.pair.collateral.symbol,
    debtSymbol: args.pair.debt.symbol,
    market: args.market,
    vaultAuthority: args.vaultAuthority,
    feeVault: args.feeVault,
    collateralVault: args.collateralVault,
    liquidityVault: args.liquidityVault,
    collateralMint: args.collateralMint,
    debtMint: args.debtMint,
    collateralPriceFeed: args.collateralPriceFeed,
    debtPriceFeed: args.debtPriceFeed,
  };
}

function parsePairsArg(): PairSpec[] | null {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--pairs");
  if (idx < 0) return null;
  const raw = args[idx + 1];
  if (!raw) {
    throw new Error(`--pairs requires a value like "tBTC:tUSDC,tETH:tUSDC"`);
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [colSym, debtSym] = entry.split(":").map((part) => part.trim());
      if (!colSym || !debtSym) {
        throw new Error(`Invalid pair entry "${entry}" (expected "<collateral>:<debt>")`);
      }
      return {
        collateral: TOKEN_DEFAULTS[colSym] ?? { symbol: colSym, name: `Test ${colSym}`, decimals: 6 },
        debt: TOKEN_DEFAULTS[debtSym] ?? { symbol: debtSym, name: `Test ${debtSym}`, decimals: 6 },
      };
    });
}

function registryPath(): string {
  return path.join(__dirname, "..", "app", "public", "token-registry.json");
}

function loadRegistry(): Record<string, RegistryEntry> {
  const target = registryPath();
  if (!fs.existsSync(target)) return {};
  try {
    return JSON.parse(fs.readFileSync(target, "utf8")) as Record<string, RegistryEntry>;
  } catch {
    return {};
  }
}

function buildSymbolIndex(registry: Record<string, RegistryEntry>): Map<string, PublicKey> {
  const idx = new Map<string, PublicKey>();
  for (const [mint, entry] of Object.entries(registry)) {
    if (!entry?.symbol) continue;
    try {
      idx.set(entry.symbol, new PublicKey(mint));
    } catch {
      // ignore malformed entries
    }
  }
  return idx;
}

function persistRegistry(registry: Record<string, RegistryEntry>): void {
  const target = registryPath();
  const dir = path.dirname(target);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(registry, null, 2)}\n`);
    console.log(`Token registry updated: ${target}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Could not write token registry: ${msg}`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
  console.error(`\nSeed markets failed:\n${message}`);
  process.exit(1);
});

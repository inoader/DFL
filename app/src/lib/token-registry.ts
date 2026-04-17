/**
 * Lightweight token registry for the DFL UI.
 *
 * Resolution order:
 *   1. Built-in well-known mainnet/devnet tokens (hardcoded below).
 *   2. Runtime overrides served at `/token-registry.json` — typically written by
 *      `npm run script:bootstrap` so localnet test mints show meaningful symbols.
 *   3. User-defined overrides via `NEXT_PUBLIC_DFL_TOKEN_LABELS` (JSON env).
 *
 * Unknown mints fall back to truncated base58 at display time.
 */

export type TokenInfo = {
  symbol: string;
  name: string;
  logoURI?: string;
  decimals?: number;
};

const BUILTIN: Record<string, TokenInfo> = {
  So11111111111111111111111111111111111111112: {
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
  },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": {
    symbol: "USDC",
    name: "USD Coin (devnet)",
    decimals: 6,
  },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
  },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: {
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
  },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: {
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
  },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: {
    symbol: "mSOL",
    name: "Marinade staked SOL",
    decimals: 9,
  },
};

function parseEnvOverrides(): Record<string, TokenInfo> {
  const raw = process.env.NEXT_PUBLIC_DFL_TOKEN_LABELS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, TokenInfo>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

const ENV_OVERRIDES = parseEnvOverrides();

let dynamicRegistry: Record<string, TokenInfo> = {};
let loaded = false;
let loading: Promise<void> | null = null;

async function loadDynamic(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;
  if (typeof window === "undefined") {
    loaded = true;
    return;
  }
  loading = (async () => {
    try {
      const res = await fetch("/token-registry.json", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as Record<string, TokenInfo>;
        dynamicRegistry = body ?? {};
      }
    } catch {
      // silent: registry file is optional
    } finally {
      loaded = true;
    }
  })();
  return loading;
}

export function getTokenInfoSync(mint: string | null | undefined): TokenInfo | null {
  if (!mint) return null;
  return (
    ENV_OVERRIDES[mint] ??
    dynamicRegistry[mint] ??
    BUILTIN[mint] ??
    null
  );
}

export async function getTokenInfo(
  mint: string | null | undefined,
): Promise<TokenInfo | null> {
  if (!mint) return null;
  await loadDynamic();
  return getTokenInfoSync(mint);
}

export async function ensureRegistryLoaded(): Promise<void> {
  await loadDynamic();
}

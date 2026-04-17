"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LendingClient,
  type MarketAccount,
  type PositionAccount,
} from "@dfl/sdk";
import { PROGRAM_ID } from "../lib/constants";
import { getTokenDecimals } from "../lib/solana";

export function useLendingClient() {
  const { connection } = useConnection();
  return useMemo(
    () => new LendingClient({ programId: PROGRAM_ID, connection }),
    [connection],
  );
}

export function useMarkets(client: LendingClient) {
  const [markets, setMarkets] = useState<MarketAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    client
      .fetchMarkets()
      .then(setMarkets)
      .catch((err) => {
        console.error("[DFL] fetchMarkets failed:", err);
        setMarkets([]);
      })
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { markets, loading, refresh };
}

export function usePosition(
  client: LendingClient,
  marketAddress: string | null,
) {
  const { publicKey } = useWallet();
  const [position, setPosition] = useState<PositionAccount | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!marketAddress || !publicKey) {
      setPosition(null);
      return;
    }
    setLoading(true);
    client
      .fetchPositionByOwner(marketAddress, publicKey.toBase58())
      .then(setPosition)
      .catch((err) => {
        console.error("[DFL] fetchPosition failed:", err);
        setPosition(null);
      })
      .finally(() => setLoading(false));
  }, [client, marketAddress, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { position, loading, refresh };
}

export function useTokenDecimals(mintAddress: string | null) {
  const { connection } = useConnection();
  const [decimals, setDecimals] = useState<number | null>(null);

  useEffect(() => {
    if (!mintAddress) {
      setDecimals(null);
      return;
    }
    let cancelled = false;
    getTokenDecimals(connection, mintAddress)
      .then((d) => {
        if (!cancelled) setDecimals(d);
      })
      .catch(() => {
        if (!cancelled) setDecimals(9);
      });
    return () => {
      cancelled = true;
    };
  }, [connection, mintAddress]);

  return decimals;
}

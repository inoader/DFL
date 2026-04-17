"use client";

import { useEffect, useState } from "react";
import {
  ensureRegistryLoaded,
  getTokenInfoSync,
  type TokenInfo,
} from "../lib/token-registry";

export function useTokenInfo(mint: string | null | undefined): TokenInfo | null {
  const [info, setInfo] = useState<TokenInfo | null>(() => getTokenInfoSync(mint));

  useEffect(() => {
    if (!mint) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    setInfo(getTokenInfoSync(mint));
    ensureRegistryLoaded().then(() => {
      if (!cancelled) setInfo(getTokenInfoSync(mint));
    });
    return () => {
      cancelled = true;
    };
  }, [mint]);

  return info;
}

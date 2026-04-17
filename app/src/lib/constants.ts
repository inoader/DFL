export const PROGRAM_ID =
  process.env.NEXT_PUBLIC_DFL_PROGRAM_ID ??
  "CiY4cgsGojL8d9ppPLoc7ZRkfcCyptRtUvUsAh5MWk1Z";

export const NETWORKS = {
  devnet: "https://api.devnet.solana.com",
  localnet:
    process.env.NEXT_PUBLIC_DFL_LOCALNET_RPC ?? "http://127.0.0.1:8899",
} as const;

export type NetworkId = keyof typeof NETWORKS;

export const DEFAULT_NETWORK: NetworkId =
  (process.env.NEXT_PUBLIC_DFL_DEFAULT_NETWORK as NetworkId | undefined) ??
  "localnet";

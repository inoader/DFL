export const PROGRAM_ID = "11111111111111111111111111111111";

export const NETWORKS = {
  devnet: "https://api.devnet.solana.com",
  localnet: "http://localhost:8899",
} as const;

export type NetworkId = keyof typeof NETWORKS;

export const DEFAULT_NETWORK: NetworkId = "devnet";

import { PublicKey } from "@solana/web3.js";

export const PDA_SEEDS = {
  config: "config",
  market: "market",
  vaultAuthority: "vault_authority",
  feeVault: "fee_vault",
  position: "position",
} as const;

export type PublicKeyInput = PublicKey | string;

const textEncoder = new TextEncoder();

function seed(value: string): Uint8Array {
  return textEncoder.encode(value);
}

export function toPublicKey(value: PublicKeyInput): PublicKey {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

export function findProtocolConfigPda(programId: PublicKeyInput): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([seed(PDA_SEEDS.config)], toPublicKey(programId));
}

export function findMarketPda(
  collateralMint: PublicKeyInput,
  debtMint: PublicKeyInput,
  programId: PublicKeyInput,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      seed(PDA_SEEDS.market),
      toPublicKey(collateralMint).toBuffer(),
      toPublicKey(debtMint).toBuffer(),
    ],
    toPublicKey(programId),
  );
}

export function findVaultAuthorityPda(
  market: PublicKeyInput,
  programId: PublicKeyInput,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed(PDA_SEEDS.vaultAuthority), toPublicKey(market).toBuffer()],
    toPublicKey(programId),
  );
}

export function findFeeVaultPda(
  market: PublicKeyInput,
  programId: PublicKeyInput,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [seed(PDA_SEEDS.feeVault), toPublicKey(market).toBuffer()],
    toPublicKey(programId),
  );
}

export function findPositionPda(
  market: PublicKeyInput,
  owner: PublicKeyInput,
  programId: PublicKeyInput,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      seed(PDA_SEEDS.position),
      toPublicKey(market).toBuffer(),
      toPublicKey(owner).toBuffer(),
    ],
    toPublicKey(programId),
  );
}

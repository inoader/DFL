import { PublicKey, type Connection } from "@solana/web3.js";

const ASSOCIATED_TOKEN_PROGRAM = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const TOKEN_PROGRAM = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

export function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM,
  );
  return address;
}

export async function getTokenDecimals(
  connection: Connection,
  mintAddress: string,
): Promise<number> {
  const mint = new PublicKey(mintAddress);
  const info = await connection.getAccountInfo(mint);
  if (!info) return 9;
  return info.data[44];
}

export { TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM };

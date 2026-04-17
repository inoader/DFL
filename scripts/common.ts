import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  type Commitment,
} from "@solana/web3.js";

const DEFAULT_RPC = "http://127.0.0.1:8899";

const DEFAULT_PROGRAM_ID = "CiY4cgsGojL8d9ppPLoc7ZRkfcCyptRtUvUsAh5MWk1Z";

export type ScriptContext = {
  connection: Connection;
  programId: PublicKey;
  payer: Keypair;
  network: string;
};

export function loadContext(options: { commitment?: Commitment } = {}): ScriptContext {
  const rpc = process.env.DFL_RPC_URL ?? DEFAULT_RPC;
  const commitment: Commitment = options.commitment ?? "confirmed";
  const connection = new Connection(rpc, commitment);

  const programId = new PublicKey(process.env.DFL_PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
  const payer = loadKeypair(
    process.env.DFL_WALLET ?? path.join(os.homedir(), ".config", "solana", "id.json"),
  );
  const network = process.env.DFL_NETWORK ?? detectNetwork(rpc);

  return { connection, programId, payer, network };
}

function detectNetwork(rpc: string): string {
  if (rpc.includes("127.0.0.1") || rpc.includes("localhost")) return "localnet";
  if (rpc.includes("devnet")) return "devnet";
  if (rpc.includes("testnet")) return "testnet";
  if (rpc.includes("mainnet")) return "mainnet";
  return "custom";
}

export function snapshotPath(networkOrCtx: string | ScriptContext, suffix: string): string {
  const network = typeof networkOrCtx === "string" ? networkOrCtx : networkOrCtx.network;
  return path.join(__dirname, "..", "target", `${network}-${suffix}.json`);
}

export function loadKeypair(keypairPath: string): Keypair {
  const resolved = keypairPath.startsWith("~")
    ? path.join(os.homedir(), keypairPath.slice(1))
    : keypairPath;

  const raw = fs.readFileSync(resolved, { encoding: "utf8" });
  const secret = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secret);
}

export async function ensureSolBalance(
  ctx: ScriptContext,
  target: PublicKey,
  minSol = 1,
): Promise<void> {
  const balance = await ctx.connection.getBalance(target);
  if (balance >= minSol * LAMPORTS_PER_SOL) {
    return;
  }

  const signature = await ctx.connection.requestAirdrop(target, 2 * LAMPORTS_PER_SOL);
  await ctx.connection.confirmTransaction(signature, "confirmed");
}

export function saveKeypair(keypair: Keypair, target: string): void {
  fs.writeFileSync(target, JSON.stringify(Array.from(keypair.secretKey)));
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function writeJson(filePath: string, payload: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, pubkeyReplacer, 2)}\n`);
}

function pubkeyReplacer(_key: string, value: unknown): unknown {
  if (value instanceof PublicKey) {
    return value.toBase58();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return Array.from(value);
  }
  return value;
}

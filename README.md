# DFL

MVP implementation for a Solana overcollateralized lending system.

The codebase implements the on-chain isolated-market lending core, a client SDK
with PDA/account helpers, a full web frontend, and localnet seeding scripts.

## Layout

- `programs/dfl_lending`: Anchor on-chain program
- `tests`: Rust and TypeScript unit / integration tests
- `sdk`: client helpers for PDAs, account parsing, instruction builders, and risk math
- `scripts`: localnet bootstrap / market seeding / smoke-test scripts (pure TS, no Anchor CLI required)
- `app`: Next.js 14 frontend for wallet connection, market browsing, and action submission
- `docs`: architecture notes, parameter reference, runbook, and self-audit

## Implemented MVP

- Protocol initialization and admin-controlled market creation
- PDA vault custody for collateral, liquidity, fee accounting, and vault authority
- Borrower flow: open position, deposit collateral, borrow, repay, withdraw
- Risk flow: Pyth price reads, conservative collateral/debt valuation, health checks, partial liquidation, bad-debt recording
- Admin flow: protocol config updates, two-step admin transfer, market parameter updates, protocol/market pause, fee collection
- SDK flow: PDA derivation, raw account decoding, risk math helpers, keeper candidate filtering, Anchor instruction builders
- Frontend flow: wallet connection, expandable market list with inline position panel, action modal, token-symbol display, multilingual UI, light/dark theme, and per-request network switching

## On-chain program

- Program id: `CiY4cgsGojL8d9ppPLoc7ZRkfcCyptRtUvUsAh5MWk1Z` (configurable via `Anchor.toml` / env)
- Large account contexts wrap `Account<'info, T>` in `Box<...>` to stay within the SBF stack budget
- `create_market` only wires state; vault ATAs are created client-side, and the fee vault is provisioned by a dedicated `initialize_market_fee_vault` instruction so the `create_market` account list stays small enough to compile under SBPF limits
- PDA validation (`seeds` + `bump`) is enforced on every borrower, admin, and liquidation instruction

## Scripts (localnet / devnet)

All scripts are pure TypeScript executed via `ts-node`. Snapshots are written to
`target/<network>-*.json`, keyed by `DFL_NETWORK` (auto-detected from the RPC URL).

| Command | Purpose |
| ------- | ------- |
| `npm run script:bootstrap` | Initialize `ProtocolConfig`; mint a default `tSOL / tUSDC` pair and register them in `app/public/token-registry.json` |
| `npm run script:create-market` | Create a single market from the bootstrap snapshot (requires Pyth-compatible feed pubkeys) |
| `npm run script:seed-markets` | Idempotently seed a batch of markets (reuses existing mints by symbol, mints new ones on demand, also updates the frontend token registry) |
| `npm run script:smoke-borrower` | End-to-end borrower flow: `open_position → deposit → fund → borrow → repay → withdraw` |

### Environment variables

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DFL_RPC_URL` | `http://127.0.0.1:8899` | Target RPC endpoint |
| `DFL_PROGRAM_ID` | `CiY4cg…MWk1Z` | On-chain program id |
| `DFL_WALLET` | `~/.config/solana/id.json` | Signer keypair path |
| `DFL_NETWORK` | auto-detect | Namespace for snapshot files (`localnet` / `devnet` / `testnet` / `mainnet`) |

### Seeding additional markets

```sh
# default trio: tBTC/tUSDC, tETH/tUSDC, tSOL/tUSDT
npm run script:seed-markets

# custom pairs; unknown symbols mint fresh SPL tokens automatically
npm run script:seed-markets -- --pairs "tBTC:tUSDC,tJUP:tUSDC,tRAY:tUSDT"
```

Markets created with `create-market.ts` / `seed-markets.ts` use stub Pyth feed
pubkeys locally, so `open_position` / `deposit_collateral` / `fund_liquidity`
work out of the box, but `borrow` / `withdraw_collateral` / `liquidate` need
real Pyth accounts — either clone them into the validator with
`solana-test-validator --clone <pubkey> --url devnet --reset` or point the
scripts at a Pyth-enabled network.

## Frontend

The frontend lives in `app` and is built with Next.js 14, React 18,
TypeScript, Tailwind CSS 4, and `shadcn/ui`-style primitives layered on Radix
UI. It integrates the local `@dfl/sdk` workspace package and Solana wallet
adapters.

### Frontend features

- Wallet connect / disconnect flow with localized labels
- Expandable market list: each row shows headline risk metrics, and expanding a row reveals the full market detail and the user's position side-by-side
- Token-symbol display across the UI via `app/public/token-registry.json` (auto-populated by bootstrap / seed scripts)
- Position panel covering collateral, debt, health factor, borrowing capacity, and liquidation state
- Action modal flow for opening positions, depositing collateral, borrowing, repaying, withdrawing, and liquidating
- Top-right controls ordered `network → language → theme`, with a runtime network switcher (localnet / devnet)
- Simplified Chinese default with English switching

### Frontend environment variables

Override at build / dev time to target a different deployment:

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NEXT_PUBLIC_DFL_PROGRAM_ID` | `CiY4cg…MWk1Z` | On-chain program id |
| `NEXT_PUBLIC_DFL_LOCALNET_RPC` | `http://127.0.0.1:8899` | Localnet RPC endpoint |
| `NEXT_PUBLIC_DFL_DEFAULT_NETWORK` | `localnet` | Initial network selection (`localnet` / `devnet`) |

### Frontend local run

From the repository root:

```sh
npm install
npm --prefix sdk run build
npm --prefix app install
npm --prefix app run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Frontend stack

- Framework: Next.js 14 App Router
- Language: TypeScript
- UI: Tailwind CSS 4, Radix UI, custom `shadcn/ui`-style components
- Wallet integration: `@solana/wallet-adapter-react`, `@solana/wallet-adapter-react-ui`
- Chain interaction: `@solana/web3.js` and local `@dfl/sdk`

## Local checks

```sh
cargo check
cargo test
npm run test:ts
npm run typecheck:scripts
npm --prefix sdk run build
npm --prefix app run build
```

## End-to-end localnet walkthrough

```sh
# 1. start a fresh validator and deploy the program
solana-test-validator --reset &
cargo build-sbf --manifest-path programs/dfl_lending/Cargo.toml
solana program deploy \
  target/deploy/dfl_lending.so \
  --program-id target/deploy/dfl_lending-keypair.json \
  --url http://127.0.0.1:8899

# 2. initialise the protocol + default tSOL/tUSDC mints
npm run script:bootstrap

# 3. (optional) seed extra markets with additional symbols
npm run script:seed-markets

# 4. launch the frontend and interact end-to-end
npm --prefix app run dev
```

## Notes

- The architecture document remains at the repository root: `系统架构设计.md`
- Replace the placeholder program id in `Anchor.toml` and `programs/dfl_lending/src/lib.rs` with the deployed program key before switching deployments
- `anchor`, Solana CLI, and JavaScript dependencies are not vendored; install them (and run `npm install`) before running the scripts or full integration tests
- `test-ledger/`, `target/`, `node_modules/`, and `*.tsbuildinfo` are ignored; keypairs must never be committed (see `.gitignore`)

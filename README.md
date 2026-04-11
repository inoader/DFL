# DFL

MVP implementation for a Solana overcollateralized lending system.

The current codebase implements the on-chain isolated-market lending core and
client-side PDA/account helpers, along with a completed frontend for wallet
connection, market browsing, position management, and action submission.

## Layout

- `programs/dfl_lending`: Anchor on-chain program
- `tests`: Anchor/TypeScript integration tests
- `sdk`: client helpers for PDAs, account parsing, and risk math
- `app`: frontend shell for wallet connection and market views
- `docs`: implementation notes and engineering docs

## Implemented MVP

- Protocol initialization and admin-controlled market creation
- PDA vault custody for collateral, liquidity, fee accounting, and vault authority
- Borrower flow: open position, deposit collateral, borrow, repay, withdraw
- Risk flow: Pyth price reads, conservative collateral/debt valuation, health checks, partial liquidation, bad debt recording
- Admin flow: protocol config updates, two-step admin transfer, market parameter updates, protocol pause, market status changes, fee collection
- SDK flow: PDA derivation, raw account decoding, risk math helpers, keeper candidate filtering, Anchor instruction builders
- Frontend flow: wallet connection, market list and detail views, position panel, risk calculator, multilingual UI, and light/dark theme switching

## Frontend

The frontend lives in `app` and is implemented with Next.js 14, React 18,
TypeScript, Tailwind CSS 4, and `shadcn/ui`-style components built on top of
Radix UI primitives. It integrates the local `@dfl/sdk` package and Solana
wallet adapters to provide a complete interaction layer for the protocol.

### Frontend Features

- Wallet connect / disconnect flow with localized labels
- Market list with market status, core risk parameters, and market selection
- Market detail panel with risk parameters, interest model, stats, and key addresses
- Position panel covering collateral, debt, health factor, borrowing capacity, and liquidation state
- Action modal flow for opening positions, depositing collateral, borrowing, repaying, withdrawing, and liquidating
- Simplified Chinese as the default language, with English switching support
- Light / dark mode toggle in the top-right corner

### Frontend Local Run

From the repository `project` directory:

```sh
npm install
npm --prefix sdk run build
npm --prefix app install
npm --prefix app run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Frontend Stack

- Framework: Next.js 14 App Router
- Language: TypeScript
- UI: Tailwind CSS 4, Radix UI, custom `shadcn/ui`-style components
- Wallet integration: `@solana/wallet-adapter-react`, `@solana/wallet-adapter-react-ui`
- Chain interaction: `@solana/web3.js` and local `@dfl/sdk`

## Local Checks

```sh
cargo check
cargo test
npm run test:ts
npm --prefix sdk run build
npm --prefix app run build
```

## Notes

- The architecture document remains at the repository root: `系统架构设计.md`
- Replace the placeholder program id in `Anchor.toml` and `programs/dfl_lending/src/lib.rs` with the deployed program key before localnet/devnet deployment
- `anchor` and JavaScript dependencies are not vendored; install the Anchor CLI and run `npm install` before TypeScript or full Anchor integration tests

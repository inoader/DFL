# 运行手册

## 本地开发环境

### 必备工具

- Rust 1.80+（与 `rust-toolchain.toml` 指定一致）
- Node.js 18+、npm 9+
- Solana CLI 1.18+（含 `solana-test-validator`）
- Anchor CLI 0.29+

### 首次安装

```bash
git clone <repo>
cd DFL
npm install
npm --prefix sdk install
npm --prefix app install
```

### 构建与测试一条命令

```bash
cargo check                       # Rust 编译 0 warning
cargo test --lib                  # 链上程序单测（31 条）
npm run test:ts                   # SDK / math 集成测试（34 条）
npm --prefix sdk run build        # SDK dts + cjs/esm
npm --prefix app run build        # Next.js 产物
npm run typecheck:scripts         # scripts/*.ts 类型检查
```

## 启动本地验证器

```bash
solana-test-validator \
  --clone <collateral-pyth-account> --url devnet \
  --clone <debt-pyth-account>       --url devnet \
  --reset
```

> Pyth Devnet 可用喂价 id 见 <https://pyth.network/developers/price-feed-ids>。

## 部署程序

```bash
anchor build
anchor deploy --provider.cluster localnet
```

`Anchor.toml` 已经把 `dfl_lending` 指向
`CiY4cgsGojL8d9ppPLoc7ZRkfcCyptRtUvUsAh5MWk1Z`；若 re-generate keypair 需要同时
更新 `programs/dfl_lending/src/lib.rs` 的 `declare_id!`。

## 初始化 → 建市 → 烟测

```bash
# 1. 初始化 ProtocolConfig + 两个 mint，向 payer 发放初始余额
npx ts-node scripts/bootstrap.ts

# 2. 建立市场
npx ts-node scripts/create-market.ts \
  --collateral-feed <SOL_USD_PYTH_PUBKEY> \
  --debt-feed       <USDC_USD_PYTH_PUBKEY>

# 3. 全流程（deposit → fund → borrow → repay → withdraw）
npx ts-node scripts/smoke-borrower.ts \
  --fund    500000000 \
  --deposit 2000000000 \
  --borrow  500000 \
  --repay   500000
```

产物位于 `target/localnet-bootstrap.json` 与 `target/localnet-market.json`。

## 运维巡检（Localnet / Devnet 通用）

| 项目 | 工具 |
| ---- | ---- |
| 读取 `ProtocolConfig` | `sdk` 的 `fetchProtocolConfig` |
| 列举市场 | `sdk` 的 `fetchMarket` + 已知 PDA |
| 扫描清算候选 | `sdk/src/keeper.ts` 的 `findLiquidatablePositions` |
| 提取协议费 | `collect_protocol_fee` 指令 |

## 前端启动

```bash
npm --prefix app run dev
```

环境变量示例：

```
NEXT_PUBLIC_SOLANA_NETWORK=localnet
NEXT_PUBLIC_SOLANA_RPC=http://127.0.0.1:8899
NEXT_PUBLIC_DFL_PROGRAM_ID=CiY4cgsGojL8d9ppPLoc7ZRkfcCyptRtUvUsAh5MWk1Z
```

## Devnet 升级路径（后续扩展）

1. 通过 `anchor deploy --provider.cluster devnet` 部署；若已部署用
   `anchor upgrade` + 正确的 `upgrade_authority`。
2. 使用 Devnet Pyth 喂价 PDA 重新执行 `bootstrap.ts` + `create-market.ts`。
3. 监控：可把 `sdk/src/keeper.ts` 作为 keeper 服务的一部分，在独立进程轮询。
4. 预发布演练：跑 `tests/dfl-lending.ts` 的集成用例或 `smoke-borrower.ts`。

## 故障排查

| 现象 | 可能原因 | 处理 |
| ---- | -------- | ---- |
| `ProtocolPaused` | `ProtocolConfig.paused = true` 或 market 非 Active | `set_protocol_pause` / `set_market_pause` |
| `StaleOracle` | Pyth publish_time > staleness | 提高 staleness，或克隆更新更频繁的 feed |
| `PriceFeedMismatch` | 传入 pubkey 不符或 feed_id 与账户字节不一致 | 检查参数 / 用 0x0 feed_id 跳过校验 |
| `InsufficientLiquidity` | vault 流动性不够 | 先 `fund_liquidity` |
| `HealthFactorTooLow` | LTV 超限 / 价格波动 | 降低 borrow 或增加 collateral |
| `BorrowCapExceeded` | `total_debt_principal > borrow_cap` | 等待还款或调整 cap |
| `PositionNotLiquidatable` | `HF ≥ 1` | 等待价格变化 |
| `NoDebt` | 对零债头寸 repay/liquidate | 跳过 |

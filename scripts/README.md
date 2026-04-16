# Localnet 脚本

本目录提供一套纯 TypeScript 脚本，用于在 `solana-test-validator` + 已部署的
`dfl_lending` 程序之上快速完成协议初始化、市场创建与借贷端到端烟雾测试，
无需依赖 Anchor CLI 之外的工具链。

## 前置条件

1. 安装 Solana CLI / Anchor CLI，并保证本机有可用钱包 `~/.config/solana/id.json`。
2. 启动本地验证器。由于借贷流程依赖 Pyth 兼容喂价账户，推荐带克隆启动：

   ```bash
   solana-test-validator \
     --clone <collateral-pyth-account> --url devnet \
     --clone <debt-pyth-account>       --url devnet \
     --reset
   ```

   常用 Devnet 喂价可在 <https://pyth.network/developers/price-feed-ids> 查询。

3. 构建并部署程序：

   ```bash
   anchor build && anchor deploy
   ```

   部署后 `Anchor.toml` 与 `programs/dfl_lending/src/lib.rs` 已指向
   `CiY4cgsGojL8d9ppPLoc7ZRkfcCyptRtUvUsAh5MWk1Z`。若重新生成 keypair，请同步修改。

4. 安装依赖（若尚未安装）：

   ```bash
   npm install
   npm --prefix sdk run build
   ```

## 环境变量

| 变量              | 默认值                                       | 说明                     |
| ----------------- | -------------------------------------------- | ------------------------ |
| `DFL_RPC_URL`     | `http://127.0.0.1:8899`                      | 目标 RPC                 |
| `DFL_PROGRAM_ID`  | `CiY4cgsGojL8d9ppPLoc7ZRkfcCyptRtUvUsAh5MWk1Z` | 已部署程序 id            |
| `DFL_WALLET`      | `~/.config/solana/id.json`                   | 发起交易的钱包           |

## 脚本列表

| 脚本                           | 作用                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `scripts/bootstrap.ts`         | 初始化 `ProtocolConfig`、铸造 collateral/debt 两个 SPL mint 并向 payer 发放初始余额 |
| `scripts/create-market.ts`     | 基于 bootstrap 输出创建市场 PDA，接入用户提供的 Pyth 喂价账户      |
| `scripts/smoke-borrower.ts`    | 端到端借贷流：`open_position → deposit → fund → borrow → repay → withdraw`  |

## 运行顺序

```bash
# 1. 初始化协议 + 生成两类 mint（输出保存到 target/localnet-bootstrap.json）
npx ts-node scripts/bootstrap.ts

# 2. 创建市场（替换为你克隆进 localnet 的喂价账户）
npx ts-node scripts/create-market.ts \
  --collateral-feed <SOL_USD_PYTH_PUBKEY> \
  --debt-feed       <USDC_USD_PYTH_PUBKEY>

# 3. 跑一个完整借贷流（金额为 u64 原始单位）
npx ts-node scripts/smoke-borrower.ts \
  --fund    500000000 \
  --deposit 2000000000 \
  --borrow  500000 \
  --repay   500000
```

Bootstrap 与市场快照分别写入 `target/localnet-bootstrap.json` 与
`target/localnet-market.json`，方便后续脚本复用。

## 常见问题

- **`PriceFeedMismatch`**：传入的喂价账户与 Pyth 期望的 feed id 不一致。可以将
  `--collateral-feed-id/--debt-feed-id` 留空（默认 32 字节全零，跳过校验），
  或精确填入 Devnet 发布者提供的 32 字节 price feed id。
- **`StaleOracle`**：localnet 如果 `--clone` 后没有持续更新喂价，会因时间戳超过
  `oracle_staleness_seconds` 被拒。建议把该参数提高（如 3600）或使用 Mainnet-beta 克隆。
- **`InsufficientLiquidity`**：在借款前先用 `--fund` 将流动性打入 `liquidity_vault`。

# 指令与账户参考

> 源文件：`programs/dfl_lending/src/lib.rs`（入口）、`programs/dfl_lending/src/instructions/*`（上下文与处理器）。下列表格按指令名分节，字段命名以 Rust 源码为准。失败码定义于 `programs/dfl_lending/src/errors.rs`。

## 通用约定

- **PDA seeds**
  - `ProtocolConfig`：`[b"protocol_config"]`
  - `Market`：`[b"market", collateral_mint, debt_mint]`
  - `Position`：`[b"position", market, owner]`
  - `vault_authority`：`[b"vault_authority", market]`
  - `fee_vault`：`[b"fee_vault", market]`
- **SPL vault 归属**：`collateral_vault`、`liquidity_vault`、`fee_vault` 的 owner
  统一是 `vault_authority` PDA。
- **价格喂价**：每个 market 记录 `collateral_price_feed` 与 `debt_price_feed`
  对应的 Pyth 账户；指令的 `#[account(address = ...)]` 约束确保调用者必须传入正确 feed。
- **暂停门闸**：`ProtocolConfig::paused` 为协议级总阀；`Market::market_status`
  细化到单市场四态（`Active/ReduceOnly/Frozen/Closed`）。

---

## 1. 治理

### `initialize_protocol(params)`

首次创建 `ProtocolConfig` PDA，设置 admin、pending_admin、fee_bps、
oracle_staleness_seconds 等全局字段。

| 账户 | 修饰 | 说明 |
| ---- | ---- | ---- |
| `payer` | signer, mut | 付账 |
| `protocol_config` | init, PDA | `[protocol_config]` |
| `admin` | account | 初始管理员 |
| `system_program` | program | |

可能错误：`InvalidParameter`。

### `update_protocol_config(args)` / `set_protocol_pause(args)`

admin 动态调整费率、oracle 参数，或切换全协议 pause。
失败模式：`Unauthorized`（非 admin）、`InvalidParameter`。

### `transfer_protocol_admin(new_admin)` + `accept_protocol_admin()`

两步交接：当前 admin 发起，`new_admin` 主动调用 `accept_*` 完成接管，
防止误把管理员移交给无法访问私钥的地址。

失败模式：`Unauthorized`。

---

## 2. 市场创建与参数

### `create_market(params: CreateMarketParams)`

管理员调用。初始化市场 PDA、创建三个 SPL vault（collateral / liquidity / fee）。

关键账户（见 `create_market.rs`）：

| 账户 | 说明 |
| ---- | ---- |
| `authority` | 必须等于 `protocol_config.admin` |
| `market` | init PDA |
| `vault_authority` | PDA，三个 vault 的 owner |
| `collateral_mint` / `debt_mint` | SPL Mint |
| `collateral_price_feed` / `debt_price_feed` | 传入必须与 `params.collateral_price_feed/debt_price_feed` 相等 |
| `collateral_vault` / `liquidity_vault` | init ATA，owner = `vault_authority` |
| `fee_vault` | init PDA token account (`[fee_vault, market]`) |

参数校验（`validate_market_params`）：

- `max_ltv_bps < liquidation_threshold_bps ≤ 10_000`
- `liquidation_bonus_bps ≤ 5_000`
- `0 < close_factor_bps ≤ 10_000`
- `reserve_factor_bps ≤ 10_000`
- `0 < kink_utilization_bps ≤ 10_000`
- `max_confidence_bps ≤ 10_000`
- 债务稳定币锚定区间：`lower ≤ upper` 或 `upper == 0`

错误码：`InvalidParameter`, `Unauthorized`, `PriceFeedMismatch`。

### `update_market_params(args)` / `set_market_pause(status)`

分别用于调整风险/利率参数与切换市场状态。状态转换规则见
`state::Market::allows_*` 与 [`parameters.md`](./parameters.md)。

---

## 3. 流动性

### `fund_liquidity(amount)`

任意账户向 `liquidity_vault` 注入债务侧资金（首次启动必须）。

| 账户 | 说明 |
| ---- | ---- |
| `funder` | signer，持有 `funder_debt_account` |
| `market` | mut, PDA |
| `liquidity_vault` | mut, = `market.liquidity_vault` |
| `funder_debt_account` | mut, mint 必须等于 `market.debt_mint` |

可能错误：`InvalidAmount`、`ProtocolPaused`、`ActionNotAllowedForMarketStatus`、
`InvalidAccount`。

### `collect_protocol_fee(amount)`

admin 把 `fee_vault` 上累积的协议费提取到指定账户。

---

## 4. 用户借贷生命周期

### `open_position()`

为 `(market, owner)` 创建 `Position` PDA。

### `deposit_collateral(amount)`

| 账户 | 说明 |
| ---- | ---- |
| `owner` | signer |
| `market` | mut, PDA |
| `position` | mut, `has_one = market`; `position.owner == owner` |
| `collateral_vault` | mut, = `market.collateral_vault` |
| `user_collateral_account` | mut, owner=owner, mint=`market.collateral_mint` |

副作用：`position.collateral_amount += amount`，`market.total_collateral_amount += amount`。
可能错误：`InvalidAmount`、`CollateralBelowMinimum`、`ProtocolPaused`、`ActionNotAllowedForMarketStatus`。

### `borrow(amount)`

1. 判断 `protocol_config.allows_risk_increase` 与 `market.allows_borrow`。
2. `amount ≥ market.min_borrow_amount`。
3. `market.accrue_interest` → `position.sync_debt`。
4. 校验 `liquidity_vault.amount ≥ amount`。
5. 读取两个 Pyth 价，计算 `collateral_value / new_debt_value / borrow_limit`；
   要求 `new_debt_value ≤ borrow_limit`。
6. 若 `market.borrow_cap > 0`，`total_debt_principal ≤ borrow_cap`。
7. CPI `token::transfer`：`liquidity_vault → user_debt_account`（签名者 = `vault_authority` PDA）。

错误：`InvalidAmount / BorrowBelowMinimum / ProtocolPaused /
ActionNotAllowedForMarketStatus / InsufficientLiquidity / HealthFactorTooLow /
BorrowCapExceeded / StaleOracle / OracleConfidenceTooWide / StablecoinDepeg /
PriceFeedMismatch`。

### `repay(amount)`

按实际债务上限裁剪：`actual = min(amount, current_debt)`。CPI 从
`user_debt_account → liquidity_vault`。允许 `ReduceOnly`、`Frozen` 状态下执行。
失败：`InvalidAmount / NoDebt / ActionNotAllowedForMarketStatus`。

### `withdraw_collateral(amount)`

要求 position 在本次提取后仍满足 `debt_value ≤ borrow_limit`。零债务时允许全额提取。
错误：`AmountExceedsCollateral / HealthFactorTooLow / ProtocolPaused /
ActionNotAllowedForMarketStatus`。

---

## 5. 清算 `liquidate(repay_amount)`

来源：`programs/dfl_lending/src/instructions/liquidate.rs`。

健康检查与定价：

1. `market.accrue_interest` + `position.sync_debt`。
2. 读价并计算 `collateral_value / debt_value /
   liquidation_limit / health_factor`；要求 `HF < 1e18`（`WAD`），否则
   `PositionNotLiquidatable`。

清偿数量约束（取四者最小）：

- `repay_amount`（调用者期望值）
- `current_debt`
- `max_liquidatable_debt = current_debt * close_factor_bps / 10_000`
- `max_repay_from_collateral`：根据 collateral 总价和 1 + bonus 折价反推出的最大可抵消债务

计算 seize：

```
seize_value = actual_repay_value * (1 + liquidation_bonus_bps / 10_000)
seized_collateral = ceil(seize_value / collateral_price)   # 向上取整
seized_collateral = min(seized_collateral, position.collateral_amount)
```

双向 CPI 转账：

- `liquidator_debt_account → liquidity_vault`（清偿）
- `collateral_vault → liquidator_collateral_account`（扣押，由 vault_authority 签名）

状态更新：

- `position.debt_principal -= actual_repay`
- `position.collateral_amount -= seized_collateral`
- `position.last_borrow_index = market.borrow_index`
- `market.total_debt_principal -= actual_repay`
- `market.total_collateral_amount -= seized_collateral`
- 若扣押后 `collateral_amount == 0 && debt_principal > 0`：
  - 剩余 `debt_principal` 计入 `market.total_bad_debt`
  - `position.debt_principal = 0`
  - `market.market_status` 若是 `Active` 自动切到 `ReduceOnly`

事件：`LiquidationExecutedEvent { bad_debt_created, bad_debt_amount, ... }`。

---

## 6. 关键事件

- `ProtocolInitializedEvent`
- `MarketCreatedEvent`
- `MarketStatusChangedEvent`（包括清算触发的自动状态降级）
- `DepositedEvent / WithdrewEvent / BorrowedEvent / RepaidEvent`
- `LiquidationExecutedEvent`
- `ProtocolFeeCollectedEvent`

SDK 通过解码 `Program logs` 得到 base64 事件。

---

## 7. 调用 SDK 速查

| 动作 | SDK 入口 |
| ---- | -------- |
| 构建指令 | `sdk/src/instructions/*.ts` |
| 计算 PDA | `sdk/src/pdas.ts` |
| 模拟利息/风险 | `sdk/src/math/*`、`sdk/src/risk.ts` |
| Keeper 扫描 | `sdk/src/keeper.ts` |
| 事件解码 | `sdk/src/client.ts` |

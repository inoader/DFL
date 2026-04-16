# 安全自审笔记

本协议属 MVP 级课设作品，尚未经过第三方审计。以下笔记汇总了我在工程收尾阶段
所做的防御性加固、威胁模型覆盖范围以及已知折衷，便于后续接手者做审计或扩展。

## 威胁模型

| 攻击路径 | 影响 | 缓解 |
| -------- | ---- | ---- |
| 伪造 `market` PDA 指向构造账户 | 资金被引向攻击者控制的 vault | 所有读写 `market` 的指令均带 `seeds = [MARKET_SEED, collateral_mint, debt_mint]` + `bump = market.bump` 约束 |
| 伪造 `position` 指向他人 | 抵押被盗用 / 债务转嫁 | `position.market == market.key()` 与 `position.owner == owner.key()` 双约束 |
| 错误 mint / 错误 vault | 资金错配 | 每个 token 账户使用 `address = market.*_vault` / `mint = market.*_mint` 约束 |
| 利用 Pyth 陈旧价格 | 借款/清算不公允 | `oracle::pyth` 校验 `status == Trading`、publish_time staleness、conf/price ≤ `max_confidence_bps` |
| 稳定币脱锚 | debt 侧估值失真 | `debt_price_lower/upper_bound_wad` 区间守卫 |
| 整数溢出 | 账目错乱 | `math::fixed` 全线 `checked_*`；所有 debt/collateral 变更 `checked_add/sub` |
| 重入攻击 | 状态未及时更新 | 所有状态写入在 CPI 转账之前完成（`debt_principal`/`collateral_amount`），Anchor 借用检查保证单线程执行 |
| 管理员错误交接 | 协议失去控制 | `transfer_protocol_admin` + `accept_protocol_admin` 两步确认 |
| 暂停旁路 | 绕过治理 pause | `allows_risk_increase()` 在 borrow/withdraw/fund 等入口前提检查；repay/liquidate 允许在 pause 时执行以帮助退风险 |
| 清算时状态未降级 | 坏账持续暴露 | 坏账产生后自动把 `Market::Active` 降级为 `ReduceOnly` |
| close_factor / bonus 配置恶意 | DoS / 过度抽血 | `validate_market_params` 对 bps 上限与互相关系做硬约束 |

## 代码级检查清单

- **PDA seeds 覆盖**：`borrow / repay / withdraw_collateral / deposit_collateral /
  liquidate / open_position / fund_liquidity / update_market_params /
  set_market_pause / collect_protocol_fee` 10 个指令的 `market` 均使用 seeds+bump。
- **CPI 授权**：涉及 vault 转出的 CPI 一律使用
  `CpiContext::new_with_signer`，signer_seeds 始终包含
  `VAULT_AUTHORITY_SEED + market.key()`。无 `vault_authority` 私钥。
- **数量边界**：`deposit/borrow/repay/withdraw/liquidate` 首行 `require!(amount > 0)`。
- **除零**：`math::fixed::div_*` 在分母为零时返回 `DivisionByZero`。
- **状态守卫**：
  - `deposit_collateral / borrow / withdraw_collateral / fund_liquidity` 要求协议
    `allows_risk_increase` 且市场 `allows_borrow` / `allows_deposit`。
  - `repay` 允许 `ReduceOnly / Frozen`。
  - `liquidate` 要求协议 `allows_liquidation` + 市场 `allows_liquidation`。
- **Close-factor 边界**：清算取 `min(repay, current_debt, max_close, max_repay_from_collateral)`，
  杜绝单步被过度清算或 over-seize。
- **Bonus → seize 向上取整**：`amount_from_value_round_up` 保证协议不会少扣
  抵押；再通过 `min(collateral_amount)` 防止越界。

## 已知折衷与改进方向

1. **累积坏债模型**：当前在单次清算判断是否归零 collateral，若刚好扣完则把残债转入坏债；
   这意味着极度资不抵债的头寸需要多次部分清算才能归零，SDK 测试已断言该不变量。
   改进方向：引入一次性 "socialize bad debt" 路径，由治理触发。
2. **reserve 收割**：reserve 通过利息中 `reserve_factor_bps` 积累到
   `fee_vault`，需要治理手动 `collect_protocol_fee`。未引入自动 keeper。
3. **Pyth 依赖**：仅对接 Pyth 官方 crate。对 Pyth 停服缺少备用预言机，
   现实中需要扩展 `oracle` 模块为 trait + 多源配置。
4. **单资产市场**：抵押和债务均为单 mint；多资产篮子/多抵押暂未支持。
5. **升级权限**：程序升级权限沿用 Anchor 默认 deployer。生产环境应转为
   multisig（如 Squads）并在文档中显式记录。
6. **授权交接**：`protocol_config.admin` 为单地址。长期应切换为 multisig
   以避免单点故障。
7. **Front-running**：borrow / liquidate 时价格依赖 Pyth 最新一次更新；
   MEV/三明治风险尚未评估。现实中可叠加 slippage 保护参数。
8. **清算激励博弈**：`close_factor_bps` + `liquidation_bonus_bps`
   固定，未引入利率曲线式 dynamic bonus。

## 测试覆盖

- Rust 单测 31 条：涵盖 `Market::accrue_interest` 幂等性、状态门闸、
  `Position::sync_debt` 利息累积、`ProtocolConfig::allows_*`、
  `math::fixed::{div_round_up, apply_bps, checked_pow10}`、
  `math::liquidation::{seize_value_from_repay, max_liquidatable_debt}`。
- TS 单测 29 条（`tests/dfl-lending.ts` + `tests/sdk-math.ts`）：
  PDA 推导、指令构造、Jump-rate 利率、`quoteBorrow/Repay`、
  `quoteLiquidation` 不过量扣押的不变量。
- 运行层：`scripts/smoke-borrower.ts` 作为端到端 happy-path
  烟雾测试；配合 Devnet/localnet 的实际交易。

## 审计建议

若后续进入审计流程，建议按以下顺序检查：

1. `math::fixed` 和 `math::risk` 的精度边界（是否存在 u128 乘法溢出的隐藏路径）。
2. `oracle::pyth::read_market_prices` 对不同 expo/confidence 组合的健壮性。
3. `liquidate` 的四维 min 逻辑在极端价格/极端参数下的行为。
4. `ReduceOnly/Frozen/Closed` 状态在所有指令中的一致性（可用 fuzzer 覆盖）。
5. `collect_protocol_fee` 与 `reserve_factor` 之间的账目一致性。

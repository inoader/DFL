# 架构概要

> 本文以工程视角复述核心架构；完整业务背景见根目录 `系统架构设计.md`。

## 分层

```
┌──────────────────────────────────────────────────────────────┐
│ Next.js 前端 (app/)                                          │
│   - Radix UI / Tailwind、钱包适配器、交易确认                │
└──────────────▲───────────────────────────────────────────────┘
               │  TypeScript SDK (sdk/)
               │    · PDA 推导  · 指令构造  · math/risk 模拟
               │    · 清算 keeper 工具                          
┌──────────────┴───────────────────────────────────────────────┐
│ DFL 链上程序 (programs/dfl_lending/)                          │
│   · 16 条 Anchor 指令                                         │
│   · ProtocolConfig / Market / Position 三类账户              │
│   · 纯整数定点数学 + Jump-rate 利率 + Pyth 适配              │
└──────────────▲───────────────────────────────────────────────┘
               │ CPI
┌──────────────┴───────────────────────────────────────────────┐
│ Solana 基础设施：SPL Token、Associated Token、Pyth、System   │
└──────────────────────────────────────────────────────────────┘
```

## 核心账户

| 账户           | 唯一性（PDA seeds）                                 | 说明 |
| -------------- | --------------------------------------------------- | ---- |
| `ProtocolConfig` | `[protocol_config]`                                | 全局治理：管理员、pending admin、protocol pause、fee bps、oracle staleness |
| `Market`         | `[market, collateral_mint, debt_mint]`             | 单市场全部状态：利率参数、风险参数、利率索引、利用率快照 |
| `Position`       | `[position, market, owner]`                        | 单用户单市场：抵押数量、债务本金、借款指数快照 |
| Vault authority  | `[vault_authority, market]`                        | 单一 PDA，担任市场内所有 vault 的 owner |

## 指令分组

- **治理**：`initialize_protocol`, `transfer_protocol_admin`, `accept_protocol_admin`,
  `set_protocol_pause`, `create_market`, `update_market_params`, `set_market_pause`,
  `collect_protocol_fee`
- **流动性**：`fund_liquidity`
- **用户生命周期**：`open_position`, `deposit_collateral`, `withdraw_collateral`,
  `borrow`, `repay`
- **风险处置**：`liquidate`
- **协议级**：`update_protocol_config`

## 借贷生命周期（时序）

```
User                SDK                  Program                 Pyth / SPL
 │ open_position ──▶│ build ix ─────────▶│ init Position PDA ──▶│
 │ deposit ────────▶│ build ix ─────────▶│ CPI token::transfer ▶│ collateral_vault
 │ borrow ─────────▶│ quote + build ────▶│ accrue_interest      │
 │                  │                    │ health check (Pyth)──│
 │                  │                    │ CPI transfer out ───▶│ to borrower ATA
 │ repay ──────────▶│ quote + build ────▶│ accrue + debt update │
 │ withdraw ───────▶│ build ix ─────────▶│ health check ────────│
Liquidator
 │ quoteLiquidation▶│ simulate ─────────▶│ accrue + check HF<1  │
 │ liquidate ──────▶│                    │ seize + repay ───────▶ SPL token CPI
```

## 关键数据流

1. **利率累计**：所有改变市场总借款/总流动性的指令首先调用
   `Market::accrue_interest(now)`，将时间差转为 `borrow_index` 增量，并累加协议费。
2. **头寸同步**：`Position::sync_debt(market)` 在每次读/写债务前，把本金从旧 `borrow_index`
   换算到当前 index，保证利息计提幂等。
3. **健康检查**：`borrow` / `withdraw_collateral` 之后计算头寸健康系数；
   `liquidate` 触发前要求 `HF < 1`。`close_position` 允许债务为零的 position 清帐。
4. **价格获取**：`oracle::pyth` 读取 `PriceFeed`，校验状态/`feed_id`/`publish_time`
   新鲜度，并以与 Pyth 指数无关的方式归一化为 1e18 标尺的 `u128`，喂给后续头寸计算。
5. **清算处置**：`math::liquidation::*` 输出本次可清偿债务、扣除的抵押数量与
   折价，`handler` 在 vault 之间执行 CPI 转账；若清偿后仍资不抵债，进入
   `BadDebt` 路径并把剩余损失记入 market。

## 安全与鲁棒性设计要点

- 全部 `market` 账户带 `seeds + bump` 约束，确保 PDA 不可被伪造。
- `Position` 通过 `has_one = market, owner` 绑定主体，防止跨用户/跨市场错用。
- `fixed` 数学全部使用 `checked_*`，任意一处溢出即 `MathOverflow`。
- Oracle 新鲜度、价格符号、发布者 feed id 三重校验。
- 关键路径（borrow/withdraw/liquidate/fund_liquidity）均有 `pause` 门闸。
- 治理管理员采用 two-step transfer + accept，避免误设置为无效地址。

更多威胁模型与已知折衷见 [`security.md`](./security.md)。

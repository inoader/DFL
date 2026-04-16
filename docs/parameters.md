# 风险与利率参数说明

以下参数对应 `state::Market` 字段，亦对应 `CreateMarketParams` 与
`UpdateMarketParamsArgs` 的入参。字段单位大多为 BPS（1 bps = 0.01%，10000 = 100%）。

## 协议级

| 字段                         | 单位     | 含义 |
| ---------------------------- | -------- | ---- |
| `ProtocolConfig.fee_bps`     | bps      | 协议费（从利息中抽取，其余进入 reserve） |
| `ProtocolConfig.oracle_staleness_seconds` | 秒   | Pyth 价格最大可容忍滞后时间（兜底，各市场可覆盖） |
| `ProtocolConfig.paused`      | bool     | 暂停除还款外的全部风险增加型操作 |

## 市场级

### 风险边界

| 字段 | 单位 | 取值范围 | 含义 |
| ---- | ---- | -------- | ---- |
| `max_ltv_bps`                | bps | `< liquidation_threshold_bps` | 借款时最大 LTV |
| `liquidation_threshold_bps`  | bps | `(max_ltv, 10_000]`           | 触发清算的阈值 |
| `liquidation_bonus_bps`      | bps | `[0, 5_000]`                  | 清算人折价收益 |
| `close_factor_bps`           | bps | `(0, 10_000]`                 | 单次清算最多清偿债务比例 |
| `reserve_factor_bps`         | bps | `[0, 10_000]`                 | 利息中留给协议 reserve 的比例 |
| `max_confidence_bps`         | bps | `[0, 10_000]`                 | Pyth conf/price 可接受上限 |
| `oracle_staleness_seconds`   | 秒   | `> 0`                         | 市场级价格新鲜度覆盖 |
| `debt_price_lower/upper_bound_wad` | 1e18 WAD | `lower ≤ upper` 或 `upper == 0` | 稳定币脱锚保护（0 表示不检查） |

推荐基线（债务为 USDC、抵押为 SOL）：

- `max_ltv_bps = 7_000`
- `liquidation_threshold_bps = 8_000`
- `liquidation_bonus_bps = 500`
- `close_factor_bps = 5_000`
- `reserve_factor_bps = 1_000`
- `max_confidence_bps = 200`
- `oracle_staleness_seconds = 60`（Devnet 克隆可放宽到 3600）
- 稳定币：`lower = 0.97 * 1e18`，`upper = 1.03 * 1e18`

### 利率与容量

| 字段 | 单位 | 含义 |
| ---- | ---- | ---- |
| `base_rate_bps`          | bps/年 | 利用率为 0 时的年化利率 |
| `kink_utilization_bps`   | bps    | 斜率切换点 |
| `slope_1_bps`            | bps/年 | kink 之前斜率 |
| `slope_2_bps`            | bps/年 | kink 之后斜率 |
| `min_borrow_amount`      | 原始u64 | 单笔借款下限 |
| `min_collateral_amount`  | 原始u64 | 首次抵押下限 |
| `borrow_cap`             | 原始u64 | 0 表示不限；否则 `total_debt_principal ≤ cap` |

Jump-rate 推荐：

- `base_rate_bps = 0`
- `slope_1_bps = 400` ( 4% )
- `kink_utilization_bps = 8_000`
- `slope_2_bps = 20_000` (80% 之后每单位利用率 200% 的斜率，鼓励还款)

## 利息计提语义

- 单位时间：slot。`Market::accrue_interest(now_slot, liquidity_before)` 将从
  上次 slot 的时间差换算成年化比例后，累加到 `borrow_index`（1e18 精度）。
- `reserve_factor_bps` 决定利息中多少留给 reserve，其余由 `borrow_index`
  增长带给 lender。reserve 部分由 `fee_vault`（`collect_protocol_fee` 提取）管理。

## 健康系数

```
health_factor = liquidation_limit / debt_value
              = collateral_value * liquidation_threshold_bps / debt_value / 10000
```

- `HF ≥ 1`：安全。
- `HF < 1`：清算人可调用 `liquidate`。
- 由于 `close_factor`，单次清算不会把 HF 拉到 1 以上（除非 debt 已全清）；
  但会把 `HF` 向 1 收敛。

## 坏账与状态联动

- 清算后若 `collateral_amount == 0 && debt > 0`，差额计入 `market.total_bad_debt`。
- `Market::Active` 下若出现首次坏账，自动切换为 `ReduceOnly`，冻结新开仓但允许还款/清算。
- 恢复 `Active` 需治理手动调用 `set_market_pause(Active)`。

# DFL 工程文档

`dfl_lending` 是一个基于 Solana / Anchor 的孤立式超额抵押借贷协议 MVP。
本目录汇集合约层与 SDK 层的工程资料，是根目录 `系统架构设计.md` 的
补充：`系统架构设计.md` 面向答辩叙事，`docs/` 面向开发与运维。

## 文档索引

| 文档 | 面向 | 主要内容 |
| ---- | ---- | -------- |
| [`architecture.md`](./architecture.md)   | 通用读者 | 层次、核心账户、交互时序、关键数据流 |
| [`instructions.md`](./instructions.md)   | 开发者   | 16 条指令的账户、参数、检查与失败模式 |
| [`parameters.md`](./parameters.md)       | 风控/运维 | 市场与协议参数建议值、边界与影响 |
| [`runbook.md`](./runbook.md)             | 运维     | 本地 localnet 演练、Anchor 构建与测试命令 |
| [`security.md`](./security.md)           | 审计     | 防御性设计、已知折衷、威胁模型 |

## 快速导航

- 源码入口：`programs/dfl_lending/src/lib.rs`
- 指令模块：`programs/dfl_lending/src/instructions/`
- 链上状态：`programs/dfl_lending/src/state/` (`ProtocolConfig`, `Market`, `Position`)
- 核心算法：`programs/dfl_lending/src/math/` (`fixed`, `interest`, `risk`, `liquidation`)
- 预言机适配：`programs/dfl_lending/src/oracle/pyth.rs`
- TS SDK：`sdk/src/` (`pdas`, `instructions`, `client`, `math`, `risk`, `keeper`, `types`)
- 前端：`app/src/`（Next.js 14 App Router）
- 集成测试：`tests/dfl-lending.ts`、`tests/sdk-math.ts`
- 本地脚本：`scripts/`（见 [`scripts/README.md`](../scripts/README.md)）

## 构建与测试一键检查

```bash
cargo check
cargo test --lib
npm run test:ts
npm --prefix sdk run build
npm --prefix app run build
npm run typecheck:scripts
```

执行后预期：`cargo test --lib` 31 passed、`test:ts` 29 passed、SDK/前端/脚本均 0 告警。

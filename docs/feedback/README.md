# 测试反馈文档体系

本目录与仓库根部的 `TEST_FEEDBACK.json`（当前轮反馈文档）配合工作，解决三个历史问题：被测对象不可复现、问题生命周期断链、发布门槛双归属。

## 文件与职责

| 文件 | 角色 | 更新方式 |
|---|---|---|
| `/TEST_FEEDBACK.json`（仓库根） | 当前轮测试反馈，开发与测试方直接读写 | 每轮整体替换 |
| `docs/feedback/YYYY-MM-DD.json` | 每轮不可变快照，用于 diff 与历史追溯 | 每轮归档一次，之后永不修改 |
| `docs/feedback/registry.json` | 全部问题的登记表，生命周期与发布门槛的唯一权威 | 每轮追加/更新 |
| `docs/feedback/schema/feedback-schema.json` | 反馈文档格式契约（含 format 17 规则） | 格式升级时更新 |
| `docs/feedback/schema/registry-schema.json` | 登记表格式契约 | 格式升级时更新 |
| `scripts/validate-feedback.mjs` | 结构与一致性校验，已纳入 `npm run verify` | 随格式升级更新 |

## 核心规则

1. **可复现性**：测试只能针对已提交的修订。`source_revision` 必须是纯 commit hash（`^[0-9a-f]{7,40}$`），被测改动必须先提交（必要时打 tag），禁止测试未提交工作区。
2. **问题登记**：finding 的完整生命周期（opened/fixed/verified/closed）只记录在 `registry.json`；每轮快照只描述“本轮所见”，不做跨轮累计。
3. **ID 引用**：提交信息、`ITERATION_LOG.md` 与发布门槛一律引用 finding ID（如 `fix: TEST-V08-009 …`）；修复后必须在登记表回填 `fix_commit` 与 `verified_by`。
4. **发布门槛**：`registry.json` 的 `release_gate` 是唯一权威；`ENGINEERING_REVIEW.json` 的 `definition_of_done` 仅作为规划期验收目标。
5. **格式升级**：`format_version` 变化必须同步更新 schema 与校验脚本，并在 `format_history` 中说明变化。
6. **缺陷与验证缺口分开**：产品缺陷进 `open_findings`；人工验收等流程项进 `pending_verification`，不阻塞代码修复排期，但按发布门槛评估。

## 每轮流程

1. 开发完成并**提交**（必要时打 tag）。
2. 测试方对提交后的修订执行验证，重写 `/TEST_FEEDBACK.json`（引用纯 commit hash）。
3. 旧一轮文档归档为 `docs/feedback/YYYY-MM-DD.json`（不可变）。
4. 在 `registry.json` 中为每个 finding 追加 `history` 事件，更新状态与发布门槛。
5. `npm run validate:feedback` 通过（已包含在 `npm run verify` 中）。

## 已知例外

- `docs/feedback/2026-08-14.json`（format 16）：该轮 `source_revision` 为 `b740eff+uncommitted-working-tree`，违反规则 1；最近的可复现基线是提交 `1c4fa06`（feat: implement merge import workflow）。快照按原样保留作为历史记录，自 format 17 起强制执行规则 1。

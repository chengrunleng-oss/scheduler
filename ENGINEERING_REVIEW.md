# 工程审核反馈

本文件用于记录最新一轮工程审核结论。以后每次复审都覆盖旧反馈，只保留本轮最新状态、当前仍需处理的问题和固定校验流程，避免历史问题堆叠造成误导。

## 本轮复审状态

- 工作区状态：复审开始前 `git status --short` 为空。
- 验证命令：`npm run verify` 通过。
- 验证结果：`typecheck` 通过，`node --test` 18 项全部通过，`node --check dist/main.js` 通过，`check:dist` 通过。
- 本轮结论：上一轮反馈中的 6 个问题已经有对应修复；仍存在少量边界校验和测试覆盖问题。

## 已确认修复

- 备份任务校验的假值漏洞已修复：`tasks` 中的 `null`、`0`、`false` 会被拒绝，并已有测试覆盖。
- 导入校验和旧数据迁移语义已明确：legacy shape 会被识别并允许迁移，README 仍声明支持旧数据迁移。
- README 运行方式已统一为本地静态服务器运行，并新增 `npm run serve`。
- `dist/` 同步校验已加入：`npm run verify` 会运行 `npm run check:dist`。
- 本地存储中的可解析垃圾 JSON 已不再提示恢复成功，并已有测试覆盖。
- 存储失败 toast 已按错误消息去重，避免每次状态变化重复提示。

## 当前仍需处理

### P0

暂无。

### P1

#### 1. 导入校验仍会静默丢弃部分无效嵌套数据

- 位置：`src/domain.ts` 的 `validateBackupPayload`、`hydrateCurrentIteration`、`hydrateIteration`。
- 问题：当前校验只要求 `currentIteration.completed`、`currentIteration.next` 和 `iterations` 是数组，但没有校验数组元素结构。后续 hydration 会过滤无效 checklist item 或 iteration summary。
- 风险：备份文件被判定为有效并提示导入成功，但其中部分完成项、下一轮项或历史记录会被静默丢弃。
- 要求：对 `currentIteration.completed`、`currentIteration.next`、`iterations` 的元素做结构校验。
- 建议测试：导入包含 `completed: [null]`、`next: [0]`、`iterations: [false]` 的备份时应失败，而不是导入后静默过滤。

### P2

#### 2. 本地存储结构错误复用了“备份文件”错误文案

- 位置：`src/storage.ts` 的 `loadStateFromStorage` 和 `src/domain.ts` 的 `validateStoredPayload`。
- 问题：`validateStoredPayload` 最终复用 `validateBackupPayload` 的错误消息。当前 storage 中出现 `{}` 这类可解析垃圾数据时，用户可能看到“备份文件结构无效”。
- 风险：提示语和实际来源不一致，用户会误以为是导入备份失败，而不是本地缓存损坏。
- 要求：本地存储校验使用本地数据专属错误文案，导入备份校验使用备份文件文案。
- 建议测试：storage 返回 `{}` 时，message 应包含“本地数据结构无效”，不应包含“备份文件”。

#### 3. 当前版本存储损坏时不会尝试 legacy fallback

- 位置：`src/storage.ts` 的 `loadStateFromStorage`。
- 问题：当前逻辑使用 `storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY)`。如果新 key 存在但内容损坏，legacy key 即使仍有效也不会被尝试。
- 风险：用户可能同时有损坏的新数据和可迁移的旧数据，应用会直接回默认数据，错过恢复机会。
- 要求：明确策略。若目标是最大化数据恢复，应在当前 key 解析或结构校验失败后尝试 legacy key；若不 fallback，应在文档或注释中说明新 key 优先且失败不回退。
- 建议测试：新 key 为损坏 JSON、legacy key 有效时，确认期望行为并固定测试。

#### 4. 存储失败 toast 去重缺少回归测试

- 位置：`src/main.ts`。
- 问题：实现已经用 `lastStorageFailureMessage` 去重，但当前测试只覆盖 `saveStateToStorage` 返回失败，没有覆盖入口订阅逻辑不会重复 toast。
- 风险：未来修改入口逻辑时可能重新引入重复提示。
- 要求：补一个轻量入口层或可注入保存回调的测试；如果暂不测试，应把该点作为已知测试缺口。

## 后续校验方式

以后所有工程校验和复审都按以下流程执行，不只看测试是否通过：

1. 检查工作区状态：运行 `git status --short`，确认是否有未提交或未知变更，并说明审查对象。
2. 跑完整验证：优先运行 `npm run verify`；如果失败，记录失败命令、关键错误和影响范围。
3. 复查关键实现：重点看构建链、入口文件、存储异常、导入校验、状态历史、日期处理、测试是否测到真实产物。
4. 按严重程度反馈：先列 P0/P1/P2 问题，必须包含文件位置、问题原因、风险、修复要求和建议测试。
5. 清空旧反馈：写回 `ENGINEERING_REVIEW.md` 时覆盖旧审核结论，只保留本轮最新反馈和固定校验方式。
6. 不把“测试通过”当作结论：测试通过只能作为验证结果的一部分，仍要指出未覆盖的边界和工程债。
7. 最后汇总状态：说明已通过的命令、未能验证的部分、工作区是否干净，以及哪些问题需要继续修。

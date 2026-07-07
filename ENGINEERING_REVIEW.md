# 工程审核反馈

本文件记录当前仓库的工程质量审核结论，供后续开发 agent 按优先级修复。修复时应先处理 P0/P1，不做无关重构，完成后补充验证结果。

## P0

### 1. 消除源码、测试、运行包三套真相源

- 当前测试直接引用 `dist/*.js`，页面直接加载手工维护的 `dist/app.js`。
- 风险：`src/*.ts` 改坏后，测试仍可能通过；`dist/app.js`、`dist/domain.js` 和源码也可能互相漂移。
- 要求：建立可靠构建链，让 `src/*.ts` 成为唯一源码真相。
- 要求：测试覆盖源码或由源码自动生成的产物，不能依赖手写 `dist`。
- 建议：补充 `build`、`typecheck`、`test` 等 npm scripts，并明确验证顺序。

### 2. 修复 TypeScript 校验不可复现

- 当前 `npm run typecheck` 找不到 `tsc`。
- 风险：TypeScript 项目没有稳定的类型检查入口，工程约束形同虚设。
- 要求：确保安装依赖后 `npm run typecheck` 可运行。
- 建议：提交 lockfile，或在 README 中明确依赖安装与验证流程。

### 3. 修复 localStorage 异常导致应用崩溃

- 当前 `loadStateFromStorage` 的 `getItem` 和 `saveStateToStorage` 的 `setItem` 没有处理浏览器存储异常。
- 风险：隐私模式、禁用存储、容量超限等场景会抛错，可能导致应用白屏或用户操作失败。
- 要求：load/save 都要捕获异常。
- 要求：存储不可用时，应用应继续使用内存状态，并给出用户可理解的提示。

### 4. 修复导入备份校验过宽

- 当前 `parseBackupFile` 只要 JSON parse 成功就返回 `recovered: true`。
- 风险：`{}`、`[]` 或无关 JSON 可能被当成有效备份，进而替换当前数据。
- 要求：导入前校验备份结构，至少验证 `tasks`、`currentIteration`、`preferences` 等核心字段。
- 要求：无效结构不能替换当前数据，也不能静默降级为默认数据后提示导入成功。

## P1

### 5. reducer no-op 操作应返回原 state

- 当前 `update-task`、`toggle-task`、`delete-task` 等操作即使找不到目标 id，也会返回新对象。
- 风险：制造无意义渲染，并污染撤销历史。
- 要求：不存在目标 id、输入无实际变化时，应返回原始 `state`。
- 要求：补充 no-op reducer 测试。

### 6. 明确 replace-state 的撤销语义

- 当前 `replace-state` 会进入撤销历史。
- 风险：用户确认导入替换数据后，仍能通过普通撤销回到旧状态，语义不清晰。
- 要求：明确导入是否允许撤销。
- 建议：如果导入被定义为确认替换数据，应从普通历史动作中排除；如果允许撤销，需要在 UI 或文档中说明。

### 7. 修复日期使用 UTC 导致错日

- 当前 `toISODate` 使用 `toISOString().slice(0, 10)`。
- 风险：非 UTC 时区在接近午夜时可能计算出错误日期，影响默认截止日期和逾期统计。
- 要求：改成本地日期格式化逻辑。
- 要求：补充本地日期相关测试。

## P2

### 8. 测试不要直接 mutation 默认 state

- 当前部分测试直接修改 `createDefaultState()` 返回对象。
- 风险：测试默认接受可变共享状态，削弱 reducer/store 的不可变性约束。
- 要求：测试中通过构造输入或 reducer action 获得目标状态，避免直接 mutation。

## 验收标准

- `npm test` 通过。
- `npm run typecheck` 通过。
- 如果保留 `dist`，必须能从 `src` 自动生成，不能手工维护。
- 浏览器运行产物通过语法检查。
- 新增或调整测试覆盖无效备份导入、localStorage 异常、reducer no-op、本地日期。
- 修复完成后汇报改动文件、已解决问题和残留风险。

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

## 复审反馈

本节记录工程审核修复后的二次复审发现。当前 `npm run verify` 已通过，但测试通过不代表没有工程风险；后续开发 agent 仍应按严重程度继续处理以下问题。

### P0

暂无新增 P0。

### P1

#### 1. 备份任务校验存在假值漏洞

- 位置：`src/domain.ts` 的 `validateBackupPayload`。
- 问题：当前使用 `find()` 查找无效任务后，再用 `if (invalidTask)` 判断。若无效项本身是假值，例如 `null`、`0`、`false`，`find()` 会返回该假值，条件判断不会进入错误分支。
- 风险：`tasks: [null]`、`tasks: [0]`、`tasks: [false]` 等无效备份会通过校验，随后被 `hydrateState` 静默丢弃，用户以为导入成功但数据实际损坏或丢失。
- 要求：改用 `.some((task) => invalidPredicate(task))`，或使用 `findIndex(...) !== -1`。
- 要求：补充测试覆盖 `tasks` 中包含 `null`、数字、布尔值等无效项的导入拒绝场景。

#### 2. 导入校验和旧数据迁移语义冲突

- 位置：`src/domain.ts` 的 `validateBackupPayload`、`hydrateState`，以及 README 的功能描述。
- 问题：README 声称支持旧数据迁移，但导入校验强制要求 `preferences`、完整 `currentIteration.completed`、`currentIteration.next` 等字段。部分本来能由 `hydrateState` 迁移的旧备份会在导入阶段被拒绝。
- 风险：用户根据文档预期旧备份可导入，但实际导入失败；或者开发者误以为 legacy 数据路径已经被完整覆盖。
- 要求：明确迁移范围。如果只迁移旧 `localStorage` key，应更新 README；如果支持旧备份导入，应让校验按 schema version 或 legacy shape 分支处理。
- 要求：补充旧备份导入/拒绝策略的测试，避免文档和实现再次分叉。

#### 3. README 运行方式自相矛盾

- 位置：`README.md` 使用方式和验证说明。
- 问题：README 前面写“直接用浏览器打开 `index.html`”，但页面当前通过 `<script type="module" src="dist/main.js">` 加载 ES Modules，很多浏览器在 `file://` 下会拦截模块导入。README 后面又建议使用本地静态服务器。
- 风险：用户按第一段说明直接打开页面可能得到空白或模块加载错误。
- 要求：删除“直接打开”的说法，统一为本地静态服务器运行。
- 建议：增加 `npm run serve`，例如使用项目内脚本或明确命令，降低手动运行门槛。

#### 4. 提交 `dist/` 但缺少产物同步校验

- 位置：`package.json` 的 `verify` 脚本和构建流程。
- 问题：项目继续提交 `dist/` 以支持开箱运行，但 `verify` 只会重新构建并运行测试，不会检查构建后的 `dist/` 是否和仓库提交一致。
- 风险：源码改了但生成产物没有同步提交，或者生成产物被手工改动，仍可能进入仓库。
- 要求：如果继续提交 `dist/`，在 CI 或 `verify` 中增加构建后产物干净检查。
- 建议：加入类似 `git diff --exit-code -- dist` 的检查，或明确改为不提交 `dist/` 并提供构建/预览命令。

### P2

#### 5. 本地存储中的可解析垃圾 JSON 会被提示为恢复成功

- 位置：`src/storage.ts` 的 `loadStateFromStorage`。
- 问题：当前只要 `JSON.parse(raw)` 成功，就调用 `hydrateState` 并返回“已从本地存储恢复数据”。如果当前 storage key 里是 `{}` 这类结构错误但可解析的内容，用户会看到恢复成功，实际得到默认数据。
- 风险：提示语和真实行为不一致，排障困难；用户可能误以为历史数据仍存在。
- 要求：对当前 schema 的存储内容做轻量结构校验；legacy key 可走独立迁移路径。
- 要求：补充 storage 中 `{}`、`[]` 等可解析垃圾数据的测试。

#### 6. 存储失败提示可能在每次状态变化重复出现

- 位置：`src/main.ts` 的 store subscription。
- 问题：每次状态变化都会调用 `saveStateToStorage`，失败就 toast。同一浏览器禁用存储或容量超限时，用户每次操作都会看到同一条提示。
- 风险：用户体验噪音大，也掩盖真正重要的操作反馈。
- 要求：对同类存储失败提示做一次性提示、节流或状态记忆。
- 建议：首次失败提示“本次会话暂存”，后续失败只在状态或原因变化时提示。

## 后续校验方式

以后所有工程校验和复审都按以下流程执行，不只看测试是否通过：

1. 检查工作区状态：运行 `git status --short`，确认是否有未提交或未知变更，并说明审查对象。
2. 对照审核文件：逐条核对 `ENGINEERING_REVIEW.md` 中的 P0/P1/P2 是否真正实现、是否有测试覆盖、是否存在语义打架。
3. 跑完整验证：优先运行 `npm run verify`；如果失败，记录失败命令、关键错误和影响范围。
4. 复查关键实现：重点看构建链、入口文件、存储异常、导入校验、状态历史、日期处理、测试是否测到真实产物。
5. 按严重程度反馈：先列 P0/P1/P2 问题，必须包含文件位置、问题原因、风险、修复要求和建议测试。
6. 不把“测试通过”当作结论：测试通过只能作为验证结果的一部分，仍要指出未覆盖的边界和工程债。
7. 最后汇总状态：说明已通过的命令、未能验证的部分、工作区是否干净，以及哪些问题需要继续修。

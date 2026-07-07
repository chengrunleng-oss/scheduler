# 迭代记录

## 第 1 轮：基础可用版

### 本轮完成

- 创建本地静态 Web 应用结构：`index.html`、`styles.css`、`app.js`。
- 实现任务新增、编辑、删除、完成状态切换。
- 实现搜索、状态筛选、优先级排序和概览统计。
- 使用浏览器 `localStorage` 保存数据。
- 实现本轮完成记录、下一轮建议、反馈输入、迭代历史归档。
- 增加数据导出功能。

### 遗留问题

- `app.js` 是单文件巨石，状态、UI、存储和业务逻辑耦合。
- 缺少类型约束、数据校验和测试。
- 使用原生 `prompt` / `confirm`。
- 任务列表全量重建 DOM。
- 只支持导出，不支持导入。

## 第 2 轮：结构优化版

### 本轮完成

- 将开发分支推进到 `feature/iteration-2`，针对结构问题进行重构。
- 新增 TypeScript 源码结构：`src/types.ts`、`src/domain.ts`、`src/store.ts`、`src/storage.ts`、`src/ui/*`、`src/main.ts`。
- 把状态管理改为 reducer + store，避免业务逻辑直接散落在全局可变单例里。
- 增加 schema 版本、数据恢复、旧字段迁移和导入文件校验。
- 将任务编辑、确认、添加改进项改为页面内 `dialog`，替代原生 `prompt` / `confirm`。
- 历史记录渲染改为 DOM API 逐节点创建，不再拼接 `innerHTML`。
- 任务列表渲染改为 keyed reconcile，避免每次操作都重建整棵任务列表。
- 增加完整任务编辑：内容、优先级、截止日期、标签都可修改。
- 增加导入备份恢复、撤销/重做、到期/逾期统计、系统/浅色/深色主题。
- 将“计划/迭代/反馈”语言收敛为“任务/改进项/产品反馈”，减少概念混用。
- 新增 Node 测试，覆盖数据恢复、反馈建议、任务筛选、reducer、撤销/重做、导入解析。

### 验证

- 已被工程审核补丁替换为 `npm run verify`。
- 待运行：`npm test`
- 当前环境未安装 `tsc`，`npm run typecheck` 需要先安装依赖。

### 仍未彻底解决

- TypeScript 源码已建立；工程审核补丁已移除手工维护的 `dist/app.js`。
- 反馈建议仍是规则匹配，只是从硬编码散落逻辑收敛为领域层规则表；真正智能化需要接入模型或可配置规则。
- `localStorage` 仍有容量上限；大规模数据应迁移到 IndexedDB。
- 尚未实现 PWA 离线安装。
- 没有虚拟滚动，超大任务列表仍需要进一步优化。

### 工程审核反馈

- 代码审核发现构建链、测试目标、存储异常、导入校验、撤销历史和日期处理存在工程风险。
- 详细问题、优先级和验收标准见 `ENGINEERING_REVIEW.md`。

### 下一轮建议与计划

- 评估是否引入 Vite 或其他开发服务器，改善 ES Modules 本地预览体验。
- 增加 IndexedDB 存储层，并保留 `localStorage` 作为轻量兼容 fallback。
- 将反馈规则改为可配置数据文件，或预留 AI 建议接口。
- 增加 PWA manifest、service worker 和离线安装能力。
- 增加子任务、批量操作和标签统计视图。

## 第 2 轮补丁：工程审核修复

### 本次修复

- 建立可复现构建链：`npm run build` 会清理并由 `src/` 自动生成 `dist/`，`dist/app.js` 手工包已移除。
- 提交 `package-lock.json`，确保安装依赖后 `npm run typecheck` 可复现。
- 将 HTML 入口改为 `dist/main.js` ES Module，运行产物来自 TypeScript 编译输出。
- 修复 `localStorage` 读写异常处理：存储不可用或容量写入失败时，应用继续使用内存状态并提示用户。
- 加强导入备份校验：无关 JSON、数组、缺少核心字段的对象不会被当作有效备份。
- 明确导入语义：导入是确认替换数据，不进入普通撤销历史，执行后清空 undo/redo 栈。
- 修复 reducer no-op：目标 id 不存在或输入无实际变化时返回原 state，不污染渲染和撤销历史。
- 修复日期逻辑：`toISODate` 改为基于本地年月日格式化，避免 UTC 截断导致错日。
- 调整测试，不再直接 mutation 默认 state，并补充 review 要求的回归场景。

### 验证

- `npm run typecheck` 通过。
- `npm test` 通过，13 项测试全部通过。
- `npm run verify` 通过。
- `node --check dist/main.js`、`dist/domain.js`、`dist/store.js`、`dist/storage.js` 通过。

### 残留风险

- 当前 HTML 使用 ES Modules，部分浏览器直接通过 `file://` 打开时可能限制模块加载；建议用本地静态服务器访问。
- `dist/` 仍被提交用于开箱运行，但已经由 `src/` 自动生成，不再手工维护。
- 反馈建议仍是规则匹配，尚未接入模型或可配置规则。

## 第 2 轮补丁：复审构建修复

### 本次修复

- README 删除“直接打开 `index.html`”说法，统一为 `npm run build` 后通过 `npm run serve` 本地静态服务器运行。
- 新增 `serve` 脚本，降低 ES Modules 本地预览门槛。
- 新增 `check:dist` 脚本，`verify` 会在构建和测试后执行 `git diff --exit-code -- dist`，防止提交的 `dist/` 与 `src/` 不同步。
- 修复备份校验假值漏洞：`tasks` 中包含 `null`、数字、布尔值等无效项时会拒绝导入。
- 明确导入迁移语义：当前 v2 备份和 legacy v1 备份分支校验，旧备份可以按声明迁移。
- 修复本地存储中 `{}`、`[]` 等可解析垃圾 JSON 被误提示恢复成功的问题。
- 对存储失败 toast 做消息记忆，避免同类存储失败在每次状态变化时重复提示。

### 验证

- `npm test` 通过，18 项测试全部通过。
- `npm run verify` 需要在构建产物暂存后执行，因为它会检查 `dist/` 是否与仓库提交同步。

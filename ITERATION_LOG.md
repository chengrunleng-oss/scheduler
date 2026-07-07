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

- 待运行：`node --check dist/app.js`
- 待运行：`npm test`
- 当前环境未安装 `tsc`，`npm run typecheck` 需要先安装依赖。

### 仍未彻底解决

- TypeScript 源码已建立，但当前运行包 `dist/app.js` 是手工维护的浏览器包；下一步应引入正式构建工具，消除源码和运行包的重复。
- 反馈建议仍是规则匹配，只是从硬编码散落逻辑收敛为领域层规则表；真正智能化需要接入模型或可配置规则。
- `localStorage` 仍有容量上限；大规模数据应迁移到 IndexedDB。
- 尚未实现 PWA 离线安装。
- 没有虚拟滚动，超大任务列表仍需要进一步优化。

### 下一轮建议与计划

- 引入 Vite 或 esbuild，建立正式 TypeScript 构建链，取消手工维护 `dist/app.js`。
- 增加 IndexedDB 存储层，并保留 `localStorage` 作为轻量兼容 fallback。
- 将反馈规则改为可配置数据文件，或预留 AI 建议接口。
- 增加 PWA manifest、service worker 和离线安装能力。
- 增加子任务、批量操作和标签统计视图。

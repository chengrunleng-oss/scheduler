# 任务工作台改进落地计划（2026-09）

> 状态：讨论定稿，待评审后按阶段实施。
> 来源：本地目录工作区导出 `C:\Users\GS\Desktop\SchedulerSaveTest`，其「本软件优化建议栏」（`folder-1787042057170-bdd6e969`）下的 21 条改进建议。
> 本项目：`task-workbench`（package.json name），本地优先任务管理器。

---

## 1. 来源与已核对结论

- 21 条建议中，**12 条 completed + 1 条 discarded **经与 `TEST_FEEDBACK.json` 对照，基本都已在 TEST-V08-022~046 落地，**无需再处理**。对应关系见《附录 A》。
- **本计划只针对 8 条仍为 active（未处理）的建议**，且已与用户逐条深聊并确定方案。

---

## 2. 决策汇总

| # | 建议（存档标题） | 定稿方案 |
|---|---|---|
| 1 | 新建任务名在点其它按钮时被清空不保存 | **B 草稿保留+保持打开**：`InlineCreateState` 草稿化 `title/priority/dueDate`，重渲染回填；外部点击不取消，仅 Escape/取消丢弃 |
| 2 | 二进制附件点击地址想打开本地文件夹 | **方向2**：`office`/`binary` 附件主导操作=「打开所属任务文件夹」，下沉到每个附件行，去除无效「预览」 |
| 3 | 已过期待办无法拖动 | **B+i+文件夹移动**：过期任务可拖；拖到其它文件夹=移动(仍逾期)；拖到拖拽中浮现的「今天/明天/3天后/7天后/自定义」改期横条=改期脱离逾期；不做逾期区内手动排序 |
| 4 | 工作区折叠丝滑/源码vs编译区分不清/新开默认折叠 | **a+b+c**：a 折叠动画；b 源码/预览视觉强化；c 全局偏好“默认展开/折叠”默认展开 |
| 5 | 文件夹无法拖动换位置 | 专用 GripVertical 手柄 + 保留「移动」对话框；拖到行上=嵌套为子、行间=同级重排；`canMoveFolder` 防环/防超深 |
| 6 | 已处理任务分级/区分/拖动 | **①不改；②做“已完成/不再需要”两子组；③已处理拖动=单独一轮** |
| 7 | 打开工作区让「操作/优先级/截止日期」换行 | 加 **Playwright 扫描探针**(1000→1600 step50) 定断点→修复+固化回归 |
| 8 | 任务条目除标题外显示说明并可编辑 | 偏好“列表显示说明”**默认关**+空说明不占行+1行省略+**行内编辑** |

---

## 3. 代码定位（改动落点）

- **#1 行内创建**：`src/ui/renderer.ts` `createInlineForm`；`src/ui/events.ts:309` submit、`:132/635/655/674` 清空、`:334` Escape。
- **#2 附件**：`src/workspace-db.ts:289` `detectAttachmentKind`；`src/ui/workspace.ts:441` open 按钮、`:476` 预览条件、`:555` `openAttachment`、`:1045` `openTaskFolder`。
- **#3 过期拖拽**：`src/ui/renderer.ts:470` `is-draggable`；`src/ui/drag-drop.ts:320/353` `isOverdue` 过滤；`src/store.ts:128` `move-task` 仅 `active`；`src/ui/events.ts:268` 移动对话框禁逾期。
- **#4 工作区**：`src/ui/workspace.ts:710` `collapseSections`、`:720` `setSectionCollapsed`；`src/styles/layout.css:267-268` `display:none`；`src/ui/markdown-editor.ts` 源码/预览；`src/styles/layout.css:223-231`。
- **#5 文件夹**：`src/store.ts:375` `moveFolder`；`src/domain.ts:358` `canMoveFolder`；`src/ui/dialogs.ts:63`；`src/ui/drag-drop.ts`（现仅 task）。
- **#6 已处理**：`src/ui/renderer.ts:408` `renderHandledSection`；`src/store.ts:128` `move-task` 仅 `active`。
- **#7 表头**：`src/components/TaskBoard.vue:38` `.list-head`；`src/styles/tokens.css:49`、`src/styles/responsive.css:8` 与 `:191` 的 `--task-columns`。
- **#8 任务行说明**：`src/ui/renderer.ts:453` `createTaskNode`（不渲染 notes）；`:147` 详情面板写 `.detailNotes`。

---

## 4. 分阶段实施 + 验收标准

> 共用验收门槛：`npm run verify` 全绿（validate:feedback → typecheck → test → check:dist → test:e2e），视觉基线 `output/playwright/` 重新采集。所有改动遵守 `docs/feedback/registry.json` 为发布权威，建议逐轮登记并写清验收。

### 第 1 阶段（低风险，渲染/前端层）
1. **#1 行内创建草稿**：`InlineCreateState` 加 `draftTitle/draftPriority/draftDueDate`；`createInlineForm` 回填；行内 `input/change` 监听写回草稿；停用外部点击清空 `inlineCreate`；Escape/取消仍丢弃。
   - 验收：行内输入后点击其它任务/按钮/筛选，重渲染后标题仍在；Enter/保存提交；Escape/取消丢弃；文件写入失败回滚仍生效。补 Node 单测 + e2e。
2. **#4a 折叠动画**：将折叠从 `display:none` 改为 `grid-template-rows: 0fr↔1fr` 过渡（内容包一层）；配合 `prefers-reduced-motion` 跳过动画。
   - 验收：展开/折叠有平滑过渡；`prefers-reduced-motion: reduce` 下即时无动画；视觉基线更新。
3. **#4b 源码/预览视觉强化**：`.markdown-source`/`.markdown-preview` 用不同 surface、加“源码/预览”标签或更清晰分隔、窄屏上边距分隔。
   - 验收：宽屏/窄屏、源码/预览态区分明显；不与编辑/拖拽/放大交互冲突；视觉基线更新。
4. **#6② 已完成/不再需要分区**：`renderHandledSection` 在「已处理」下分「已完成」「不再需要」两个子组（或加状态徽标）。
   - 验收：完成与丢弃任务分列可见；折叠/展开/计数正确；e2e 更新。
5. **#8 列表显示说明+行内编辑**：偏好“列表显示说明”（默认关）；空说明不占行；1 行省略；点说明转输入框行内编辑（Enter 存/Escape 取消）。
   - 验收：默认关时不显示说明，列表密度不变；开启后在行内显示说明并可就地编辑，与选中/拖拽不冲突；符合 `verify`。

### 第 2 阶段（交互系统）
6. **#5 文件夹拖拽**：向 `drag-drop.ts` 增 `{kind:"folder"}`；文件夹表头加 GripVertical 手柄；注册文件夹落点（`canDrop = canMoveFolder`）；行上=嵌套、行间=同级重排；dispatch `moveFolder`；保留「移动」对话框。
   - 验收：文件夹可拖到同层重排与拖入成为子文件夹；防环（拖进自身/子孙被拒）、防超深（>4 层被拒）；与折叠热区不冲突；e2e + 视觉基线。
7. **#3 过期任务可拖+改期横条**：允许 `isOverdue` 任务 `is-draggable`；拖到其它文件夹=移动（保留状态/日期）；拖到拖拽中浮现的改期横条=改期；用 `isOverdue` 校验“改期后仍逾期”的落点并提示。
   - 验收：过期任务可拖到其它文件夹（仍入新文件夹逾期区）；拖到“3天后/7天后/自定义”后脱离逾期；拖“今天/明天”给出仍逾期提示；不做逾期区内手动排序。

### 第 3 阶段（store/CSS 级）
8. **#2 附件行为重定向**：对 `office`/`binary`：主导操作=「打开任务文件夹」（复用 `openTaskFolder`），去掉/禁用「预览」；把「打开任务文件夹」加到每个附件行；可预览类维持现状。
   - 验收：word/zip 等附件主操作打开所属任务文件夹；图片/PDF/视频仍可预览；无法定位单个文件（FS Access API）需在文案说明。
9. **#7 换行探针+修复**：新增 Playwright 扫描（1000→1600 step50）定位触发的断点与列；针对性修 `--task-columns`/`minmax`；固化断言为回归。
   - 验收：探针全宽无换行/无溢出；失败用例收敛为一条针对根因；视觉基线更新。

### 第 4 阶段（单独一轮）
10. **#6③ 已处理拖动**：新增 store 支持“已处理移动/恢复”；已处理任务在已处理区内排序、拖到其它文件夹已处理区、拖回上方=恢复为待办（带确认/撤销）。
    - 验收：三种拖动语义正确；恢复待办触发确认/撤销；与 8 秒撤销语义一致；单独契约测试 + e2e。

---

## 5. 流程与门槛
- **发布权威**：`docs/feedback/registry.json`（本计划文件不放入 `docs/feedback/`，避免污染不可变区）。
- **每轮**：先登记反馈项 → 写验收标准 → `npm run verify` 全绿 → 更新 `TEST_FEEDBACK.json`/`ENGINEERING_REVIEW.json` 与视觉基线 → 提交分支（遵循 `BRANCHING.md`）。
- **改动面**：`typecheck`、`test`、`check:dist`、`test:e2e`、视觉基线 `output/playwright/` 均可能受影响，需逐项确认。

## 6. 未决 / 待补充
- **#7**：需先跑扫描探针确定真实断点与列，才能写死修复用例（本计划已给出探针范围）。
- **#6③**：需新增 store 已处理移动/恢复能力及确认/撤销，独立一轮评估。
- **#2**：受 File System Access API 限制，无法在资源管理器中定位单个文件，“打开任务文件夹”为当前近似方案，需在界面注明。

---

## 附录 A：已落地建议与 TEST-V08 对照
Esc 分层退出 → V08-029；折叠热区整个表头 → V08-030；放大按钮移至源码键右侧 → V08-033；表头吸顶 → V08-035/037/041；截止日期默认值加选项 → V08-031；md 视频展示 → V08-032；放大后源码区铺满底部 → V08-034；放大后编码区可滚动 → V08-028；md 导出 PDF → V08-027；历史日期高亮 → V08-045；md 显示区背景色区分 → V08-044；折叠后按钮变展开 → V08-036。

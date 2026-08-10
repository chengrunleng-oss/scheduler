{
  "document_type": "scheduler_improvement_feedback",
  "format_version": 1,
  "review_date": "2026-08-10",
  "target_branch": "develop",
  "scope": "全项目用户体验与任务管理功能审查",
  "summary": {
    "product_direction": "将产品从带有开发迭代流程的工作台收敛为纯任务管理器，并将原右侧开发区域改造成所选任务的可编辑详情面板。",
    "recommended_schema_version": 3,
    "implementation_principle": "先修复现有可见缺陷和移除开发界面，再升级状态与树形数据模型，最后实现多视图和响应式交互。"
  },
  "assumptions": [
    {
      "source_feedback": "删除编辑按钮",
      "interpretation": "删除的是任务行中的编辑按钮；任务删除能力继续保留，因为编辑功能将由选中任务后的详情面板替代。"
    },
    {
      "source_feedback": "已完成类、不再需要完成类",
      "interpretation": "任务需要三个互斥状态：待办、已完成、不再需要。"
    }
  ],
  "confirmed_issues": [
    {
      "id": "UI-001",
      "priority": "P0",
      "title": "有任务时空状态仍然可见",
      "evidence": [
        {
          "file": "src/ui/renderer.ts",
          "line": 115,
          "detail": "渲染器通过 hidden 属性控制空状态。"
        },
        {
          "file": "styles.css",
          "line": 553,
          "detail": ".empty-state 设置 display: grid，覆盖了浏览器对 hidden 属性的默认隐藏样式。"
        },
        {
          "source": "browser_review",
          "viewport": "1280x720",
          "detail": "页面存在两条任务时仍显示“没有匹配的任务”。"
        }
      ],
      "required_change": "增加全局 [hidden] { display: none !important; } 或避免对隐藏元素设置覆盖 display 的规则，并补充任务列表非空时空状态不可见的回归测试。"
    },
    {
      "id": "UI-002",
      "priority": "P1",
      "title": "任务列表头与任务行列错位",
      "evidence": [
        {
          "file": "styles.css",
          "line": 446,
          "detail": "表头与任务行共用五列网格，但表头只有四个子元素。"
        },
        {
          "file": "styles.css",
          "line": 452,
          "detail": "表头额外使用 48px 左内边距补偿，导致各列无法与任务行对应。"
        },
        {
          "source": "browser_measurement",
          "viewport": "1280x720",
          "detail": "优先级表头 x=475，实际优先级内容 x=622；任务表头 x=427，任务标题 x=442。"
        }
      ],
      "required_change": "表头和任务行使用同一 CSS 网格变量及相同数量的网格单元，不再使用左内边距猜测对齐位置。"
    },
    {
      "id": "UX-001",
      "priority": "P1",
      "title": "开发流程占据主要用户界面",
      "evidence": [
        {
          "file": "index.html",
          "line": 108,
          "detail": "顶部包含“归档本轮”。"
        },
        {
          "file": "index.html",
          "line": 147,
          "detail": "右侧整栏包含改进记录、下一轮改进项、产品反馈和开发历史。"
        }
      ],
      "required_change": "从 GUI 删除所有开发相关入口、面板、弹窗、默认示例和文案；仓库内部工程文档可以继续保留。"
    },
    {
      "id": "MODEL-001",
      "priority": "P1",
      "title": "任务模型不能表达新状态与树形分类",
      "evidence": [
        {
          "file": "src/types.ts",
          "line": 6,
          "detail": "Task 只有 done:boolean，没有不再需要状态、文件夹引用、说明或手动顺序。"
        }
      ],
      "required_change": "升级到 schema v3，引入三态任务状态、文件夹实体、文件夹引用、手动顺序和任务说明字段。"
    },
    {
      "id": "UX-002",
      "priority": "P1",
      "title": "任务排序固定且不可切换",
      "evidence": [
        {
          "file": "src/domain.ts",
          "line": 183,
          "detail": "当前固定按完成状态、优先级和创建时间排序。"
        }
      ],
      "required_change": "将视图模式、状态筛选和视图内排序拆为独立偏好设置。"
    },
    {
      "id": "UX-003",
      "priority": "P2",
      "title": "中小屏布局产生过长滚动路径",
      "evidence": [
        {
          "source": "browser_review",
          "viewport": "820x900",
          "detail": "录入区、概览、工作区和开发面板全部纵向堆叠，任务列表进入首屏较晚。"
        }
      ],
      "required_change": "中等宽度保留导航加任务列表，详情使用侧边抽屉；手机端使用单列列表和全屏详情或底部面板。"
    },
    {
      "id": "UX-004",
      "priority": "P2",
      "title": "任务编辑入口与目标交互冲突",
      "evidence": [
        {
          "file": "index.html",
          "line": 198,
          "detail": "任务行仍显示编辑按钮。"
        },
        {
          "file": "index.html",
          "line": 208,
          "detail": "任务编辑仍通过模态弹窗完成。"
        }
      ],
      "required_change": "用行选中和常驻详情面板替代编辑按钮及编辑弹窗。"
    }
  ],
  "target_information_architecture": {
    "desktop": {
      "left_column": "品牌、紧凑快速新增、文件夹树、任务概览",
      "center_column": "搜索、视图选择、状态筛选、排序和任务列表",
      "right_column": "当前选中任务的可编辑详情"
    },
    "tablet": "左侧导航和主任务列表保持可见，任务详情从右侧抽屉打开。",
    "mobile": "单列任务列表；新增和详情使用全屏面板或底部面板；低频行内操作可进入更多菜单。",
    "breakpoint_validation_widths": [1440, 1024, 768, 390]
  },
  "requirements": [
    {
      "id": "REQ-001",
      "title": "移除开发相关界面",
      "changes": [
        "删除改进记录、下一轮改进项、产品反馈、开发历史和归档本轮。",
        "删除相应的检查清单、反馈整理、轮次归档渲染和事件绑定。",
        "删除开发导向的默认示例任务、标签、标题和产品说明。",
        "保留导入、导出、撤销、重做和主题设置等通用功能。",
        "顶部标题改为任务工作台或当前文件夹名称。"
      ],
      "acceptance": [
        "GUI 中不存在开发、反馈整理或轮次归档入口。",
        "删除相关 DOM 后 selectors 初始化不会因缺少旧元素而失败。",
        "README 的用户功能列表与新界面一致。"
      ]
    },
    {
      "id": "REQ-002",
      "title": "任务选中与可编辑详情",
      "changes": [
        "单击任务行后设置 selectedTaskId，并显示稳定的高亮背景、左侧强调线和边框。",
        "任务行设置 aria-selected，并支持 Enter、Space 和方向键选择。",
        "详情面板编辑标题、说明、文件夹、状态、优先级、截止日期和标签。",
        "创建时间和更新时间只读显示。",
        "采用明确的保存和取消操作；切换任务时若有未保存内容则提示。",
        "点击行内操作按钮不得误触发详情切换或重复提交。"
      ],
      "acceptance": [
        "任意时刻最多一个任务处于选中状态。",
        "选中任务在筛选后不可见或被删除时，详情面板安全清空。",
        "保存详情可以撤销和重做。",
        "桌面、平板和手机端均能完整编辑任务。"
      ]
    },
    {
      "id": "REQ-003",
      "title": "修复表头对齐",
      "changes": [
        "移除任务复选框后使用四列布局：任务、优先级、截止日期、操作。",
        "表头和任务行共享 --task-columns、间距和水平内边距变量。",
        "树形展开按钮和缩进位于任务列内部，不新增会破坏表头对齐的独立列。",
        "移动端隐藏表头，并通过布局和可访问名称保留字段含义。"
      ],
      "acceptance": [
        "各桌面验收宽度下，表头文字与对应任务单元格左边界视觉一致。",
        "任务标题换行、标签缺失和操作按钮状态变化不会引起列宽跳动。"
      ]
    },
    {
      "id": "REQ-004",
      "title": "重构任务行操作",
      "changes": [
        "删除编辑按钮和任务编辑弹窗。",
        "保留删除按钮，并继续使用确认或可撤销删除机制。",
        "新增移至已完成、移至不再需要、提高优先级和降低优先级按钮。",
        "任务状态定义为 active、completed、discarded。",
        "高优先级禁止继续提高，低优先级禁止继续降低。",
        "已完成和不再需要任务提供恢复为待办操作。",
        "所有图标按钮必须有 tooltip 和 aria-label。"
      ],
      "acceptance": [
        "三种状态之间的允许流转有 reducer 测试覆盖。",
        "优先级边界操作为 no-op，不写入无意义撤销历史。",
        "完成和不再需要不会删除任务数据。",
        "行内操作在窄屏下不溢出或遮挡任务内容。"
      ]
    },
    {
      "id": "REQ-005",
      "title": "支持文件夹式树状分类",
      "decision": "文件夹与任务使用独立实体；文件夹可以嵌套，任务是挂在文件夹下的叶节点。",
      "changes": [
        "支持新建、重命名、折叠、展开和移动文件夹。",
        "支持将任务移动到任意文件夹或根目录。",
        "界面最多展示四层嵌套，数据层禁止父级循环引用。",
        "文件夹内任务支持手动顺序，并为后续拖放预留 order 字段。",
        "删除非空文件夹时必须选择把内容移到上一级或删除整个分支，不允许静默级联删除。",
        "搜索命中深层任务时自动展开其祖先文件夹，并标识搜索结果。"
      ],
      "acceptance": [
        "空文件夹、深层文件夹、孤立引用和循环引用均有明确处理。",
        "折叠状态和手动顺序在刷新后保持。",
        "任务跨文件夹移动后统计、筛选和撤销结果正确。"
      ]
    },
    {
      "id": "REQ-006",
      "title": "增加树状、优先级和截止日期视图",
      "decision": "三种主视图互斥；搜索和状态筛选对所有视图通用；每种视图再提供有限的视图内排序。",
      "rationale": "树状视图要求同一文件夹内容连续展示，而全局优先级或截止日期排序会打散层级，因此不能把三种主视图作为可同时开启的叠加开关。",
      "views": [
        {
          "mode": "tree",
          "behavior": "保持文件夹层级；文件夹内部可按手动顺序、优先级或截止日期排序。"
        },
        {
          "mode": "priority",
          "behavior": "扁平化任务并按高、中、低分组；组内默认按截止日期排序。"
        },
        {
          "mode": "due_date",
          "behavior": "按逾期、今天、未来七天、更晚、未设置分组；同日按优先级排序。"
        }
      ],
      "shared_controls": [
        "全文搜索",
        "全部、待办、已完成、不再需要状态筛选",
        "当前文件夹范围或全部文件夹范围",
        "稳定排序，排序键相同时保持手动顺序或创建顺序"
      ],
      "acceptance": [
        "切换视图不会修改任务数据、状态或文件夹归属。",
        "搜索和状态筛选在三种视图中的结果集合一致。",
        "树状视图的视图内排序不会打散文件夹层级。",
        "视图与排序偏好在刷新后恢复。"
      ]
    }
  ],
  "data_model": {
    "schema_version": 3,
    "task": {
      "required_fields": [
        "id",
        "title",
        "notes",
        "priority",
        "dueDate",
        "tag",
        "status",
        "folderId",
        "order",
        "createdAt",
        "updatedAt"
      ],
      "status_values": ["active", "completed", "discarded"]
    },
    "folder": {
      "required_fields": ["id", "name", "parentId", "order", "collapsed", "createdAt", "updatedAt"]
    },
    "preferences": {
      "required_fields": ["activeStatusFilter", "theme", "viewMode", "sortMode", "folderScope"]
    },
    "transient_ui_state": ["selectedTaskId", "detailPanelOpen", "detailDraft"]
  },
  "migration": {
    "from_schema_version": 2,
    "rules": [
      "done=false 迁移为 status=active，done=true 迁移为 status=completed。",
      "现有任务默认放入根目录，并按当前稳定顺序生成 order。",
      "新字段 notes 使用空字符串，folderId 使用 null。",
      "旧 currentIteration、iterations、改进清单和反馈字段不再参与新界面或新业务逻辑。",
      "导入旧备份时保留所有用户任务，并忽略仅属于开发迭代流程的字段。",
      "升级后的导出文件写出 schema v3，并保持旧备份导入测试。"
    ]
  },
  "implementation_plan": [
    {
      "phase": 1,
      "title": "清理界面并修复现有缺陷",
      "work": [
        "修复空状态隐藏和表头对齐。",
        "删除开发相关 GUI、默认文案、选择器、渲染和事件绑定。",
        "调整桌面、平板和手机基础布局。"
      ]
    },
    {
      "phase": 2,
      "title": "升级领域模型和存储",
      "work": [
        "实现 schema v3、任务三态、文件夹和偏好设置。",
        "实现 v2 本地数据与备份迁移。",
        "为新 action、no-op 和撤销重做补充测试。"
      ]
    },
    {
      "phase": 3,
      "title": "实现选中详情与任务操作",
      "work": [
        "实现任务行选中、高亮、键盘交互和响应式详情面板。",
        "实现保存、取消、状态流转、优先级调整和删除。",
        "移除旧编辑弹窗。"
      ]
    },
    {
      "phase": 4,
      "title": "实现树形分类和多视图",
      "work": [
        "实现文件夹维护、移动、折叠和删除策略。",
        "实现树状、优先级、截止日期视图及共享筛选。",
        "实现稳定排序和偏好持久化。"
      ]
    },
    {
      "phase": 5,
      "title": "端到端验收",
      "work": [
        "运行类型检查、单元测试、构建产物校验。",
        "在 1440、1024、768、390px 宽度下做浏览器视觉与交互检查。",
        "验证导入、导出、撤销、重做、主题、搜索和所有任务状态。"
      ]
    }
  ],
  "test_plan": [
    "空状态只在可见任务集合为空时显示。",
    "任务行选中、取消、筛选隐藏、删除后的详情状态正确。",
    "active、completed、discarded 状态流转及恢复操作正确。",
    "高、中、低优先级升降边界正确且 no-op 不进入撤销历史。",
    "文件夹创建、重命名、嵌套、折叠、移动、删除和循环防护正确。",
    "三种视图在相同搜索和状态筛选下返回相同任务集合。",
    "截止日期视图正确区分逾期、今天、未来七天、更晚和未设置。",
    "schema v2 本地数据及备份可以迁移到 schema v3。",
    "schema v3 导入导出往返不丢失任务、文件夹、顺序和偏好。",
    "桌面和移动端不存在表头错位、横向滚动、按钮遮挡或文本溢出。",
    "所有图标按钮具备 tooltip、aria-label 和可见焦点状态。"
  ],
  "definition_of_done": [
    "六项需求全部实现且不保留开发相关 GUI。",
    "npm run verify 通过。",
    "新增领域与迁移测试全部通过。",
    "浏览器完成四档宽度的视觉及交互验收。",
    "README、默认数据和导入导出说明与新功能一致。",
    "工作区只包含本轮预期文件变更。"
  ],
  "out_of_scope_for_this_version": [
    "多设备同步和用户账号",
    "系统级通知与提醒",
    "日历月视图",
    "多人协作",
    "超大数据量虚拟滚动"
  ],
  "verification_baseline": {
    "command": "npm run verify",
    "result": "passed",
    "test_count": 18,
    "note": "该结果是实施前基线，不代表上述改进已实现。"
  }
}

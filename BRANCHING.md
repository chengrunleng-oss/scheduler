# 分支策略

本项目采用稳定主线、集成分支、任务分支的结构。

## 分支

- `main`：稳定可运行版本。每一轮确认可用后再合并进入该分支。
- `develop`：迭代集成分支。下一轮开发完成后先合并到这里验证。
- `feature/iteration-*`：按需创建的功能分支；完成验证后合并到 `develop`。

## 推荐流程

1. 在 `feature/iteration-*` 分支完成具体开发任务。
2. 验证通过后合并到 `develop`。
3. 当一轮迭代确认稳定后，将 `develop` 合并到 `main`。
4. 为下一轮创建新的 `feature/iteration-*` 分支。

## 提交约定

- `feat:` 新功能
- `fix:` 修复问题
- `docs:` 文档变更
- `style:` 样式调整
- `chore:` 工程维护

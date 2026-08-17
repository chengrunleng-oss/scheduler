// TEST-V08-023：近期活跃标记的共享状态。renderer 在每次渲染前调用 computeRecentActivitySets
// 注入计算好的集合；main 在工作记录变更与工作区切换后调用 refreshRecentActivity 重新拉取。
import type { Folder, Task } from "../types.js";
import type { WorkspaceBackend } from "../workspace-backend.js";
import { toISODate } from "../domain.js";

const DEFAULT_RECENT_DAYS = 7;

let enabledDays = DEFAULT_RECENT_DAYS;
let latestByTask = new Map<string, string>();

export function setRecentWorklogDays(days: number): void {
  enabledDays = days;
}

export function getRecentWorklogDays(): number {
  return enabledDays;
}

export async function refreshRecentActivity(backend: WorkspaceBackend): Promise<void> {
  const getDates = backend.listLatestWorklogDates;
  latestByTask = getDates ? await getDates.call(backend) : new Map();
}

export function isRecentlyActive(taskId: string, now = new Date()): boolean {
  if (enabledDays <= 0) return false;
  const latest = latestByTask.get(taskId);
  if (!latest) return false;
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (enabledDays - 1));
  return latest >= toISODate(cutoff) && latest <= toISODate(now);
}

// 文件夹活跃 = 其任意后代任务（含子文件夹）近期有工作记录。
export function computeRecentActivitySets(tasks: Task[], folders: Folder[]): { tasks: Set<string>; folders: Set<string> } {
  const taskSet = new Set(tasks.filter((task) => isRecentlyActive(task.id)).map((task) => task.id));
  const parentOf = new Map<string, string | null>(folders.map((folder) => [folder.id, folder.parentId]));
  const folderSet = new Set<string>();
  for (const task of tasks) {
    if (!taskSet.has(task.id)) continue;
    let cursor = task.folderId;
    const visited = new Set<string>();
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      folderSet.add(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }
  return { tasks: taskSet, folders: folderSet };
}

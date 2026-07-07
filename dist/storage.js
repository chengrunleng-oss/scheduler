import { createDefaultState, hydrateState } from "./domain.js";

export const STORAGE_KEY = "task-workbench-state-v2";
const LEGACY_STORAGE_KEY = "plan-workbench-state-v1";

export function loadStateFromStorage(storage = localStorage) {
  const raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) {
    return {
      state: createDefaultState(),
      recovered: false,
      message: "",
    };
  }
  try {
    return {
      state: hydrateState(JSON.parse(raw)),
      recovered: true,
      message: "已从本地存储恢复数据。",
    };
  } catch {
    return {
      state: createDefaultState(),
      recovered: false,
      message: "本地数据无法解析，已恢复为默认数据。",
    };
  }
}

export function saveStateToStorage(state, storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function parseBackupFile(text) {
  try {
    return {
      state: hydrateState(JSON.parse(text)),
      recovered: true,
      message: "备份文件已导入。",
    };
  } catch {
    return {
      state: createDefaultState(),
      recovered: false,
      message: "备份文件不是有效 JSON，未导入。",
    };
  }
}

export function createBackupBlob(state) {
  return new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
}

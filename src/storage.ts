import { createDefaultState, hydrateState, validateBackupPayload, validateStoredPayload } from "./domain.js";
import type { AppState } from "./types.js";

export const STORAGE_KEY = "task-workbench-state-v2";
const LEGACY_STORAGE_KEY = "plan-workbench-state-v1";

export interface StorageResult {
  state: AppState;
  recovered: boolean;
  message: string;
}

export interface SaveResult {
  saved: boolean;
  message: string;
}

export function loadStateFromStorage(storage: Storage = localStorage): StorageResult {
  let raw: string | null = null;

  try {
    raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return {
      state: createDefaultState(),
      recovered: false,
      message: "浏览器存储不可用，当前记录会暂存在本次页面会话中。",
    };
  }

  if (!raw) {
    return {
      state: createDefaultState(),
      recovered: false,
      message: "",
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const validation = validateStoredPayload(parsed);
    if (!validation.valid) {
      return {
        state: createDefaultState(),
        recovered: false,
        message: validation.message,
      };
    }

    return {
      state: hydrateState(parsed),
      recovered: true,
      message: validation.kind === "legacy" ? "已迁移旧版本地数据。" : "已从本地存储恢复数据。",
    };
  } catch {
    return {
      state: createDefaultState(),
      recovered: false,
      message: "本地数据无法解析，已恢复为默认数据。",
    };
  }
}

export function saveStateToStorage(state: AppState, storage: Storage = localStorage): SaveResult {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { saved: true, message: "" };
  } catch {
    return {
      saved: false,
      message: "浏览器存储不可用，本次修改暂存在内存中，刷新页面后可能丢失。",
    };
  }
}

export function parseBackupFile(text: string): StorageResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      state: createDefaultState(),
      recovered: false,
      message: "备份文件不是有效 JSON，未导入。",
    };
  }

  const validation = validateBackupPayload(parsed);
  if (!validation.valid) {
    return {
      state: createDefaultState(),
      recovered: false,
      message: validation.message,
    };
  }

  return {
    state: hydrateState(parsed),
    recovered: true,
    message: "备份文件已导入。",
  };
}

export function createBackupBlob(state: AppState): Blob {
  return new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
}

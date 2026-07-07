import { createDefaultState, hydrateState, validateBackupPayload } from "./domain.js";
export const STORAGE_KEY = "task-workbench-state-v2";
const LEGACY_STORAGE_KEY = "plan-workbench-state-v1";
export function loadStateFromStorage(storage = localStorage) {
    let raw = null;
    try {
        raw = storage.getItem(STORAGE_KEY) ?? storage.getItem(LEGACY_STORAGE_KEY);
    }
    catch {
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
        return {
            state: hydrateState(JSON.parse(raw)),
            recovered: true,
            message: "已从本地存储恢复数据。",
        };
    }
    catch {
        return {
            state: createDefaultState(),
            recovered: false,
            message: "本地数据无法解析，已恢复为默认数据。",
        };
    }
}
export function saveStateToStorage(state, storage = localStorage) {
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        return { saved: true, message: "" };
    }
    catch {
        return {
            saved: false,
            message: "浏览器存储不可用，本次修改暂存在内存中，刷新页面后可能丢失。",
        };
    }
}
export function parseBackupFile(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
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
export function createBackupBlob(state) {
    return new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
}

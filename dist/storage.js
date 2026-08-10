import { createDefaultState, hydrateState, validateBackupPayload, validateStoredPayload } from "./domain.js";
export const STORAGE_KEY = "task-workbench-state-v3";
export const LEGACY_STORAGE_KEYS = ["task-workbench-state-v2", "plan-workbench-state-v1"];
export function loadStateFromStorage(storage = localStorage) {
    const keys = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
    let firstFailure = "";
    let foundData = false;
    for (const key of keys) {
        let raw;
        try {
            raw = storage.getItem(key);
        }
        catch {
            return {
                state: createDefaultState(),
                recovered: false,
                message: "浏览器存储不可用，当前记录会暂存在本次页面会话中。",
            };
        }
        if (!raw)
            continue;
        foundData = true;
        try {
            const parsed = JSON.parse(raw);
            const validation = validateStoredPayload(parsed);
            if (!validation.valid) {
                firstFailure ||= validation.message;
                continue;
            }
            const migrated = key !== STORAGE_KEY || validation.kind !== "current";
            return {
                state: hydrateState(parsed),
                recovered: true,
                message: migrated ? "已迁移旧版本地数据。" : "已从本地存储恢复数据。",
            };
        }
        catch {
            firstFailure ||= "本地数据无法解析，已尝试恢复旧版本数据。";
        }
    }
    return {
        state: createDefaultState(),
        recovered: false,
        message: foundData ? firstFailure || "本地数据无效，已恢复为初始数据。" : "",
    };
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
        message: validation.kind === "current" ? "备份文件已导入。" : "旧版备份已迁移并导入。",
    };
}
export function createBackupBlob(state) {
    return new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
}

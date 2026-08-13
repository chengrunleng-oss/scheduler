import type { WorkspaceDirectoryHandle } from "./local-directory-backend.js";

const DATABASE_NAME = "task-workbench-workspace-handles-v1";
const DATABASE_VERSION = 1;
const STORE_NAME = "settings";
const ACTIVE_HANDLE_KEY = "active-workspace-directory";

interface HandleRecord {
  key: string;
  handle: WorkspaceDirectoryHandle;
}

export async function loadWorkspaceDirectoryHandle(): Promise<WorkspaceDirectoryHandle | null> {
  if (!("indexedDB" in globalThis)) return null;
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const record = await requestResult<HandleRecord | undefined>(transaction.objectStore(STORE_NAME).get(ACTIVE_HANDLE_KEY));
    return record?.handle ?? null;
  } finally {
    db.close();
  }
}

export async function saveWorkspaceDirectoryHandle(handle: WorkspaceDirectoryHandle): Promise<void> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ key: ACTIVE_HANDLE_KEY, handle } satisfies HandleRecord);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

export async function clearWorkspaceDirectoryHandle(): Promise<void> {
  if (!("indexedDB" in globalThis)) return;
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(ACTIVE_HANDLE_KEY);
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("工作区设置被其它页面占用，请关闭其它页面后重试。"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("工作区设置保存已中止。"));
  });
}

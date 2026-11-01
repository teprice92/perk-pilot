import type { StateStorage } from "zustand/middleware";

/**
 * Minimal IndexedDB-backed storage for zustand's persist middleware.
 * Saved trips can be a few hundred KB each, which would quickly exhaust
 * localStorage; IndexedDB also keeps everything available offline.
 * Falls back to localStorage, then to memory, when IndexedDB is unavailable.
 */
const DB_NAME = "perkpilot";
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
const memory = new Map<string, string>();

function hasIdb() {
  return typeof indexedDB !== "undefined";
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  dbPromise ??= openDb();
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const idbStorage: StateStorage = {
  async getItem(name) {
    try {
      if (hasIdb()) return ((await tx("readonly", (s) => s.get(name))) as string | undefined) ?? null;
      return localStorage.getItem(name);
    } catch {
      return memory.get(name) ?? null;
    }
  },
  async setItem(name, value) {
    try {
      if (hasIdb()) await tx("readwrite", (s) => s.put(value, name));
      else localStorage.setItem(name, value);
    } catch {
      memory.set(name, value);
    }
  },
  async removeItem(name) {
    try {
      if (hasIdb()) await tx("readwrite", (s) => s.delete(name));
      else localStorage.removeItem(name);
    } catch {
      memory.delete(name);
    }
  },
};

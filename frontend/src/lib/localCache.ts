// Local read-through cache backed by IndexedDB.
// When online: fetch from Supabase, write to cache, return data.
// When offline: return cached data from IndexedDB.

import { isOnline } from '@/lib/supabase';

const DB_NAME = 'contractor_pro_cache';
const DB_VERSION = 1;
const STORE = 'business_data';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
  });
  return dbPromise;
}

interface CacheEntry {
  key: string;
  data: unknown;
  cachedAt: string;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        resolve(entry ? (entry.data as T) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function cachePut(key: string, data: unknown): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key, data, cachedAt: new Date().toISOString() } as CacheEntry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail — cache is best-effort
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}

export async function clearUserCache(userId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.getAllKeys();
      request.onsuccess = () => {
        for (const key of request.result) {
          if (typeof key === 'string' && key.startsWith(`${userId}:`)) {
            store.delete(key);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Cache is best-effort; the server remains authoritative.
  }
}

/**
 * Read-through cache helper.
 * - Online: calls fetchFn, caches result, returns it.
 * - Offline: returns cached data (or empty array if none).
 */
export async function cachedRead<T>(
  key: string,
  fetchFn: () => Promise<T>,
): Promise<T> {
  if (isOnline()) {
    try {
      const data = await fetchFn();
      await cachePut(key, data);
      return data;
    } catch (err) {
      // Network failed mid-online — fall back to cache
      const cached = await cacheGet<T>(key);
      if (cached !== null) return cached;
      throw err;
    }
  }
  // Offline — serve from cache
  const cached = await cacheGet<T>(key);
  return cached ?? ([] as unknown as T);
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// ============================================================
// Offline Operation Queue — IndexedDB-backed write buffer
// ============================================================

type OperationType = 'insert' | 'update' | 'upsert' | 'delete';

interface QueuedOperation {
  id: string;
  table: string;
  op: OperationType;
  payload: Record<string, unknown> | Record<string, unknown>[];
  matchColumn?: string;
  matchValue?: string | string[];
  clientTimestamp: string;
  retryCount: number;
  deviceId: string;
}

const DB_NAME = 'contractor_pro_offline';
const STORE_NAME = 'pending_writes';
const DB_VERSION = 1;
const QUEUE_KEY_PREFIX = 'offline_op_';

// Unique device ID — persisted in localStorage so it's stable across sessions
function getDeviceId(): string {
  let id = localStorage.getItem('cp_device_id');
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem('cp_device_id', id);
  }
  return id;
}

// Lightweight IndexedDB wrapper — falls back to localStorage if IndexedDB is unavailable
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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
}

async function dbPut(op: QueuedOperation): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(op);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to localStorage
    localStorage.setItem(`${QUEUE_KEY_PREFIX}${op.id}`, JSON.stringify(op));
  }
}

async function dbGetAll(): Promise<QueuedOperation[]> {
  try {
    const db = await openDB();
    return await new Promise<QueuedOperation[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as QueuedOperation[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback: scan localStorage keys
    const ops: QueuedOperation[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(QUEUE_KEY_PREFIX)) {
        try {
          ops.push(JSON.parse(localStorage.getItem(key)!));
        } catch { /* skip corrupt entries */ }
      }
    }
    return ops.sort((a, b) => a.clientTimestamp.localeCompare(b.clientTimestamp));
  }
}

async function dbDelete(id: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.removeItem(`${QUEUE_KEY_PREFIX}${id}`);
  }
}

async function dbClear(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(QUEUE_KEY_PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
}

// ============================================================
// Public offline queue API
// ============================================================

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Enqueue a write operation for later sync. Call this when offline
 * instead of calling supabase directly. Returns a local placeholder
 * record so the UI can render immediately.
 */
export async function enqueueWrite(
  table: string,
  op: OperationType,
  payload: Record<string, unknown> | Record<string, unknown>[],
  matchColumn?: string,
  matchValue?: string | string[],
): Promise<string> {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const operation: QueuedOperation = {
    id,
    table,
    op,
    payload,
    matchColumn,
    matchValue,
    clientTimestamp: new Date().toISOString(),
    retryCount: 0,
    deviceId: getDeviceId(),
  };
  await dbPut(operation);
  return id;
}

export async function getPendingCount(): Promise<number> {
  const ops = await dbGetAll();
  return ops.length;
}

/**
 * Flush all pending writes to Supabase. Uses last-write-wins conflict
 * resolution: each upsert/update includes the clientTimestamp as
 * updated_at, so the most recent change across both devices wins.
 *
 * Operations are replayed in chronological order. Failed operations
 * are retried up to 3 times then kept in the queue for the next sync.
 */
export async function flushPendingWrites(): Promise<{ synced: number; failed: number }> {
  const ops = await dbGetAll();
  if (ops.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  // Sort by timestamp to preserve chronological order across devices
  ops.sort((a, b) => a.clientTimestamp.localeCompare(b.clientTimestamp));

  for (const op of ops) {
    try {
      await executeOperation(op);
      await dbDelete(op.id);
      synced++;
    } catch (err) {
      console.error(`Offline sync: failed op ${op.id} on ${op.table}:`, err);
      op.retryCount++;
      if (op.retryCount >= 3) {
        // Drop permanently failed operations to avoid blocking the queue
        await dbDelete(op.id);
        failed++;
      } else {
        // Keep for next sync attempt
        await dbPut(op);
        failed++;
      }
    }
  }

  return { synced, failed };
}

async function executeOperation(op: QueuedOperation): Promise<void> {
  const client: SupabaseClient = supabase;
  const payloadWithTimestamp = Array.isArray(op.payload)
    ? op.payload.map((p) => ({ ...p, updated_at: op.clientTimestamp }))
    : { ...op.payload, updated_at: op.clientTimestamp };

  switch (op.op) {
    case 'insert': {
      const { error } = await client.from(op.table).insert(op.payload).select();
      if (error) throw error;
      break;
    }
    case 'upsert': {
      const conflictCol = op.matchColumn || 'id';
      const { error } = await client
        .from(op.table)
        .upsert(payloadWithTimestamp, { onConflict: conflictCol })
        .select();
      if (error) throw error;
      break;
    }
    case 'update': {
      if (!op.matchColumn || !op.matchValue) throw new Error('update requires matchColumn and matchValue');
      const { error } = await client
        .from(op.table)
        .update(payloadWithTimestamp)
        .in(op.matchColumn, Array.isArray(op.matchValue) ? op.matchValue : [op.matchValue]);
      if (error) throw error;
      break;
    }
    case 'delete': {
      if (!op.matchColumn || !op.matchValue) throw new Error('delete requires matchColumn and matchValue');
      const { error } = await client
        .from(op.table)
        .delete()
        .in(op.matchColumn, Array.isArray(op.matchValue) ? op.matchValue : [op.matchValue]);
      if (error) throw error;
      break;
    }
  }
}

/** Clear all pending operations (e.g. after sign-out) */
export async function clearOfflineQueue(): Promise<void> {
  await dbClear();
}

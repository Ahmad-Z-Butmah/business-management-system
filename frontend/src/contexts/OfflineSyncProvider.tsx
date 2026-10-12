import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { flushPendingWrites, getPendingCount, isOnline } from '@/lib/supabase';

interface OfflineSyncContextValue {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  lastSyncResult: { synced: number; failed: number } | null;
  syncNow: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue>({
  online: true,
  pendingCount: 0,
  syncing: false,
  lastSyncResult: null,
  syncNow: async () => {},
});

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number } | null>(null);
  const syncLock = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  const syncNow = useCallback(async () => {
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      const result = await flushPendingWrites();
      setLastSyncResult(result);
      await refreshPendingCount();
    } catch (err) {
      console.error('Offline sync failed:', err);
    } finally {
      setSyncing(false);
      syncLock.current = false;
    }
  }, [refreshPendingCount]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      // Auto-sync when connection is restored
      syncNow();
    };
    const handleOffline = () => {
      setOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check pending count on mount and periodically
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 5000);

    // If already online, attempt an initial sync in case there are stale operations
    if (isOnline()) {
      syncNow();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [syncNow, refreshPendingCount]);

  // Periodically retry sync while online if there are pending items
  useEffect(() => {
    if (!online || pendingCount === 0 || syncing) return;
    const retryInterval = setInterval(() => {
      if (isOnline() && !syncLock.current) syncNow();
    }, 30000);
    return () => clearInterval(retryInterval);
  }, [online, pendingCount, syncing, syncNow]);

  return (
    <OfflineSyncContext.Provider value={{ online, pendingCount, syncing, lastSyncResult, syncNow }}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  return useContext(OfflineSyncContext);
}

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type RefreshTrigger = number;

interface DataRefreshContextValue {
  refreshKey: RefreshTrigger;
  triggerRefresh: () => void;
}

const DataRefreshContext = createContext<DataRefreshContextValue>({
  refreshKey: 0,
  triggerRefresh: () => {},
});

export function DataRefreshProvider({ children }: { children: ReactNode }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);
  return (
    <DataRefreshContext.Provider value={{ refreshKey, triggerRefresh }}>
      {children}
    </DataRefreshContext.Provider>
  );
}

export function useDataRefresh() {
  return useContext(DataRefreshContext);
}

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { DataRefreshProvider, useDataRefresh } from '@/contexts/DataRefreshProvider';
import { AuthScreen } from '@/pages/AuthScreen';
import { AppShell, type PageId } from '@/components/AppShell';
import { Dashboard } from '@/pages/Dashboard';
import { DailyRegistration } from '@/pages/DailyRegistration';
import { Workers } from '@/pages/Workers';
import { Workshops } from '@/pages/Workshops';
import { Contractors } from '@/pages/Contractors';
import { Claims } from '@/pages/Claims';
import { Wallet } from '@/pages/Wallet';
import { WorkerPayments } from '@/pages/WorkerPayments';
import { WorkerSettlement } from '@/pages/WorkerSettlement';
import { Reports } from '@/pages/Reports';
import { TaxCenter } from '@/pages/TaxCenter';
import { Settings } from '@/pages/Settings';
import { Contacts } from '@/pages/Contacts';
import { ExtraWorkPage } from '@/pages/ExtraWorkPage';
import { DocumentVault } from '@/pages/DocumentVault';
import { TaxCalendar } from '@/pages/TaxCalendar';
import { TasksReminders } from '@/pages/TasksReminders';
import { SystemHealth } from '@/pages/SystemHealth';
import { getWalletAccounts, getWalletTransactions } from '@/lib/dataAccess';
import { calculateWalletTotal } from '@/lib/calculations';
import { checkAndRunScheduledBackup, performBackupWithRetry } from '@/lib/backupService';
import { LoadingSpinner } from '@/components/Common';
import { useI18n } from '@/i18n/I18nProvider';

function AppContent() {
  const { user, loading, settings } = useAuth();
  const { t } = useI18n();
  const { refreshKey, triggerRefresh } = useDataRefresh();
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [walletTotal, setWalletTotal] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [accounts, transactions] = await Promise.all([
          getWalletAccounts(user.id),
          getWalletTransactions(user.id),
        ]);
        setWalletTotal(calculateWalletTotal(accounts, transactions));
      } catch (e) {
        console.error(e);
      }
    })();
  }, [user, currentPage, refreshKey]);

  useEffect(() => {
    if (!user || !settings) return;
    const runScheduled = async () => {
      if (!navigator.onLine) {
        window.addEventListener('online', async function handleOnline() {
          window.removeEventListener('online', handleOnline);
          const result = await performBackupWithRetry(user.id, 'scheduled');
          if (result.success) triggerRefresh();
        }, { once: true });
        return;
      }
      const result = await checkAndRunScheduledBackup(user.id, settings);
      if (result?.success) triggerRefresh();
    };
    runScheduled();
    const interval = setInterval(runScheduled, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user, settings, triggerRefresh]);

  if (loading) {
    return <LoadingSpinner label={t('loading')} />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  const handleNavigate = (page: string) => {
    setCurrentPage(page as PageId);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard onNavigate={handleNavigate} />;
      case 'dailyRegistration': return <DailyRegistration />;
      case 'workers': return <Workers />;
      case 'workshops': return <Workshops />;
      case 'contractors': return <Contractors />;
      case 'claims': return <Claims />;
      case 'wallet': return <Wallet />;
      case 'reports': return <Reports />;
      case 'contacts': return <Contacts />;
      case 'taxCenter': return <TaxCenter />;
      case 'taxCalendar': return <TaxCalendar />;
      case 'extraWork': return <ExtraWorkPage />;
      case 'documentVault': return <DocumentVault />;
      case 'tasksReminders': return <TasksReminders />;
      case 'systemHealth': return <SystemHealth />;
      case 'workerPayments': return <WorkerPayments />;
      case 'workerSettlement': return <WorkerSettlement />;
      case 'settings': return <Settings />;
      default: return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <AppShell currentPage={currentPage} onNavigate={handleNavigate} walletTotal={walletTotal}>
      {renderPage()}
    </AppShell>
  );
}

function App() {
  return (
    <DataRefreshProvider>
      <AppContent />
    </DataRefreshProvider>
  );
}

export default App;

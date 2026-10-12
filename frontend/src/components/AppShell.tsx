import { useEffect, useState, type ReactNode } from 'react';
import {
  LayoutDashboard, CalendarCheck, Users, Building2, HardHat,
  FileText, Wallet, BarChart3, BookUser, Receipt, Settings,
  Menu, X, LogOut, Wifi, WifiOff, Briefcase, FileStack, CalendarClock, Undo2,
  Bell, Activity, ChevronDown, Calculator, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useAuth } from '@/contexts/AuthProvider';
import { useOfflineSync } from '@/contexts/OfflineSyncProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { useDataRefresh } from '@/contexts/DataRefreshProvider';
import { useToast } from '@/contexts/ToastProvider';
import { UNDO_CHANGE_EVENT, getLastUndoAction, undoLastAddition } from '@/lib/undoHistory';
import type { Language } from '@/types';

export type PageId =
  | 'dashboard' | 'dailyRegistration' | 'workers' | 'workshops'
  | 'contractors' | 'claims' | 'wallet' | 'reports'
  | 'contacts' | 'taxCenter' | 'settings' | 'extraWork' | 'documentVault' | 'taxCalendar'
  | 'tasksReminders' | 'systemHealth' | 'workerSettlement' | 'workerPayments';

interface AppShellProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  walletTotal: number;
  children: ReactNode;
}

export function AppShell({ currentPage, onNavigate, walletTotal, children }: AppShellProps) {
  const { t, dir, language, setLanguage, formatCurrency } = useI18n();
  const { signOut, user } = useAuth();
  const { online, syncing, pendingCount, lastSyncResult, syncNow } = useOfflineSync();
  const { triggerRefresh } = useDataRefresh();
  const { showToast } = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    const updateUndoState = () => setUndoAvailable(user ? Boolean(getLastUndoAction(user.id)) : false);
    updateUndoState();
    window.addEventListener(UNDO_CHANGE_EVENT, updateUndoState);
    window.addEventListener('storage', updateUndoState);
    return () => {
      window.removeEventListener(UNDO_CHANGE_EVENT, updateUndoState);
      window.removeEventListener('storage', updateUndoState);
    };
  }, [user?.id]);

  // Remove the old local online tracking — use the context instead
  const syncState = syncing ? 'syncing' : !online ? 'offline' : pendingCount > 0 ? 'syncPending' : lastSyncResult && lastSyncResult.failed > 0 ? 'syncError' : 'synced';
  const syncConfig: Record<string, { icon: typeof Wifi; label: string; cls: string }> = {
    syncing: { icon: RefreshCw, label: t('syncing'), cls: 'bg-primary-50 text-primary-700' },
    offline: { icon: WifiOff, label: t('offline'), cls: 'bg-error-50 text-error-700' },
    syncPending: { icon: RefreshCw, label: t('syncPending'), cls: 'bg-warning-50 text-warning-700' },
    syncError: { icon: AlertCircle, label: t('syncFailed'), cls: 'bg-error-50 text-error-700' },
    synced: { icon: CheckCircle2, label: t('online'), cls: 'bg-success-50 text-success-700' },
  };
  const SyncIcon = syncConfig[syncState].icon;

  const navGroups: { label?: string; items: { id: PageId; icon: typeof LayoutDashboard; label: string }[] }[] = [
    {
      items: [
        { id: 'dashboard', icon: LayoutDashboard, label: t('dashboard') },
      ],
    },
    {
      label: t('operations'),
      items: [
        { id: 'dailyRegistration', icon: CalendarCheck, label: t('dailyRegistration') },
        { id: 'workers', icon: Users, label: t('workers') },
        { id: 'workshops', icon: Building2, label: t('workshops') },
        { id: 'contractors', icon: HardHat, label: t('contractors') },
      ],
    },
    {
      label: t('financial'),
      items: [
        { id: 'claims', icon: FileText, label: t('claims') },
        { id: 'wallet', icon: Wallet, label: t('wallet') },
        { id: 'workerSettlement', icon: Calculator, label: t('workerSettlement') },
        { id: 'reports', icon: BarChart3, label: t('reports') },
      ],
    },
    {
      label: t('compliance'),
      items: [
        { id: 'taxCenter', icon: Receipt, label: t('taxCenter') },
        { id: 'taxCalendar', icon: CalendarClock, label: t('submissionCalendar') },
      ],
    },
    {
      label: t('more'),
      items: [
        { id: 'extraWork', icon: Briefcase, label: t('extraWork') },
        { id: 'documentVault', icon: FileStack, label: t('documentVault') },
        { id: 'contacts', icon: BookUser, label: t('contacts') },
        { id: 'tasksReminders', icon: Bell, label: t('tasksReminders') },
        { id: 'systemHealth', icon: Activity, label: t('systemHealth') },
        { id: 'settings', icon: Settings, label: t('settings') },
      ],
    },
  ];

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
    { code: 'he', label: 'עברית', flag: '🇮🇱' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
  ];

  const currentLang = languages.find((l) => l.code === language);

  const handleNav = (page: PageId) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const handleUndo = async () => {
    if (!user || !undoAvailable || !online || undoing) return;
    setUndoing(true);
    try {
      const undone = await undoLastAddition(user.id);
      if (undone) {
        triggerRefresh();
        showToast('success', t('undoSuccess'));
      }
    } catch (error) {
      console.error('Undo failed:', error);
      showToast('error', t('undoFailed'));
    } finally {
      setUndoing(false);
    }
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-sidebar-100 text-sidebar-900">
      {/* Logo area */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shrink-0 shadow-lg shadow-primary-600/30">
          <Building2 size={22} />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-white truncate tracking-tight">{t('appName')}</h1>
          <p className="text-xs text-sidebar-700 font-medium">Contractor Pro</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {navGroups.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {group.label && (
              <p className="px-3 pb-1.5 text-[10px] font-semibold text-sidebar-600 uppercase tracking-wider">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User area */}
      <div className="px-3 py-3 border-t border-white/5">
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-lg bg-white/5">
          <div className="w-8 h-8 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center text-xs font-bold shrink-0">
            {user?.email?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-sidebar-900 truncate">{user?.email}</p>
          </div>
        </div>
        <button onClick={signOut} className="nav-item nav-item-inactive text-error-400 hover:bg-error-500/10 hover:text-error-300">
          <LogOut size={18} className="shrink-0" />
          <span>{t('signOut')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 start-0 w-64 z-30 flex-col shadow-sidebar">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className={`absolute inset-y-0 ${dir === 'rtl' ? 'right-0 animate-slide-in-rtl' : 'left-0 animate-slide-in'} w-72 shadow-2xl flex flex-col`}>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="lg:ps-64">
        {/* Header */}
        <header className="glass-header sticky top-0 z-20">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-2 rounded-lg text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                <Menu size={20} />
              </button>
              <h2 className="text-base font-semibold text-neutral-800 hidden sm:block">
                {navGroups.flatMap((g) => g.items).find((n) => n.id === currentPage)?.label}
              </h2>
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              {/* Global Search */}
              <GlobalSearch onNavigate={onNavigate} />

              {/* Sync state indicator */}
              <button
                onClick={() => online && pendingCount > 0 ? syncNow() : undefined}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${syncConfig[syncState].cls}`}
                title={syncConfig[syncState].label}
              >
                <SyncIcon size={14} className={syncState === 'syncing' ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{syncConfig[syncState].label}</span>
              </button>

              {/* Language selector */}
              <div className="relative">
                <button
                  onClick={() => setLangOpen(!langOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-700 text-sm hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                >
                  <span>{currentLang?.flag}</span>
                  <span className="hidden sm:inline">{currentLang?.label}</span>
                  <ChevronDown size={14} className="text-neutral-400" />
                </button>
                {langOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                    <div className="absolute end-0 top-full mt-1 z-20 bg-white rounded-xl border border-neutral-200 shadow-elevated py-1 min-w-[140px]">
                      {languages.map((l) => (
                        <button
                          key={l.code}
                          onClick={() => { setLanguage(l.code); setLangOpen(false); }}
                          className={`flex items-center gap-2 px-3 py-2 text-sm w-full text-start transition-colors ${
                            language === l.code ? 'bg-primary-50 text-primary-700 font-medium' : 'text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          <span>{l.flag}</span>
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={handleUndo}
                disabled={!undoAvailable || !online || undoing}
                className="p-2 rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={t('undoLastAddition')}
                aria-label={t('undoLastAddition')}
              >
                <Undo2 size={17} />
              </button>

              {/* Wallet indicator */}
              <button
                onClick={() => onNavigate('wallet')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-br from-success-50 to-success-100/50 text-success-700 font-semibold text-[11px] sm:text-xs hover:from-success-100 hover:to-success-200/60 transition-all border border-success-200/50 shadow-sm shadow-success-600/10"
              >
                <Wallet size={14} />
                <span className="max-w-[60px] truncate tabular-nums sm:max-w-[76px]">{formatCurrency(walletTotal)}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
          {children}
        </main>
      </div>

      {/* Mobile menu close button overlay */}
      {mobileOpen && (
        <button
          className="lg:hidden fixed top-3 z-50 p-2 rounded-lg bg-white shadow-md text-neutral-600"
          onClick={() => setMobileOpen(false)}
          style={dir === 'rtl' ? { left: '0.75rem' } : { right: '0.75rem' }}
        >
          <X size={20} />
        </button>
      )}
    </div>
  );
}

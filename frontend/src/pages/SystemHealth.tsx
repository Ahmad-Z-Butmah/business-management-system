import { useState, useEffect } from 'react';
import {
  Activity, Database, Wifi, Shield, RefreshCw, CheckCircle2,
  AlertCircle, HardDrive, Receipt, Loader2, Info,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { LoadingSpinner } from '@/components/Common';
import { getSettings, getAuditLogs, getTaxRules } from '@/lib/dataAccess';
import { supabase } from '@/lib/supabase';
import type { AppSettings } from '@/types';

export function SystemHealth() {
  const { t, formatDate } = useI18n();
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [auditCount, setAuditCount] = useState(0);
  const [lastTaxUpdate, setLastTaxUpdate] = useState<string | null>(null);
  const [online] = useState(navigator.onLine);
  const [dbConnected, setDbConnected] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [s, logs, rules] = await Promise.all([
          getSettings(user.id),
          getAuditLogs(user.id, 1),
          getTaxRules(user.id),
        ]);
        setSettings(s);
        setAuditCount(logs.length);
        if (rules.length > 0) {
          const sorted = [...rules].sort((a, b) => b.created_at.localeCompare(a.created_at));
          setLastTaxUpdate(sorted[0].created_at);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const checkDbConnection = async () => {
    setChecking(true);
    try {
      const { error } = await supabase.from('business_profiles').select('id').limit(1);
      setDbConnected(!error);
    } catch {
      setDbConnected(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { checkDbConnection(); }, []);

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const statusItems = [
    {
      label: t('databaseStatus'),
      status: dbConnected ? 'ok' : 'error',
      value: dbConnected ? t('connected') : t('disconnected'),
      icon: Database,
    },
    {
      label: t('syncStatus'),
      status: online ? 'ok' : 'warning',
      value: online ? t('online') : t('offline'),
      icon: Wifi,
    },
    {
      label: t('authStatus'),
      status: session ? 'ok' : 'error',
      value: session ? t('authenticated') : t('notAuthenticated'),
      icon: Shield,
    },
    {
      label: t('backupStatus'),
      status: settings?.last_backup_status === 'success' ? 'ok' : settings?.last_backup_status === 'failed' ? 'error' : 'neutral',
      value: settings?.last_backup_at ? formatDate(settings.last_backup_at) : t('noBackup'),
      icon: HardDrive,
    },
    {
      label: t('taxRulesLastUpdate'),
      status: lastTaxUpdate ? 'ok' : 'warning',
      value: lastTaxUpdate ? formatDate(lastTaxUpdate) : t('noTaxRules'),
      icon: Receipt,
    },
    {
      label: t('auditTrail'),
      status: 'ok',
      value: `${auditCount}+ ${t('records')}`,
      icon: Activity,
    },
  ];

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      ok: 'text-success-600 bg-success-50',
      warning: 'text-warning-600 bg-warning-50',
      error: 'text-error-600 bg-error-50',
      neutral: 'text-neutral-500 bg-neutral-50',
    };
    return map[s] || map.neutral;
  };

  const statusIcon = (s: string) => {
    if (s === 'ok') return <CheckCircle2 size={18} className="text-success-500" />;
    if (s === 'warning') return <AlertCircle size={18} className="text-warning-500" />;
    if (s === 'error') return <AlertCircle size={18} className="text-error-500" />;
    return <Info size={18} className="text-neutral-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">{t('systemHealth')}</h1>
        <button onClick={checkDbConnection} className="btn-secondary" disabled={checking}>
          {checking ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {t('refresh')}
        </button>
      </div>

      {/* Overall status */}
      <div className="card p-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${dbConnected && online ? 'bg-success-50 text-success-600' : 'bg-error-50 text-error-600'}`}>
            {dbConnected && online ? <CheckCircle2 size={28} /> : <AlertCircle size={28} />}
          </div>
          <div>
            <p className="text-base font-semibold text-neutral-900">
              {dbConnected && online ? t('systemHealthy') : t('systemIssues')}
            </p>
            <p className="text-sm text-neutral-500">{t('appVersion')}: 1.0.0</p>
          </div>
        </div>
      </div>

      {/* Status items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statusItems.map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="card-hover p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${statusColor(item.status)}`}>
                  <Icon size={18} />
                </div>
                {statusIcon(item.status)}
              </div>
              <p className="text-xs text-neutral-400">{item.label}</p>
              <p className="text-sm font-semibold text-neutral-900 mt-1">{item.value}</p>
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="card p-5">
        <div className="flex items-start gap-3 text-sm text-neutral-600">
          <Info size={18} className="shrink-0 mt-0.5 text-primary-500" />
          <p>{t('systemHealthInfo')}</p>
        </div>
      </div>
    </div>
  );
}

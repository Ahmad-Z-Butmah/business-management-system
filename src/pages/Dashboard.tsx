import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, Users, Building2, FileText,
  AlertCircle, ArrowUpRight, ArrowDownRight,
  Calendar, Receipt, Loader2, HardHat, Clock, ShieldCheck, ChevronLeft, PieChart,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useDataRefresh } from '@/contexts/DataRefreshProvider';
import {
  getWalletAccounts, getWalletTransactions, getDailyRegistrations,
  getClaims, getWorkerPayments, getBusinessProfile, getWorkshops,
} from '@/lib/dataAccess';
import { calculateWalletTotal, calculateContractorProfit } from '@/lib/calculations';
import type { WalletAccount, WalletTransaction, DailyRegistration, Claim, WorkerPayment, BusinessProfile, Workshop } from '@/types';

interface DashboardProps {
  onNavigate: (page: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { t, formatCurrency, formatDate, dir } = useI18n();
  const { user, settings } = useAuth();
  const { refreshKey } = useDataRefresh();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [todayRegs, setTodayRegs] = useState<DailyRegistration[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [payments, setPayments] = useState<WorkerPayment[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [allRegs, setAllRegs] = useState<DailyRegistration[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [accs, txs, regs, cls, pays, prof, ws] = await Promise.all([
          getWalletAccounts(user.id),
          getWalletTransactions(user.id),
          getDailyRegistrations(user.id, undefined, new Date().toISOString().split('T')[0]),
          getClaims(user.id),
          getWorkerPayments(user.id),
          getBusinessProfile(user.id),
          getWorkshops(user.id),
        ]);
        setAccounts(accs);
        setTransactions(txs);
        setTodayRegs(regs);
        setClaims(cls);
        setPayments(pays);
        setProfile(prof);
        setWorkshops(ws);
        const allRegData = await getDailyRegistrations(user.id);
        setAllRegs(allRegData);
      } catch (e) {
        console.error(e);
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle size={32} className="text-error-400" />
        <p className="text-sm text-neutral-500">{t('failedToLoad')}</p>
        <button onClick={() => window.location.reload()} className="btn-secondary text-sm">{t('retry')}</button>
      </div>
    );
  }

  const walletTotal = calculateWalletTotal(accounts, transactions);
  const pendingClaims = claims.filter((c) => c.status === 'draft' || c.status === 'prepared' || c.status === 'sent');
  const outstandingClaims = claims.filter((c) => c.status === 'sent' || c.status === 'partially_received');
  const moneyOwedToMe = outstandingClaims.reduce((sum, c) => sum + c.total, 0);
  const totalIOwe = payments.reduce((s, p) => s + p.amount, 0);

  const { totalProfit: contractorProfit, byWorkshop: profitByWorkshop } = useMemo(
    () => calculateContractorProfit(claims, workshops, allRegs),
    [claims, workshops, allRegs],
  );

  const todayWorkshops = new Set(todayRegs.map((r) => r.workshop_id));

  const recentTx = transactions.slice(0, 5);
  const recentPayments = payments.slice(0, 5);

  const incomeTx = transactions.filter((t) => t.type === 'income' || t.type === 'claim_receipt');
  const expenseTx = transactions.filter((t) => t.type === 'expense' || t.type === 'worker_payment');
  const totalIncome = incomeTx.reduce((s, t) => s + t.amount, 0);
  const totalExpenses = expenseTx.reduce((s, t) => s + t.amount, 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('goodMorning') : hour < 18 ? t('goodAfternoon') : t('goodEvening');
  const displayName = profile?.business_name || t('appName');
  const ChevronArrow = dir === 'rtl' ? ChevronLeft : ChevronLeft;

  return (
    <div className="space-y-6">
      {/* Greeting header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          {profile?.logo_url ? (
            <img src={profile.logo_url} alt="logo" className="w-14 h-14 rounded-2xl object-cover border border-neutral-200 shadow-sm" />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-lg shadow-primary-600/25">
              <Building2 size={28} />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
              {greeting}
            </h1>
            <p className="text-sm text-neutral-400 mt-0.5 flex items-center gap-1.5">
              <Calendar size={14} />
              {formatDate(new Date())}
            </p>
          </div>
        </div>

        {/* Backup status pill */}
        {settings?.last_backup_at && (
          <button
            onClick={() => onNavigate('settings')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-neutral-200/70 shadow-card text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:border-neutral-300 transition-all"
          >
            <ShieldCheck size={15} className={settings.last_backup_status === 'success' ? 'text-success-500' : 'text-error-500'} />
            <span className="hidden sm:inline">{t('backupStatus')}</span>
            <span className={settings.last_backup_status === 'success' ? 'text-success-600' : 'text-error-600'}>
              {settings.last_backup_status === 'success' ? t('verified') : t('failed')}
            </span>
          </button>
        )}
      </div>

      {/* Primary financial hero cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Wallet total - featured card */}
        <button
          onClick={() => onNavigate('wallet')}
          className="card-hover p-6 text-start relative overflow-hidden group col-span-1 sm:col-span-1"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-success-50 to-transparent opacity-60" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-success-100 text-success-600 flex items-center justify-center">
                <Wallet size={24} />
              </div>
              <ChevronArrow size={18} className="text-neutral-300 group-hover:text-success-500 transition-colors" />
            </div>
            <p className="text-xs text-neutral-400 font-medium mb-1">{t('totalBalance')}</p>
            <p className="text-3xl font-bold text-neutral-900 tracking-tight">{formatCurrency(walletTotal)}</p>
          </div>
        </button>

        {/* Money owed to me */}
        <button
          onClick={() => onNavigate('claims')}
          className="card-hover p-6 text-start relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-warning-50/50 to-transparent opacity-60" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-warning-100 text-warning-600 flex items-center justify-center">
                <TrendingUp size={24} />
              </div>
              <ChevronArrow size={18} className="text-neutral-300 group-hover:text-warning-500 transition-colors" />
            </div>
            <p className="text-xs text-neutral-400 font-medium mb-1">{t('moneyOwedToMe')}</p>
            <p className="text-3xl font-bold text-neutral-900 tracking-tight">{formatCurrency(moneyOwedToMe)}</p>
          </div>
        </button>

        {/* Money I owe */}
        <button
          onClick={() => onNavigate('workerSettlement')}
          className="card-hover p-6 text-start relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-error-50/50 to-transparent opacity-60" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-error-100 text-error-600 flex items-center justify-center">
                <TrendingDown size={24} />
              </div>
              <ChevronArrow size={18} className="text-neutral-300 group-hover:text-error-500 transition-colors" />
            </div>
            <p className="text-xs text-neutral-400 font-medium mb-1">{t('moneyIOwe')}</p>
            <p className="text-3xl font-bold text-neutral-900 tracking-tight">{formatCurrency(totalIOwe)}</p>
          </div>
        </button>
      </div>

      {/* Daily operational summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: t('todaysWorkers'), value: String(todayRegs.length), icon: Users, iconBg: 'bg-primary-100 text-primary-600', onClick: () => onNavigate('dailyRegistration') },
          { label: t('todaysWorkshops'), value: String(todayWorkshops.size), icon: Building2, iconBg: 'bg-info-100 text-info-600', onClick: () => onNavigate('workshops') },
          { label: t('pendingClaims'), value: String(pendingClaims.length), icon: FileText, iconBg: 'bg-warning-100 text-warning-600', onClick: () => onNavigate('claims') },
          { label: t('workerPayments'), value: String(payments.length), icon: AlertCircle, iconBg: 'bg-error-100 text-error-600', onClick: () => onNavigate('workerSettlement') },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <button
              key={i}
              onClick={card.onClick}
              className="card-hover p-4 text-start"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card.iconBg}`}>
                <Icon size={20} />
              </div>
              <p className="text-xs text-neutral-400 mb-1">{card.label}</p>
              <p className="text-xl font-bold text-neutral-900">{card.value}</p>
            </button>
          );
        })}
      </div>

      {/* Income / Expense summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-success-50/40 to-transparent" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success-100 text-success-600 flex items-center justify-center">
              <ArrowUpRight size={20} />
            </div>
            <div>
              <p className="text-xs text-neutral-400">{t('recentIncome')}</p>
              <p className="text-lg font-bold text-neutral-900">{formatCurrency(totalIncome)}</p>
            </div>
          </div>
        </div>
        <div className="card p-5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-error-50/40 to-transparent" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-error-100 text-error-600 flex items-center justify-center">
              <ArrowDownRight size={20} />
            </div>
            <div>
              <p className="text-xs text-neutral-400">{t('recentExpenses')}</p>
              <p className="text-lg font-bold text-neutral-900">{formatCurrency(totalExpenses)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Contractor Profit Breakdown */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title flex items-center gap-2">
            <PieChart size={18} className="text-primary-500" />
            {t('contractorProfit')}
          </h3>
          <button onClick={() => onNavigate('workshops')} className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors">
            {t('all')}
          </button>
        </div>

        <div className="flex items-center justify-between mb-4 pb-4 border-b border-neutral-100">
          <div>
            <p className="text-xs text-neutral-400 mb-1">{t('moneyOwedToMe')}</p>
            <p className="text-2xl font-bold text-neutral-900">{formatCurrency(contractorProfit)}</p>
          </div>
          <div className="text-end">
            <p className="text-xs text-neutral-400 mb-1">{t('profitBreakdown')}</p>
            <p className="text-sm font-medium text-neutral-600">{profitByWorkshop.filter((w) => w.profit !== 0).length} {t('workshop')}</p>
          </div>
        </div>

        {profitByWorkshop.filter((w) => w.profit !== 0).length === 0 ? (
          <div className="text-center py-8">
            <PieChart size={32} className="text-neutral-300 mx-auto mb-2" />
            <p className="text-sm text-neutral-400">{t('noProfitData')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {profitByWorkshop.filter((w) => w.profit !== 0).map((wp) => (
              <div key={wp.workshopId} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-neutral-50 transition-colors border border-neutral-100">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 size={14} className="text-neutral-400 shrink-0" />
                    <p className="text-sm font-medium text-neutral-700 truncate">{wp.workshopName}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className={`px-1.5 py-0.5 rounded ${wp.model === 'percentage' ? 'bg-primary-50 text-primary-600' : 'bg-info-50 text-info-600'}`}>
                      {wp.model === 'percentage' ? `${t('percentageModel')} · ${wp.managementFeePercent}%` : t('marginModel')}
                    </span>
                    <span>{t('totalClaimed')}: {formatCurrency(wp.totalClaimed)}</span>
                    {wp.model === 'margin' && <span>· {t('workerWages')}: {formatCurrency(wp.totalWorkerWages)}</span>}
                  </div>
                </div>
                <span className={`text-sm font-bold shrink-0 ${wp.profit >= 0 ? 'text-success-600' : 'text-error-600'}`}>
                  {wp.profit >= 0 ? '+' : ''}{formatCurrency(wp.profit)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent transactions */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title flex items-center gap-2">
              <Wallet size={18} className="text-primary-500" />
              {t('recentActivity')}
            </h3>
            <button onClick={() => onNavigate('wallet')} className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors">
              {t('allAccounts')}
            </button>
          </div>
          {recentTx.length === 0 ? (
            <div className="text-center py-8">
              <Wallet size={32} className="text-neutral-300 mx-auto mb-2" />
              <p className="text-sm text-neutral-400">{t('noRecentActivity')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentTx.map((tx) => {
                const isIncome = tx.type === 'income' || tx.type === 'transfer_in' || tx.type === 'opening_balance' || tx.type === 'claim_receipt';
                const account = accounts.find((a) => a.id === tx.wallet_account_id);
                return (
                  <div key={tx.id} className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-neutral-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isIncome ? 'bg-success-50 text-success-600' : 'bg-error-50 text-error-600'
                      }`}>
                        {isIncome ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-700 truncate">{tx.description || account?.name || t('transactions')}</p>
                        <p className="text-xs text-neutral-400">{formatDate(tx.transaction_date)}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${isIncome ? 'text-success-600' : 'text-error-600'}`}>
                      {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent payments */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title flex items-center gap-2">
              <Users size={18} className="text-primary-500" />
              {t('recentPayments')}
            </h3>
            <button onClick={() => onNavigate('workerPayments')} className="text-xs text-primary-600 hover:text-primary-700 font-medium transition-colors">
              {t('all')}
            </button>
          </div>
          {recentPayments.length === 0 ? (
            <div className="text-center py-8">
              <Users size={32} className="text-neutral-300 mx-auto mb-2" />
              <p className="text-sm text-neutral-400">{t('noPayments')}</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-primary-50 text-primary-600">
                      <HardHat size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-700 truncate">{p.worker?.full_name || t('workers')}</p>
                      <p className="text-xs text-neutral-400 flex items-center gap-1">
                        <Clock size={11} />
                        {formatDate(p.payment_date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-error-600">{formatCurrency(p.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="card p-5">
        <h3 className="section-title mb-4">{t('quickActions')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => onNavigate('dailyRegistration')} className="btn-primary py-3">
            <Calendar size={18} /> {t('dailyRegistration')}
          </button>
          <button onClick={() => onNavigate('claims')} className="btn-secondary py-3">
            <FileText size={18} /> {t('createClaim')}
          </button>
          <button onClick={() => onNavigate('workers')} className="btn-secondary py-3">
            <Users size={18} /> {t('addWorker')}
          </button>
          <button onClick={() => onNavigate('wallet')} className="btn-secondary py-3">
            <Wallet size={18} /> {t('wallet')}
          </button>
        </div>
      </div>
    </div>
  );
}

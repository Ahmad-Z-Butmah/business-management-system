import { useState, useEffect } from 'react';
import {
  BarChart3, Users, Building2, HardHat, FileText, Wallet,
  TrendingUp, TrendingDown, Receipt, Printer, Download, Loader2,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { LoadingSpinner, EmptyState } from '@/components/Common';
import {
  getWorkers, getWorkshops, getContractors, getClaims,
  getWalletAccounts, getWalletTransactions, getDailyRegistrations,
  getWorkerPayments,
} from '@/lib/dataAccess';
import {
  calculateRegistrationTotal, calculateWorkerEarnings,
  calculateWorkerPayments, calculateAccountBalance, calculateWalletTotal,
} from '@/lib/calculations';
import type {
  Worker, Workshop, Contractor, Claim, WalletAccount,
  WalletTransaction, DailyRegistration, WorkerPayment,
} from '@/types';

type ReportType = 'worker' | 'workshop' | 'contractor' | 'claims' | 'wallet' | 'profitLoss';

export function Reports() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<ReportType>('worker');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [registrations, setRegistrations] = useState<DailyRegistration[]>([]);
  const [payments, setPayments] = useState<WorkerPayment[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [w, ws, c, cl, a, tx, r, p] = await Promise.all([
          getWorkers(user.id),
          getWorkshops(user.id),
          getContractors(user.id),
          getClaims(user.id),
          getWalletAccounts(user.id),
          getWalletTransactions(user.id),
          getDailyRegistrations(user.id),
          getWorkerPayments(user.id),
        ]);
        setWorkers(w); setWorkshops(ws); setContractors(c); setClaims(cl);
        setAccounts(a); setTransactions(tx); setRegistrations(r); setPayments(p);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const reportTypes: { id: ReportType; icon: typeof Users; label: string }[] = [
    { id: 'worker', icon: Users, label: t('workerReport') },
    { id: 'workshop', icon: Building2, label: t('workshopReport') },
    { id: 'contractor', icon: HardHat, label: t('contractorReport') },
    { id: 'claims', icon: FileText, label: t('claimsReport') },
    { id: 'wallet', icon: Wallet, label: t('walletReport') },
    { id: 'profitLoss', icon: TrendingUp, label: t('profitLoss') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-neutral-900">{t('reports')}</h1>
        <button onClick={() => window.print()} className="btn-secondary no-print"><Printer size={18} /> {t('print')}</button>
      </div>

      {/* Report type tabs */}
      <div className="flex flex-wrap gap-2">
        {reportTypes.map((rt) => {
          const Icon = rt.icon;
          return (
            <button
              key={rt.id}
              onClick={() => setActiveReport(rt.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeReport === rt.id
                  ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20'
                  : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300 hover:-translate-y-0.5'
              }`}
            >
              <Icon size={16} />
              {rt.label}
            </button>
          );
        })}
      </div>

      {/* Report content */}
      <div className="card p-6">
        {activeReport === 'worker' && <WorkerReport workers={workers} registrations={registrations} payments={payments} />}
        {activeReport === 'workshop' && <WorkshopReport workshops={workshops} registrations={registrations} />}
        {activeReport === 'contractor' && <ContractorReport contractors={contractors} workshops={workshops} claims={claims} />}
        {activeReport === 'claims' && <ClaimsReport claims={claims} />}
        {activeReport === 'wallet' && <WalletReport accounts={accounts} transactions={transactions} />}
        {activeReport === 'profitLoss' && <ProfitLossReport claims={claims} registrations={registrations} payments={payments} transactions={transactions} />}
      </div>
    </div>
  );
}

function WorkerReport({ workers, registrations, payments }: { workers: Worker[]; registrations: DailyRegistration[]; payments: WorkerPayment[] }) {
  const { t, formatCurrency } = useI18n();
  return (
    <div>
      <h3 className="section-title mb-5">{t('workerReport')}</h3>
      {workers.length === 0 ? (
        <EmptyState icon={<Users size={48} />} title={t('noWorkers')} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 table-header">
                <tr>
                  <th className="px-4 py-3 text-start">{t('name')}</th>
                  <th className="px-4 py-3 text-start">{t('profession')}</th>
                  <th className="px-4 py-3 text-center">{t('totalRegistrations')}</th>
                  <th className="px-4 py-3 text-end">{t('totalEarnings')}</th>
                  <th className="px-4 py-3 text-end">{t('totalPaid')}</th>
                  <th className="px-4 py-3 text-end">{t('totalOwed')}</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => {
                  const earnings = calculateWorkerEarnings(registrations, w.id);
                  const paid = calculateWorkerPayments(payments, w.id);
                  const owed = Math.max(0, earnings - paid);
                  const regCount = registrations.filter((r) => r.worker_id === w.id).length;
                  return (
                    <tr key={w.id} className="border-t border-neutral-100 table-row">
                      <td className="px-4 py-3 font-medium text-neutral-900">{w.full_name}</td>
                      <td className="px-4 py-3 text-neutral-600">{w.profession || '-'}</td>
                      <td className="px-4 py-3 text-center text-neutral-600">{regCount}</td>
                      <td className="px-4 py-3 text-end text-neutral-700">{formatCurrency(earnings)}</td>
                      <td className="px-4 py-3 text-end text-success-600">{formatCurrency(paid)}</td>
                      <td className="px-4 py-3 text-end text-error-600 font-medium">{formatCurrency(owed)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkshopReport({ workshops, registrations }: { workshops: Workshop[]; registrations: DailyRegistration[] }) {
  const { t, formatCurrency } = useI18n();
  return (
    <div>
      <h3 className="section-title mb-5">{t('workshopReport')}</h3>
      {workshops.length === 0 ? (
        <EmptyState icon={<Building2 size={48} />} title={t('noWorkshops')} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 table-header">
                <tr>
                  <th className="px-4 py-3 text-start">{t('workshopName')}</th>
                  <th className="px-4 py-3 text-start">{t('contractor')}</th>
                  <th className="px-4 py-3 text-center">{t('totalWorkers')}</th>
                  <th className="px-4 py-3 text-center">{t('totalRegistrations')}</th>
                  <th className="px-4 py-3 text-end">{t('workerCosts')}</th>
                </tr>
              </thead>
              <tbody>
                {workshops.map((w) => {
                  const wsRegs = registrations.filter((r) => r.workshop_id === w.id);
                  const uniqueWorkers = new Set(wsRegs.map((r) => r.worker_id)).size;
                  const totalCost = wsRegs.reduce((s, r) => s + calculateRegistrationTotal(r), 0);
                  return (
                    <tr key={w.id} className="border-t border-neutral-100 table-row">
                      <td className="px-4 py-3 font-medium text-neutral-900">{w.name}</td>
                      <td className="px-4 py-3 text-neutral-600">{w.contractor?.name || '-'}</td>
                      <td className="px-4 py-3 text-center text-neutral-600">{uniqueWorkers}</td>
                      <td className="px-4 py-3 text-center text-neutral-600">{wsRegs.length}</td>
                      <td className="px-4 py-3 text-end text-error-600">{formatCurrency(totalCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractorReport({ contractors, workshops, claims }: { contractors: Contractor[]; workshops: Workshop[]; claims: Claim[] }) {
  const { t, formatCurrency } = useI18n();
  return (
    <div>
      <h3 className="section-title mb-5">{t('contractorReport')}</h3>
      {contractors.length === 0 ? (
        <EmptyState icon={<HardHat size={48} />} title={t('noContractors')} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 table-header">
                <tr>
                  <th className="px-4 py-3 text-start">{t('contractorName')}</th>
                  <th className="px-4 py-3 text-center">{t('workshops')}</th>
                  <th className="px-4 py-3 text-center">{t('claims')}</th>
                  <th className="px-4 py-3 text-end">{t('revenue')}</th>
                  <th className="px-4 py-3 text-end">{t('outstandingRevenue')}</th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((c) => {
                  const cWorkshops = workshops.filter((w) => w.contractor_id === c.id);
                  const cClaims = claims.filter((cl) => cl.contractor_id === c.id);
                  const revenue = cClaims.reduce((s, cl) => s + cl.total, 0);
                  const outstanding = cClaims.filter((cl) => cl.status === 'sent' || cl.status === 'partially_received').reduce((s, cl) => s + cl.total, 0);
                  return (
                    <tr key={c.id} className="border-t border-neutral-100 table-row">
                      <td className="px-4 py-3 font-medium text-neutral-900">{c.name}</td>
                      <td className="px-4 py-3 text-center text-neutral-600">{cWorkshops.length}</td>
                      <td className="px-4 py-3 text-center text-neutral-600">{cClaims.length}</td>
                      <td className="px-4 py-3 text-end text-success-600">{formatCurrency(revenue)}</td>
                      <td className="px-4 py-3 text-end text-warning-600">{formatCurrency(outstanding)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ClaimsReport({ claims }: { claims: Claim[] }) {
  const { t, formatCurrency, formatDate } = useI18n();
  return (
    <div>
      <h3 className="section-title mb-5">{t('claimsReport')}</h3>
      {claims.length === 0 ? (
        <EmptyState icon={<FileText size={48} />} title={t('noClaims')} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 table-header">
                <tr>
                  <th className="px-4 py-3 text-start">{t('claimNumber')}</th>
                  <th className="px-4 py-3 text-start">{t('workshop')}</th>
                  <th className="px-4 py-3 text-start">{t('date')}</th>
                  <th className="px-4 py-3 text-center">{t('status')}</th>
                  <th className="px-4 py-3 text-end">{t('subtotal')}</th>
                  <th className="px-4 py-3 text-end">{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className="border-t border-neutral-100 table-row">
                    <td className="px-4 py-3 font-medium text-neutral-900">{c.claim_number}</td>
                    <td className="px-4 py-3 text-neutral-600">{c.workshop?.name}</td>
                    <td className="px-4 py-3 text-neutral-600">{formatDate(c.claim_date)}</td>
                    <td className="px-4 py-3 text-center"><span className="badge-neutral badge">{t(c.status)}</span></td>
                    <td className="px-4 py-3 text-end text-neutral-600">{formatCurrency(c.subtotal)}</td>
                    <td className="px-4 py-3 text-end font-semibold text-neutral-900">{formatCurrency(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function WalletReport({ accounts, transactions }: { accounts: WalletAccount[]; transactions: WalletTransaction[] }) {
  const { t, formatCurrency } = useI18n();
  const totalBalance = calculateWalletTotal(accounts, transactions);
  return (
    <div>
      <h3 className="section-title mb-5">{t('walletReport')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        {accounts.map((acc) => {
          const balance = calculateAccountBalance(acc, transactions);
          const accTx = transactions.filter((tx) => tx.wallet_account_id === acc.id);
          const income = accTx.filter((tx) => tx.type === 'income' || tx.type === 'claim_receipt' || tx.type === 'opening_balance').reduce((s, tx) => s + tx.amount, 0);
          const expenses = accTx.filter((tx) => tx.type === 'expense' || tx.type === 'worker_payment' || tx.type === 'transfer_out').reduce((s, tx) => s + tx.amount, 0);
          return (
            <div key={acc.id} className="card-hover p-5">
              <p className="text-sm font-semibold text-neutral-700 mb-1">{acc.name}</p>
              <p className="text-2xl font-bold text-neutral-900 mb-3">{formatCurrency(balance)}</p>
              <div className="flex gap-4 text-xs">
                <span className="text-success-600">{t('income')}: {formatCurrency(income)}</span>
                <span className="text-error-600">{t('expenses')}: {formatCurrency(expenses)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="p-5 rounded-xl bg-success-50 border border-success-200/60">
        <p className="text-sm text-neutral-600">{t('combinedTotal')}</p>
        <p className="text-2xl font-bold text-success-700 mt-1">{formatCurrency(totalBalance)}</p>
      </div>
    </div>
  );
}

function ProfitLossReport({ claims, registrations, payments, transactions }: { claims: Claim[]; registrations: DailyRegistration[]; payments: WorkerPayment[]; transactions: WalletTransaction[] }) {
  const { t, formatCurrency } = useI18n();
  const revenue = claims.reduce((s, c) => s + c.total, 0);
  const receivedRevenue = claims.filter((c) => c.status === 'fully_received' || c.status === 'partially_received').reduce((s, c) => s + c.total, 0);
  const outstandingRevenue = revenue - receivedRevenue;
  const workerEarnings = registrations.reduce((s, r) => s + calculateRegistrationTotal(r), 0);
  const workerPaymentsTotal = payments.reduce((s, p) => s + p.amount, 0);
  const drivingCosts = registrations.filter((r) => r.has_driving_outbound || r.has_driving_return).reduce((s, r) => s + r.driving_amount, 0);
  const otherExpenses = transactions.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
  const netResult = receivedRevenue - workerPaymentsTotal - drivingCosts - otherExpenses;

  const rows = [
    { label: t('revenue'), value: revenue, color: 'text-neutral-700' },
    { label: t('receivedRevenue'), value: receivedRevenue, color: 'text-success-600' },
    { label: t('outstandingRevenue'), value: outstandingRevenue, color: 'text-warning-600' },
    { label: t('workerCosts'), value: workerEarnings, color: 'text-error-600', expense: true },
    { label: t('workerPayments'), value: workerPaymentsTotal, color: 'text-error-600', expense: true },
    { label: t('drivingCosts'), value: drivingCosts, color: 'text-error-600', expense: true },
    { label: t('otherExpenses'), value: otherExpenses, color: 'text-error-600', expense: true },
  ];

  return (
    <div>
      <h3 className="section-title mb-5">{t('profitLoss')}</h3>
      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-50/80 hover:bg-neutral-100 transition-colors">
            <span className="text-sm text-neutral-600">{r.label}</span>
            <span className={`text-sm font-semibold ${r.color}`}>{r.expense ? '-' : ''}{formatCurrency(r.value)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between py-4 px-4 rounded-xl bg-primary-50 border border-primary-200/60">
          <span className="text-sm font-bold text-neutral-900">{t('netResult')}</span>
          <span className={`text-lg font-bold ${netResult >= 0 ? 'text-success-700' : 'text-error-700'}`}>
            {formatCurrency(netResult)}
          </span>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Users, Loader2, ArrowLeft, Printer, Wallet,
  Banknote, CheckCircle2,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useDataRefresh } from '@/contexts/DataRefreshProvider';
import { recordUndoAction } from '@/lib/undoHistory';
import { Modal } from '@/components/Modal';
import { EmptyState, LoadingSpinner } from '@/components/Common';
import {
  getWorkers, getWorkerPayments, createWorkerPayment,
  getWalletAccounts, createWalletTransaction, addAuditLog,
  getDailyRegistrations, getWorkshops, getBusinessProfile,
} from '@/lib/dataAccess';
import { calculateRegistrationTotal } from '@/lib/calculations';
import type {
  Worker, WorkerPayment, WalletAccount, DailyRegistration,
  Workshop, BusinessProfile,
} from '@/types';

type PaymentStatus = 'paid' | 'partially_paid' | 'unpaid';
type FilterStatus = 'all' | PaymentStatus;
type SortBy = 'name' | 'earned' | 'remaining' | 'status';

interface WorkerSettlement {
  worker: Worker;
  registrations: DailyRegistration[];
  payments: WorkerPayment[];
  workDays: number;
  baseWages: number;
  overtimeAmount: number;
  drivingAmount: number;
  totalEarned: number;
  totalPaid: number;
  remaining: number;
  status: PaymentStatus;
}

function getMonthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

function getStatus(remaining: number, paid: number): PaymentStatus {
  if (remaining <= 0) return 'paid';
  if (paid > 0) return 'partially_paid';
  return 'unpaid';
}

export function WorkerSettlement() {
  const { t, formatCurrency, formatDate, dir } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { triggerRefresh, refreshKey } = useDataRefresh();

  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [allRegistrations, setAllRegistrations] = useState<DailyRegistration[]>([]);
  const [allPayments, setAllPayments] = useState<WorkerPayment[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState(getMonthRange(now.getFullYear(), now.getMonth()).start);
  const [customEnd, setCustomEnd] = useState(getMonthRange(now.getFullYear(), now.getMonth()).end);

  const [selectedWorker, setSelectedWorker] = useState<WorkerSettlement | null>(null);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<WorkerSettlement | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [showStatement, setShowStatement] = useState(false);

  const [payForm, setPayForm] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split('T')[0],
    wallet_account_id: '',
    description: '',
    notes: '',
  });

  const dateRange = useMemo(() => {
    if (useCustomRange) return { start: customStart, end: customEnd };
    return getMonthRange(year, month);
  }, [useCustomRange, customStart, customEnd, year, month]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [w, r, p, ws, acc, prof] = await Promise.all([
          getWorkers(user.id),
          getDailyRegistrations(user.id),
          getWorkerPayments(user.id),
          getWorkshops(user.id),
          getWalletAccounts(user.id),
          getBusinessProfile(user.id),
        ]);
        setWorkers(w);
        setAllRegistrations(r);
        setAllPayments(p);
        setWorkshops(ws);
        setAccounts(acc);
        setProfile(prof);
        if (acc.length > 0) setPayForm((prev) => ({ ...prev, wallet_account_id: acc[0].id }));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, refreshKey]);

  const settlements = useMemo<WorkerSettlement[]>(() => {
    const { start, end } = dateRange;
    const result: WorkerSettlement[] = [];

    for (const worker of workers) {
      const workerRegs = allRegistrations
        .filter((r) => r.worker_id === worker.id)
        .filter((r) => r.work_date >= start && r.work_date <= end)
        .sort((a, b) => a.work_date.localeCompare(b.work_date));

      const workerPayments = allPayments
        .filter((p) => p.worker_id === worker.id)
        .filter((p) => p.payment_date >= start && p.payment_date <= end)
        .sort((a, b) => a.payment_date.localeCompare(b.payment_date));

      if (workerRegs.length === 0 && workerPayments.length === 0) continue;

      let baseWages = 0;
      let overtimeAmount = 0;
      let drivingAmount = 0;

      for (const reg of workerRegs) {
        const headcount = reg.headcount || 1;
        baseWages += reg.daily_wage * headcount;
        if (reg.has_overtime) {
          overtimeAmount += reg.overtime_hours * reg.overtime_rate;
        }
        if (reg.has_driving_outbound) drivingAmount += reg.driving_amount;
        if (reg.has_driving_return) drivingAmount += reg.driving_amount;
      }

      const totalEarned = baseWages + overtimeAmount + drivingAmount;
      const totalPaid = workerPayments.reduce((s, p) => s + p.amount, 0);
      const remaining = totalEarned - totalPaid;
      const status = getStatus(remaining, totalPaid);

      result.push({
        worker,
        registrations: workerRegs,
        payments: workerPayments,
        workDays: workerRegs.length,
        baseWages,
        overtimeAmount,
        drivingAmount,
        totalEarned,
        totalPaid,
        remaining: Math.max(0, remaining),
        status,
      });
    }

    return result;
  }, [workers, allRegistrations, allPayments, dateRange]);

  const filteredSettlements = useMemo(() => {
    let list = settlements;
    if (filterStatus !== 'all') {
      list = list.filter((s) => s.status === filterStatus);
    }
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'earned': return b.totalEarned - a.totalEarned;
        case 'remaining': return b.remaining - a.remaining;
        case 'status': {
          const order: Record<PaymentStatus, number> = { unpaid: 0, partially_paid: 1, paid: 2 };
          return order[a.status] - order[b.status];
        }
        default: return a.worker.full_name.localeCompare(b.worker.full_name);
      }
    });
    return list;
  }, [settlements, filterStatus, sortBy]);

  const totals = useMemo(() => {
    return settlements.reduce(
      (acc, s) => ({
        baseWages: acc.baseWages + s.baseWages,
        overtime: acc.overtime + s.overtimeAmount,
        driving: acc.driving + s.drivingAmount,
        earned: acc.earned + s.totalEarned,
        paid: acc.paid + s.totalPaid,
        remaining: acc.remaining + s.remaining,
      }),
      { baseWages: 0, overtime: 0, driving: 0, earned: 0, paid: 0, remaining: 0 },
    );
  }, [settlements]);

  const workshopName = (id: string) => workshops.find((w) => w.id === id)?.name || '-';
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name || '-';

  const openPayModal = (s: WorkerSettlement) => {
    setPayTarget(s);
    setPayForm({
      amount: s.remaining,
      payment_date: new Date().toISOString().split('T')[0],
      wallet_account_id: accounts[0]?.id || '',
      description: `${t('workerSettlement')} - ${s.worker.full_name}`,
      notes: '',
    });
    setPayModalOpen(true);
  };

  const handlePay = async () => {
    if (!user || !payTarget || payForm.amount <= 0 || !payForm.wallet_account_id) return;
    setSaving(true);
    try {
      const payment = await createWorkerPayment({
        user_id: user.id,
        worker_id: payTarget.worker.id,
        payment_date: payForm.payment_date,
        amount: payForm.amount,
        wallet_account_id: payForm.wallet_account_id,
        description: payForm.description,
        notes: payForm.notes,
        period_start: dateRange.start,
        period_end: dateRange.end,
        is_period_closed: false,
      });
      const walletTransaction = await createWalletTransaction({
        user_id: user.id,
        wallet_account_id: payForm.wallet_account_id,
        transaction_date: payForm.payment_date,
        type: 'worker_payment',
        amount: payForm.amount,
        description: `${t('workerPayments')} - ${payTarget.worker.full_name}`,
        related_worker_id: payTarget.worker.id,
        related_contractor_id: null,
        related_claim_id: null,
        transfer_pair_id: null,
        notes: '',
      });
      recordUndoAction(user.id, [
        { table: 'wallet_transactions', ids: [walletTransaction.id] },
        { table: 'worker_payments', ids: [payment.id] },
      ]);
      await addAuditLog({
        user_id: user.id,
        action: 'worker_settlement_payment',
        entity_type: 'worker_payment',
        entity_id: payment.id,
        details: { worker_id: payTarget.worker.id, amount: payForm.amount, period: `${dateRange.start} to ${dateRange.end}` },
      });
      showToast('success', t('paymentSaved'));
      setPayModalOpen(false);

      const [newPayments] = await Promise.all([getWorkerPayments(user.id)]);
      setAllPayments(newPayments);
      setPayTarget(null);
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    setShowStatement(true);
    setTimeout(() => {
      window.print();
      setShowStatement(false);
    }, 100);
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const monthNames = [
    '01', '02', '03', '04', '05', '06',
    '07', '08', '09', '10', '11', '12',
  ];

  const statusBadge = (status: PaymentStatus) => {
    if (status === 'paid') return <span className="badge-success">{t('paid')}</span>;
    if (status === 'partially_paid') return <span className="badge-warning">{t('partiallyPaid')}</span>;
    return <span className="badge-error">{t('unpaid')}</span>;
  };

  if (selectedWorker) {
    return (
      <div className="space-y-6 no-print">
        <button onClick={() => setSelectedWorker(null)} className="btn-ghost">
          <ArrowLeft size={18} className={dir === 'rtl' ? 'rotate-180' : ''} />
          {t('workerSettlement')}
        </button>

        {/* Worker header */}
        <div className="card p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center text-xl font-bold">
                {selectedWorker.worker.full_name[0]?.toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-neutral-900">{selectedWorker.worker.full_name}</h2>
                <p className="text-sm text-neutral-400">
                  {t('settlementPeriod')}: {formatDate(dateRange.start)} — {formatDate(dateRange.end)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handlePrint} className="btn-secondary">
                <Printer size={18} /> {t('print')}
              </button>
              <button onClick={() => openPayModal(selectedWorker)} className="btn-primary">
                <Wallet size={18} /> {t('payWorker')}
              </button>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card">
            <p className="text-xs text-neutral-400">{t('workDays')}</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{selectedWorker.workDays}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-neutral-400">{t('totalEarned')}</p>
            <p className="text-2xl font-bold text-success-600 mt-1">{formatCurrency(selectedWorker.totalEarned)}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-neutral-400">{t('totalPaid')}</p>
            <p className="text-2xl font-bold text-primary-600 mt-1">{formatCurrency(selectedWorker.totalPaid)}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs text-neutral-400">{t('remaining')}</p>
            <p className={`text-2xl font-bold mt-1 ${selectedWorker.remaining > 0 ? 'text-error-600' : 'text-success-600'}`}>
              {formatCurrency(selectedWorker.remaining)}
            </p>
          </div>
        </div>

        {/* Daily work table */}
        <div className="card p-6">
          <h3 className="section-title mb-5 flex items-center gap-2">
            <Calendar size={18} className="text-primary-500" />
            {t('settlementDetails')}
          </h3>
          {selectedWorker.registrations.length === 0 ? (
            <p className="text-sm text-neutral-400 py-8 text-center">{t('noSettlementData')}</p>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="table-header text-start py-3 px-2">{t('date')}</th>
                    <th className="table-header text-start py-3 px-2">{t('workshops')}</th>
                    <th className="table-header text-end py-3 px-2">{t('dailyWage')}</th>
                    <th className="table-header text-end py-3 px-2">{t('overtimeHours')}</th>
                    <th className="table-header text-end py-3 px-2">{t('overtimeRate')}</th>
                    <th className="table-header text-end py-3 px-2">{t('overtimeAmount')}</th>
                    <th className="table-header text-center py-3 px-2">{t('drivingOutbound')}</th>
                    <th className="table-header text-center py-3 px-2">{t('drivingReturn')}</th>
                    <th className="table-header text-end py-3 px-2">{t('drivingAmount2')}</th>
                    <th className="table-header text-end py-3 px-2">{t('dailyTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedWorker.registrations.map((reg) => {
                    const headcount = reg.headcount || 1;
                    const otAmt = reg.has_overtime ? reg.overtime_hours * reg.overtime_rate : 0;
                    const drvAmt = (reg.has_driving_outbound ? reg.driving_amount : 0) + (reg.has_driving_return ? reg.driving_amount : 0);
                    const dailyTotal = calculateRegistrationTotal(reg);
                    return (
                      <tr key={reg.id} className="table-row border-b border-neutral-100">
                        <td className="py-3 px-2 text-neutral-600 whitespace-nowrap">{formatDate(reg.work_date)}</td>
                        <td className="py-3 px-2 text-neutral-600">{workshopName(reg.workshop_id)}</td>
                        <td className="py-3 px-2 text-end text-neutral-700 font-medium">
                          {formatCurrency(reg.daily_wage)}
                          {headcount > 1 && <span className="text-xs text-neutral-400 ms-1">×{headcount}</span>}
                        </td>
                        <td className="py-3 px-2 text-end text-neutral-600">{reg.has_overtime ? reg.overtime_hours : '-'}</td>
                        <td className="py-3 px-2 text-end text-neutral-600">{reg.has_overtime ? formatCurrency(reg.overtime_rate) : '-'}</td>
                        <td className="py-3 px-2 text-end text-neutral-600">{otAmt > 0 ? formatCurrency(otAmt) : '-'}</td>
                        <td className="py-3 px-2 text-center">{reg.has_driving_outbound ? <CheckCircle2 size={14} className="text-success-500 inline" /> : <span className="text-neutral-300">-</span>}</td>
                        <td className="py-3 px-2 text-center">{reg.has_driving_return ? <CheckCircle2 size={14} className="text-success-500 inline" /> : <span className="text-neutral-300">-</span>}</td>
                        <td className="py-3 px-2 text-end text-neutral-600">{drvAmt > 0 ? formatCurrency(drvAmt) : '-'}</td>
                        <td className="py-3 px-2 text-end font-semibold text-neutral-900">{formatCurrency(dailyTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-neutral-200">
                    <td colSpan={2} className="py-3.5 px-2 text-sm font-semibold text-neutral-700">{t('settlementSummary')}</td>
                    <td className="py-3.5 px-2 text-end font-semibold text-neutral-900">{formatCurrency(selectedWorker.baseWages)}</td>
                    <td colSpan={2} />
                    <td className="py-3.5 px-2 text-end font-semibold text-neutral-900">{formatCurrency(selectedWorker.overtimeAmount)}</td>
                    <td colSpan={2} />
                    <td className="py-3.5 px-2 text-end font-semibold text-neutral-900">{formatCurrency(selectedWorker.drivingAmount)}</td>
                    <td className="py-3.5 px-2 text-end font-bold text-primary-700">{formatCurrency(selectedWorker.totalEarned)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Payment history */}
        <div className="card p-6">
          <h3 className="section-title mb-5 flex items-center gap-2">
            <Wallet size={18} className="text-primary-500" />
            {t('paymentHistory')}
          </h3>
          {selectedWorker.payments.length === 0 ? (
            <p className="text-sm text-neutral-400 py-8 text-center">{t('noPayments')}</p>
          ) : (
            <div className="space-y-2">
              {selectedWorker.payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-error-50 text-error-600 flex items-center justify-center">
                      <Banknote size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-700">{formatDate(p.payment_date)}</p>
                      <p className="text-xs text-neutral-400">{accountName(p.wallet_account_id)}{p.description ? ` · ${p.description}` : ''}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-error-600">{formatCurrency(p.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-neutral-200">
                <span className="text-sm font-semibold text-neutral-700">{t('totalPaid')}</span>
                <span className="text-base font-bold text-primary-600">{formatCurrency(selectedWorker.totalPaid)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-neutral-700">{t('remaining')}</span>
                <span className={`text-base font-bold ${selectedWorker.remaining > 0 ? 'text-error-600' : 'text-success-600'}`}>
                  {formatCurrency(selectedWorker.remaining)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 no-print">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">{t('workerSettlement')}</h1>
      </div>

      {/* Period selector */}
      <div className="card p-5">
        <div className="flex flex-wrap items-end gap-3">
          {!useCustomRange ? (
            <>
              <div className="input-group">
                <label className="label">{t('selectMonth')}</label>
                <div className="flex gap-2">
                  <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="input">
                    {monthNames.map((m, i) => (
                      <option key={i} value={i}>{m}</option>
                    ))}
                  </select>
                  <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="input">
                    {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="input-group">
                <label className="label">{t('periodStart')}</label>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="input" />
              </div>
              <div className="input-group">
                <label className="label">{t('periodEnd')}</label>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="input" />
              </div>
            </>
          )}
          <button onClick={() => setUseCustomRange(!useCustomRange)} className="btn-secondary">
            <Calendar size={16} />
            {useCustomRange ? t('selectMonth') : t('customRange')}
          </button>
        </div>
        <p className="text-xs text-neutral-400 mt-3">
          {formatDate(dateRange.start)} — {formatDate(dateRange.end)}
        </p>
      </div>

      {/* Summary totals */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('totalBaseWages')}</p>
          <p className="text-lg font-bold text-neutral-900 mt-1">{formatCurrency(totals.baseWages)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('totalOvertimeAmount')}</p>
          <p className="text-lg font-bold text-neutral-900 mt-1">{formatCurrency(totals.overtime)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('totalDrivingAmount')}</p>
          <p className="text-lg font-bold text-neutral-900 mt-1">{formatCurrency(totals.driving)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('totalEarned')}</p>
          <p className="text-lg font-bold text-success-600 mt-1">{formatCurrency(totals.earned)}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('remaining')}</p>
          <p className="text-lg font-bold text-error-600 mt-1">{formatCurrency(totals.remaining)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 font-medium">{t('filterByStatus')}:</span>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)} className="input py-2 text-sm w-auto">
            <option value="all">{t('allStatuses')}</option>
            <option value="paid">{t('paid')}</option>
            <option value="partially_paid">{t('partiallyPaid')}</option>
            <option value="unpaid">{t('unpaid')}</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 font-medium">{t('sortBy')}:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="input py-2 text-sm w-auto">
            <option value="name">{t('name')}</option>
            <option value="earned">{t('totalEarned')}</option>
            <option value="remaining">{t('remaining')}</option>
            <option value="status">{t('paymentStatus')}</option>
          </select>
        </div>
      </div>

      {/* Settlement list */}
      {filteredSettlements.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users size={48} />}
            title={t('noSettlementData')}
            description={t('noWorkers')}
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/50">
                  <th className="table-header text-start py-3 px-4">{t('name')}</th>
                  <th className="table-header text-center py-3 px-4">{t('workDays')}</th>
                  <th className="table-header text-end py-3 px-4">{t('totalEarned')}</th>
                  <th className="table-header text-end py-3 px-4">{t('totalPaid')}</th>
                  <th className="table-header text-end py-3 px-4">{t('remaining')}</th>
                  <th className="table-header text-center py-3 px-4">{t('paymentStatus')}</th>
                  <th className="table-header text-end py-3 px-4">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSettlements.map((s) => (
                  <tr
                    key={s.worker.id}
                    className="table-row border-b border-neutral-100 cursor-pointer hover:bg-primary-50/30"
                    onClick={() => setSelectedWorker(s)}
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-bold shrink-0">
                          {s.worker.full_name[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-700 truncate">{s.worker.full_name}</p>
                          <p className="text-xs text-neutral-400">{s.worker.profession || (s.worker.worker_type === 'team_leader' ? t('teamLeader') : t('normalWorker'))}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center text-neutral-600 font-medium">{s.workDays}</td>
                    <td className="py-3.5 px-4 text-end font-semibold text-success-600">{formatCurrency(s.totalEarned)}</td>
                    <td className="py-3.5 px-4 text-end font-medium text-primary-600">{formatCurrency(s.totalPaid)}</td>
                    <td className="py-3.5 px-4 text-end font-semibold text-neutral-900">{formatCurrency(s.remaining)}</td>
                    <td className="py-3.5 px-4 text-center">{statusBadge(s.status)}</td>
                    <td className="py-3.5 px-4 text-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); openPayModal(s); }}
                        className="btn-primary py-1.5 px-3 text-xs"
                        disabled={s.remaining <= 0}
                      >
                        <Wallet size={14} /> {t('payWorker')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pay Worker Modal */}
      <Modal open={payModalOpen} onClose={() => setPayModalOpen(false)} title={`${t('payWorker')}${payTarget ? ` - ${payTarget.worker.full_name}` : ''}`}>
        {payTarget && (
          <div className="space-y-4">
            <div className="card p-4 bg-neutral-50">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">{t('remaining')}</span>
                <span className="font-bold text-error-600">{formatCurrency(payTarget.remaining)}</span>
              </div>
            </div>
            <div className="input-group">
              <label className="label">{t('amount')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={payForm.amount || ''}
                onChange={(e) => setPayForm({ ...payForm, amount: parseFloat(e.target.value) || 0 })}
                className="input"
              />
            </div>
            <div className="input-group">
              <label className="label">{t('paymentDate')}</label>
              <input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('account')}</label>
              <select value={payForm.wallet_account_id} onChange={(e) => setPayForm({ ...payForm, wallet_account_id: e.target.value })} className="input">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="label">{t('description')}</label>
              <input value={payForm.description} onChange={(e) => setPayForm({ ...payForm, description: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('notes')}</label>
              <input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="input" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPayModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
              <button onClick={handlePay} className="btn-primary" disabled={saving || payForm.amount <= 0}>
                {saving && <Loader2 size={16} className="animate-spin" />}
                {t('save')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Print statement */}
      {showStatement && (() => {
        const sw = (selectedWorker ?? null) as WorkerSettlement | null;
        if (!sw) return null;
        return (
        <div className="hidden print:block fixed inset-0 bg-white z-50 p-8">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-8 pb-4 border-b-2 border-neutral-800">
              <div className="flex items-center gap-3">
                {profile?.logo_url ? (
                  <img src={profile.logo_url} alt="logo" className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-primary-600 text-white flex items-center justify-center text-xl font-bold">
                    {profile?.business_name?.[0] || 'B'}
                  </div>
                )}
                <div>
                  <h1 className="text-lg font-bold">{profile?.business_name || t('appName')}</h1>
                  <p className="text-xs text-neutral-500">{profile?.phone} {profile?.address ? `· ${profile.address}` : ''}</p>
                </div>
              </div>
              <div className="text-end">
                <h2 className="text-base font-bold">{t('workerStatement')}</h2>
                <p className="text-xs text-neutral-500">{t('dateGenerated')}: {formatDate(new Date())}</p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-sm text-neutral-600"><strong>{t('name')}:</strong> {sw.worker.full_name}</p>
              <p className="text-sm text-neutral-600"><strong>{t('settlementPeriod')}:</strong> {formatDate(dateRange.start)} — {formatDate(dateRange.end)}</p>
              <p className="text-sm text-neutral-600"><strong>{t('workDays')}:</strong> {sw.workDays}</p>
            </div>

            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="border-b border-neutral-300">
                  <th className="text-start py-2">{t('date')}</th>
                  <th className="text-start py-2">{t('workshops')}</th>
                  <th className="text-end py-2">{t('baseWage')}</th>
                  <th className="text-end py-2">{t('overtimeAmount')}</th>
                  <th className="text-end py-2">{t('drivingAmount2')}</th>
                  <th className="text-end py-2">{t('dailyTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {sw.registrations.map((reg: DailyRegistration) => {
                  const headcount = reg.headcount || 1;
                  const base = reg.daily_wage * headcount;
                  const otAmt = reg.has_overtime ? reg.overtime_hours * reg.overtime_rate : 0;
                  const drvAmt = (reg.has_driving_outbound ? reg.driving_amount : 0) + (reg.has_driving_return ? reg.driving_amount : 0);
                  const total = base + otAmt + drvAmt;
                  return (
                    <tr key={reg.id} className="border-b border-neutral-100">
                      <td className="py-2">{formatDate(reg.work_date)}</td>
                      <td className="py-2">{workshopName(reg.workshop_id)}</td>
                      <td className="py-2 text-end">{formatCurrency(base)}</td>
                      <td className="py-2 text-end">{otAmt > 0 ? formatCurrency(otAmt) : '-'}</td>
                      <td className="py-2 text-end">{drvAmt > 0 ? formatCurrency(drvAmt) : '-'}</td>
                      <td className="py-2 text-end font-semibold">{formatCurrency(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm"><span>{t('totalBaseWages')}</span><span className="font-medium">{formatCurrency(sw.baseWages)}</span></div>
                <div className="flex justify-between text-sm"><span>{t('totalOvertimeAmount')}</span><span className="font-medium">{formatCurrency(sw.overtimeAmount)}</span></div>
                <div className="flex justify-between text-sm"><span>{t('totalDrivingAmount')}</span><span className="font-medium">{formatCurrency(sw.drivingAmount)}</span></div>
                <div className="flex justify-between text-sm font-bold border-t border-neutral-300 pt-2"><span>{t('totalEarned')}</span><span>{formatCurrency(sw.totalEarned)}</span></div>
                <div className="flex justify-between text-sm"><span>{t('totalPaid')}</span><span>{formatCurrency(sw.totalPaid)}</span></div>
                <div className="flex justify-between text-sm font-bold border-t border-neutral-300 pt-2"><span>{t('remaining')}</span><span>{formatCurrency(sw.remaining)}</span></div>
              </div>
            </div>
          </div>
        </div>
      );
      })()}
    </div>
  );
}

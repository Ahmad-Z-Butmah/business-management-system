import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Users, Loader2, Trash2, Calendar, Lock,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useDataRefresh } from '@/contexts/DataRefreshProvider';
import { recordUndoAction } from '@/lib/undoHistory';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/Common';
import {
  getWorkers, getWorkerPayments, createWorkerPayment,
  deleteWorkerPayment, getWalletAccounts, createWalletTransaction, addAuditLog,
  getDailyRegistrations,
} from '@/lib/dataAccess';
import type { Worker, WorkerPayment, WalletAccount, DailyRegistration } from '@/types';

function getMonthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export function WorkerPayments() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { triggerRefresh, refreshKey } = useDataRefresh();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [payments, setPayments] = useState<WorkerPayment[]>([]);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [registrations, setRegistrations] = useState<DailyRegistration[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkerPayment | null>(null);
  const [closePeriodTarget, setClosePeriodTarget] = useState<{ worker: Worker; amount: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const [fromDate, setFromDate] = useState(getMonthRange(now.getFullYear(), now.getMonth()).start);
  const [toDate, setToDate] = useState(getMonthRange(now.getFullYear(), now.getMonth()).end);

  const [form, setForm] = useState({
    worker_id: '',
    payment_date: new Date().toISOString().split('T')[0],
    amount: 0,
    wallet_account_id: '',
    description: '',
    notes: '',
  });

  const load = async () => {
    if (!user) return;
    try {
      const [w, p, a, r] = await Promise.all([
        getWorkers(user.id, true),
        getWorkerPayments(user.id),
        getWalletAccounts(user.id),
        getDailyRegistrations(user.id),
      ]);
      setWorkers(w);
      setPayments(p);
      setAccounts(a);
      setRegistrations(r);
      if (a.length > 0) setForm((prev) => ({ ...prev, wallet_account_id: a[0].id }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);
  useEffect(() => { if (user) load(); }, [user, refreshKey]);

  // Per-worker period calculations
  const workerPeriodData = useMemo(() => {
    return workers.map((w) => {
      const workerRegs = registrations
        .filter((r) => r.worker_id === w.id)
        .filter((r) => r.work_date >= fromDate && r.work_date <= toDate)
        .sort((a, b) => a.work_date.localeCompare(b.work_date));

      const workerPayments = payments
        .filter((p) => p.worker_id === w.id)
        .filter((p) => p.payment_date >= fromDate && p.payment_date <= toDate)
        .sort((a, b) => a.payment_date.localeCompare(b.payment_date));

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
      const remaining = Math.max(0, totalEarned - totalPaid);

      return {
        worker: w,
        registrations: workerRegs,
        payments: workerPayments,
        baseWages,
        overtimeAmount,
        drivingAmount,
        totalEarned,
        totalPaid,
        remaining,
      };
    });
  }, [workers, registrations, payments, fromDate, toDate]);

  const filteredPayments = useMemo(() => {
    return payments
      .filter((p) => p.payment_date >= fromDate && p.payment_date <= toDate)
      .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  }, [payments, fromDate, toDate]);

  const handleSave = async () => {
    if (!user || !form.worker_id || form.amount <= 0 || !form.wallet_account_id) return;
    setSaving(true);
    try {
      const payment = await createWorkerPayment({
        user_id: user.id,
        worker_id: form.worker_id,
        payment_date: form.payment_date,
        amount: form.amount,
        wallet_account_id: form.wallet_account_id,
        description: form.description,
        notes: form.notes,
        period_start: fromDate,
        period_end: toDate,
        is_period_closed: false,
      });
      const walletTransaction = await createWalletTransaction({
        user_id: user.id,
        wallet_account_id: form.wallet_account_id,
        transaction_date: form.payment_date,
        type: 'worker_payment',
        amount: form.amount,
        description: `${t('workerPayments')} - ${workers.find((w) => w.id === form.worker_id)?.full_name}`,
        related_worker_id: form.worker_id,
        related_contractor_id: null,
        related_claim_id: null,
        transfer_pair_id: null,
        notes: '',
      });
      recordUndoAction(user.id, [
        { table: 'wallet_transactions', ids: [walletTransaction.id] },
        { table: 'worker_payments', ids: [payment.id] },
      ]);
      await addAuditLog({ user_id: user.id, action: 'worker_payment_created', entity_type: 'worker_payment', entity_id: payment.id });
      showToast('success', t('paymentSaved'));
      setModalOpen(false);
      setForm({ ...form, amount: 0, description: '', notes: '' });
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    try {
      await deleteWorkerPayment(deleteTarget.id);
      showToast('success', t('deleteSuccess'));
      setDeleteTarget(null);
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    }
  };

  const handleClosePeriod = async () => {
    if (!user || !closePeriodTarget) return;
    setSaving(true);
    try {
      const payment = await createWorkerPayment({
        user_id: user.id,
        worker_id: closePeriodTarget.worker.id,
        payment_date: new Date().toISOString().split('T')[0],
        amount: closePeriodTarget.amount,
        wallet_account_id: accounts[0]?.id || '',
        description: `${t('closePeriod')} - ${closePeriodTarget.worker.full_name}`,
        notes: `${t('periodClosedMsg')}`,
        period_start: fromDate,
        period_end: toDate,
        is_period_closed: true,
      });
      if (accounts[0]) {
        const walletTransaction = await createWalletTransaction({
          user_id: user.id,
          wallet_account_id: accounts[0].id,
          transaction_date: new Date().toISOString().split('T')[0],
          type: 'worker_payment',
          amount: closePeriodTarget.amount,
          description: `${t('closePeriod')} - ${closePeriodTarget.worker.full_name}`,
          related_worker_id: closePeriodTarget.worker.id,
          related_contractor_id: null,
          related_claim_id: null,
          transfer_pair_id: null,
          notes: '',
        });
        recordUndoAction(user.id, [
          { table: 'wallet_transactions', ids: [walletTransaction.id] },
          { table: 'worker_payments', ids: [payment.id] },
        ]);
      } else {
        recordUndoAction(user.id, [{ table: 'worker_payments', ids: [payment.id] }]);
      }
      await addAuditLog({
        user_id: user.id,
        action: 'worker_period_closed',
        entity_type: 'worker_payment',
        entity_id: payment.id,
        details: { worker_id: closePeriodTarget.worker.id, period: `${fromDate} to ${toDate}`, amount: closePeriodTarget.amount },
      });
      showToast('success', t('periodClosed'));
      setClosePeriodTarget(null);
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">{t('workerPayments')}</h1>
        <button onClick={() => setModalOpen(true)} className="btn-primary"><Plus size={18} /> {t('addPayment')}</button>
      </div>

      {/* Date Range Filter */}
      <div className="card p-5">
        <h3 className="section-title mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-primary-500" />
          {t('payrollPeriod')}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="input-group">
            <label className="label">{t('fromDate')}</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('toDate')}</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input" />
          </div>
        </div>
        <p className="text-xs text-neutral-400 mt-3">
          {formatDate(fromDate)} — {formatDate(toDate)}
        </p>
      </div>

      {/* Worker earnings summary for period */}
      <div className="card p-5">
        <h3 className="section-title mb-4">{t('workerEarnings')}</h3>
        <div className="space-y-2">
          {workerPeriodData.map((wp) => {
            return (
              <div key={wp.worker.id} className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-50 text-sm hover:bg-neutral-100/70 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-bold shrink-0">
                    {wp.worker.full_name[0]?.toUpperCase()}
                  </div>
                  <span className="font-medium text-neutral-700 truncate">{wp.worker.full_name}</span>
                </div>
                <div className="flex gap-3 text-xs items-center">
                  <span className="text-neutral-500">{t('periodEarnings')}: {formatCurrency(wp.totalEarned)}</span>
                  <span className="text-success-600">{t('totalPaid')}: {formatCurrency(wp.totalPaid)}</span>
                  <span className={wp.remaining > 0 ? 'text-error-600 font-semibold' : 'text-neutral-400'}>{t('remaining')}: {formatCurrency(wp.remaining)}</span>
                  {wp.remaining > 0 && (
                    <button
                      onClick={() => setClosePeriodTarget({ worker: wp.worker, amount: wp.remaining })}
                      className="btn-primary py-1 px-2.5 text-xs flex items-center gap-1"
                    >
                      <Lock size={12} />
                      {t('closePeriod')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {workers.length === 0 && <p className="text-sm text-neutral-400">{t('noWorkers')}</p>}
        </div>
      </div>

      {/* Payments list */}
      <div className="card p-6">
        <h3 className="section-title mb-5">{t('recentPayments')}</h3>
        {filteredPayments.length === 0 ? (
          <EmptyState icon={<Users size={48} />} title={t('noPayments')} />
        ) : (
          <div className="space-y-2">
            {filteredPayments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-neutral-50 group transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center shrink-0">
                    <Users size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">{p.worker?.full_name}</p>
                    <p className="text-xs text-neutral-400">
                      {formatDate(p.payment_date)} · {accounts.find((a) => a.id === p.wallet_account_id)?.name}
                      {p.is_period_closed && <span className="badge badge-neutral text-[10px] px-1.5 py-0.5 ms-1">{t('closePeriod')}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-error-600">{formatCurrency(p.amount)}</span>
                  <button onClick={() => setDeleteTarget(p)} className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-error-600 transition-all p-1.5 rounded-lg hover:bg-error-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('addPayment')}>
        <div className="space-y-4">
          <div className="card p-3 bg-neutral-50 text-xs text-neutral-500">
            {t('payrollPeriod')}: {formatDate(fromDate)} — {formatDate(toDate)}
          </div>
          <div className="input-group">
            <label className="label">{t('selectWorker')}</label>
            <select value={form.worker_id} onChange={(e) => {
              const wid = e.target.value;
              setForm({ ...form, worker_id: wid });
              const wp = workerPeriodData.find((w) => w.worker.id === wid);
              if (wp && wp.remaining > 0) setForm((prev) => ({ ...prev, amount: wp.remaining }));
            }} className="input">
              <option value="">{t('selectWorker')}</option>
              {workers.map((w) => <option key={w.id} value={w.id}>{w.full_name}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="label">{t('amount')}</label>
            <input type="number" min="0" step="0.01" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('paymentDate')}</label>
            <input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('account')}</label>
            <select value={form.wallet_account_id} onChange={(e) => setForm({ ...form, wallet_account_id: e.target.value })} className="input">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="label">{t('description')}</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('notes')}</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('delete')}
        message={t('confirmDelete')}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!closePeriodTarget}
        title={t('closePeriod')}
        message={`${t('confirmClosePeriod')} (${closePeriodTarget ? formatCurrency(closePeriodTarget.amount) : ''})`}
        confirmLabel={t('closePeriod')}
        cancelLabel={t('noCancel')}
        onConfirm={handleClosePeriod}
        onCancel={() => setClosePeriodTarget(null)}
        loading={saving}
      />
    </div>
  );
}

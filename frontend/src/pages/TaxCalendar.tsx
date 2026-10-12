import { useState, useEffect } from 'react';
import {
  Plus, Calendar, Edit2, Trash2, Loader2, Check, AlertCircle,
  Clock, FileCheck, Send, DollarSign,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/Common';
import {
  getTaxSubmissions, createTaxSubmission, updateTaxSubmission,
  deleteTaxSubmission, addAuditLog,
} from '@/lib/dataAccess';
import type { TaxSubmission, TaxSubmissionStatus, TaxObligationType } from '@/types';

export function TaxCalendar() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<TaxSubmission[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaxSubmission | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaxSubmission | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    obligation_type: 'vat' as TaxObligationType,
    reporting_period: '',
    period_start: '',
    period_end: '',
    due_date: new Date().toISOString().split('T')[0],
    amount: 0,
    status: 'pending' as TaxSubmissionStatus,
    notes: '',
    source: 'Israel Tax Authority',
  });

  const load = async () => {
    if (!user) return;
    try {
      const s = await getTaxSubmissions(user.id);
      setSubmissions(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const today = new Date().toISOString().split('T')[0];
  const overdue = submissions.filter((s) => s.status === 'pending' && s.due_date < today);
  const upcoming = submissions.filter((s) => s.status === 'pending' && s.due_date >= today);
  const prepared = submissions.filter((s) => s.status === 'prepared');
  const submitted = submissions.filter((s) => s.status === 'submitted');
  const paid = submissions.filter((s) => s.status === 'paid');

  const openAdd = () => {
    setEditing(null);
    setForm({
      obligation_type: 'vat', reporting_period: '', period_start: '', period_end: '',
      due_date: new Date().toISOString().split('T')[0], amount: 0, status: 'pending',
      notes: '', source: 'Israel Tax Authority',
    });
    setModalOpen(true);
  };

  const openEdit = (sub: TaxSubmission) => {
    setEditing(sub);
    setForm({
      obligation_type: sub.obligation_type,
      reporting_period: sub.reporting_period,
      period_start: sub.period_start || '',
      period_end: sub.period_end || '',
      due_date: sub.due_date,
      amount: sub.amount || 0,
      status: sub.status,
      notes: sub.notes,
      source: sub.source,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user || !form.reporting_period.trim()) return;
    setSaving(true);
    try {
      const data = {
        ...form,
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        amount: form.amount || null,
        reminder_enabled: true,
        last_rules_update: null,
        user_id: user.id,
      };
      if (editing) {
        await updateTaxSubmission(editing.id, data);
        showToast('success', t('changesSaved'));
      } else {
        await createTaxSubmission(data);
        await addAuditLog({ user_id: user.id, action: 'tax_submission_created', entity_type: 'tax_submission' });
        showToast('success', t('createSuccess'));
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (sub: TaxSubmission, status: TaxSubmissionStatus) => {
    try {
      await updateTaxSubmission(sub.id, { status });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    try {
      await deleteTaxSubmission(deleteTarget.id);
      showToast('success', t('deleteSuccess'));
      setDeleteTarget(null);
      await load();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    }
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-warning', prepared: 'badge-primary', submitted: 'badge-primary',
      paid: 'badge-success', cancelled: 'badge-neutral',
    };
    return map[status] || 'badge-neutral';
  };

  const obligationLabel = (type: string) => {
    const map: Record<string, string> = {
      vat: t('vatTax'), income_tax: t('incomeTax'), bituach_leumi: t('nationalInsurance'),
      annual: t('annual'), other: t('other'),
    };
    return map[type] || type;
  };

  const renderSection = (title: string, items: TaxSubmission[], icon: typeof Clock, color: string) => {
    if (items.length === 0) return null;
    const Icon = icon;
    return (
      <div className="mb-6">
        <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${color}`}>
          <Icon size={16} /> {title}
        </h3>
        <div className="space-y-2">
          {items.map((sub) => (
            <div key={sub.id} className="card p-4 hover:shadow-card-hover transition-all duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-900">{obligationLabel(sub.obligation_type)} — {sub.reporting_period}</p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {t('dueDate2')}: {formatDate(sub.due_date)}
                    {sub.amount ? ` · ${formatCurrency(sub.amount)}` : ''}
                    {sub.source ? ` · ${sub.source}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={statusBadge(sub.status)}>{t(sub.status)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-neutral-100">
                {sub.status === 'pending' && <button onClick={() => handleStatusChange(sub, 'prepared')} className="btn-ghost text-xs"><FileCheck size={14} /> {t('prepared')}</button>}
                {sub.status === 'prepared' && <button onClick={() => handleStatusChange(sub, 'submitted')} className="btn-ghost text-xs"><Send size={14} /> {t('submitted')}</button>}
                {(sub.status === 'prepared' || sub.status === 'submitted') && <button onClick={() => handleStatusChange(sub, 'paid')} className="btn-ghost text-xs text-success-600"><DollarSign size={14} /> {t('paid')}</button>}
                <button onClick={() => openEdit(sub)} className="btn-ghost text-xs"><Edit2 size={14} /> {t('edit')}</button>
                <button onClick={() => setDeleteTarget(sub)} className="btn-ghost text-error-600 text-xs"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">{t('submissionCalendar')}</h1>
        <button onClick={openAdd} className="btn-primary"><Plus size={18} /> {t('addSubmission')}</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('pending')}</p>
          <p className="text-lg font-bold text-warning-600 mt-1">{overdue.length + upcoming.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('prepared')}</p>
          <p className="text-lg font-bold text-primary-600 mt-1">{prepared.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('submitted')}</p>
          <p className="text-lg font-bold text-primary-600 mt-1">{submitted.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('paid')}</p>
          <p className="text-lg font-bold text-success-600 mt-1">{paid.length}</p>
        </div>
      </div>

      {submissions.length === 0 ? (
        <EmptyState icon={<Calendar size={48} />} title={t('noSubmissions')} action={<button onClick={openAdd} className="btn-primary"><Plus size={16} /> {t('addSubmission')}</button>} />
      ) : (
        <div className="card p-6">
          {overdue.length > 0 && renderSection(`${t('pending')} (${overdue.length})`, overdue, AlertCircle, 'text-error-600')}
          {upcoming.length > 0 && renderSection(t('pending'), upcoming, Clock, 'text-warning-600')}
          {renderSection(t('prepared'), prepared, FileCheck, 'text-primary-600')}
          {renderSection(t('submitted'), submitted, Send, 'text-primary-600')}
          {renderSection(t('paid'), paid, Check, 'text-success-600')}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t('edit') : t('addSubmission')}>
        <div className="space-y-4">
          <div className="input-group">
            <label className="label">{t('obligationType')}</label>
            <select value={form.obligation_type} onChange={(e) => setForm({ ...form, obligation_type: e.target.value as TaxObligationType })} className="input">
              <option value="vat">{t('vatTax')}</option>
              <option value="income_tax">{t('incomeTax')}</option>
              <option value="bituach_leumi">{t('nationalInsurance')}</option>
              <option value="annual">{t('annual')}</option>
              <option value="other">{t('other')}</option>
            </select>
          </div>
          <div className="input-group">
            <label className="label">{t('reportingPeriod')} *</label>
            <input value={form.reporting_period} onChange={(e) => setForm({ ...form, reporting_period: e.target.value })} className="input" placeholder="e.g. Sep 2024" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="label">{t('periodStart')}</label>
              <input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('periodEnd')}</label>
              <input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} className="input" />
            </div>
          </div>
          <div className="input-group">
            <label className="label">{t('dueDate2')} *</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('amount')}</label>
            <input type="number" min="0" step="0.01" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('submissionStatus')}</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaxSubmissionStatus })} className="input">
              <option value="pending">{t('pending')}</option>
              <option value="prepared">{t('prepared')}</option>
              <option value="submitted">{t('submitted')}</option>
              <option value="paid">{t('paid')}</option>
              <option value="cancelled">{t('cancelled')}</option>
            </select>
          </div>
          <div className="input-group">
            <label className="label">{t('taxSource')}</label>
            <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="input" />
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
        message={`${t('confirmDelete')} ${deleteTarget?.reporting_period}`}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

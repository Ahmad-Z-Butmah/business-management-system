import { useState, useEffect } from 'react';
import {
  Plus, Briefcase, Edit2, Trash2, Loader2, Check,
  Archive, AlertCircle, Receipt, Wallet, Building2,
  CheckCircle2, FileText, Printer,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useDataRefresh } from '@/contexts/DataRefreshProvider';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/Common';
import {
  getExtraWork, createExtraWork, updateExtraWork, deleteExtraWork,
  getContractors, getWorkshops, addAuditLog,
  getWalletAccounts, createWalletTransaction, getBusinessProfile,
} from '@/lib/dataAccess';
import type { ExtraWork, ExtraWorkMode, ExtraWorkStatus, Contractor, Workshop, WalletAccount, BusinessProfile } from '@/types';

export function ExtraWorkPage() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { triggerRefresh, refreshKey } = useDataRefresh();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ExtraWork[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExtraWork | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExtraWork | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<ExtraWork | null>(null);
  const [saving, setSaving] = useState(false);
  const [receiveForm, setReceiveForm] = useState({ amount: 0, wallet_account_id: '', receive_date: new Date().toISOString().split('T')[0] });

  const [form, setForm] = useState({
    work_date: new Date().toISOString().split('T')[0],
    mode: 'structured' as ExtraWorkMode,
    company: '',
    contractor_id: '',
    workshop_id: '',
    subject: '',
    work_description: '',
    quantity: 0,
    unit_price: 0,
    total_price: 0,
    notes: '',
    from_time: '',
    to_time: '',
  });

  const load = async () => {
    if (!user) return;
    try {
      const [ew, c, w, a, p] = await Promise.all([
        getExtraWork(user.id),
        getContractors(user.id, true),
        getWorkshops(user.id, true),
        getWalletAccounts(user.id),
        getBusinessProfile(user.id),
      ]);
      setItems(ew);
      setContractors(c);
      setWorkshops(w);
      setAccounts(a);
      setProfile(p);
      if (a.length > 0) setReceiveForm((prev) => ({ ...prev, wallet_account_id: a[0].id }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);
  useEffect(() => { if (user) load(); }, [user, refreshKey]);

  const pendingReview = items.filter((i) => i.status === 'pending' || i.status === 'reviewed');

  const openAdd = () => {
    setEditing(null);
    setForm({
      work_date: new Date().toISOString().split('T')[0], mode: 'structured',
      company: '', contractor_id: '', workshop_id: '', subject: '',
      work_description: '', quantity: 0, unit_price: 0, total_price: 0,
      notes: '', from_time: '', to_time: '',
    });
    setModalOpen(true);
  };

  const openEdit = (item: ExtraWork) => {
    setEditing(item);
    setForm({
      work_date: item.work_date, mode: item.mode, company: item.company,
      contractor_id: item.contractor_id || '', workshop_id: item.workshop_id || '',
      subject: item.subject, work_description: item.work_description,
      quantity: item.quantity || 0, unit_price: item.unit_price || 0,
      total_price: item.total_price, notes: item.notes,
      from_time: item.from_time, to_time: item.to_time,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user || !form.subject.trim()) return;
    setSaving(true);
    try {
      const data = {
        ...form,
        contractor_id: form.contractor_id || null,
        workshop_id: form.workshop_id || null,
        quantity: form.mode === 'structured' ? form.quantity : null,
        unit_price: form.mode === 'structured' ? form.unit_price : null,
        total_price: form.mode === 'structured' ? form.quantity * form.unit_price : form.total_price,
        status: 'pending' as const,
        related_claim_id: null,
        user_id: user.id,
      };
      if (editing) {
        await updateExtraWork(editing.id, data);
        showToast('success', t('changesSaved'));
      } else {
        await createExtraWork(data);
        await addAuditLog({ user_id: user.id, action: 'extra_work_created', entity_type: 'extra_work' });
        showToast('success', t('createSuccess'));
      }
      setModalOpen(false);
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (item: ExtraWork, status: ExtraWorkStatus) => {
    try {
      await updateExtraWork(item.id, { status });
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReceive = async () => {
    if (!user || !receiveTarget || receiveForm.amount <= 0 || !receiveForm.wallet_account_id) return;
    setSaving(true);
    try {
      await updateExtraWork(receiveTarget.id, { status: 'received' });
      await createWalletTransaction({
        user_id: user.id,
        wallet_account_id: receiveForm.wallet_account_id,
        transaction_date: receiveForm.receive_date,
        type: 'income',
        amount: receiveForm.amount,
        description: `${t('receiveExtraWork')} - ${receiveTarget.subject}`,
        related_worker_id: null,
        related_contractor_id: receiveTarget.contractor_id,
        related_claim_id: null,
        transfer_pair_id: null,
        notes: '',
      });
      await addAuditLog({ user_id: user.id, action: 'extra_work_received', entity_type: 'extra_work', entity_id: receiveTarget.id });
      showToast('success', t('received'));
      setReceiveTarget(null);
      setReceiveForm({ ...receiveForm, amount: 0 });
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
      await deleteExtraWork(deleteTarget.id);
      showToast('success', t('deleteSuccess'));
      setDeleteTarget(null);
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    }
  };

  const handlePrint = () => {
    setTimeout(() => window.print(), 100);
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-warning', reviewed: 'badge-primary', claimed: 'badge-success',
      invoiced: 'badge-success', received: 'badge-success', archived: 'badge-neutral',
    };
    return map[status] || 'badge-neutral';
  };

  const structuredItems = items.filter((i) => i.mode === 'structured');
  const freeTextItems = items.filter((i) => i.mode !== 'structured');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <h1 className="text-xl font-bold text-neutral-900">{t('extraWork')}</h1>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="btn-secondary"><Printer size={18} /> {t('print')}</button>
          <button onClick={openAdd} className="btn-primary"><Plus size={18} /> {t('addExtraWork')}</button>
        </div>
      </div>

      {/* Review reminder */}
      {pendingReview.length > 0 && (
        <div className="card p-5 border-warning-200 bg-warning-50/50 no-print">
          <h3 className="text-sm font-semibold text-warning-700 mb-4 flex items-center gap-2">
            <AlertCircle size={18} /> {t('extraWorkReview')}
          </h3>
          <div className="space-y-2">
            {pendingReview.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-white text-sm hover:shadow-card-hover transition-all">
                <div className="min-w-0">
                  <p className="font-medium text-neutral-700 truncate">{item.subject}</p>
                  <p className="text-xs text-neutral-400">{formatDate(item.work_date)} · {formatCurrency(item.total_price)}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {item.status === 'pending' && <button onClick={() => handleStatusChange(item, 'reviewed')} className="btn-ghost text-xs text-success-600"><Check size={14} /> {t('markAsReviewed')}</button>}
                  <button onClick={() => openEdit(item)} className="btn-ghost text-xs"><Edit2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Structured items table */}
      {structuredItems.length > 0 && (
        <div className="card overflow-hidden no-print">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/50">
                  <th className="table-header text-start py-3 px-3 w-12">{t('extraWorkTableNo')}</th>
                  <th className="table-header text-start py-3 px-3">{t('workSubject')}</th>
                  <th className="table-header text-center py-3 px-3">{t('quantity')}</th>
                  <th className="table-header text-end py-3 px-3">{t('unitPrice')}</th>
                  <th className="table-header text-end py-3 px-3">{t('totalPrice')}</th>
                  <th className="table-header text-center py-3 px-3">{t('paymentStatus')}</th>
                  <th className="table-header text-end py-3 px-3 w-24">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {structuredItems.map((item, idx) => (
                  <tr key={item.id} className="table-row border-b border-neutral-100">
                    <td className="py-3 px-3 text-neutral-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-neutral-900">{item.subject}</p>
                      <p className="text-xs text-neutral-400">{formatDate(item.work_date)} · {item.contractor?.name || item.company || '-'}</p>
                    </td>
                    <td className="py-3 px-3 text-center text-neutral-600">{item.quantity || 0}</td>
                    <td className="py-3 px-3 text-end text-neutral-600">{formatCurrency(item.unit_price || 0)}</td>
                    <td className="py-3 px-3 text-end font-semibold text-neutral-900">{formatCurrency(item.total_price)}</td>
                    <td className="py-3 px-3 text-center"><span className={statusBadge(item.status)}>{t(item.status)}</span></td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end gap-1">
                        {item.status !== 'received' && item.status !== 'archived' && (
                          <button onClick={() => { setReceiveTarget(item); setReceiveForm({ ...receiveForm, amount: item.total_price }); }} className="btn-success px-2.5 py-1 text-xs">
                            <Receipt size={12} /> {t('markAsReceived')}
                          </button>
                        )}
                        <button onClick={() => openEdit(item)} className="btn-ghost text-xs px-1.5"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteTarget(item)} className="btn-ghost text-error-600 text-xs px-1.5"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Free text items */}
      {freeTextItems.length > 0 && (
        <div className="space-y-3 no-print">
          {freeTextItems.map((item) => (
            <div key={item.id} className="card-hover p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
                    <Briefcase size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{item.subject}</p>
                    <p className="text-xs text-neutral-500">
                      {formatDate(item.work_date)} · {item.contractor?.name || item.company || '-'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={statusBadge(item.status)}>{t(item.status)}</span>
                  <span className="text-sm font-semibold text-neutral-900">{formatCurrency(item.total_price)}</span>
                </div>
              </div>
              {item.work_description && <p className="text-sm text-neutral-600 mt-3">{item.work_description}</p>}
              <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-100">
                {item.status !== 'received' && item.status !== 'archived' && (
                  <button onClick={() => { setReceiveTarget(item); setReceiveForm({ ...receiveForm, amount: item.total_price }); }} className="btn-success text-xs">
                    <Receipt size={14} /> {t('markAsReceived')}
                  </button>
                )}
                <button onClick={() => openEdit(item)} className="btn-ghost text-xs"><Edit2 size={14} /> {t('edit')}</button>
                <button onClick={() => setDeleteTarget(item)} className="btn-ghost text-error-600 text-xs"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <EmptyState icon={<Briefcase size={48} />} title={t('noExtraWork')} action={<button onClick={openAdd} className="btn-primary"><Plus size={16} /> {t('addExtraWork')}</button>} />
      )}

      {/* Print area */}
      <div className="hidden print:block">
        <div className="max-w-3xl mx-auto p-8">
          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-neutral-800">
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
              <h2 className="text-base font-bold">{t('extraWork')}</h2>
              <p className="text-xs text-neutral-500">{formatDate(new Date())}</p>
            </div>
          </div>
          <table className="w-full text-sm mb-4">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="text-start py-2 w-10">No.</th>
                <th className="text-start py-2">{t('workSubject')}</th>
                <th className="text-center py-2">{t('quantity')}</th>
                <th className="text-end py-2">{t('unitPrice')}</th>
                <th className="text-end py-2">{t('totalPrice')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id} className="border-b border-neutral-100">
                  <td className="py-2">{String(idx + 1).padStart(2, '0')}</td>
                  <td className="py-2">{item.subject}</td>
                  <td className="py-2 text-center">{item.quantity || '-'}</td>
                  <td className="py-2 text-end">{item.unit_price ? formatCurrency(item.unit_price) : '-'}</td>
                  <td className="py-2 text-end font-semibold">{formatCurrency(item.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end">
            <div className="w-48 space-y-1">
              <div className="flex justify-between text-sm font-bold border-t border-neutral-300 pt-2">
                <span>{t('totalPrice')}</span>
                <span>{formatCurrency(items.reduce((s, i) => s + i.total_price, 0))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t('editExtraWork') : t('addExtraWork')} size="lg">
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => setForm({ ...form, mode: 'free_text' })}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${form.mode === 'free_text' ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
            >
              {t('extraWorkFreeText')}
            </button>
            <button
              onClick={() => setForm({ ...form, mode: 'structured' })}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${form.mode === 'structured' ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
            >
              {t('extraWorkStructured')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="input-group">
              <label className="label">{t('date')} *</label>
              <input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('companyName')}</label>
              <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('contractor')}</label>
              <select value={form.contractor_id} onChange={(e) => setForm({ ...form, contractor_id: e.target.value })} className="input">
                <option value="">-</option>
                {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="label">{t('workshop')}</label>
              <select value={form.workshop_id} onChange={(e) => setForm({ ...form, workshop_id: e.target.value })} className="input">
                <option value="">-</option>
                {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="label">{t('workSubject')} *</label>
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('workDescription')}</label>
            <textarea value={form.work_description} onChange={(e) => setForm({ ...form, work_description: e.target.value })} className="input min-h-[80px]" />
          </div>

          {form.mode === 'structured' ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="input-group">
                <label className="label">{t('fromTime')}</label>
                <input type="time" value={form.from_time} onChange={(e) => setForm({ ...form, from_time: e.target.value })} className="input" />
              </div>
              <div className="input-group">
                <label className="label">{t('toTime')}</label>
                <input type="time" value={form.to_time} onChange={(e) => setForm({ ...form, to_time: e.target.value })} className="input" />
              </div>
              <div className="input-group">
                <label className="label">{t('quantity')}</label>
                <input type="number" min="0" step="0.01" value={form.quantity || ''} onChange={(e) => setForm({ ...form, quantity: parseFloat(e.target.value) || 0 })} className="input" />
              </div>
              <div className="input-group">
                <label className="label">{t('unitPrice')}</label>
                <input type="number" min="0" step="0.01" value={form.unit_price || ''} onChange={(e) => setForm({ ...form, unit_price: parseFloat(e.target.value) || 0 })} className="input" />
              </div>
              <div className="sm:col-span-2 p-4 rounded-xl bg-primary-50 text-sm">
                {t('totalPrice')}: <span className="font-bold text-primary-700">{formatCurrency(form.quantity * form.unit_price)}</span>
              </div>
            </div>
          ) : (
            <div className="input-group">
              <label className="label">{t('totalPrice')}</label>
              <input type="number" min="0" step="0.01" value={form.total_price || ''} onChange={(e) => setForm({ ...form, total_price: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
          )}

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

      {/* Receive Modal */}
      <Modal open={!!receiveTarget} onClose={() => setReceiveTarget(null)} title={t('receiveExtraWork')}>
        {receiveTarget && (
          <div className="space-y-4">
            <div className="card p-4 bg-neutral-50">
              <p className="text-sm text-neutral-600">{t('workSubject')}: <span className="font-semibold">{receiveTarget.subject}</span></p>
              <p className="text-sm text-neutral-600">{t('totalPrice')}: <span className="font-semibold">{formatCurrency(receiveTarget.total_price)}</span></p>
            </div>
            <div className="input-group">
              <label className="label">{t('amount')}</label>
              <input type="number" min="0" step="0.01" value={receiveForm.amount || ''} onChange={(e) => setReceiveForm({ ...receiveForm, amount: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('paymentDate')}</label>
              <input type="date" value={receiveForm.receive_date} onChange={(e) => setReceiveForm({ ...receiveForm, receive_date: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('account')}</label>
              <select value={receiveForm.wallet_account_id} onChange={(e) => setReceiveForm({ ...receiveForm, wallet_account_id: e.target.value })} className="input">
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setReceiveTarget(null)} className="btn-secondary">{t('cancel')}</button>
              <button onClick={handleReceive} className="btn-success" disabled={saving || receiveForm.amount <= 0}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Receipt size={16} />}
                {t('markAsReceived')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('delete')}
        message={`${t('confirmDelete')} ${deleteTarget?.subject}`}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

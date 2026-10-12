import { useState, useEffect } from 'react';
import {
  Plus, Search, Building2, Phone, Edit2, Trash2,
  Loader2, Calendar, FileText, HardHat, Power, PowerOff,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/Common';
import {
  getWorkshops, createWorkshop, updateWorkshop, deleteWorkshop,
  getContractors, getContracts, createContract, updateContract, addAuditLog,
} from '@/lib/dataAccess';
import type { Workshop, Contractor, WorkshopType, WorkshopContract, ContractStatus } from '@/types';

export function Workshops() {
  const { t, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Workshop | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workshop | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Workshop | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '', contractor_id: '', phone: '', address: '',
    workshop_type: 'daily_wage' as WorkshopType, is_active: true,
    start_date: '', end_date: '', notes: '',
  });

  const load = async () => {
    if (!user) return;
    try {
      const [w, c] = await Promise.all([getWorkshops(user.id), getContractors(user.id, true)]);
      setWorkshops(w);
      setContractors(c);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const filtered = workshops.filter((w) =>
    (statusFilter === 'all' || (statusFilter === 'active' ? w.is_active : !w.is_active)) &&
    (!search ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      (w.contractor?.name || '').toLowerCase().includes(search.toLowerCase()))
  );

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', contractor_id: '', phone: '', address: '', workshop_type: 'daily_wage', is_active: true, start_date: '', end_date: '', notes: '' });
    setModalOpen(true);
  };

  const openEdit = (w: Workshop) => {
    setEditing(w);
    setForm({
      name: w.name, contractor_id: w.contractor_id || '', phone: w.phone, address: w.address,
      workshop_type: w.workshop_type, is_active: w.is_active,
      start_date: w.start_date || '', end_date: w.end_date || '', notes: w.notes,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    setSaving(true);
    try {
      const data = {
        ...form,
        contractor_id: form.contractor_id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        user_id: user.id,
      };
      if (editing) {
        await updateWorkshop(editing.id, data);
        await addAuditLog({ user_id: user.id, action: 'workshop_updated', entity_type: 'workshop', entity_id: editing.id });
        showToast('success', t('changesSaved'));
      } else {
        const created = await createWorkshop(data);
        await addAuditLog({ user_id: user.id, action: 'workshop_created', entity_type: 'workshop', entity_id: created.id });
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

  const handleDelete = async () => {
    if (!user || !deleteTarget) return;
    try {
      await deleteWorkshop(deleteTarget.id);
      await addAuditLog({ user_id: user.id, action: 'workshop_deleted', entity_type: 'workshop', entity_id: deleteTarget.id });
      showToast('success', t('deleteSuccess'));
      setDeleteTarget(null);
      await load();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    }
  };

  const toggleActive = async (w: Workshop) => {
    if (!user) return;
    try {
      await updateWorkshop(w.id, { is_active: !w.is_active, user_id: user.id });
      await addAuditLog({ user_id: user.id, action: 'workshop_updated', entity_type: 'workshop', entity_id: w.id });
      showToast('success', t('changesSaved'));
      await load();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    }
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{t('workshops')}</h1>
          <p className="text-sm text-neutral-400 mt-1">{t('workshops')}</p>
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus size={18} /> {t('addWorkshop')}</button>
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search size={18} className="absolute top-3 start-3 text-neutral-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} className="input ps-10" />
        </div>
        <div className="flex gap-2 mt-3">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === f ? 'bg-primary-500 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {f === 'all' ? t('all') : f === 'active' ? t('active') : t('inactive')}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Building2 size={48} />} title={t('noWorkshops')} action={<button onClick={openAdd} className="btn-primary"><Plus size={16} /> {t('addWorkshop')}</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((w) => (
            <div key={w.id} className="card-hover p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
                    <Building2 size={22} />
                  </div>
                  <div className="min-w-0">
                    <button onClick={() => setDetailsTarget(w)} className="text-sm font-semibold text-neutral-900 hover:text-primary-600 transition-colors truncate block text-start">{w.name}</button>
                    <p className="text-xs text-neutral-400 mt-0.5">{w.workshop_type === 'daily_wage' ? t('dailyWageType') : t('contractType')}</p>
                  </div>
                </div>
                <span className={`badge ${w.is_active ? 'badge-success' : 'badge-neutral'}`}>{w.is_active ? t('active') : t('inactive')}</span>
              </div>

              <div className="space-y-2 text-sm text-neutral-600">
                {w.contractor && <p className="flex items-center gap-2"><HardHat size={14} className="text-neutral-400" /> {w.contractor.name}</p>}
                {w.phone && <p className="flex items-center gap-2"><Phone size={14} className="text-neutral-400" /> {w.phone}</p>}
                {w.start_date && <p className="flex items-center gap-2"><Calendar size={14} className="text-neutral-400" /> {formatDate(w.start_date)}</p>}
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-200/60">
                <button onClick={() => setDetailsTarget(w)} className="btn-ghost flex-1 text-xs"><FileText size={14} /> {t('workshopDetails')}</button>
                <button onClick={() => openEdit(w)} className="btn-ghost text-xs"><Edit2 size={14} /></button>
                <button onClick={() => toggleActive(w)} className={`btn-ghost text-xs ${w.is_active ? 'text-warning-600 hover:text-warning-700' : 'text-success-600 hover:text-success-700'}`} title={w.is_active ? t('deactivate') : t('activate')}>
                  {w.is_active ? <PowerOff size={14} /> : <Power size={14} />}
                </button>
                <button onClick={() => setDeleteTarget(w)} className="btn-ghost text-error-600 text-xs hover:text-error-700"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t('editWorkshop') : t('addWorkshop')} size="lg">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="input-group">
              <label className="label">{t('workshopName')} *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('contractor')}</label>
              <select value={form.contractor_id} onChange={(e) => setForm({ ...form, contractor_id: e.target.value })} className="input">
                <option value="">{t('selectWorker')}</option>
                {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="label">{t('workshopType')}</label>
              <select value={form.workshop_type} onChange={(e) => setForm({ ...form, workshop_type: e.target.value as WorkshopType })} className="input">
                <option value="daily_wage">{t('dailyWageType')}</option>
                <option value="contract">{t('contractType')}</option>
              </select>
            </div>
            <div className="input-group">
              <label className="label">{t('phone')}</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('address')}</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('startDate')}</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('endDate')}</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="input" />
            </div>
          </div>
          <div className="input-group">
            <label className="label">{t('notes')}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[80px] resize-none" />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>

      {detailsTarget && (
        <WorkshopDetailsModal workshop={detailsTarget} onClose={() => setDetailsTarget(null)} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteWorkshop')}
        message={`${t('confirmDelete')} ${deleteTarget?.name}`}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function WorkshopDetailsModal({ workshop, onClose }: { workshop: Workshop; onClose: () => void }) {
  const { t, formatDate, formatCurrency } = useI18n();
  const { user } = useAuth();
  const [contracts, setContracts] = useState<WorkshopContract[]>([]);
  const [showAddContract, setShowAddContract] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contractForm, setContractForm] = useState({
    contract_name: '', agreed_amount: 0, agreement_type: 'fixed' as 'fixed' | 'per_worker',
    start_date: '', end_date: '', received_amount: 0, status: 'active' as ContractStatus, notes: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const c = await getContracts(workshop.id);
        setContracts(c);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [workshop.id]);

  const handleAddContract = async () => {
    if (!user || !contractForm.contract_name.trim()) return;
    try {
      await createContract({
        ...contractForm,
        workshop_id: workshop.id,
        user_id: user.id,
        start_date: contractForm.start_date || null,
        end_date: contractForm.end_date || null,
      });
      const c = await getContracts(workshop.id);
      setContracts(c);
      setContractForm({ contract_name: '', agreed_amount: 0, agreement_type: 'fixed', start_date: '', end_date: '', received_amount: 0, status: 'active', notes: '' });
      setShowAddContract(false);
    } catch (e) {
      console.error(e);
    }
  };

  const updateContractStatus = async (id: string, status: ContractStatus) => {
    try {
      await updateContract(id, { status });
      const c = await getContracts(workshop.id);
      setContracts(c);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={t('workshopDetails')} size="lg">
      {loading ? (
        <LoadingSpinner label={t('loading')} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
              <Building2 size={28} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900">{workshop.name}</h3>
              <p className="text-sm text-neutral-400 mt-0.5">{workshop.workshop_type === 'daily_wage' ? t('dailyWageType') : t('contractType')}</p>
            </div>
          </div>

          <div className="card p-4 grid grid-cols-2 gap-4 text-sm">
            {workshop.contractor && <div><span className="text-neutral-400">{t('contractor')}: </span><span className="text-neutral-900 font-medium">{workshop.contractor.name}</span></div>}
            {workshop.phone && <div><span className="text-neutral-400">{t('phone')}: </span><span className="text-neutral-900 font-medium">{workshop.phone}</span></div>}
            {workshop.address && <div><span className="text-neutral-400">{t('address')}: </span><span className="text-neutral-900 font-medium">{workshop.address}</span></div>}
            {workshop.start_date && <div><span className="text-neutral-400">{t('startDate')}: </span><span className="text-neutral-900 font-medium">{formatDate(workshop.start_date)}</span></div>}
            {workshop.end_date && <div><span className="text-neutral-400">{t('endDate')}: </span><span className="text-neutral-900 font-medium">{formatDate(workshop.end_date)}</span></div>}
          </div>

          {workshop.notes && <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/60 text-sm text-neutral-600">{workshop.notes}</div>}

          {/* Contracts section */}
          {workshop.workshop_type === 'contract' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="section-title">{t('contractName')}</h4>
                <button onClick={() => setShowAddContract(!showAddContract)} className="btn-ghost text-xs"><Plus size={14} /> {t('addContract')}</button>
              </div>

              {showAddContract && (
                <div className="card p-4 mb-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder={t('contractName')} value={contractForm.contract_name} onChange={(e) => setContractForm({ ...contractForm, contract_name: e.target.value })} className="input text-sm" />
                    <input type="number" placeholder={t('agreedAmount')} value={contractForm.agreed_amount || ''} onChange={(e) => setContractForm({ ...contractForm, agreed_amount: parseFloat(e.target.value) || 0 })} className="input text-sm" />
                    <select value={contractForm.agreement_type} onChange={(e) => setContractForm({ ...contractForm, agreement_type: e.target.value as 'fixed' | 'per_worker' })} className="input text-sm">
                      <option value="fixed">{t('fixed')}</option>
                      <option value="per_worker">{t('perWorker')}</option>
                    </select>
                    <select value={contractForm.status} onChange={(e) => setContractForm({ ...contractForm, status: e.target.value as ContractStatus })} className="input text-sm">
                      <option value="active">{t('active')}</option>
                      <option value="completed">{t('completed')}</option>
                      <option value="cancelled">{t('cancelled')}</option>
                    </select>
                    <input type="date" value={contractForm.start_date} onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })} className="input text-sm" />
                    <input type="date" value={contractForm.end_date} onChange={(e) => setContractForm({ ...contractForm, end_date: e.target.value })} className="input text-sm" />
                  </div>
                  <button onClick={handleAddContract} className="btn-primary w-full text-sm">{t('save')}</button>
                </div>
              )}

              <div className="space-y-2">
                {contracts.map((c) => (
                  <div key={c.id} className="py-3 px-4 rounded-xl bg-neutral-50 border border-neutral-200/60 transition-colors hover:bg-neutral-100/60">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-neutral-900">{c.contract_name}</span>
                      <span className={`badge ${
                        c.status === 'active' ? 'badge-success' :
                        c.status === 'completed' ? 'badge-primary' : 'badge-neutral'
                      }`}>{t(c.status)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span>{t('agreedAmount')}: {formatCurrency(c.agreed_amount)}</span>
                      <span>{t('receivedAmount')}: {formatCurrency(c.received_amount)}</span>
                      <span>{t('remainingAmount')}: {formatCurrency(c.agreed_amount - c.received_amount)}</span>
                    </div>
                    {c.status === 'active' && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => updateContractStatus(c.id, 'completed')} className="btn-ghost text-xs text-success-600 hover:text-success-700">{t('completed')}</button>
                        <button onClick={() => updateContractStatus(c.id, 'cancelled')} className="btn-ghost text-xs text-error-600 hover:text-error-700">{t('cancelled')}</button>
                      </div>
                    )}
                  </div>
                ))}
                {contracts.length === 0 && <p className="text-sm text-neutral-400">{t('noContracts')}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

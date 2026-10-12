import { useState, useEffect } from 'react';import {
  Plus, Search, HardHat, Phone, MapPin, Building2, Edit2, Trash2,
  Loader2, FileText,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/Common';
import {
  getContractors, createContractor, updateContractor, deleteContractor,
  getWorkshops, getClaimsByContractor, addAuditLog,
} from '@/lib/dataAccess';
import type { Contractor, Workshop, Claim } from '@/types';

export function Contractors() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Contractor | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<Contractor | null>(null);
  const [contractorClaims, setContractorClaims] = useState<Claim[]>([]);

  const [form, setForm] = useState({
    name: '', company_name: '', phone: '', address: '',
    is_active: true, notes: '',
  });

  const load = async () => {
    if (!user) return;
    try {
      const [c, w] = await Promise.all([
        getContractors(user.id),
        getWorkshops(user.id),
      ]);
      setContractors(c);
      setWorkshops(w);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const filtered = contractors.filter((c) => {
    const matchesSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.company_name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search);
    const matchesActive = filterActive === 'all' ||
      (filterActive === 'active' && c.is_active) ||
      (filterActive === 'inactive' && !c.is_active);
    return matchesSearch && matchesActive;
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', company_name: '', phone: '', address: '', is_active: true, notes: '' });
    setModalOpen(true);
  };

  const openEdit = (c: Contractor) => {
    setEditing(c);
    setForm({ name: c.name, company_name: c.company_name, phone: c.phone, address: c.address, is_active: c.is_active, notes: c.notes });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateContractor(editing.id, form);
        await addAuditLog({ user_id: user.id, action: 'contractor_updated', entity_type: 'contractor', entity_id: editing.id });
        showToast('success', t('changesSaved'));
      } else {
        const existing = contractors.find((c) => c.name.toLowerCase() === form.name.toLowerCase());
        if (existing) { showToast('warning', t('duplicateContractor')); setSaving(false); return; }
        const created = await createContractor({ ...form, user_id: user.id });
        await addAuditLog({ user_id: user.id, action: 'contractor_created', entity_type: 'contractor', entity_id: created.id });
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
      await deleteContractor(deleteTarget.id);
      await addAuditLog({ user_id: user.id, action: 'contractor_deleted', entity_type: 'contractor', entity_id: deleteTarget.id });
      showToast('success', t('deleteSuccess'));
      setDeleteTarget(null);
      await load();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    }
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{t('contractors')}</h1>
          <p className="text-sm text-neutral-400 mt-1">{t('contractors')}</p>
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus size={18} /> {t('addContractor')}</button>
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute top-3 start-3 text-neutral-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchContractors')} className="input ps-10" />
          </div>
          <select value={filterActive} onChange={(e) => setFilterActive(e.target.value as typeof filterActive)} className="input sm:w-36">
            <option value="all">{t('all')}</option>
            <option value="active">{t('active')}</option>
            <option value="inactive">{t('inactive')}</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<HardHat size={48} />} title={t('noContractors')} action={<button onClick={openAdd} className="btn-primary"><Plus size={16} /> {t('addContractor')}</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((c) => {
            const contractorWorkshops = workshops.filter((w) => w.contractor_id === c.id);
            return (
              <div key={c.id} className="card-hover p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
                      <HardHat size={22} />
                    </div>
                    <div className="min-w-0">
                      <button onClick={() => setDetailsTarget(c)} className="text-sm font-semibold text-neutral-900 hover:text-primary-600 transition-colors truncate block text-start">{c.name}</button>
                      {c.company_name && <p className="text-xs text-neutral-400 mt-0.5 truncate">{c.company_name}</p>}
                    </div>
                  </div>
                  <span className={`badge ${c.is_active ? 'badge-success' : 'badge-neutral'}`}>{c.is_active ? t('active') : t('inactive')}</span>
                </div>

                <div className="space-y-2 text-sm text-neutral-600">
                  {c.phone && <p className="flex items-center gap-2"><Phone size={14} className="text-neutral-400" /> {c.phone}</p>}
                  {c.address && <p className="flex items-center gap-2"><MapPin size={14} className="text-neutral-400" /> {c.address}</p>}
                  <p className="flex items-center gap-2"><Building2 size={14} className="text-neutral-400" /> {contractorWorkshops.length} {t('workshops')}</p>
                </div>

                <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-200/60">
                  <button onClick={() => openEdit(c)} className="btn-ghost flex-1 text-xs"><Edit2 size={14} /> {t('edit')}</button>
                  <button onClick={() => setDeleteTarget(c)} className="btn-ghost text-error-600 text-xs hover:text-error-700"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t('editContractor') : t('addContractor')}>
        <div className="space-y-5">
          <div className="input-group">
            <label className="label">{t('contractorName')} *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('companyName')}</label>
            <input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="input" />
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
        <ContractorDetailsModal
          contractor={detailsTarget}
          workshops={workshops}
          claims={contractorClaims}
          onClose={() => setDetailsTarget(null)}
          onShowClaims={async (id) => { const c = await getClaimsByContractor(user!.id, id); setContractorClaims(c); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteContractor')}
        message={`${t('confirmDelete')} ${deleteTarget?.name}`}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function ContractorDetailsModal({
  contractor, workshops, claims, onClose, onShowClaims,
}: {
  contractor: Contractor;
  workshops: Workshop[];
  claims: Claim[];
  onClose: () => void;
  onShowClaims: (id: string) => Promise<void>;
}) {
  const { t, formatCurrency, formatDate } = useI18n();
  const [claimsLoaded, setClaimsLoaded] = useState(false);

  useEffect(() => {
    onShowClaims(contractor.id).then(() => setClaimsLoaded(true)).catch(console.error);
  }, [contractor.id]);

  const contractorWorkshops = workshops.filter((w) => w.contractor_id === contractor.id);
  const draftCount = claims.filter((c) => c.status === 'draft').length;
  const sentCount = claims.filter((c) => c.status === 'sent').length;
  const fullCount = claims.filter((c) => c.status === 'fully_received').length;
  const outstanding = claims
    .filter((c) => c.status === 'sent' || c.status === 'partially_received')
    .reduce((s, c) => s + c.total, 0);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: 'badge-neutral', prepared: 'badge-primary', sent: 'badge-warning',
      partially_received: 'badge-warning', fully_received: 'badge-success', closed: 'badge-neutral',
    };
    return map[status] || 'badge-neutral';
  };

  return (
    <Modal open={true} onClose={onClose} title={t('contractorDetails')} size="lg">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
            <HardHat size={28} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-neutral-900">{contractor.name}</h3>
            {contractor.company_name && <p className="text-sm text-neutral-400 mt-0.5">{contractor.company_name}</p>}
          </div>
        </div>

        <div className="card p-4 grid grid-cols-2 gap-4 text-sm">
          {contractor.phone && <div><span className="text-neutral-400">{t('phone')}: </span><span className="text-neutral-900 font-medium">{contractor.phone}</span></div>}
          {contractor.address && <div><span className="text-neutral-400">{t('address')}: </span><span className="text-neutral-900 font-medium">{contractor.address}</span></div>}
        </div>

        {contractor.notes && <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/60 text-sm text-neutral-600">{contractor.notes}</div>}

        <div>
          <h4 className="section-title mb-3">{t('relatedWorkshops')}</h4>
          <div className="space-y-2">
            {contractorWorkshops.map((w) => (
              <div key={w.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-neutral-50 border border-neutral-200/60 text-sm transition-colors hover:bg-neutral-100/60">
                <div className="flex items-center gap-2">
                  <Building2 size={14} className="text-neutral-400" />
                  <span className="font-medium text-neutral-900">{w.name}</span>
                </div>
                <span className="text-xs text-neutral-400">{w.workshop_type === 'daily_wage' ? t('dailyWageType') : t('contractType')}</span>
              </div>
            ))}
            {contractorWorkshops.length === 0 && <p className="text-sm text-neutral-400">{t('noWorkshops')}</p>}
          </div>
        </div>

        {/* Claim History */}
        <div>
          <h4 className="section-title mb-3 flex items-center gap-2">
            <FileText size={16} className="text-primary-600" /> {t('contractorClaimHistory')}
          </h4>
          {!claimsLoaded ? (
            <p className="text-sm text-neutral-400">{t('loading')}</p>
          ) : claims.length === 0 ? (
            <p className="text-sm text-neutral-400">{t('noContractorClaims')}</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="stat-card">
                  <p className="text-xs text-neutral-400">{t('draftClaims')}</p>
                  <p className="text-2xl font-bold text-neutral-900 mt-1">{draftCount}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs text-neutral-400">{t('sentClaims')}</p>
                  <p className="text-2xl font-bold text-neutral-900 mt-1">{sentCount}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs text-neutral-400">{t('fullyReceivedClaims')}</p>
                  <p className="text-2xl font-bold text-success-600 mt-1">{fullCount}</p>
                </div>
              </div>
              {outstanding > 0 && (
                <div className="p-3 rounded-xl bg-warning-50 border border-warning-200/60 text-sm mb-3 flex items-center justify-between">
                  <span className="text-warning-700 font-medium">{t('outstandingAmount')}</span>
                  <span className="font-bold text-warning-700">{formatCurrency(outstanding)}</span>
                </div>
              )}
              <div className="space-y-2">
                {claims.map((c) => {
                  const lineWorkshops = new Map<string, string>();
                  c.claim_lines?.forEach((l) => { if (l.workshop_name) lineWorkshops.set(l.workshop_id || '', l.workshop_name); });
                  return (
                    <div key={c.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-neutral-50 border border-neutral-200/60 text-sm transition-colors hover:bg-neutral-100/60">
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900">{c.claim_number}</p>
                        <p className="text-xs text-neutral-400 mt-0.5">
                          {formatDate(c.claim_date)}
                          {lineWorkshops.size > 0 && ` · ${Array.from(lineWorkshops.values()).join(', ')}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`badge ${statusBadge(c.status)}`}>{t(c.status)}</span>
                        <span className="font-semibold text-neutral-900">{formatCurrency(c.total)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

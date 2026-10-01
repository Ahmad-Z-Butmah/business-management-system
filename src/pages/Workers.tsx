import { useState, useEffect } from 'react';
import {
  Plus, Search, Users, Phone, Briefcase, Edit2, Trash2,
  UserCircle, UserPlus, UserMinus, Loader2, History, X,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/Common';
import {
  getWorkers, createWorker, updateWorker, deleteWorker,
  getWageHistory, addWageHistory, getOvertimeHistory, addOvertimeHistory,
  getTeamMembers, addTeamMembership, removeTeamMembership,
} from '@/lib/dataAccess';
import { addAuditLog } from '@/lib/dataAccess';
import type { Worker, WorkerWageHistory, WorkerOvertimeHistory, WorkerType } from '@/types';

export function Workers() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'normal' | 'team_leader'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);
  const [detailsWorker, setDetailsWorker] = useState<Worker | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    profession: '',
    worker_type: 'normal' as WorkerType,
    is_active: true,
    notes: '',
    default_daily_wage: 0,
    default_overtime_rate: 0,
    default_driving_amount: 50,
    effective_date: new Date().toISOString().split('T')[0],
  });

  const loadWorkers = async () => {
    if (!user) return;
    try {
      const data = await getWorkers(user.id);
      setWorkers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWorkers(); }, [user]);

  const filtered = workers.filter((w) => {
    const matchesSearch = !search ||
      w.full_name.toLowerCase().includes(search.toLowerCase()) ||
      w.phone.includes(search) ||
      w.profession.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || w.worker_type === filterType;
    const matchesActive = filterActive === 'all' ||
      (filterActive === 'active' && w.is_active) ||
      (filterActive === 'inactive' && !w.is_active);
    return matchesSearch && matchesType && matchesActive;
  });

  const openAdd = () => {
    setEditingWorker(null);
    setForm({
      full_name: '', phone: '', profession: '', worker_type: 'normal',
      is_active: true, notes: '', default_daily_wage: 0,
      default_overtime_rate: 0, default_driving_amount: 50,
      effective_date: new Date().toISOString().split('T')[0],
    });
    setModalOpen(true);
  };

  const openEdit = (w: Worker) => {
    setEditingWorker(w);
    setForm({
      full_name: w.full_name, phone: w.phone, profession: w.profession,
      worker_type: w.worker_type, is_active: w.is_active, notes: w.notes,
      default_daily_wage: w.default_daily_wage, default_overtime_rate: w.default_overtime_rate,
      default_driving_amount: w.default_driving_amount, effective_date: w.effective_date,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!user || !form.full_name.trim()) return;
    setSaving(true);
    try {
      if (editingWorker) {
        const oldWage = editingWorker.default_daily_wage;
        const newWage = form.default_daily_wage;
        await updateWorker(editingWorker.id, form);
        if (newWage !== oldWage) {
          await addWageHistory({
            user_id: user.id, worker_id: editingWorker.id,
            daily_wage: newWage, effective_date: form.effective_date,
          });
        }
        const oldOt = editingWorker.default_overtime_rate;
        const newOt = form.default_overtime_rate;
        if (newOt !== oldOt) {
          await addOvertimeHistory({
            user_id: user.id, worker_id: editingWorker.id,
            overtime_rate: newOt, effective_date: form.effective_date,
          });
        }
        await addAuditLog({ user_id: user.id, action: 'worker_updated', entity_type: 'worker', entity_id: editingWorker.id });
        showToast('success', t('changesSaved'));
      } else {
        const existing = workers.find((w) => w.full_name.toLowerCase() === form.full_name.toLowerCase());
        if (existing) { showToast('warning', t('duplicateWorker')); setSaving(false); return; }
        const created = await createWorker({ ...form, user_id: user.id });
        await addWageHistory({
          user_id: user.id, worker_id: created.id,
          daily_wage: form.default_daily_wage, effective_date: form.effective_date,
        });
        if (form.default_overtime_rate > 0) {
          await addOvertimeHistory({
            user_id: user.id, worker_id: created.id,
            overtime_rate: form.default_overtime_rate, effective_date: form.effective_date,
          });
        }
        await addAuditLog({ user_id: user.id, action: 'worker_created', entity_type: 'worker', entity_id: created.id });
        showToast('success', t('createSuccess'));
      }
      setModalOpen(false);
      await loadWorkers();
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
      await deleteWorker(deleteTarget.id);
      await addAuditLog({ user_id: user.id, action: 'worker_deleted', entity_type: 'worker', entity_id: deleteTarget.id });
      showToast('success', t('deleteSuccess'));
      setDeleteTarget(null);
      await loadWorkers();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    }
  };

  const toggleActive = async (w: Worker) => {
    if (!user) return;
    try {
      await updateWorker(w.id, { is_active: !w.is_active });
      await addAuditLog({ user_id: user.id, action: w.is_active ? 'worker_deactivated' : 'worker_activated', entity_type: 'worker', entity_id: w.id });
      await loadWorkers();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">{t('workers')}</h1>
          <p className="text-sm text-neutral-400 mt-1">{t('workers')}</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={18} /> {t('addWorker')}
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute top-3 start-3 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchWorkers')}
              className="input ps-10"
            />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)} className="input sm:w-44">
            <option value="all">{t('allTypes')}</option>
            <option value="normal">{t('normalWorker')}</option>
            <option value="team_leader">{t('teamLeader')}</option>
          </select>
          <select value={filterActive} onChange={(e) => setFilterActive(e.target.value as typeof filterActive)} className="input sm:w-36">
            <option value="all">{t('all')}</option>
            <option value="active">{t('active')}</option>
            <option value="inactive">{t('inactive')}</option>
          </select>
        </div>
      </div>

      {/* Workers list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title={t('noWorkers')}
          description={t('noWorkersActive')}
          action={<button onClick={openAdd} className="btn-primary"><Plus size={16} /> {t('addWorker')}</button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((w) => (
            <div key={w.id} className="card-hover p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                    w.worker_type === 'team_leader' ? 'bg-primary-100 text-primary-600' : 'bg-neutral-100 text-neutral-500'
                  }`}>
                    <UserCircle size={24} />
                  </div>
                  <div className="min-w-0">
                    <button onClick={() => setDetailsWorker(w)} className="text-sm font-semibold text-neutral-900 hover:text-primary-600 transition-colors truncate block text-start">
                      {w.full_name}
                    </button>
                    <p className="text-xs text-neutral-400 mt-0.5">{w.worker_type === 'team_leader' ? t('teamLeader') : t('normalWorker')}</p>
                  </div>
                </div>
                <span className={`badge ${w.is_active ? 'badge-success' : 'badge-neutral'}`}>
                  {w.is_active ? t('active') : t('inactive')}
                </span>
              </div>

              <div className="space-y-2 text-sm text-neutral-600">
                {w.phone && <p className="flex items-center gap-2"><Phone size={14} className="text-neutral-400" /> {w.phone}</p>}
                {w.profession && <p className="flex items-center gap-2"><Briefcase size={14} className="text-neutral-400" /> {w.profession}</p>}
                <p className="flex items-center gap-2"><span className="text-neutral-400 font-medium">₪</span> {t('dailyWage')}: {formatCurrency(w.default_daily_wage)}</p>
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-200/60">
                <button onClick={() => openEdit(w)} className="btn-ghost flex-1 text-xs"><Edit2 size={14} /> {t('edit')}</button>
                <button onClick={() => toggleActive(w)} className="btn-ghost text-xs transition-colors hover:text-primary-600">
                  {w.is_active ? <UserMinus size={14} /> : <UserPlus size={14} />}
                </button>
                <button onClick={() => setDeleteTarget(w)} className="btn-ghost text-error-600 text-xs hover:text-error-700"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingWorker ? t('editWorker') : t('addWorker')} size="lg">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="input-group">
              <label className="label">{t('fullName')} *</label>
              <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('phone')}</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('profession')}</label>
              <input value={form.profession} onChange={(e) => setForm({ ...form, profession: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('workerType')}</label>
              <select value={form.worker_type} onChange={(e) => setForm({ ...form, worker_type: e.target.value as WorkerType })} className="input">
                <option value="normal">{t('normalWorker')}</option>
                <option value="team_leader">{t('teamLeader')}</option>
              </select>
            </div>
            <div className="input-group">
              <label className="label">{t('dailyWage')}</label>
              <input type="number" min="0" step="0.01" value={form.default_daily_wage} onChange={(e) => setForm({ ...form, default_daily_wage: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('overtimeRate')}</label>
              <input type="number" min="0" step="0.01" value={form.default_overtime_rate} onChange={(e) => setForm({ ...form, default_overtime_rate: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('drivingAmount')}</label>
              <input type="number" min="0" step="0.01" value={form.default_driving_amount} onChange={(e) => setForm({ ...form, default_driving_amount: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('effectiveDate')}</label>
              <input type="date" value={form.effective_date} onChange={(e) => setForm({ ...form, effective_date: e.target.value })} className="input" />
            </div>
          </div>
          <div className="input-group">
            <label className="label">{t('notes')}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[80px] resize-none" />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Worker Details Modal */}
      {detailsWorker && (
        <WorkerDetailsModal worker={detailsWorker} onClose={() => setDetailsWorker(null)} />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteWorker')}
        message={`${t('confirmDelete')} ${deleteTarget?.full_name}`}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function WorkerDetailsModal({ worker, onClose }: { worker: Worker; onClose: () => void }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const [wageHistory, setWageHistory] = useState<WorkerWageHistory[]>([]);
  const [otHistory, setOtHistory] = useState<WorkerOvertimeHistory[]>([]);
  const [teamMembers, setTeamMembers] = useState<Worker[]>([]);
  const [allWorkers, setAllWorkers] = useState<Worker[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedMember, setSelectedMember] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [wh, oh, tm, aw] = await Promise.all([
          getWageHistory(worker.id),
          getOvertimeHistory(worker.id),
          worker.worker_type === 'team_leader' ? getTeamMembers(worker.id) : Promise.resolve([]),
          getWorkers(user.id, true),
        ]);
        setWageHistory(wh);
        setOtHistory(oh);
        setTeamMembers(tm.map((m) => m.worker));
        setAllWorkers(aw.filter((w) => w.id !== worker.id && w.worker_type === 'normal'));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, worker.id, worker.worker_type]);

  const addMember = async () => {
    if (!user || !selectedMember) return;
    try {
      await addTeamMembership({ user_id: user.id, team_leader_id: worker.id, worker_id: selectedMember });
      const tm = await getTeamMembers(worker.id);
      setTeamMembers(tm.map((m) => m.worker));
      setSelectedMember('');
      setShowAddMember(false);
    } catch (e) {
      console.error(e);
    }
  };

  const removeMember = async (workerId: string) => {
    if (!user) return;
    try {
      const memberships = await getTeamMembers(worker.id);
      const membership = memberships.find((m) => m.worker_id === workerId);
      if (membership) await removeTeamMembership(membership.id);
      const tm = await getTeamMembers(worker.id);
      setTeamMembers(tm.map((m) => m.worker));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={t('workerDetails')} size="lg">
      {loading ? (
        <LoadingSpinner label={t('loading')} />
      ) : (
        <div className="space-y-6">
          {/* Worker info */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
              <UserCircle size={28} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-neutral-900">{worker.full_name}</h3>
              <p className="text-sm text-neutral-400 mt-0.5">
                {worker.worker_type === 'team_leader' ? t('teamLeader') : t('normalWorker')} ·
                <span className={worker.is_active ? 'text-success-600 font-medium' : 'text-neutral-400'}>
                  {' '}{worker.is_active ? t('active') : t('inactive')}
                </span>
              </p>
            </div>
          </div>

          <div className="card p-4 grid grid-cols-2 gap-4 text-sm">
            {worker.phone && <div><span className="text-neutral-400">{t('phone')}: </span><span className="text-neutral-900 font-medium">{worker.phone}</span></div>}
            {worker.profession && <div><span className="text-neutral-400">{t('profession')}: </span><span className="text-neutral-900 font-medium">{worker.profession}</span></div>}
            <div><span className="text-neutral-400">{t('dailyWage')}: </span><span className="text-neutral-900 font-medium">{formatCurrency(worker.default_daily_wage)}</span></div>
            <div><span className="text-neutral-400">{t('overtimeRate')}: </span><span className="text-neutral-900 font-medium">{formatCurrency(worker.default_overtime_rate)}</span></div>
            <div><span className="text-neutral-400">{t('drivingAmount')}: </span><span className="text-neutral-900 font-medium">{formatCurrency(worker.default_driving_amount)}</span></div>
            <div><span className="text-neutral-400">{t('effectiveDate')}: </span><span className="text-neutral-900 font-medium">{formatDate(worker.effective_date)}</span></div>
          </div>

          {worker.notes && (
            <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-200/60 text-sm text-neutral-600">{worker.notes}</div>
          )}

          {/* Wage History */}
          <div>
            <h4 className="section-title mb-3 flex items-center gap-2">
              <History size={16} className="text-primary-600" /> {t('wageHistory')}
            </h4>
            <div className="space-y-2">
              {wageHistory.map((wh) => (
                <div key={wh.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-neutral-50 border border-neutral-200/60 text-sm transition-colors hover:bg-neutral-100/60">
                  <span className="text-neutral-500">{formatDate(wh.effective_date)}</span>
                  <span className="font-semibold text-neutral-900">{formatCurrency(wh.daily_wage)}</span>
                </div>
              ))}
              {wageHistory.length === 0 && <p className="text-sm text-neutral-400">{t('noData')}</p>}
            </div>
          </div>

          {/* Overtime History */}
          {otHistory.length > 0 && (
            <div>
              <h4 className="section-title mb-3 flex items-center gap-2">
                <History size={16} className="text-primary-600" /> {t('overtimeHistory')}
              </h4>
              <div className="space-y-2">
                {otHistory.map((oh) => (
                  <div key={oh.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-neutral-50 border border-neutral-200/60 text-sm transition-colors hover:bg-neutral-100/60">
                    <span className="text-neutral-500">{formatDate(oh.effective_date)}</span>
                    <span className="font-semibold text-neutral-900">{formatCurrency(oh.overtime_rate)}/{t('hours')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Members (for team leaders) */}
          {worker.worker_type === 'team_leader' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="section-title flex items-center gap-2">
                  <Users size={16} className="text-primary-600" /> {t('teamMembers')}
                </h4>
                <button onClick={() => setShowAddMember(!showAddMember)} className="btn-ghost text-xs">
                  <Plus size={14} /> {t('addTeamMember')}
                </button>
              </div>

              {showAddMember && (
                <div className="flex gap-2 mb-3">
                  <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)} className="input flex-1">
                    <option value="">{t('selectWorker')}</option>
                    {allWorkers.filter((w) => !teamMembers.find((tm) => tm.id === w.id)).map((w) => (
                      <option key={w.id} value={w.id}>{w.full_name}</option>
                    ))}
                  </select>
                  <button onClick={addMember} className="btn-primary"><Plus size={16} /></button>
                </div>
              )}

              <div className="space-y-2">
                {teamMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-neutral-50 border border-neutral-200/60 text-sm transition-colors hover:bg-neutral-100/60">
                    <div className="flex items-center gap-2">
                      <UserCircle size={16} className="text-neutral-400" />
                      <span className="font-medium text-neutral-900">{m.full_name}</span>
                    </div>
                    <button onClick={() => removeMember(m.id)} className="text-error-500 hover:text-error-700 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                ))}
                {teamMembers.length === 0 && <p className="text-sm text-neutral-400">{t('noData')}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

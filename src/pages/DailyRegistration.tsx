import { useState, useEffect } from 'react';
import {
  CalendarCheck, Loader2, Save, Check, X, ChevronDown, ChevronUp,
  Clock, Car, Users, AlertCircle, Info, Zap, CheckCheck, CheckCircle2,
  Trash2, Pencil,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useDataRefresh } from '@/contexts/DataRefreshProvider';
import { EmptyState, LoadingSpinner, ConfirmDialog } from '@/components/Common';
import {
  getWorkshops, getWorkers, getDailyRegistrations,
  getPreviousRegistration, getRegistrationForWorkerOnDate,
  createDailyRegistration, updateDailyRegistration, deleteDailyRegistration, addAuditLog,
} from '@/lib/dataAccess';
import type { Workshop, Worker, DailyRegistration } from '@/types';

interface WorkerRegState {
  selected: boolean;
  sameAsPrevious: boolean;
  daily_wage: number;
  headcount: number;
  has_overtime: boolean;
  overtime_hours: number;
  overtime_rate: number;
  has_driving_outbound: boolean;
  has_driving_return: boolean;
  driving_amount: number;
  notes: string;
  existingRegId?: string;
}

const DRAFT_KEY = 'contractor_pro_daily_draft';

export function DailyRegistration() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { triggerRefresh } = useDataRefresh();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkshop, setSelectedWorkshop] = useState('');
  const [workDate, setWorkDate] = useState(new Date().toISOString().split('T')[0]);
  const [regState, setRegState] = useState<Record<string, WorkerRegState>>({});
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [existingRegs, setExistingRegs] = useState<DailyRegistration[]>([]);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [copyStats, setCopyStats] = useState({ loaded: 0, modified: 0, contractors: 0 });
  const [dateError, setDateError] = useState(false);
  const [deleteRegTarget, setDeleteRegTarget] = useState<DailyRegistration | null>(null);
  const [deletingReg, setDeletingReg] = useState(false);
  const [editingReg, setEditingReg] = useState<DailyRegistration | null>(null);

  const load = async () => {
    if (!user) return;
    try {
      const [w, wr] = await Promise.all([
        getWorkshops(user.id, true),
        getWorkers(user.id, false),
      ]);
      setWorkshops(w);
      setWorkers(wr);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  // Load existing registrations for selected workshop + date
  useEffect(() => {
    if (!user || !selectedWorkshop) return;
    (async () => {
      const regs = await getDailyRegistrations(user.id, selectedWorkshop, workDate);
      setExistingRegs(regs);
    })();
  }, [user, selectedWorkshop, workDate]);

  // Initialize worker states when workshop changes
  useEffect(() => {
    if (!selectedWorkshop || !user) return;

    const draftKey = `${DRAFT_KEY}_${user.id}_${selectedWorkshop}_${workDate}`;
    const draft = localStorage.getItem(draftKey);

    (async () => {
      const states: Record<string, WorkerRegState> = {};
      for (const w of workers) {
        const prev = await getPreviousRegistration(user.id, w.id, selectedWorkshop, workDate);
        const existing = existingRegs.find((r) => r.worker_id === w.id);

        if (existing) {
          states[w.id] = {
            selected: true,
            sameAsPrevious: false,
            daily_wage: existing.daily_wage,
            headcount: existing.headcount || 1,
            has_overtime: existing.has_overtime,
            overtime_hours: existing.overtime_hours,
            overtime_rate: existing.overtime_rate,
            has_driving_outbound: existing.has_driving_outbound,
            has_driving_return: existing.has_driving_return,
            driving_amount: existing.driving_amount,
            notes: existing.notes,
            existingRegId: existing.id,
          };
        } else if (draft) {
          try {
            const parsed = JSON.parse(draft);
            if (parsed[w.id]) {
              states[w.id] = parsed[w.id];
            } else {
              states[w.id] = createDefaultState(w, prev);
            }
          } catch {
            states[w.id] = createDefaultState(w, prev);
          }
        } else {
          states[w.id] = createDefaultState(w, prev);
        }
      }
      setRegState(states);
    })();
  }, [selectedWorkshop, workers, workDate, user, existingRegs]);

  // Auto-save draft
  useEffect(() => {
    if (!user || !selectedWorkshop || Object.keys(regState).length === 0) return;
    const draftKey = `${DRAFT_KEY}_${user.id}_${selectedWorkshop}_${workDate}`;
    localStorage.setItem(draftKey, JSON.stringify(regState));
  }, [regState, user, selectedWorkshop, workDate]);

  const createDefaultState = (w: Worker, prev: DailyRegistration | null): WorkerRegState => ({
    selected: false,
    sameAsPrevious: !!prev,
    daily_wage: prev?.daily_wage ?? w.default_daily_wage,
    headcount: prev?.headcount ?? 1,
    has_overtime: prev?.has_overtime ?? false,
    overtime_hours: prev?.overtime_hours ?? 0,
    overtime_rate: prev?.overtime_rate ?? w.default_overtime_rate,
    has_driving_outbound: prev?.has_driving_outbound ?? false,
    has_driving_return: prev?.has_driving_return ?? false,
    driving_amount: prev?.driving_amount ?? w.default_driving_amount,
    notes: '',
  });

  const updateWorkerState = (workerId: string, updates: Partial<WorkerRegState>) => {
    setRegState((prev) => ({
      ...prev,
      [workerId]: { ...prev[workerId], ...updates, sameAsPrevious: false },
    }));
  };

  const toggleSelected = (workerId: string) => {
    setRegState((prev) => ({
      ...prev,
      [workerId]: { ...prev[workerId], selected: !prev[workerId].selected },
    }));
  };

  const selectAllActive = () => {
    setRegState((prev) => {
      const updated = { ...prev };
      for (const id in updated) {
        const worker = workers.find((w) => w.id === id);
        if (worker?.is_active) updated[id] = { ...updated[id], selected: true };
      }
      return updated;
    });
    showToast('success', t('allActiveWorkersSelected'));
  };

  const deselectAll = () => {
    setRegState((prev) => {
      const updated = { ...prev };
      for (const id in updated) updated[id] = { ...updated[id], selected: false };
      return updated;
    });
  };

  const handleDateChange = (newDate: string) => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (newDate !== today && newDate !== yesterday) {
      setDateError(true);
      showToast('warning', t('dateNotAllowed'));
    } else {
      setDateError(false);
    }
    setWorkDate(newDate);
  };

  // Global Same as Yesterday — workshop-aware: fetch actual previous day registrations for this workshop only
  const globalSameAsYesterday = async () => {
    if (!user || !selectedWorkshop) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const prevRegs = await getDailyRegistrations(user.id, selectedWorkshop, yesterday);
    const prevWorkerIds = new Set(prevRegs.map((r) => r.worker_id));

    setRegState((prev) => {
      const updated = { ...prev };
      let loaded = 0;
      let contractors = 0;
      for (const w of workers) {
        if (!prevWorkerIds.has(w.id)) continue;
        const prevReg = prevRegs.find((r) => r.worker_id === w.id);
        if (!prevReg) continue;
        updated[w.id] = {
          ...updated[w.id],
          selected: true,
          sameAsPrevious: true,
          daily_wage: prevReg.daily_wage,
          headcount: prevReg.headcount || 1,
          has_overtime: prevReg.has_overtime,
          overtime_hours: prevReg.overtime_hours,
          overtime_rate: prevReg.overtime_rate,
          has_driving_outbound: prevReg.has_driving_outbound,
          has_driving_return: prevReg.has_driving_return,
          driving_amount: prevReg.driving_amount,
        };
        loaded++;
        if (w.worker_type === 'team_leader') contractors++;
      }
      setCopyStats({ loaded, modified: 0, contractors });
      return updated;
    });
    setShowCopyConfirm(true);
    setTimeout(() => setShowCopyConfirm(false), 4000);
  };

  const selectedWorkers = Object.entries(regState).filter(([_, s]) => s.selected);
  const sameAsPrevCount = selectedWorkers.filter(([_, s]) => s.sameAsPrevious).length;
  const modifiedCount = selectedWorkers.filter(([_, s]) => !s.sameAsPrevious).length;
  const overtimeCount = selectedWorkers.filter(([_, s]) => s.selected && s.has_overtime).length;
  const outboundCount = selectedWorkers.filter(([_, s]) => s.selected && s.has_driving_outbound).length;
  const returnCount = selectedWorkers.filter(([_, s]) => s.selected && s.has_driving_return).length;
  const contractorCount = selectedWorkers.filter(([id, _]) => workers.find((w) => w.id === id)?.worker_type === 'team_leader').length;

  const handleSave = async () => {
    if (!user || !selectedWorkshop) return;
    setSaving(true);
    try {
      let savedCount = 0;
      for (const [workerId, state] of selectedWorkers) {
        const regData = {
          user_id: user.id,
          workshop_id: selectedWorkshop,
          worker_id: workerId,
          work_date: workDate,
          daily_wage: state.daily_wage,
          headcount: state.headcount || 1,
          has_overtime: state.has_overtime,
          overtime_hours: state.overtime_hours,
          overtime_rate: state.overtime_rate,
          has_driving_outbound: state.has_driving_outbound,
          has_driving_return: state.has_driving_return,
          driving_amount: state.driving_amount,
          notes: state.notes,
          is_claimed: false,
        };

        if (state.existingRegId) {
          await updateDailyRegistration(state.existingRegId, regData);
        } else {
          const existing = await getRegistrationForWorkerOnDate(user.id, workerId, selectedWorkshop, workDate);
          if (existing) {
            await updateDailyRegistration(existing.id, regData);
          } else {
            await createDailyRegistration(regData);
          }
        }
        savedCount++;
      }

      const draftKey = `${DRAFT_KEY}_${user.id}_${selectedWorkshop}_${workDate}`;
      localStorage.removeItem(draftKey);

      await addAuditLog({
        user_id: user.id,
        action: 'daily_registration_created',
        entity_type: 'daily_registration',
        details: { workshop_id: selectedWorkshop, work_date: workDate, worker_count: savedCount },
      });

      showToast('success', t('registrationSaved'));
      setEditingReg(null);
      const regs = await getDailyRegistrations(user.id, selectedWorkshop, workDate);
      setExistingRegs(regs);
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteReg = async () => {
    if (!user || !deleteRegTarget) return;
    setDeletingReg(true);
    try {
      await deleteDailyRegistration(deleteRegTarget.id);
      await addAuditLog({ user_id: user.id, action: 'daily_registration_deleted', entity_type: 'daily_registration', entity_id: deleteRegTarget.id });
      showToast('success', t('dailyLogDeleted'));
      setDeleteRegTarget(null);
      setEditingReg(null);
      if (selectedWorkshop) {
        const regs = await getDailyRegistrations(user.id, selectedWorkshop, workDate);
        setExistingRegs(regs);
      }
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    } finally {
      setDeletingReg(false);
    }
  };

  // Edit a saved registration — bring it back into the worker form for modification
  const handleEditReg = (reg: DailyRegistration) => {
    setEditingReg(reg);
    const worker = workers.find((w) => w.id === reg.worker_id);
    if (!worker) return;

    // Make the worker visible in the list again and pre-fill their form with the saved values
    setRegState((prev) => ({
      ...prev,
      [reg.worker_id]: {
        ...prev[reg.worker_id],
        selected: true,
        daily_wage: reg.daily_wage,
        headcount: reg.headcount || 1,
        has_overtime: reg.has_overtime,
        overtime_hours: reg.overtime_hours,
        overtime_rate: reg.overtime_rate,
        has_driving_outbound: reg.has_driving_outbound,
        has_driving_return: reg.has_driving_return,
        driving_amount: reg.driving_amount,
        notes: reg.notes || '',
        existingRegId: reg.id,
        sameAsPrevious: false,
      },
    }));
    setExpandedWorker(reg.worker_id);
    showToast('info', t('editTodayRegistration'));
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  if (workshops.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck size={48} />}
        title={t('noWorkshops')}
        description={t('selectWorkshopFirst')}
      />
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">{t('dailyRegistration')}</h1>
      </div>

      {/* Workshop + Date selection */}
      <div className="card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="input-group">
            <label className="label">{t('selectWorkshop')}</label>
            <select value={selectedWorkshop} onChange={(e) => setSelectedWorkshop(e.target.value)} className="input">
              <option value="">{t('selectWorkshopFirst')}</option>
              {workshops.map((w) => (
                <option key={w.id} value={w.id}>{w.name} {w.contractor ? `(${w.contractor.name})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label className="label">{t('workDate')}</label>
            <input type="date" value={workDate} onChange={(e) => handleDateChange(e.target.value)} className="input" />
          </div>
        </div>
        {dateError && (
          <div className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-error-50 text-sm text-error-700">
            <AlertCircle size={16} className="shrink-0" />
            {t('dateNotAllowed')}
          </div>
        )}
      </div>

      {selectedWorkshop && workers.length === 0 && (
        <EmptyState icon={<Users size={48} />} title={t('noActiveWorkers')} />
      )}

      {selectedWorkshop && workers.length > 0 && (
        <>
          {/* Copy confirmation banner */}
          {showCopyConfirm && (
            <div className="card p-4 border-success-200 bg-success-50/60 flex items-start gap-3">
              <CheckCircle2 className="text-success-500 shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-success-800">
                <p className="font-semibold">{t('previousLoadedForToday')}</p>
                <p className="text-xs text-success-700 mt-1">
                  {t('workersLoaded')}: {copyStats.loaded} · {t('workersModified')}: {copyStats.modified} · {t('dailyContractors')}: {copyStats.contractors}
                </p>
              </div>
            </div>
          )}

          {/* Global actions */}
          <div className="card p-5">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={globalSameAsYesterday}
                className="btn-success flex-1 text-sm py-3"
              >
                <Zap size={18} />
                {t('sameAsYesterday')}
              </button>
              <button
                onClick={selectAllActive}
                className="btn-primary flex-1 text-sm py-3"
              >
                <CheckCheck size={18} />
                {t('selectAllActive')}
              </button>
              <button
                onClick={deselectAll}
                className="btn-secondary text-sm py-3"
              >
                <X size={18} />
                {t('deselectAll')}
              </button>
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-neutral-500">{selectedWorkers.length} / {workers.length} {t('workers')}</span>
              {existingRegs.length > 0 && (
                <span className="text-xs text-warning-600 flex items-center gap-1.5">
                  <AlertCircle size={14} />
                  {t('registrationExists')} — {t('editTodayRegistration')}
                </span>
              )}
            </div>
          </div>

          {/* Existing registrations for this date */}
          {existingRegs.length > 0 && (
            <div className="card p-5">
              <h3 className="section-title mb-4 flex items-center gap-2">
                <CalendarCheck size={18} className="text-primary-500" />
                {t('dailyRegistration')} — {formatDate(workDate)}
              </h3>
              <div className="space-y-2">
                {existingRegs.map((reg) => {
                  const worker = workers.find((w) => w.id === reg.worker_id);
                  const headcount = reg.headcount || 1;
                  const base = reg.daily_wage * headcount;
                  const otAmt = reg.has_overtime ? reg.overtime_hours * reg.overtime_rate : 0;
                  const drvOut = reg.has_driving_outbound ? reg.driving_amount : 0;
                  const drvRet = reg.has_driving_return ? reg.driving_amount : 0;
                  const drvTotal = drvOut + drvRet;
                  const total = base + otAmt + drvTotal;
                  return (
                    <div key={reg.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-neutral-50 hover:bg-neutral-100/70 group transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-bold shrink-0">
                          {(worker?.full_name || '?')[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{worker?.full_name || t('unknown')}</p>
                          <p className="text-xs text-neutral-400">
                            {formatCurrency(base)}
                            {otAmt > 0 && ` + ${formatCurrency(otAmt)}`}
                            {drvTotal > 0 && ` + ${formatCurrency(drvTotal)}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-neutral-900">{formatCurrency(total)}</span>
                        <button
                          onClick={() => handleEditReg(reg)}
                          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-primary-600 transition-all p-1.5 rounded-lg hover:bg-primary-50"
                          title={t('edit')}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteRegTarget(reg)}
                          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-error-600 transition-all p-1.5 rounded-lg hover:bg-error-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Worker list — workers already saved for THIS workshop+date are hidden */}
          <div className="space-y-3">
            {workers.map((w) => {
              const state = regState[w.id];
              if (!state) return null;
              // Hide workers that are already saved for this specific workshop on this date.
              // They remain visible for a DIFFERENT workshop (existingRegs is workshop-scoped)
              // and reappear automatically on a new date (workDate-scoped query resets).
              // Exception: if this worker is being edited from history, show them.
              if (state.existingRegId && editingReg?.worker_id !== w.id) return null;
              const isExpanded = expandedWorker === w.id;
              const isContractor = w.worker_type === 'team_leader';

              return (
                <div key={w.id} className={`card overflow-hidden transition-all duration-200 ${state.selected ? 'border-primary-200 shadow-card-hover' : 'hover:shadow-card-hover'}`}>
                  <div className="flex items-center gap-3 p-4">
                    {/* Selection checkbox */}
                    <button
                      onClick={() => toggleSelected(w.id)}
                      className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                        state.selected ? 'bg-primary-600 border-primary-600 text-white' : 'border-neutral-300 hover:border-primary-400'
                      }`}
                    >
                      {state.selected && <Check size={16} />}
                    </button>

                    {/* Worker name */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{w.full_name}</p>
                        <span className={`badge ${w.is_active ? 'badge-success' : 'badge-neutral'} text-[10px] px-1.5 py-0.5`}>
                          {w.is_active ? t('active') : t('inactive')}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500">
                        {isContractor ? (
                          <>{t('pricePerHead')}: {formatCurrency(state.daily_wage)} · {t('headcountToday')}: {state.headcount || 1} → <span className="font-medium text-primary-600">{formatCurrency((state.daily_wage || 0) * (state.headcount || 1))}</span></>
                        ) : (
                          <>{formatCurrency(state.daily_wage)}</>
                        )}
                        {state.has_overtime && ` + ${state.overtime_hours}h ${t('overtime')}`}
                        {(state.has_driving_outbound || state.has_driving_return) && ` + ${t('driving')}`}
                        {state.sameAsPrevious && <span className="text-success-600 ms-1">· {t('sameAsPrevious')}</span>}
                      </p>
                    </div>

                    {/* Expand button */}
                    <button
                      onClick={() => setExpandedWorker(isExpanded ? null : w.id)}
                      className="p-2 rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 shrink-0 transition-all"
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && state.selected && (
                    <div className="border-t border-neutral-100 p-4 space-y-4 bg-neutral-50/50">
                      {state.existingRegId && (
                        <div className="flex items-center gap-2 text-xs text-warning-700 bg-warning-50 px-3 py-2.5 rounded-xl">
                          <AlertCircle size={14} className="shrink-0" />
                          {t('registrationExists')} — {t('editTodayRegistration')}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div className="input-group">
                          <label className="label text-xs">{isContractor ? t('pricePerHead') : t('dailyWage')}</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={state.daily_wage || ''}
                            onChange={(e) => updateWorkerState(w.id, { daily_wage: parseFloat(e.target.value) || 0 })}
                            className="input text-sm"
                          />
                        </div>
                        {isContractor ? (
                          <div className="input-group">
                            <label className="label text-xs">{t('headcountToday')}</label>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={state.headcount || 1}
                              onChange={(e) => updateWorkerState(w.id, { headcount: parseInt(e.target.value) || 1 })}
                              className="input text-sm"
                            />
                          </div>
                        ) : (
                          <div className="input-group">
                            <label className="label text-xs">{t('drivingAmount')}</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={state.driving_amount || ''}
                              onChange={(e) => updateWorkerState(w.id, { driving_amount: parseFloat(e.target.value) || 0 })}
                              className="input text-sm"
                            />
                          </div>
                        )}
                      </div>

                      {isContractor && (
                        <div className="p-3 rounded-xl bg-primary-50 text-sm text-primary-700">
                          {t('dailyContractorAmount')}: <span className="font-bold">{formatCurrency((state.daily_wage || 0) * (state.headcount || 1))}</span>
                        </div>
                      )}

                      {/* Overtime */}
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={state.has_overtime}
                            onChange={(e) => updateWorkerState(w.id, { has_overtime: e.target.checked })}
                            className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm font-medium text-neutral-700">{t('overtime')}</span>
                        </label>
                        {state.has_overtime && (
                          <div className="grid grid-cols-2 gap-4 ps-6">
                            <div className="input-group">
                              <label className="label text-xs">{t('overtimeHours')}</label>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={state.overtime_hours || ''}
                                onChange={(e) => updateWorkerState(w.id, { overtime_hours: parseFloat(e.target.value) || 0 })}
                                className="input text-sm"
                              />
                            </div>
                            <div className="input-group">
                              <label className="label text-xs">{t('overtimeRate')}</label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={state.overtime_rate || ''}
                                onChange={(e) => updateWorkerState(w.id, { overtime_rate: parseFloat(e.target.value) || 0 })}
                                className="input text-sm"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Driving */}
                      <div className="space-y-3">
                        <div className="flex gap-6">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={state.has_driving_outbound}
                              onChange={(e) => updateWorkerState(w.id, { has_driving_outbound: e.target.checked })}
                              className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm font-medium text-neutral-700">{t('drivingOutbound')}</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={state.has_driving_return}
                              onChange={(e) => updateWorkerState(w.id, { has_driving_return: e.target.checked })}
                              className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-sm font-medium text-neutral-700">{t('drivingReturn')}</span>
                          </label>
                        </div>
                      </div>

                      <div className="input-group">
                        <label className="label text-xs">{t('notes')}</label>
                        <input
                          value={state.notes}
                          onChange={(e) => updateWorkerState(w.id, { notes: e.target.value })}
                          className="input text-sm"
                          placeholder={t('notes')}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {selectedWorkers.length > 0 && (
            <div className="card p-5">
              <h3 className="section-title mb-4">{t('registrationSummary')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div className="p-3.5 rounded-xl bg-neutral-50">
                  <p className="text-xs text-neutral-400">{t('workersSelected')}</p>
                  <p className="text-lg font-bold text-neutral-900 mt-1">{selectedWorkers.length}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-success-50">
                  <p className="text-xs text-success-600">{t('workersUsingPrevious')}</p>
                  <p className="text-lg font-bold text-success-700 mt-1">{sameAsPrevCount}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-primary-50">
                  <p className="text-xs text-primary-600">{t('workersModified')}</p>
                  <p className="text-lg font-bold text-primary-700 mt-1">{modifiedCount}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-warning-50">
                  <p className="text-xs text-warning-600">{t('overtimeWorkers')}</p>
                  <p className="text-lg font-bold text-warning-700 mt-1">{overtimeCount}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50">
                  <p className="text-xs text-neutral-400">{t('drivingOutboundCount')}</p>
                  <p className="text-lg font-bold text-neutral-900 mt-1">{outboundCount}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-neutral-50">
                  <p className="text-xs text-neutral-400">{t('drivingReturnCount')}</p>
                  <p className="text-lg font-bold text-neutral-900 mt-1">{returnCount}</p>
                </div>
              </div>
            </div>
          )}

          {/* Sticky save button */}
          <div className="fixed bottom-0 inset-x-0 lg:ps-64 z-30">
            <div className="glass-header px-4 py-3 max-w-7xl mx-auto">
              <button
                onClick={handleSave}
                disabled={saving || selectedWorkers.length === 0}
                className="btn-primary w-full sm:w-auto"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {existingRegs.length > 0 ? t('updateRegistration') : t('saveRegistration')}
                {selectedWorkers.length > 0 && ` (${selectedWorkers.length})`}
              </button>
            </div>
          </div>
        </>
      )}
      <ConfirmDialog
        open={!!deleteRegTarget}
        title={t('deleteDailyLog')}
        message={t('confirmDeleteDailyLog')}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDeleteReg}
        onCancel={() => setDeleteRegTarget(null)}
        loading={deletingReg}
      />
    </div>
  );
}

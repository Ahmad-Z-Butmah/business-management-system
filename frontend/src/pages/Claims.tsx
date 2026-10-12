import { useState, useEffect } from 'react';
import {
  Plus, FileText, Loader2, Trash2, Eye, Printer, Share2,
  Building2, Check, AlertCircle, Receipt, X,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useDataRefresh } from '@/contexts/DataRefreshProvider';
import { recordUndoAction } from '@/lib/undoHistory';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/Common';
import {
  getClaims, createClaim, deleteClaim, updateClaim,
  getWorkshops, getDailyRegistrations, getActiveVatRate,
  getWalletAccounts, createWalletTransaction, addAuditLog,
  getContractors,
} from '@/lib/dataAccess';
import {
  groupRegistrationsByDate, groupRegistrationsByDateForContractor,
  calculateClaimSubtotal, calculateVatAmount, calculateClaimTotal,
  generateClaimNumber,
} from '@/lib/calculations';
import type { Claim, Workshop, DailyRegistration, BusinessProfile, WalletAccount, Contractor } from '@/types';
import { getBusinessProfile } from '@/lib/dataAccess';

type CreateMode = 'workshop' | 'contractor';

interface ActivityRow {
  date: string;
  workshopId: string;
  workshopName: string;
  workerCount: number;
  regIds: string[];
}

export function Claims() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { triggerRefresh, refreshKey } = useDataRefresh();
  const [loading, setLoading] = useState(true);
  const [, setError] = useState(false);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>('contractor');
  const [previewClaim, setPreviewClaim] = useState<Claim | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Claim | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<Claim | null>(null);
  const [saving, setSaving] = useState(false);
  const [allRegistrations, setAllRegistrations] = useState<DailyRegistration[]>([]);

  // Form state
  const [selectedContractorId, setSelectedContractorId] = useState('');
  const [selectedWorkshopId, setSelectedWorkshopId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [pricePerHead, setPricePerHead] = useState(0);
  const [activityData, setActivityData] = useState<ActivityRow[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [vatRate, setVatRate] = useState(0);

  const load = async () => {
    if (!user) return;
    try {
      const [c, w, p, a, ctrs, regs] = await Promise.all([
        getClaims(user.id),
        getWorkshops(user.id),
        getBusinessProfile(user.id),
        getWalletAccounts(user.id),
        getContractors(user.id, true),
        getDailyRegistrations(user.id),
      ]);
      setClaims(c);
      setWorkshops(w);
      setProfile(p);
      setAccounts(a);
      setContractors(ctrs);
      setAllRegistrations(regs);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);
  useEffect(() => { if (user) load(); }, [user, refreshKey]);

  useEffect(() => {
    if (!user) return;
    getActiveVatRate(user.id).then(setVatRate).catch(console.error);
  }, [user]);

  // Load activity when contractor + period selected (consolidated flow)
  useEffect(() => {
    if (!user || !selectedContractorId || !periodStart || !periodEnd) {
      setActivityData([]);
      setSelectedRows(new Set());
      return;
    }
    const contractorWorkshops = workshops.filter((w) => w.contractor_id === selectedContractorId && w.workshop_type === 'daily_wage');
    const grouped = groupRegistrationsByDateForContractor(
      allRegistrations,
      contractorWorkshops.map((w) => ({ id: w.id, name: w.name })),
      periodStart,
      periodEnd,
      true,
    );
    setActivityData(grouped);
    setSelectedRows(new Set(grouped.map((g) => `${g.date}|${g.workshopId}`)));
  }, [user, selectedContractorId, periodStart, periodEnd, workshops, allRegistrations]);

  // Load activity when workshop selected (workshop flow)
  useEffect(() => {
    if (!user || !selectedWorkshopId || createMode !== 'workshop') {
      if (createMode === 'workshop') setActivityData([]);
      return;
    }
    const regs = allRegistrations.filter((r) => r.workshop_id === selectedWorkshopId);
    const grouped = groupRegistrationsByDate(regs, selectedWorkshopId, true);
    const workshop = workshops.find((w) => w.id === selectedWorkshopId);
    const wsName = workshop?.name || '';
    setActivityData(grouped.map((g) => ({
      date: g.date,
      workshopId: selectedWorkshopId,
      workshopName: wsName,
      workerCount: g.workerCount,
      regIds: g.registrations.map((r) => r.id),
    })));
    setSelectedRows(new Set(grouped.map((g) => `${g.date}|${selectedWorkshopId}`)));
  }, [user, selectedWorkshopId, createMode, allRegistrations, workshops]);

  const dailyWageWorkshops = workshops.filter((w) => w.workshop_type === 'daily_wage');

  const toggleRow = (key: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedActivity = activityData.filter((a) => selectedRows.has(`${a.date}|${a.workshopId}`));
  const subtotal = calculateClaimSubtotal(
    selectedActivity.map((a) => ({ daily_total: a.workerCount * pricePerHead }))
  );
  const vatAmount = calculateVatAmount(subtotal, vatRate);
  const total = calculateClaimTotal(subtotal, vatAmount);

  const includedWorkshops = new Map<string, string>();
  selectedActivity.forEach((a) => includedWorkshops.set(a.workshopId, a.workshopName));
  const totalWorkers = selectedActivity.reduce((s, a) => s + a.workerCount, 0);

  const openCreate = (mode: CreateMode) => {
    setCreateMode(mode);
    setSelectedContractorId('');
    setSelectedWorkshopId('');
    setPeriodStart('');
    setPeriodEnd('');
    setPricePerHead(0);
    setActivityData([]);
    setSelectedRows(new Set());
    setCreateModalOpen(true);
  };

  const handleCreateClaim = async () => {
    if (!user || pricePerHead <= 0 || selectedActivity.length === 0) return;
    setSaving(true);
    try {
      const claimNumber = generateClaimNumber();
      const lines = selectedActivity.map((a) => ({
        user_id: user.id,
        work_date: a.date,
        worker_count: a.workerCount,
        price_per_head: pricePerHead,
        daily_total: a.workerCount * pricePerHead,
        workshop_id: a.workshopId,
        workshop_name: a.workshopName,
      }));

      const allRegIds = selectedActivity.flatMap((a) => a.regIds);

      let workshopId: string | null = null;
      let contractorId: string | null = null;

      if (createMode === 'contractor') {
        contractorId = selectedContractorId;
      } else {
        workshopId = selectedWorkshopId;
        const ws = workshops.find((w) => w.id === selectedWorkshopId);
        contractorId = ws?.contractor_id || null;
      }

      const claim = await createClaim({
        user_id: user.id,
        claim_number: claimNumber,
        workshop_id: workshopId,
        contractor_id: contractorId,
        claim_date: new Date().toISOString().split('T')[0],
        billing_period_start: periodStart || null,
        billing_period_end: periodEnd || null,
        price_per_head: pricePerHead,
        subtotal,
        vat_amount: vatAmount,
        total,
        status: 'prepared',
        notes: '',
      }, lines, allRegIds);

      await addAuditLog({ user_id: user.id, action: 'claim_created', entity_type: 'claim', entity_id: claim.id });

      showToast('success', t('claimCreated'));
      setCreateModalOpen(false);
      setPricePerHead(0);
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
      await deleteClaim(deleteTarget.id);
      await addAuditLog({ user_id: user.id, action: 'claim_deleted', entity_type: 'claim', entity_id: deleteTarget.id });
      showToast('success', t('deleteSuccess'));
      setDeleteTarget(null);
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    }
  };

  const handleReceiveClaim = async (amount: number, accountId: string) => {
    if (!user || !receiveTarget) return;
    try {
      await updateClaim(receiveTarget.id, {
        status: amount >= receiveTarget.total ? 'fully_received' : 'partially_received',
      });
      const walletTransaction = await createWalletTransaction({
        user_id: user.id,
        wallet_account_id: accountId,
        transaction_date: new Date().toISOString().split('T')[0],
        type: 'claim_receipt',
        amount,
        description: `${t('claimReceipt')} ${receiveTarget.claim_number}`,
        related_contractor_id: receiveTarget.contractor_id,
        related_claim_id: receiveTarget.id,
        related_worker_id: null,
        transfer_pair_id: null,
        notes: '',
      });
      recordUndoAction(user.id, [{ table: 'wallet_transactions', ids: [walletTransaction.id] }], {
        restoreClaim: { id: receiveTarget.id, status: receiveTarget.status },
      });
      await addAuditLog({ user_id: user.id, action: 'claim_received', entity_type: 'claim', entity_id: receiveTarget.id });
      showToast('success', t('claimReceived'));
      setReceiveTarget(null);
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    }
  };

  const handleShare = async (claim: Claim) => {
    const text = `${t('claimHeader')} ${claim.claim_number}\n${t('contractor')}: ${claim.contractor?.name || '-'}\n${t('total')}: ${formatCurrency(claim.total)}`;
    if (navigator.share) {
      try { await navigator.share({ title: t('claimHeader'), text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      showToast('success', t('share'));
    }
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: 'badge-neutral', prepared: 'badge-primary', sent: 'badge-warning',
      partially_received: 'badge-warning', fully_received: 'badge-success', closed: 'badge-neutral',
    };
    return map[status] || 'badge-neutral';
  };

  const canGenerate = createMode === 'contractor'
    ? !!selectedContractorId && !!periodStart && !!periodEnd
    : !!selectedWorkshopId;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-neutral-900">{t('claims')}</h1>
        <div className="flex gap-3">
          <button onClick={() => openCreate('contractor')} className="btn-primary">
            <Plus size={18} /> {t('createConsolidatedClaim')}
          </button>
          <button onClick={() => openCreate('workshop')} className="btn-secondary">
            <Plus size={18} /> {t('createDailyWageClaim')}
          </button>
        </div>
      </div>

      {claims.length === 0 ? (
        <EmptyState
          icon={<FileText size={48} />}
          title={t('noClaims')}
          action={<button onClick={() => openCreate('contractor')} className="btn-primary"><Plus size={16} /> {t('createConsolidatedClaim')}</button>}
        />
      ) : (
        <div className="space-y-4">
          {claims.map((c) => {
            const lineWorkshops = new Map<string, string>();
            c.claim_lines?.forEach((l) => { if (l.workshop_name) lineWorkshops.set(l.workshop_id || '', l.workshop_name); });
            return (
              <div key={c.id} className="card-hover p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
                      <FileText size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900">{c.claim_number}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {c.contractor?.name || t('contractor')} · {formatDate(c.claim_date)}
                        {c.billing_period_start && c.billing_period_end ? ` · ${formatDate(c.billing_period_start)} - ${formatDate(c.billing_period_end)}` : ''}
                      </p>
                      {lineWorkshops.size > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {Array.from(lineWorkshops.values()).map((name, i) => (
                            <span key={i} className="badge-neutral badge text-[10px]">{name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`badge ${statusBadge(c.status)}`}>{t(c.status)}</span>
                    <span className="text-base font-bold text-neutral-900">{formatCurrency(c.total)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-neutral-100">
                  <button onClick={() => setPreviewClaim(c)} className="btn-ghost text-xs"><Eye size={14} /> {t('preview')}</button>
                  <button onClick={() => { setPreviewClaim(c); setTimeout(() => window.print(), 300); }} className="btn-ghost text-xs"><Printer size={14} /> {t('print')}</button>
                  <button onClick={() => handleShare(c)} className="btn-ghost text-xs"><Share2 size={14} /> {t('share')}</button>
                  {(c.status === 'prepared' || c.status === 'sent') && (
                    <button onClick={() => setReceiveTarget(c)} className="btn-success text-xs"><Receipt size={14} /> {t('receiveClaim')}</button>
                  )}
                  <button onClick={() => setDeleteTarget(c)} className="btn-ghost text-error-600 text-xs"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Claim Modal */}
      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title={createMode === 'contractor' ? t('createConsolidatedClaim') : t('createDailyWageClaim')} size="xl">
        <div className="space-y-5">
          {createMode === 'contractor' ? (
            <>
              {/* Contractor-first flow */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="input-group">
                  <label className="label">{t('selectContractor')} *</label>
                  <select value={selectedContractorId} onChange={(e) => setSelectedContractorId(e.target.value)} className="input">
                    <option value="">{t('selectContractorFirst')}</option>
                    {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="input-group">
                  <label className="label">{t('billingPeriodStart')} *</label>
                  <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="input" />
                </div>
                <div className="input-group">
                  <label className="label">{t('billingPeriodEnd')} *</label>
                  <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="input" />
                </div>
              </div>

              {selectedContractorId && periodStart && periodEnd && (
                <>
                  {/* Detected workshops */}
                  <div>
                    <h3 className="section-title mb-3">{t('workshopsIncluded')}</h3>
                    {activityData.length === 0 ? (
                      <div className="flex items-center gap-2 p-4 rounded-xl bg-neutral-50 text-sm text-neutral-500">
                        <AlertCircle size={16} /> {t('noUnclaimedActivity')}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Map(activityData.map((a) => [a.workshopId, a.workshopName])).values()).map((name, i) => (
                          <span key={i} className="badge-primary badge">{name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Workshop-first flow */}
              <div className="input-group">
                <label className="label">{t('selectWorkshop')} *</label>
                <select value={selectedWorkshopId} onChange={(e) => setSelectedWorkshopId(e.target.value)} className="input">
                  <option value="">{t('selectWorkshopFirst')}</option>
                  {dailyWageWorkshops.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} {w.contractor ? `(${w.contractor.name})` : ''}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* Detected activity table */}
          {canGenerate && activityData.length > 0 && (
            <>
              <div>
                <h3 className="section-title mb-3">{t('detectedActivity')}</h3>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setSelectedRows(new Set(activityData.map((a) => `${a.date}|${a.workshopId}`)))} className="btn-secondary text-xs">{t('selectAllActivity')}</button>
                  <button onClick={() => setSelectedRows(new Set())} className="btn-secondary text-xs">{t('deselectAllActivity')}</button>
                </div>
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral-50 table-header">
                        <tr>
                          <th className="px-4 py-3 text-start w-10"></th>
                          <th className="px-4 py-3 text-start">{t('claimLineDate')}</th>
                          {createMode === 'contractor' && <th className="px-4 py-3 text-start">{t('workshop')}</th>}
                          <th className="px-4 py-3 text-center">{t('claimLineWorkers')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityData.map((a) => {
                          const key = `${a.date}|${a.workshopId}`;
                          return (
                            <tr key={key} className="border-t border-neutral-100 table-row">
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => toggleRow(key)}
                                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedRows.has(key) ? 'bg-primary-600 border-primary-600 text-white' : 'border-neutral-300 hover:border-primary-400'}`}
                                >
                                  {selectedRows.has(key) && <Check size={12} />}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-neutral-700">{formatDate(a.date)}</td>
                              {createMode === 'contractor' && <td className="px-4 py-3 text-neutral-600">{a.workshopName}</td>}
                              <td className="px-4 py-3 text-center font-medium text-neutral-700">{a.workerCount}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Price per head */}
              {selectedActivity.length > 0 && (
                <>
                  <div className="input-group">
                    <label className="label">{t('pricePerHead')}</label>
                    <input type="number" min="0" step="0.01" value={pricePerHead || ''} onChange={(e) => setPricePerHead(parseFloat(e.target.value) || 0)} className="input max-w-xs" placeholder="0" />
                  </div>

                  {/* Review summary */}
                  {pricePerHead > 0 && (
                    <>
                      <div className="card p-5 bg-neutral-50/80">
                        <h3 className="section-title mb-4">{t('claimReview')}</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                          <div><span className="text-neutral-400">{t('totalActivityDays')}: </span><span className="font-semibold text-neutral-900">{selectedActivity.length}</span></div>
                          <div><span className="text-neutral-400">{t('totalWorkersRows')}: </span><span className="font-semibold text-neutral-900">{totalWorkers}</span></div>
                          <div><span className="text-neutral-400">{t('pricePerHead')}: </span><span className="font-semibold text-neutral-900">{formatCurrency(pricePerHead)}</span></div>
                        </div>
                      </div>

                      {/* Preview table */}
                      <div>
                        <h3 className="section-title mb-3">{t('claimPreview')}</h3>
                        <div className="card overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-neutral-50 table-header">
                                <tr>
                                  <th className="px-4 py-3 text-start">{t('claimLineDate')}</th>
                                  {createMode === 'contractor' && <th className="px-4 py-3 text-start">{t('workshop')}</th>}
                                  <th className="px-4 py-3 text-center">{t('claimLineWorkers')}</th>
                                  <th className="px-4 py-3 text-end">{t('claimLinePrice')}</th>
                                  <th className="px-4 py-3 text-end">{t('claimLineTotal')}</th>
                                  <th className="px-4 py-3 text-center w-8"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {selectedActivity.map((a) => {
                                  const key = `${a.date}|${a.workshopId}`;
                                  return (
                                    <tr key={key} className="border-t border-neutral-100 table-row">
                                      <td className="px-4 py-3 text-neutral-700">{formatDate(a.date)}</td>
                                      {createMode === 'contractor' && <td className="px-4 py-3 text-neutral-600">{a.workshopName}</td>}
                                      <td className="px-4 py-3 text-center font-medium text-neutral-700">{a.workerCount}</td>
                                      <td className="px-4 py-3 text-end text-neutral-600">{formatCurrency(pricePerHead)}</td>
                                      <td className="px-4 py-3 text-end font-semibold text-neutral-900">{formatCurrency(a.workerCount * pricePerHead)}</td>
                                      <td className="px-4 py-3 text-center">
                                        <button onClick={() => toggleRow(key)} className="text-neutral-400 hover:text-error-600 transition-colors"><X size={14} /></button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="bg-neutral-50 border-t-2 border-neutral-200">
                                <tr>
                                  <td colSpan={createMode === 'contractor' ? 4 : 3} className="px-4 py-3 text-end font-medium text-neutral-600">{t('subtotal')}</td>
                                  <td className="px-4 py-3 text-end font-bold text-neutral-900">{formatCurrency(subtotal)}</td>
                                  <td></td>
                                </tr>
                                <tr>
                                  <td colSpan={createMode === 'contractor' ? 4 : 3} className="px-4 py-3 text-end font-medium text-neutral-600">{t('vat')} ({(vatRate * 100).toFixed(0)}%)</td>
                                  <td className="px-4 py-3 text-end font-bold text-neutral-900">{formatCurrency(vatAmount)}</td>
                                  <td></td>
                                </tr>
                                <tr>
                                  <td colSpan={createMode === 'contractor' ? 4 : 3} className="px-4 py-3 text-end font-semibold text-neutral-700">{t('totalIncludingVAT')}</td>
                                  <td className="px-4 py-3 text-end font-bold text-primary-700 text-base">{formatCurrency(total)}</td>
                                  <td></td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 justify-end pt-2">
                        <button onClick={() => setCreateModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
                        <button onClick={handleCreateClaim} className="btn-primary" disabled={saving || pricePerHead <= 0 || selectedActivity.length === 0}>
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                          {t('generateClaim')}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {canGenerate && activityData.length === 0 && (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-neutral-50 text-sm text-neutral-500">
              <AlertCircle size={16} /> {t('noUnclaimedActivity')}
            </div>
          )}
        </div>
      </Modal>

      {/* Claim Preview Modal */}
      {previewClaim && (
        <ClaimPreviewModal claim={previewClaim} profile={profile} onClose={() => setPreviewClaim(null)} />
      )}

      {/* Receive Claim Modal */}
      {receiveTarget && (
        <ReceiveClaimModal claim={receiveTarget} accounts={accounts} onClose={() => setReceiveTarget(null)} onReceive={handleReceiveClaim} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteClaim')}
        message={`${t('confirmDelete')} ${deleteTarget?.claim_number}`}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function ClaimPreviewModal({ claim, profile, onClose }: { claim: Claim; profile: BusinessProfile | null; onClose: () => void }) {
  const { t, formatCurrency, formatDate } = useI18n();
  const hasWorkshopColumn = claim.claim_lines?.some((l) => l.workshop_name) ?? false;

  return (
    <Modal open={true} onClose={onClose} title={t('claimPreview')} size="lg">
      <div className="claim-invoice space-y-6" id="claim-print-area" dir="rtl">
        {/* === Invoice Header === */}
        <div className="flex items-start justify-between gap-6 pb-6 border-b-2 border-neutral-800">
          {/* Left: Claim metadata */}
          <div className="flex flex-col gap-1 text-sm">
            <h2 className="text-base font-bold text-neutral-900 mb-1">{t('claimHeader')}</h2>
            <div className="flex gap-2">
              <span className="text-neutral-400">{t('claimNumber')}:</span>
              <span className="font-semibold text-neutral-800">{claim.claim_number}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-neutral-400">{t('date')}:</span>
              <span className="font-medium text-neutral-700">{formatDate(claim.claim_date)}</span>
            </div>
            {claim.billing_period_start && claim.billing_period_end && (
              <div className="flex gap-2">
                <span className="text-neutral-400">{t('period')}:</span>
                <span className="font-medium text-neutral-700">{formatDate(claim.billing_period_start)} — {formatDate(claim.billing_period_end)}</span>
              </div>
            )}
          </div>

          {/* Right: Company logo + name */}
          <div className="flex flex-col items-end gap-2">
            {profile?.logo_url ? (
              <img src={profile.logo_url} alt="logo" className="w-16 h-16 rounded-xl object-cover border border-neutral-200" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-primary-600 text-white flex items-center justify-center">
                <Building2 size={30} />
              </div>
            )}
            <div className="text-end">
              <h1 className="text-lg font-bold text-neutral-900">{profile?.business_name || t('appName')}</h1>
              {profile?.phone && <p className="text-xs text-neutral-500 mt-0.5">{profile.phone}</p>}
              {profile?.address && <p className="text-xs text-neutral-500">{profile.address}</p>}
            </div>
          </div>
        </div>

        {/* === Client Card === */}
        <div className="rounded-xl border border-neutral-300 p-4 bg-white">
          <p className="text-xs font-medium text-neutral-400 mb-2 uppercase tracking-wide">{t('toKabud')}</p>
          <p className="text-sm font-bold text-neutral-900">{claim.contractor?.name || t('contractor')}</p>
          {claim.contractor?.company_name && <p className="text-sm text-neutral-600 mt-1">{claim.contractor.company_name}</p>}
        </div>

        {/* === Line Items Table === */}
        <table className="claim-table w-full text-sm border-collapse">
          <thead>
            <tr className="bg-neutral-100">
              <th className="px-4 py-3 text-start font-semibold text-neutral-700 border-b-2 border-neutral-300">{t('claimLineDate')}</th>
              {hasWorkshopColumn && <th className="px-4 py-3 text-start font-semibold text-neutral-700 border-b-2 border-neutral-300">{t('workshop')}</th>}
              <th className="px-4 py-3 text-center font-semibold text-neutral-700 border-b-2 border-neutral-300">{t('claimLineWorkers')}</th>
              <th className="px-4 py-3 text-end font-semibold text-neutral-700 border-b-2 border-neutral-300">{t('claimLinePrice')}</th>
              <th className="px-4 py-3 text-end font-semibold text-neutral-700 border-b-2 border-neutral-300">{t('claimLineTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {claim.claim_lines?.map((line) => (
              <tr key={line.id} className="border-b border-neutral-200">
                <td className="px-4 py-3 text-neutral-700">{formatDate(line.work_date)}</td>
                {hasWorkshopColumn && <td className="px-4 py-3 text-neutral-600">{line.workshop_name}</td>}
                <td className="px-4 py-3 text-center font-medium text-neutral-700">{line.worker_count}</td>
                <td className="px-4 py-3 text-end text-neutral-600">{formatCurrency(line.price_per_head)}</td>
                <td className="px-4 py-3 text-end font-semibold text-neutral-900">{formatCurrency(line.daily_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* === Totals Section — aligned to the left (last column) === */}
        <div className="flex justify-start">
          <div className="w-64 space-y-0 border border-neutral-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-neutral-50">
              <span className="text-sm font-medium text-neutral-600">{t('subtotal')}</span>
              <span className="text-sm font-bold text-neutral-900">{formatCurrency(claim.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-t border-neutral-200">
              <span className="text-sm font-medium text-neutral-600">{t('vat')}</span>
              <span className="text-sm font-bold text-neutral-900">{formatCurrency(claim.vat_amount)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-4 bg-primary-50 border-t-2 border-primary-200">
              <span className="text-base font-bold text-primary-800">{t('totalIncludingVAT')}</span>
              <span className="text-base font-bold text-primary-700">{formatCurrency(claim.total)}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-neutral-400 text-center pt-2">{t('taxEstimateDisclaimer')}</p>
      </div>
    </Modal>
  );
}

function ReceiveClaimModal({
  claim, accounts, onClose, onReceive,
}: {
  claim: Claim;
  accounts: WalletAccount[];
  onClose: () => void;
  onReceive: (amount: number, accountId: string) => void;
}) {
  const { t, formatCurrency } = useI18n();
  const [amount, setAmount] = useState(claim.total);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');

  return (
    <Modal open={true} onClose={onClose} title={t('receiveClaim')}>
      <div className="space-y-5">
        <div className="p-4 rounded-xl bg-neutral-50 text-sm space-y-1.5">
          <p className="text-neutral-600">{t('claimNumber')}: <span className="font-semibold text-neutral-900">{claim.claim_number}</span></p>
          <p className="text-neutral-600">{t('contractor')}: <span className="font-semibold text-neutral-900">{claim.contractor?.name || '-'}</span></p>
          <p className="text-neutral-600">{t('total')}: <span className="font-semibold text-neutral-900">{formatCurrency(claim.total)}</span></p>
        </div>
        <div className="input-group">
          <label className="label">{t('enterReceivedAmount')}</label>
          <input type="number" min="0" step="0.01" value={amount || ''} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} className="input" />
        </div>
        <div className="input-group">
          <label className="label">{t('selectAccount')}</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} className="btn-secondary">{t('cancel')}</button>
          <button onClick={() => onReceive(amount, accountId)} className="btn-success" disabled={amount <= 0 || !accountId}>
            <Receipt size={16} /> {t('claimReceipt')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

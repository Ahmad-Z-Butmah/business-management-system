import { useState, useEffect } from 'react';
import {
  Receipt, Percent, TrendingUp, Loader2, RefreshCw, CheckCircle2,
  AlertCircle, Info, Calculator, ExternalLink, Shield, Clock,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { LoadingSpinner, EmptyState } from '@/components/Common';
import {
  getTaxRules, getClaims, getDailyRegistrations,
  getWorkerPayments, getWalletTransactions,
} from '@/lib/dataAccess';
import {
  calculateProgressiveIncomeTax, calculateRegistrationTotal,
} from '@/lib/calculations';
import {
  checkAndUpdateTaxRules, getActiveVatRateFromRules,
  getActiveIncomeTaxBrackets, getActiveBituachLeumiRate,
  getActiveHealthRate, storeTaxCalculation,
} from '@/lib/taxRulesService';
import type { TaxRule, Claim, DailyRegistration, WorkerPayment, WalletTransaction, TaxType } from '@/types';

export function TaxCenter() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [taxRules, setTaxRules] = useState<TaxRule[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [registrations, setRegistrations] = useState<DailyRegistration[]>([]);
  const [payments, setPayments] = useState<WorkerPayment[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [updating, setUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<TaxType>('vat');
  const [updateResult, setUpdateResult] = useState<{ updated: boolean; changes: { type: string; oldValue: string; newValue: string; effectiveDate?: string }[] } | null>(null);

  const load = async () => {
    if (!user) return;
    try {
      const [r, c, reg, p, tx] = await Promise.all([
        getTaxRules(user.id),
        getClaims(user.id),
        getDailyRegistrations(user.id),
        getWorkerPayments(user.id),
        getWalletTransactions(user.id),
      ]);
      setTaxRules(r);
      setClaims(c);
      setRegistrations(reg);
      setPayments(p);
      setTransactions(tx);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const handleUpdateRules = async () => {
    if (!user) return;
    setUpdating(true);
    try {
      const result = await checkAndUpdateTaxRules(user.id);
      if (result.success) {
        if (result.updated) {
          showToast('success', t('taxRulesUpdated'));
          setUpdateResult({ updated: true, changes: result.changes });
        } else {
          showToast('success', t('taxRulesVerified'));
          setUpdateResult({ updated: false, changes: [] });
        }
      } else {
        showToast('warning', t('taxUpdateFailed'));
      }
      await load();
    } catch (e) {
      console.error(e);
      showToast('error', t('taxUpdateFailed'));
    } finally {
      setUpdating(false);
    }
  };

  // Calculate tax estimates using verified rules
  const annualRevenue = claims.reduce((s, c) => s + c.subtotal, 0);
  const annualWorkerCosts = registrations.reduce((s, r) => s + calculateRegistrationTotal(r), 0);
  const annualExpenses = transactions.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
  const netTaxableIncome = Math.max(0, annualRevenue - annualWorkerCosts - annualExpenses);

  const { rate: currentVatRate, rule: vatRule } = getActiveVatRateFromRules(taxRules);
  const incomeBrackets = getActiveIncomeTaxBrackets(taxRules);
  const { rate: blRate, maxIncome: blMax, rule: blRule } = getActiveBituachLeumiRate(taxRules);
  const { rate: healthRate, maxIncome: healthMax, rule: healthRule } = getActiveHealthRate(taxRules);

  const estimatedIncomeTax = calculateProgressiveIncomeTax(netTaxableIncome, incomeBrackets);
  const estimatedBl = Math.min(netTaxableIncome, blMax) * blRate;
  const estimatedHealth = Math.min(netTaxableIncome, healthMax) * healthRate;
  const totalEstimatedTax = estimatedIncomeTax + estimatedBl + estimatedHealth;

  const lastVerifiedDate = taxRules
    .filter((r) => r.is_verified && r.last_verified)
    .map((r) => r.last_verified)
    .sort()
    .reverse()[0];

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const tabs: { id: TaxType; label: string }[] = [
    { id: 'vat', label: t('vatTax') },
    { id: 'income_tax', label: t('incomeTax') },
    { id: 'bituach_leumi', label: t('nationalInsurance') },
  ];

  const verifiedRules = taxRules.filter((r) => r.is_verified);
  const unverifiedRules = taxRules.filter((r) => !r.is_verified);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">{t('taxCenter')}</h1>
        <button onClick={handleUpdateRules} className="btn-primary" disabled={updating}>
          {updating ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          {t('updateTaxRules')}
        </button>
      </div>

      {/* Verification status banner */}
      <div className={`card p-5 ${verifiedRules.length > 0 ? 'border-success-200 bg-success-50/50' : 'border-warning-200 bg-warning-50/50'}`}>
        <div className="flex items-center gap-3">
          {verifiedRules.length > 0 ? (
            <CheckCircle2 size={24} className="text-success-500 shrink-0" />
          ) : (
            <AlertCircle size={24} className="text-warning-500 shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold text-neutral-900">
              {verifiedRules.length > 0 ? t('taxRulesVerified') : t('noTaxRules')}
            </p>
            {lastVerifiedDate && (
              <p className="text-xs text-neutral-500 flex items-center gap-1.5 mt-1">
                <Clock size={12} />
                {t('lastVerified')}: {formatDate(lastVerifiedDate)}
              </p>
            )}
          </div>
          {vatRule?.source_url && (
            <a href={vatRule.source_url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs">
              <ExternalLink size={14} /> {t('officialSource')}
            </a>
          )}
        </div>
      </div>

      {/* Update notification */}
      {updateResult?.updated && updateResult.changes.length > 0 && (
        <div className="card p-5 border-primary-200 bg-primary-50/50">
          <h3 className="text-sm font-semibold text-primary-700 mb-3 flex items-center gap-2">
            <RefreshCw size={16} /> {t('taxRulesUpdated')}
          </h3>
          <div className="space-y-2">
            {updateResult.changes.map((c, i) => (
              <div key={i} className="text-xs text-neutral-600">
                <span className="font-medium">{c.type}:</span> {c.oldValue} → {c.newValue}
                <span className="text-neutral-400"> ({c.effectiveDate ? formatDate(c.effectiveDate) : ''})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tax summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="stat-icon bg-primary-50 text-primary-600">
            <Percent size={20} />
          </div>
          <p className="text-sm text-neutral-500">{t('vatTax')}</p>
          <p className="text-xl font-bold text-neutral-900 mt-1">{(currentVatRate * 100).toFixed(1)}%</p>
          <p className="text-xs text-neutral-400 mt-1">{formatCurrency(annualRevenue * currentVatRate)} {t('estimatedTax')}</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-warning-50 text-warning-600">
            <TrendingUp size={20} />
          </div>
          <p className="text-sm text-neutral-500">{t('incomeTax')}</p>
          <p className="text-xl font-bold text-neutral-900 mt-1">{formatCurrency(estimatedIncomeTax)}</p>
          <p className="text-xs text-neutral-400 mt-1">{incomeBrackets.length} {t('brackets')}</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-success-50 text-success-600">
            <Receipt size={20} />
          </div>
          <p className="text-sm text-neutral-500">{t('nationalInsurance')}</p>
          <p className="text-xl font-bold text-neutral-900 mt-1">{formatCurrency(estimatedBl)}</p>
          <p className="text-xs text-neutral-400 mt-1">{(blRate * 100).toFixed(2)}%</p>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-info-50 text-info-600">
            <Receipt size={20} />
          </div>
          <p className="text-sm text-neutral-500">{t('healthInsurance')}</p>
          <p className="text-xl font-bold text-neutral-900 mt-1">{formatCurrency(estimatedHealth)}</p>
          <p className="text-xs text-neutral-400 mt-1">{(healthRate * 100).toFixed(2)}%</p>
        </div>
      </div>

      {/* Tax calculator */}
      <div className="card p-6">
        <h3 className="section-title mb-5 flex items-center gap-2">
          <Calculator size={18} className="text-primary-500" />
          {t('taxableIncome')}
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-50 text-sm">
            <span className="text-neutral-600">{t('revenue')}</span>
            <span className="font-semibold text-neutral-900">{formatCurrency(annualRevenue)}</span>
          </div>
          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-50 text-sm">
            <span className="text-neutral-600">- {t('workerCosts')}</span>
            <span className="font-semibold text-error-600">-{formatCurrency(annualWorkerCosts)}</span>
          </div>
          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-50 text-sm">
            <span className="text-neutral-600">- {t('otherExpenses')}</span>
            <span className="font-semibold text-error-600">-{formatCurrency(annualExpenses)}</span>
          </div>
          <div className="flex items-center justify-between py-3.5 px-4 rounded-xl bg-primary-50 border border-primary-200">
            <span className="font-bold text-neutral-700">{t('taxableIncome')}</span>
            <span className="text-lg font-bold text-primary-700">{formatCurrency(netTaxableIncome)}</span>
          </div>
          <div className="flex items-center justify-between py-3.5 px-4 rounded-xl bg-error-50 border border-error-200">
            <span className="font-bold text-neutral-700">{t('estimatedTax')}</span>
            <span className="text-lg font-bold text-error-700">{formatCurrency(totalEstimatedTax)}</span>
          </div>
          <div className="flex items-center justify-between py-3.5 px-4 rounded-xl bg-success-50 border border-success-200">
            <span className="font-bold text-neutral-700">{t('netAfterTax')}</span>
            <span className="text-lg font-bold text-success-700">{formatCurrency(netTaxableIncome - totalEstimatedTax)}</span>
          </div>
        </div>
        <p className="text-xs text-neutral-400 mt-4 flex items-center gap-1.5">
          <Info size={14} />
          {t('taxEstimateDisclaimer')}
        </p>
      </div>

      {/* Tax rules tabs */}
      <div className="card p-6">
        <div className="flex flex-wrap gap-2 mb-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'vat' && (
          <div>
            {taxRules.filter((r) => r.tax_type === 'vat').length === 0 ? (
              <EmptyState icon={<Percent size={48} />} title={t('noTaxRules')} />
            ) : (
              <div className="space-y-3">
                {taxRules.filter((r) => r.tax_type === 'vat').sort((a, b) => b.effective_date.localeCompare(a.effective_date)).map((r) => (
                  <div key={r.id} className={`p-4 rounded-xl border border-neutral-100 ${r.is_active ? 'bg-neutral-50' : 'bg-neutral-50/50 opacity-60'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-neutral-900">{(r.rate * 100).toFixed(1)}%</p>
                      <div className="flex items-center gap-2">
                        {r.is_verified && <span className="badge-success"><Shield size={10} className="inline" /> {t('verified')}</span>}
                        <span className={r.is_active ? 'badge-primary' : 'badge-neutral'}>{r.is_active ? t('active') : t('archived')}</span>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-400">
                      {formatDate(r.effective_date)}{r.end_date ? ` - ${formatDate(r.end_date)}` : ''} · v{r.version}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1.5">{r.source}</p>
                    {r.source_url && (
                      <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline flex items-center gap-1 mt-1.5">
                        <ExternalLink size={10} /> {r.source_url}
                      </a>
                    )}
                    {r.last_verified && (
                      <p className="text-[10px] text-neutral-400 mt-1.5">{t('lastVerified')}: {formatDate(r.last_verified)}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'income_tax' && (
          <div>
            {incomeBrackets.length === 0 ? (
              <EmptyState icon={<TrendingUp size={48} />} title={t('noTaxRules')} />
            ) : (
              <div>
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200">
                        <th className="table-header text-start py-3 px-2">{t('bracket')}</th>
                        <th className="table-header text-end py-3 px-2">Min</th>
                        <th className="table-header text-end py-3 px-2">Max</th>
                        <th className="table-header text-end py-3 px-2">{t('rate')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomeBrackets.map((r) => (
                        <tr key={r.id} className="table-row border-b border-neutral-100">
                          <td className="py-3 px-2 text-neutral-700">{formatCurrency(r.bracket_min)} - {r.bracket_max ? formatCurrency(r.bracket_max) : '∞'}</td>
                          <td className="py-3 px-2 text-end text-neutral-600">{formatCurrency(r.bracket_min)}</td>
                          <td className="py-3 px-2 text-end text-neutral-600">{r.bracket_max ? formatCurrency(r.bracket_max) : '∞'}</td>
                          <td className="py-3 px-2 text-end font-semibold text-neutral-900">{(r.bracket_rate * 100).toFixed(0)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {incomeBrackets[0] && (
                  <div className="p-4 rounded-xl bg-neutral-50 text-xs space-y-1.5 mt-4">
                    <p className="text-neutral-500">{incomeBrackets[0].source}</p>
                    {incomeBrackets[0].source_url && (
                      <a href={incomeBrackets[0].source_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline flex items-center gap-1">
                        <ExternalLink size={10} /> {incomeBrackets[0].source_url}
                      </a>
                    )}
                    <p className="text-neutral-400">{t('effectiveDate')}: {formatDate(incomeBrackets[0].effective_date)} · v{incomeBrackets[0].version}</p>
                    {incomeBrackets[0].last_verified && <p className="text-neutral-400">{t('lastVerified')}: {formatDate(incomeBrackets[0].last_verified)}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'bituach_leumi' && (
          <div>
            {taxRules.filter((r) => r.tax_type === 'bituach_leumi').length === 0 ? (
              <EmptyState icon={<Receipt size={48} />} title={t('noTaxRules')} />
            ) : (
              <div className="space-y-4">
                {/* National Insurance */}
                {blRule && (
                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-neutral-900">{t('nationalInsurance')}: {(blRate * 100).toFixed(2)}%</p>
                      {blRule.is_verified && <span className="badge-success"><Shield size={10} className="inline" /> {t('verified')}</span>}
                    </div>
                    <p className="text-xs text-neutral-400">{t('maxIncome')}: {formatCurrency(blMax)}</p>
                    <p className="text-xs text-neutral-500 mt-1.5">{blRule.source}</p>
                    {blRule.source_url && (
                      <a href={blRule.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline flex items-center gap-1 mt-1.5">
                        <ExternalLink size={10} /> {blRule.source_url}
                      </a>
                    )}
                  </div>
                )}
                {/* Health Insurance */}
                {healthRule && (
                  <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-neutral-900">{t('healthInsurance')}: {(healthRate * 100).toFixed(2)}%</p>
                      {healthRule.is_verified && <span className="badge-success"><Shield size={10} className="inline" /> {t('verified')}</span>}
                    </div>
                    <p className="text-xs text-neutral-400">{t('maxIncome')}: {formatCurrency(healthMax)}</p>
                    <p className="text-xs text-neutral-500 mt-1.5">{healthRule.source}</p>
                    {healthRule.source_url && (
                      <a href={healthRule.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-600 hover:underline flex items-center gap-1 mt-1.5">
                        <ExternalLink size={10} /> {healthRule.source_url}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-neutral-400 text-center flex items-center justify-center gap-1.5">
        <Info size={14} />
        {t('taxEstimateDisclaimer')}
      </p>
    </div>
  );
}

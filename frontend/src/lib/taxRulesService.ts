import { supabase } from '@/lib/supabase';
import { createTaxRule, getTaxRules, addAuditLog } from '@/lib/dataAccess';
import { recordUndoAction } from '@/lib/undoHistory';
import type { TaxRule } from '@/types';

// Official Israeli government source URLs
export const OFFICIAL_SOURCES = {
  vat: {
    name: 'Israel Tax Authority',
    url: 'https://www.gov.il/he/departments/general/vat_rates',
  },
  income_tax: {
    name: 'Israel Tax Authority',
    url: 'https://www.gov.il/he/departments/topics/income_tax',
  },
  bituach_leumi: {
    name: 'Bituach Leumi (National Insurance Institute of Israel)',
    url: 'https://www.btl.gov.il/',
  },
  health: {
    name: 'Bituach Leumi (National Insurance Institute of Israel)',
    url: 'https://www.btl.gov.il/',
  },
};

export const MANUAL_VAT_SOURCE = 'User configured';

// Reference Israeli tax rules for 2026. VAT is intentionally user-managed;
// official refresh only updates income tax, National Insurance, and health rules.
const OFFICIAL_TAX_DATA = {
  vat: { rate: 0.18, effectiveDate: '2026-01-01' },
  income_tax_brackets: [
    { min: 0, max: 84600, rate: 0.10 },
    { min: 84600, max: 123840, rate: 0.14 },
    { min: 123840, max: 186120, rate: 0.20 },
    { min: 186120, max: 273960, rate: 0.31 },
    { min: 273960, max: 582840, rate: 0.35 },
    { min: 582840, max: 754560, rate: 0.47 },
    { min: 754560, max: null, rate: 0.50 },
  ],
  bituach_leumi: { rate: 0.0301, maxIncome: 582840 },
  health: { rate: 0.0318, maxIncome: 582840 },
};

export interface TaxUpdateResult {
  success: boolean;
  updated: boolean;
  changes: { type: string; oldValue: string; newValue: string; effectiveDate: string }[];
  source: string;
  sourceUrl: string;
  verifiedAt: string;
  error?: string;
}

export async function checkAndUpdateTaxRules(userId: string): Promise<TaxUpdateResult> {
  const now = new Date().toISOString();
  const changes: TaxUpdateResult['changes'] = [];

  try {
    // Get current active rules
    const currentRules = await getTaxRules(userId);
    const activeIncomeBrackets = currentRules.filter((r) => r.tax_type === 'income_tax' && r.is_active && r.is_verified);
    const activeBl = currentRules.find((r) => r.tax_type === 'bituach_leumi' && r.is_active && r.is_verified);

    let updated = false;
    const taxYear = String(new Date().getFullYear());

    // VAT is intentionally user-managed; official rule refresh must not overwrite it.

    // Check income tax brackets
    if (activeIncomeBrackets.length === 0) {
      for (const bracket of OFFICIAL_TAX_DATA.income_tax_brackets) {
        await createTaxRule({
          user_id: userId,
          tax_type: 'income_tax',
          tax_year: taxYear,
          effective_date: OFFICIAL_TAX_DATA.vat.effectiveDate,
          end_date: null,
          version: 1,
          rate: 0,
          bracket_min: bracket.min,
          bracket_max: bracket.max,
          bracket_rate: bracket.rate,
          source: OFFICIAL_SOURCES.income_tax.name,
          source_url: OFFICIAL_SOURCES.income_tax.url,
          is_active: true,
          is_verified: true,
          last_verified: now,
        });
      }
      updated = true;
      changes.push({
        type: 'Income Tax',
        oldValue: 'None',
        newValue: `${OFFICIAL_TAX_DATA.income_tax_brackets.length} brackets`,
        effectiveDate: OFFICIAL_TAX_DATA.vat.effectiveDate,
      });
    } else {
      // Update last_verified
      for (const bracket of activeIncomeBrackets) {
        await supabase.from('tax_rules').update({ last_verified: now }).eq('id', bracket.id);
      }
    }

    // Check Bituach Leumi
    const officialBl = OFFICIAL_TAX_DATA.bituach_leumi;
    if (!activeBl || activeBl.rate !== officialBl.rate) {
      if (activeBl) {
        await supabase.from('tax_rules').update({ is_active: false, end_date: OFFICIAL_TAX_DATA.vat.effectiveDate }).eq('id', activeBl.id);
        changes.push({
          type: 'National Insurance',
          oldValue: `${(activeBl.rate * 100).toFixed(2)}%`,
          newValue: `${(officialBl.rate * 100).toFixed(2)}%`,
          effectiveDate: OFFICIAL_TAX_DATA.vat.effectiveDate,
        });
      } else {
        changes.push({
          type: 'National Insurance',
          oldValue: 'None',
          newValue: `${(officialBl.rate * 100).toFixed(2)}%`,
          effectiveDate: OFFICIAL_TAX_DATA.vat.effectiveDate,
        });
      }
      updated = true;
      await createTaxRule({
        user_id: userId,
        tax_type: 'bituach_leumi',
        tax_year: taxYear,
        effective_date: OFFICIAL_TAX_DATA.vat.effectiveDate,
        end_date: null,
        version: (activeBl?.version ?? 0) + 1,
        rate: officialBl.rate,
        bracket_min: 0,
        bracket_max: officialBl.maxIncome,
        bracket_rate: 0,
        source: OFFICIAL_SOURCES.bituach_leumi.name,
        source_url: OFFICIAL_SOURCES.bituach_leumi.url,
        is_active: true,
        is_verified: true,
        last_verified: now,
      });
    } else {
      await supabase.from('tax_rules').update({ last_verified: now }).eq('id', activeBl.id);
    }

    // Check Health insurance (stored as bituach_leumi with a separate record)
    const activeHealth = currentRules.find((r) => r.tax_type === 'bituach_leumi' && r.is_active && r.is_verified && r.source_url === OFFICIAL_SOURCES.health.url);
    const officialHealth = OFFICIAL_TAX_DATA.health;
    if (!activeHealth || activeHealth.rate !== officialHealth.rate) {
      if (activeHealth) {
        await supabase.from('tax_rules').update({ is_active: false, end_date: OFFICIAL_TAX_DATA.vat.effectiveDate }).eq('id', activeHealth.id);
        changes.push({
          type: 'Health Insurance',
          oldValue: `${(activeHealth.rate * 100).toFixed(2)}%`,
          newValue: `${(officialHealth.rate * 100).toFixed(2)}%`,
          effectiveDate: OFFICIAL_TAX_DATA.vat.effectiveDate,
        });
      } else {
        changes.push({
          type: 'Health Insurance',
          oldValue: 'None',
          newValue: `${(officialHealth.rate * 100).toFixed(2)}%`,
          effectiveDate: OFFICIAL_TAX_DATA.vat.effectiveDate,
        });
      }
      updated = true;
      await createTaxRule({
        user_id: userId,
        tax_type: 'bituach_leumi',
        tax_year: taxYear,
        effective_date: OFFICIAL_TAX_DATA.vat.effectiveDate,
        end_date: null,
        version: 1,
        rate: officialHealth.rate,
        bracket_min: 0,
        bracket_max: officialHealth.maxIncome,
        bracket_rate: 0,
        source: OFFICIAL_SOURCES.health.name,
        source_url: OFFICIAL_SOURCES.health.url,
        is_active: true,
        is_verified: true,
        last_verified: now,
      });
    }

    await addAuditLog({
      user_id: userId,
      action: updated ? 'tax_rules_updated_from_official_source' : 'tax_rules_verified',
      entity_type: 'tax_rules',
      details: { changes, verifiedAt: now, source: OFFICIAL_SOURCES.vat.name },
    });

    return {
      success: true,
      updated,
      changes,
      source: OFFICIAL_SOURCES.vat.name,
      sourceUrl: OFFICIAL_SOURCES.vat.url,
      verifiedAt: now,
    };
  } catch (e) {
    console.error('Tax rule update failed:', e);
    return {
      success: false,
      updated: false,
      changes: [],
      source: OFFICIAL_SOURCES.vat.name,
      sourceUrl: OFFICIAL_SOURCES.vat.url,
      verifiedAt: now,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

export async function saveManualVatRate(userId: string, ratePercent: number): Promise<TaxRule> {
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new Error('VAT rate must be between 0 and 100');
  }

  const currentRules = await getTaxRules(userId);
  const vatRules = currentRules.filter((rule) => rule.tax_type === 'vat');
  const activeVatRules = vatRules.filter((rule) => rule.is_active);
  const effectiveDate = new Date().toISOString().split('T')[0];

  if (activeVatRules.length > 0) {
    const { error } = await supabase
      .from('tax_rules')
      .update({ is_active: false, end_date: effectiveDate })
      .eq('user_id', userId)
      .eq('tax_type', 'vat')
      .eq('is_active', true);
    if (error) throw error;
  }

  let rule: TaxRule;
  try {
    rule = await createTaxRule({
      user_id: userId,
      tax_type: 'vat',
      tax_year: String(new Date().getFullYear()),
      effective_date: effectiveDate,
      end_date: null,
      version: Math.max(0, ...vatRules.map((item) => item.version)) + 1,
      rate: ratePercent / 100,
      bracket_min: 0,
      bracket_max: null,
      bracket_rate: 0,
      source: MANUAL_VAT_SOURCE,
      source_url: '',
      is_active: true,
      is_verified: false,
      last_verified: null,
    });
  } catch (error) {
    for (const activeRule of activeVatRules) {
      await supabase
        .from('tax_rules')
        .update({ is_active: true, end_date: activeRule.end_date })
        .eq('user_id', userId)
        .eq('id', activeRule.id);
    }
    throw error;
  }

  await addAuditLog({
    user_id: userId,
    action: 'vat_rate_updated_manually',
    entity_type: 'tax_rule',
    entity_id: rule.id,
    details: { rate_percent: ratePercent },
  });

  return rule;
}

export function getActiveVatRateFromRules(rules: TaxRule[], date?: string): { rate: number; rule: TaxRule | null } {
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const vatRules = rules
    .filter((r) => r.tax_type === 'vat' && r.is_active && (r.is_verified || r.source === MANUAL_VAT_SOURCE))
    .filter((r) => r.effective_date <= targetDate)
    .filter((r) => !r.end_date || r.end_date > targetDate)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  return { rate: vatRules[0]?.rate ?? 0, rule: vatRules[0] ?? null };
}

export function getActiveIncomeTaxBrackets(rules: TaxRule[], date?: string): TaxRule[] {
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  return rules
    .filter((r) => r.tax_type === 'income_tax' && r.is_active && r.is_verified)
    .filter((r) => r.effective_date <= targetDate)
    .filter((r) => !r.end_date || r.end_date > targetDate)
    .sort((a, b) => a.bracket_min - b.bracket_min);
}

export function getActiveBituachLeumiRate(rules: TaxRule[], date?: string): { rate: number; maxIncome: number; rule: TaxRule | null } {
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const blRules = rules
    .filter((r) => r.tax_type === 'bituach_leumi' && r.is_active && r.is_verified && r.source_url === OFFICIAL_SOURCES.bituach_leumi.url)
    .filter((r) => r.effective_date <= targetDate)
    .filter((r) => !r.end_date || r.end_date > targetDate)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  return { rate: blRules[0]?.rate ?? 0, maxIncome: blRules[0]?.bracket_max ?? 0, rule: blRules[0] ?? null };
}

export function getActiveHealthRate(rules: TaxRule[], date?: string): { rate: number; maxIncome: number; rule: TaxRule | null } {
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const healthRules = rules
    .filter((r) => r.tax_type === 'bituach_leumi' && r.is_active && r.is_verified && r.source_url === OFFICIAL_SOURCES.health.url)
    .filter((r) => r.effective_date <= targetDate)
    .filter((r) => !r.end_date || r.end_date > targetDate)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
  return { rate: healthRules[0]?.rate ?? 0, maxIncome: healthRules[0]?.bracket_max ?? 0, rule: healthRules[0] ?? null };
}

// Store a tax calculation for traceability
export async function storeTaxCalculation(userId: string, calc: {
  calculation_type: 'vat' | 'income_tax' | 'bituach_leumi' | 'health' | 'combined';
  reporting_period: string;
  period_start?: string | null;
  period_end?: string | null;
  gross_income: number;
  total_expenses: number;
  taxable_income: number;
  rules_used: Record<string, unknown>[];
  rule_versions: Record<string, unknown>;
  vat_amount: number;
  income_tax_amount: number;
  bituach_leumi_amount: number;
  health_amount: number;
  total_tax: number;
  net_after_tax: number;
  notes?: string;
}) {
  const { data, error } = await supabase.from('tax_calculations').insert({
    user_id: userId,
    ...calc,
    period_start: calc.period_start ?? null,
    period_end: calc.period_end ?? null,
    notes: calc.notes ?? '',
  }).select().single();
  if (error) throw error;
  recordUndoAction(userId, [{ table: 'tax_calculations', ids: [data.id] }]);
  return data;
}

export async function getTaxCalculations(userId: string) {
  const { data, error } = await supabase
    .from('tax_calculations')
    .select('*')
    .eq('user_id', userId)
    .order('calculation_date', { ascending: false });
  if (error) throw error;
  return data;
}

import type { DailyRegistration, WalletAccount, WalletTransaction, WorkerPayment, Claim, TaxRule, Workshop } from '@/types';
import { calculateAccountBalance as _calcBalance } from '@/lib/dataAccess';

export function calculateAccountBalance(account: WalletAccount, transactions: WalletTransaction[]): number {
  return _calcBalance(account, transactions);
}

export function calculateRegistrationTotal(reg: DailyRegistration): number {
  // For team leaders, daily_wage is the per-head price and headcount is stored
  const headcount = reg.headcount || 1;
  let total = reg.daily_wage * headcount;
  if (reg.has_overtime) {
    total += reg.overtime_hours * reg.overtime_rate;
  }
  if (reg.has_driving_outbound) total += reg.driving_amount;
  if (reg.has_driving_return) total += reg.driving_amount;
  return total;
}

export function calculateWorkerEarnings(
  registrations: DailyRegistration[],
  workerId: string,
  startDate?: string,
  endDate?: string,
): number {
  return registrations
    .filter((r) => r.worker_id === workerId)
    .filter((r) => !startDate || r.work_date >= startDate)
    .filter((r) => !endDate || r.work_date <= endDate)
    .reduce((sum, r) => sum + calculateRegistrationTotal(r), 0);
}

export function calculateWorkerPayments(
  payments: WorkerPayment[],
  workerId: string,
  startDate?: string,
  endDate?: string,
): number {
  return payments
    .filter((p) => p.worker_id === workerId)
    .filter((p) => !startDate || p.payment_date >= startDate)
    .filter((p) => !endDate || p.payment_date <= endDate)
    .reduce((sum, p) => sum + p.amount, 0);
}

export function calculateWalletTotal(
  accounts: WalletAccount[],
  transactions: WalletTransaction[],
): number {
  return accounts.reduce((sum, acc) => sum + calculateAccountBalance(acc, transactions), 0);
}

export function getWorkersByDate(registrations: DailyRegistration[], date: string): DailyRegistration[] {
  return registrations.filter((r) => r.work_date === date);
}

export function countWorkersByDate(registrations: DailyRegistration[], date: string): number {
  const regs = registrations.filter((r) => r.work_date === date);
  const uniqueDates = new Set(regs.map((r) => r.id));
  return uniqueDates.size;
}

export function groupRegistrationsByDate(
  registrations: DailyRegistration[],
  workshopId: string,
  unclaimedOnly = false,
): { date: string; workerCount: number; registrations: DailyRegistration[] }[] {
  let filtered = registrations.filter((r) => r.workshop_id === workshopId);
  if (unclaimedOnly) filtered = filtered.filter((r) => !r.is_claimed);

  const byDate = new Map<string, DailyRegistration[]>();
  for (const reg of filtered) {
    const arr = byDate.get(reg.work_date) ?? [];
    arr.push(reg);
    byDate.set(reg.work_date, arr);
  }

  const result = Array.from(byDate.entries())
    .map(([date, regs]) => ({
      date,
      workerCount: regs.reduce((sum, r) => sum + (r.headcount || 1), 0),
      registrations: regs.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

export function groupRegistrationsByDateForContractor(
  registrations: DailyRegistration[],
  workshops: { id: string; name: string }[],
  startDate: string,
  endDate: string,
  unclaimedOnly = true,
): { date: string; workshopId: string; workshopName: string; workerCount: number; regIds: string[] }[] {
  const workshopIds = new Set(workshops.map((w) => w.id));
  let filtered = registrations.filter((r) => workshopIds.has(r.workshop_id));
  if (unclaimedOnly) filtered = filtered.filter((r) => !r.is_claimed);
  filtered = filtered.filter((r) => r.work_date >= startDate && r.work_date <= endDate);

  const workshopNameMap = new Map(workshops.map((w) => [w.id, w.name]));

  const byDateWorkshop = new Map<string, { date: string; workshopId: string; workshopName: string; workerCount: number; regIds: string[] }>();
  for (const reg of filtered) {
    const key = `${reg.work_date}|${reg.workshop_id}`;
    const existing = byDateWorkshop.get(key);
    if (existing) {
      existing.workerCount += reg.headcount || 1;
      existing.regIds.push(reg.id);
    } else {
      byDateWorkshop.set(key, {
        date: reg.work_date,
        workshopId: reg.workshop_id,
        workshopName: workshopNameMap.get(reg.workshop_id) || '',
        workerCount: reg.headcount || 1,
        regIds: [reg.id],
      });
    }
  }

  return Array.from(byDateWorkshop.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.workshopName.localeCompare(b.workshopName);
  });
}

export function calculateClaimSubtotal(lines: { daily_total: number }[]): number {
  return lines.reduce((sum, l) => sum + l.daily_total, 0);
}

export function calculateVatAmount(subtotal: number, vatRate: number): number {
  return subtotal * vatRate;
}

export function calculateClaimTotal(subtotal: number, vatAmount: number): number {
  return subtotal + vatAmount;
}

export function generateClaimNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `CL-${year}${month}${day}-${random}`;
}

// === Contractor Profit Calculations ===

export interface WorkshopProfit {
  workshopId: string;
  workshopName: string;
  model: 'percentage' | 'margin';
  managementFeePercent: number | null;
  totalClaimed: number;
  totalWorkerWages: number;
  profit: number;
}

export function calculateContractorProfit(
  claims: Claim[],
  workshops: Workshop[],
  registrations: DailyRegistration[],
): { totalProfit: number; byWorkshop: WorkshopProfit[] } {
  const byWorkshopMap = new Map<string, WorkshopProfit>();

  for (const ws of workshops) {
    byWorkshopMap.set(ws.id, {
      workshopId: ws.id,
      workshopName: ws.name,
      model: ws.management_fee_percent != null ? 'percentage' : 'margin',
      managementFeePercent: ws.management_fee_percent ?? null,
      totalClaimed: 0,
      totalWorkerWages: 0,
      profit: 0,
    });
  }

  // Accumulate claimed totals per workshop from claim lines
  for (const claim of claims) {
    const lines = claim.claim_lines ?? [];
    for (const line of lines) {
      if (!line.workshop_id) continue;
      const entry = byWorkshopMap.get(line.workshop_id);
      if (entry) entry.totalClaimed += line.daily_total;
    }
    // Also count claims directly tied to a single workshop (no lines)
    if (lines.length === 0 && claim.workshop_id) {
      const entry = byWorkshopMap.get(claim.workshop_id);
      if (entry) entry.totalClaimed += claim.subtotal;
    }
  }

  // Accumulate actual worker wages per workshop from registrations
  for (const reg of registrations) {
    const entry = byWorkshopMap.get(reg.workshop_id);
    if (entry) entry.totalWorkerWages += calculateRegistrationTotal(reg);
  }

  // Compute profit per workshop
  let totalProfit = 0;
  for (const entry of byWorkshopMap.values()) {
    if (entry.managementFeePercent != null && entry.managementFeePercent > 0) {
      entry.profit = entry.totalClaimed * (entry.managementFeePercent / 100);
    } else {
      entry.profit = entry.totalClaimed - entry.totalWorkerWages;
    }
    totalProfit += entry.profit;
  }

  const byWorkshop = Array.from(byWorkshopMap.values()).sort((a, b) => b.profit - a.profit);

  return { totalProfit, byWorkshop };
}

export function calculateProgressiveIncomeTax(taxableIncome: number, brackets: TaxRule[]): number {
  if (taxableIncome <= 0 || brackets.length === 0) return 0;
  const sorted = [...brackets].sort((a, b) => a.bracket_min - b.bracket_min);
  let tax = 0;
  let remaining = taxableIncome;

  for (const bracket of sorted) {
    if (remaining <= 0) break;
    const bracketMin = bracket.bracket_min;
    const bracketMax = bracket.bracket_max ?? Infinity;
    const taxableInBracket = Math.min(remaining, bracketMax - bracketMin);
    if (taxableInBracket > 0) {
      tax += taxableInBracket * bracket.bracket_rate;
      remaining -= taxableInBracket;
    }
  }

  return tax;
}

export function calculateBituachLeumi(taxableIncome: number, rules: TaxRule[]): number {
  if (taxableIncome <= 0 || rules.length === 0) return 0;
  const rate = rules[0]?.rate ?? 0;
  return taxableIncome * rate;
}

export function calculateProfitLoss(
  claims: Claim[],
  workerEarnings: number,
  workerPayments: number,
  drivingCosts: number,
  otherExpenses: number,
): {
  revenue: number;
  receivedRevenue: number;
  outstandingRevenue: number;
  workerCosts: number;
  workerPayments: number;
  drivingCosts: number;
  otherExpenses: number;
  netResult: number;
} {
  const revenue = claims.reduce((sum, c) => sum + c.total, 0);
  const receivedRevenue = claims
    .filter((c) => c.status === 'fully_received' || c.status === 'partially_received')
    .reduce((sum, c) => sum + c.total, 0);
  const outstandingRevenue = revenue - receivedRevenue;

  const totalExpenses = workerEarnings + drivingCosts + otherExpenses;
  const netResult = receivedRevenue - workerPayments - drivingCosts - otherExpenses;

  return {
    revenue,
    receivedRevenue,
    outstandingRevenue,
    workerCosts: workerEarnings,
    workerPayments,
    drivingCosts,
    otherExpenses,
    netResult,
  };
}

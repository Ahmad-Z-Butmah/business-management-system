import { supabase, isOnline, enqueueWrite } from '@/lib/supabase';
import { cachedRead, cacheDelete } from '@/lib/localCache';
import type {
  Worker, Contractor, Workshop, DailyRegistration, Claim, ClaimLine,
  WorkerPayment, WalletAccount, WalletTransaction, TaxRule, AppSettings,
  BusinessProfile, WorkshopContract, WorkerWageHistory, WorkerOvertimeHistory,
  TeamMembership, ExtraWork, DocumentItem, TaxSubmission,
  TaxInvoice, Task, Attachment, FeatureFlag, UserRole, AccountManagement,
} from '@/types';

// Cache key prefix per user
function ck(userId: string, entity: string): string {
  return `${userId}:${entity}`;
}

/**
 * Offline-aware write: if offline, enqueue the operation and return a placeholder.
 * If online, execute immediately.
 */
async function offlineAwareInsert<T>(
  table: string,
  payload: Record<string, unknown>,
  cacheKey: string,
): Promise<T> {
  if (!isOnline()) {
    await enqueueWrite(table, 'insert', payload);
    // Invalidate cache so next read picks up the change when back online
    await cacheDelete(cacheKey);
    return payload as unknown as T;
  }
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw error;
  return data as T;
}

async function offlineAwareUpdate<T>(
  table: string,
  id: string,
  updates: Partial<T>,
  cacheKey: string,
): Promise<T> {
  const payloadWithTs = { ...updates, updated_at: new Date().toISOString() } as Record<string, unknown>;
  if (!isOnline()) {
    await enqueueWrite(table, 'update', payloadWithTs, 'id', id);
    await cacheDelete(cacheKey);
    return { id, ...updates } as unknown as T;
  }
  const { data, error } = await supabase.from(table).update(payloadWithTs).eq('id', id).select().single();
  if (error) throw error;
  return data as T;
}

// === Business Profile ===
export async function getBusinessProfile(userId: string) {
  const { data, error } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as BusinessProfile | null;
}

export async function upsertBusinessProfile(profile: Partial<BusinessProfile> & { user_id: string }) {
  const { data, error } = await supabase
    .from('business_profiles')
    .upsert(profile, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as BusinessProfile;
}

// === Workers ===
export async function getWorkers(userId: string, activeOnly = false) {
  const result = await cachedRead<Worker[]>(ck(userId, 'workers'), async () => {
    let query = supabase.from('workers').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data as Worker[];
  });
  return activeOnly ? result.filter((w) => w.is_active) : result;
}

export async function createWorker(worker: Omit<Worker, 'id' | 'created_at' | 'updated_at'>) {
  return offlineAwareInsert<Worker>('workers', worker as unknown as Record<string, unknown>, ck(worker.user_id, 'workers'));
}

export async function updateWorker(id: string, updates: Partial<Worker>) {
  return offlineAwareUpdate<Worker>('workers', id, updates, ck(updates.user_id ?? '', 'workers'));
}

export async function deleteWorker(id: string) {
  const { error } = await supabase.from('workers').delete().eq('id', id);
  if (error) throw error;
}

// === Worker Wage History ===
export async function getWageHistory(workerId: string) {
  const { data, error } = await supabase
    .from('worker_wage_history')
    .select('*')
    .eq('worker_id', workerId)
    .order('effective_date', { ascending: false });
  if (error) throw error;
  return data as WorkerWageHistory[];
}

export async function addWageHistory(entry: Omit<WorkerWageHistory, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('worker_wage_history')
    .insert(entry)
    .select()
    .single();
  if (error) throw error;
  return data as WorkerWageHistory;
}

// === Worker Overtime History ===
export async function getOvertimeHistory(workerId: string) {
  const { data, error } = await supabase
    .from('worker_overtime_history')
    .select('*')
    .eq('worker_id', workerId)
    .order('effective_date', { ascending: false });
  if (error) throw error;
  return data as WorkerOvertimeHistory[];
}

export async function addOvertimeHistory(entry: Omit<WorkerOvertimeHistory, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('worker_overtime_history')
    .insert(entry)
    .select()
    .single();
  if (error) throw error;
  return data as WorkerOvertimeHistory;
}

// === Team Memberships ===
export async function getTeamMemberships(userId: string) {
  const { data, error } = await supabase
    .from('team_memberships')
    .select('*, worker:workers!team_memberships_worker_id_fkey(*), team_leader:workers!team_memberships_team_leader_id_fkey(*)')
    .eq('user_id', userId);
  if (error) throw error;
  return data as (TeamMembership & { worker: Worker; team_leader: Worker })[];
}

export async function getTeamMembers(leaderId: string) {
  const { data, error } = await supabase
    .from('team_memberships')
    .select('*, worker:workers!team_memberships_worker_id_fkey(*)')
    .eq('team_leader_id', leaderId);
  if (error) throw error;
  return data as (TeamMembership & { worker: Worker })[];
}

export async function addTeamMembership(entry: Omit<TeamMembership, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('team_memberships')
    .insert(entry)
    .select()
    .single();
  if (error) throw error;
  return data as TeamMembership;
}

export async function removeTeamMembership(id: string) {
  const { error } = await supabase.from('team_memberships').delete().eq('id', id);
  if (error) throw error;
}

// === Contractors ===
export async function getContractors(userId: string, activeOnly = false) {
  const result = await cachedRead<Contractor[]>(ck(userId, 'contractors'), async () => {
    let query = supabase.from('contractors').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data as Contractor[];
  });
  return activeOnly ? result.filter((c) => c.is_active) : result;
}

export async function createContractor(contractor: Omit<Contractor, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('contractors')
    .insert(contractor)
    .select()
    .single();
  if (error) throw error;
  return data as Contractor;
}

export async function updateContractor(id: string, updates: Partial<Contractor>) {
  const { data, error } = await supabase
    .from('contractors')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Contractor;
}

export async function deleteContractor(id: string) {
  const { error } = await supabase.from('contractors').delete().eq('id', id);
  if (error) throw error;
}

// === Workshops ===
export async function getWorkshops(userId: string, activeOnly = false) {
  const result = await cachedRead<Workshop[]>(ck(userId, 'workshops'), async () => {
    let query = supabase
      .from('workshops')
      .select('*, contractor:contractors(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    return data as Workshop[];
  });
  return activeOnly ? result.filter((w) => w.is_active) : result;
}

export async function createWorkshop(workshop: Omit<Workshop, 'id' | 'created_at' | 'updated_at'>) {
  return offlineAwareInsert<Workshop>('workshops', workshop as unknown as Record<string, unknown>, ck(workshop.user_id, 'workshops'));
}

export async function updateWorkshop(id: string, updates: Partial<Workshop>) {
  return offlineAwareUpdate<Workshop>('workshops', id, updates, ck(updates.user_id ?? '', 'workshops'));
}

export async function deleteWorkshop(id: string) {
  const { error } = await supabase.from('workshops').delete().eq('id', id);
  if (error) throw error;
}

// === Workshop Contracts ===
export async function getContracts(workshopId: string) {
  const { data, error } = await supabase
    .from('workshop_contracts')
    .select('*')
    .eq('workshop_id', workshopId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as WorkshopContract[];
}

export async function createContract(contract: Omit<WorkshopContract, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('workshop_contracts')
    .insert(contract)
    .select()
    .single();
  if (error) throw error;
  return data as WorkshopContract;
}

export async function updateContract(id: string, updates: Partial<WorkshopContract>) {
  const { data, error } = await supabase
    .from('workshop_contracts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as WorkshopContract;
}

// === Daily Registrations ===
export async function getDailyRegistrations(userId: string, workshopId?: string, date?: string) {
  const all = await cachedRead<DailyRegistration[]>(ck(userId, 'registrations'), async () => {
    let query = supabase
      .from('daily_registrations')
      .select('*, worker:workers(*)')
      .eq('user_id', userId)
      .order('work_date', { ascending: false });
    if (workshopId) query = query.eq('workshop_id', workshopId);
    if (date) query = query.eq('work_date', date);
    const { data, error } = await query;
    if (error) throw error;
    return data as DailyRegistration[];
  });
  // Apply filters on cached data too
  return all.filter((r) =>
    (!workshopId || r.workshop_id === workshopId) &&
    (!date || r.work_date === date)
  );
}

export async function getRegistrationsByDateRange(userId: string, workshopId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('daily_registrations')
    .select('*')
    .eq('user_id', userId)
    .eq('workshop_id', workshopId)
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: true });
  if (error) throw error;
  return data as DailyRegistration[];
}

export async function getRegistrationForWorkerOnDate(userId: string, workerId: string, workshopId: string, date: string) {
  const { data, error } = await supabase
    .from('daily_registrations')
    .select('*')
    .eq('user_id', userId)
    .eq('worker_id', workerId)
    .eq('workshop_id', workshopId)
    .eq('work_date', date)
    .maybeSingle();
  if (error) throw error;
  return data as DailyRegistration | null;
}

export async function getPreviousRegistration(userId: string, workerId: string, workshopId: string, beforeDate: string) {
  const { data, error } = await supabase
    .from('daily_registrations')
    .select('*')
    .eq('user_id', userId)
    .eq('worker_id', workerId)
    .eq('workshop_id', workshopId)
    .lt('work_date', beforeDate)
    .order('work_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DailyRegistration | null;
}

export async function createDailyRegistration(reg: Omit<DailyRegistration, 'id' | 'created_at' | 'updated_at'>) {
  return offlineAwareInsert<DailyRegistration>('daily_registrations', reg as unknown as Record<string, unknown>, ck(reg.user_id, 'registrations'));
}

export async function updateDailyRegistration(id: string, updates: Partial<DailyRegistration>) {
  return offlineAwareUpdate<DailyRegistration>('daily_registrations', id, updates, ck(updates.user_id ?? '', 'registrations'));
}

export async function deleteDailyRegistration(id: string) {
  const { error } = await supabase.from('daily_registrations').delete().eq('id', id);
  if (error) throw error;
}

export async function markRegistrationsAsClaimed(ids: string[]) {
  const { error } = await supabase
    .from('daily_registrations')
    .update({ is_claimed: true, updated_at: new Date().toISOString() })
    .in('id', ids);
  if (error) throw error;
}

// === Claims ===
export async function getClaims(userId: string) {
  return cachedRead<Claim[]>(ck(userId, 'claims'), async () => {
    const { data, error } = await supabase
      .from('claims')
      .select('*, workshop:workshops(*), contractor:contractors(*), claim_lines(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Claim[];
  });
}

export async function getClaim(id: string) {
  const { data, error } = await supabase
    .from('claims')
    .select('*, workshop:workshops(*), contractor:contractors(*), claim_lines(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as Claim | null;
}

export async function createClaim(claim: Omit<Claim, 'id' | 'created_at' | 'updated_at'>, lines: Omit<ClaimLine, 'id' | 'created_at' | 'claim_id'>[], registrationIds: string[]) {
  const { data, error } = await supabase
    .from('claims')
    .insert(claim)
    .select()
    .single();
  if (error) throw error;
  const newClaim = data as Claim;

  const linesWithClaimId = lines.map((l) => ({ ...l, claim_id: newClaim.id }));
  const { error: linesError } = await supabase.from('claim_lines').insert(linesWithClaimId);
  if (linesError) throw linesError;

  if (registrationIds.length > 0) {
    await markRegistrationsAsClaimed(registrationIds);
  }

  return newClaim;
}

export async function getClaimsByContractor(userId: string, contractorId: string) {
  const { data, error } = await supabase
    .from('claims')
    .select('*, workshop:workshops(*), contractor:contractors(*), claim_lines(*)')
    .eq('user_id', userId)
    .eq('contractor_id', contractorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Claim[];
}

export async function updateClaim(id: string, updates: Partial<Claim>) {
  const { data, error } = await supabase
    .from('claims')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Claim;
}

export async function deleteClaim(id: string) {
  const { error: linesError } = await supabase.from('claim_lines').delete().eq('claim_id', id);
  if (linesError) throw linesError;
  const { error } = await supabase.from('claims').delete().eq('id', id);
  if (error) throw error;
}

// === Worker Payments ===
export async function getWorkerPayments(userId: string) {
  return cachedRead<WorkerPayment[]>(ck(userId, 'worker_payments'), async () => {
    const { data, error } = await supabase
      .from('worker_payments')
      .select('*, worker:workers(*)')
      .eq('user_id', userId)
      .order('payment_date', { ascending: false });
    if (error) throw error;
    return data as WorkerPayment[];
  });
}

export async function createWorkerPayment(payment: Omit<WorkerPayment, 'id' | 'created_at'>) {
  return offlineAwareInsert<WorkerPayment>('worker_payments', payment as unknown as Record<string, unknown>, ck(payment.user_id, 'worker_payments'));
}

export async function deleteWorkerPayment(id: string) {
  const { error } = await supabase.from('worker_payments').delete().eq('id', id);
  if (error) throw error;
}

// === Wallet ===
export async function getWalletAccounts(userId: string) {
  return cachedRead<WalletAccount[]>(ck(userId, 'wallet_accounts'), async () => {
    const { data, error } = await supabase
      .from('wallet_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data as WalletAccount[];
  });
}

export async function createWalletAccount(account: Omit<WalletAccount, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('wallet_accounts')
    .insert(account)
    .select()
    .single();
  if (error) throw error;
  return data as WalletAccount;
}

export async function updateWalletAccount(id: string, updates: Partial<WalletAccount>) {
  const { data, error } = await supabase
    .from('wallet_accounts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as WalletAccount;
}

export async function getWalletTransactions(userId: string, accountId?: string) {
  const all = await cachedRead<WalletTransaction[]>(ck(userId, 'wallet_transactions'), async () => {
    let query = supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false });
    if (accountId) query = query.eq('wallet_account_id', accountId);
    const { data, error } = await query;
    if (error) throw error;
    return data as WalletTransaction[];
  });
  return accountId ? all.filter((t) => t.wallet_account_id === accountId) : all;
}

export async function createWalletTransaction(tx: Omit<WalletTransaction, 'id' | 'created_at'>) {
  return offlineAwareInsert<WalletTransaction>('wallet_transactions', tx as unknown as Record<string, unknown>, ck(tx.user_id, 'wallet_transactions'));
}

export async function createTransfer(
  userId: string,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  date: string,
  description: string,
) {
  const tx1: Omit<WalletTransaction, 'id' | 'created_at'> = {
    user_id: userId,
    wallet_account_id: fromAccountId,
    transaction_date: date,
    type: 'transfer_out',
    amount,
    description,
    transfer_pair_id: null,
    notes: '',
    related_worker_id: null,
    related_contractor_id: null,
    related_claim_id: null,
  };
  const { data: outTx, error: outError } = await supabase
    .from('wallet_transactions')
    .insert(tx1)
    .select()
    .single();
  if (outError) throw outError;

  const tx2: Omit<WalletTransaction, 'id' | 'created_at'> = {
    user_id: userId,
    wallet_account_id: toAccountId,
    transaction_date: date,
    type: 'transfer_in',
    amount,
    description,
    transfer_pair_id: outTx.id,
    notes: '',
    related_worker_id: null,
    related_contractor_id: null,
    related_claim_id: null,
  };
  const { data: inTx, error: inError } = await supabase
    .from('wallet_transactions')
    .insert(tx2)
    .select()
    .single();
  if (inError) throw inError;

  await supabase
    .from('wallet_transactions')
    .update({ transfer_pair_id: inTx.id })
    .eq('id', outTx.id);

  return { outTx, inTx };
}

export async function deleteWalletAccount(id: string) {
  const { error } = await supabase.from('wallet_accounts').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteWalletTransaction(id: string) {
  const { error } = await supabase.from('wallet_transactions').delete().eq('id', id);
  if (error) throw error;
}

export function calculateAccountBalance(account: WalletAccount, transactions: WalletTransaction[]): number {
  let balance = account.opening_balance;
  for (const tx of transactions) {
    if (tx.wallet_account_id !== account.id) continue;
    if (tx.type === 'income' || tx.type === 'transfer_in' || tx.type === 'claim_receipt') {
      balance += tx.amount;
    } else if (tx.type === 'expense' || tx.type === 'transfer_out' || tx.type === 'worker_payment') {
      balance -= tx.amount;
    }
  }
  return balance;
}

// === Tax Rules ===
export async function getTaxRules(userId: string, taxType?: string) {
  let query = supabase
    .from('tax_rules')
    .select('*')
    .eq('user_id', userId)
    .order('effective_date', { ascending: false });
  if (taxType) query = query.eq('tax_type', taxType);
  const { data, error } = await query;
  if (error) throw error;
  return data as TaxRule[];
}

export async function createTaxRule(rule: Omit<TaxRule, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('tax_rules')
    .insert(rule)
    .select()
    .single();
  if (error) throw error;
  return data as TaxRule;
}

export async function getActiveVatRate(userId: string, date?: string): Promise<number> {
  const targetDate = date ?? new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('tax_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('tax_type', 'vat')
    .eq('is_active', true)
    .lte('effective_date', targetDate)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.rate ?? 0;
}

// === App Settings ===
export async function getSettings(userId: string) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as AppSettings | null;
}

export async function upsertSettings(settings: Partial<AppSettings> & { user_id: string }) {
  const { data, error } = await supabase
    .from('app_settings')
    .upsert(settings, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as AppSettings;
}

// === Audit Logs ===
export async function addAuditLog(entry: { user_id: string; action: string; entity_type?: string; entity_id?: string; details?: Record<string, unknown> }) {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: entry.user_id,
    action: entry.action,
    entity_type: entry.entity_type ?? '',
    entity_id: entry.entity_id ?? null,
    details: entry.details ?? {},
  });
  if (error) console.error('Failed to add audit log:', error);
}

export async function getAuditLogs(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// === Extra Work ===
export async function getExtraWork(userId: string) {
  const { data, error } = await supabase
    .from('extra_work')
    .select('*, contractor:contractors(*), workshop:workshops(*)')
    .eq('user_id', userId)
    .order('work_date', { ascending: false });
  if (error) throw error;
  return data as ExtraWork[];
}

export async function createExtraWork(item: Omit<ExtraWork, 'id' | 'created_at' | 'updated_at' | 'contractor' | 'workshop'>) {
  const { data, error } = await supabase
    .from('extra_work')
    .insert(item)
    .select('*, contractor:contractors(*), workshop:workshops(*)')
    .single();
  if (error) throw error;
  return data as ExtraWork;
}

export async function updateExtraWork(id: string, updates: Partial<ExtraWork>) {
  const { data, error } = await supabase
    .from('extra_work')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, contractor:contractors(*), workshop:workshops(*)')
    .single();
  if (error) throw error;
  return data as ExtraWork;
}

export async function deleteExtraWork(id: string) {
  const { error } = await supabase.from('extra_work').delete().eq('id', id);
  if (error) throw error;
}

// === Documents ===
export async function getDocuments(userId: string, category?: string) {
  let query = supabase
    .from('documents')
    .select('*, contractor:contractors(*), workshop:workshops(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (category) query = query.eq('category', category);
  const { data, error } = await query;
  if (error) throw error;
  return data as DocumentItem[];
}

export async function createDocument(item: Omit<DocumentItem, 'id' | 'created_at' | 'updated_at' | 'contractor' | 'workshop'>) {
  const { data, error } = await supabase
    .from('documents')
    .insert(item)
    .select('*, contractor:contractors(*), workshop:workshops(*)')
    .single();
  if (error) throw error;
  return data as DocumentItem;
}

export async function updateDocument(id: string, updates: Partial<DocumentItem>) {
  const { data, error } = await supabase
    .from('documents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, contractor:contractors(*), workshop:workshops(*)')
    .single();
  if (error) throw error;
  return data as DocumentItem;
}

export async function deleteDocument(id: string) {
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) throw error;
}

// === Tax Submissions ===
export async function getTaxSubmissions(userId: string) {
  const { data, error } = await supabase
    .from('tax_submissions')
    .select('*')
    .eq('user_id', userId)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return data as TaxSubmission[];
}

export async function createTaxSubmission(item: Omit<TaxSubmission, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('tax_submissions')
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data as TaxSubmission;
}

export async function updateTaxSubmission(id: string, updates: Partial<TaxSubmission>) {
  const { data, error } = await supabase
    .from('tax_submissions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as TaxSubmission;
}

export async function deleteTaxSubmission(id: string) {
  const { error } = await supabase.from('tax_submissions').delete().eq('id', id);
  if (error) throw error;
}

// === Tax Invoices ===
export async function getTaxInvoices(userId: string) {
  const { data, error } = await supabase
    .from('tax_invoices')
    .select('*, contractor:contractors(*), claim:claims(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as TaxInvoice[];
}

export async function createTaxInvoice(item: Omit<TaxInvoice, 'id' | 'created_at' | 'updated_at' | 'contractor' | 'claim'>) {
  const { data, error } = await supabase
    .from('tax_invoices')
    .insert(item)
    .select('*, contractor:contractors(*), claim:claims(*)')
    .single();
  if (error) throw error;
  return data as TaxInvoice;
}

export async function updateTaxInvoice(id: string, updates: Partial<TaxInvoice>) {
  const { data, error } = await supabase
    .from('tax_invoices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as TaxInvoice;
}

export async function deleteTaxInvoice(id: string) {
  const { error } = await supabase.from('tax_invoices').delete().eq('id', id);
  if (error) throw error;
}

// === Tasks & Reminders ===
export async function getTasks(userId: string, status?: string) {
  let query = supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('due_date', { ascending: true });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data as Task[];
}

export async function createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at'>) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function updateTask(id: string, updates: Partial<Task>) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// === Attachments ===
export async function getAttachments(userId: string, entityType?: string, entityId?: string) {
  let query = supabase
    .from('attachments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (entityType) query = query.eq('related_entity_type', entityType);
  if (entityId) query = query.eq('related_entity_id', entityId);
  const { data, error } = await query;
  if (error) throw error;
  return data as Attachment[];
}

export async function createAttachment(item: Omit<Attachment, 'id' | 'created_at'>) {
  const { data, error } = await supabase
    .from('attachments')
    .insert(item)
    .select()
    .single();
  if (error) throw error;
  return data as Attachment;
}

export async function deleteAttachment(id: string) {
  const { error } = await supabase.from('attachments').delete().eq('id', id);
  if (error) throw error;
}

// === Feature Flags ===
export async function getFeatureFlags(userId: string) {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data as FeatureFlag[];
}

export async function upsertFeatureFlag(flag: Omit<FeatureFlag, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('feature_flags')
    .upsert(flag, { onConflict: 'user_id,feature_key' })
    .select()
    .single();
  if (error) throw error;
  return data as FeatureFlag;
}

// === User Roles ===
export async function getUserRoles(userId: string) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data as UserRole[];
}

export async function upsertUserRole(role: Omit<UserRole, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('user_roles')
    .upsert(role, { onConflict: 'user_id,role' })
    .select()
    .single();
  if (error) throw error;
  return data as UserRole;
}

// === Account Management ===
export async function getAccountManagement(userId: string) {
  const { data, error } = await supabase
    .from('account_management')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as AccountManagement | null;
}

export async function upsertAccountManagement(item: Omit<AccountManagement, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('account_management')
    .upsert(item, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as AccountManagement;
}

// === Enhanced Audit Log ===
export async function addAuditLogV2(entry: {
  user_id: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
  old_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
  source_device?: string;
}) {
  const { error } = await supabase.from('audit_logs').insert({
    user_id: entry.user_id,
    action: entry.action,
    entity_type: entry.entity_type ?? '',
    entity_id: entry.entity_id ?? null,
    details: entry.details ?? {},
    old_value: entry.old_value ?? null,
    new_value: entry.new_value ?? null,
    source_device: entry.source_device ?? '',
  });
  if (error) console.error('Failed to add audit log:', error);
}

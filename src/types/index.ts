export type WorkerType = 'normal' | 'team_leader';
export type WorkshopType = 'daily_wage' | 'contract';
export type ClaimStatus = 'draft' | 'prepared' | 'sent' | 'partially_received' | 'fully_received' | 'closed';
export type ContractStatus = 'active' | 'completed' | 'cancelled';
export type WalletTxType = 'income' | 'expense' | 'transfer_in' | 'transfer_out' | 'opening_balance' | 'worker_payment' | 'claim_receipt';
export type TaxType = 'vat' | 'income_tax' | 'bituach_leumi';
export type Language = 'ar' | 'he' | 'en';
export type ExtraWorkMode = 'structured' | 'free_text';
export type ExtraWorkStatus = 'pending' | 'reviewed' | 'claimed' | 'invoiced' | 'received' | 'archived';
export type DocumentCategory = 'customer_billing' | 'business_expense';
export type DocumentStatus = 'pending' | 'reviewed' | 'sent' | 'archived';
export type TaxSubmissionStatus = 'pending' | 'prepared' | 'submitted' | 'paid' | 'cancelled';
export type TaxObligationType = 'vat' | 'income_tax' | 'bituach_leumi' | 'annual' | 'other';

export interface BusinessProfile {
  id: string;
  user_id: string;
  business_name: string;
  phone: string;
  address: string;
  logo_url: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface Worker {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  profession: string;
  worker_type: WorkerType;
  is_active: boolean;
  notes: string;
  default_daily_wage: number;
  default_overtime_rate: number;
  default_driving_amount: number;
  effective_date: string;
  created_at: string;
  updated_at: string;
}

export interface WorkerWageHistory {
  id: string;
  user_id: string;
  worker_id: string;
  daily_wage: number;
  effective_date: string;
  created_at: string;
}

export interface WorkerOvertimeHistory {
  id: string;
  user_id: string;
  worker_id: string;
  overtime_rate: number;
  effective_date: string;
  created_at: string;
}

export interface TeamMembership {
  id: string;
  user_id: string;
  team_leader_id: string;
  worker_id: string;
  created_at: string;
}

export interface Contractor {
  id: string;
  user_id: string;
  name: string;
  company_name: string;
  phone: string;
  address: string;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Workshop {
  id: string;
  user_id: string;
  name: string;
  contractor_id: string | null;
  phone: string;
  address: string;
  workshop_type: WorkshopType;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  management_fee_percent?: number | null;
  created_at: string;
  updated_at: string;
  contractor?: Contractor;
}

export interface WorkshopContract {
  id: string;
  user_id: string;
  workshop_id: string;
  contract_name: string;
  agreed_amount: number;
  agreement_type: 'fixed' | 'per_worker';
  start_date: string | null;
  end_date: string | null;
  received_amount: number;
  status: ContractStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DailyRegistration {
  id: string;
  user_id: string;
  workshop_id: string;
  worker_id: string;
  work_date: string;
  daily_wage: number;
  has_overtime: boolean;
  overtime_hours: number;
  overtime_rate: number;
  has_driving_outbound: boolean;
  has_driving_return: boolean;
  driving_amount: number;
  notes: string;
  is_claimed: boolean;
  headcount: number;
  created_at: string;
  updated_at: string;
  worker?: Worker;
}

export interface Claim {
  id: string;
  user_id: string;
  claim_number: string;
  workshop_id: string | null;
  contractor_id: string | null;
  claim_date: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  price_per_head: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  status: ClaimStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  workshop?: Workshop;
  contractor?: Contractor;
  claim_lines?: ClaimLine[];
}

export interface ClaimLine {
  id: string;
  user_id: string;
  claim_id: string;
  work_date: string;
  worker_count: number;
  price_per_head: number;
  daily_total: number;
  workshop_id: string | null;
  workshop_name: string;
  created_at: string;
}

export interface WorkerPayment {
  id: string;
  user_id: string;
  worker_id: string;
  payment_date: string;
  amount: number;
  wallet_account_id: string | null;
  description: string;
  notes: string;
  period_start: string | null;
  period_end: string | null;
  is_period_closed: boolean;
  created_at: string;
  worker?: Worker;
}

export interface WalletAccount {
  id: string;
  user_id: string;
  name: string;
  account_type: 'bank' | 'cash';
  opening_balance: number;
  created_at: string;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  wallet_account_id: string;
  transaction_date: string;
  type: WalletTxType;
  amount: number;
  description: string;
  related_worker_id: string | null;
  related_contractor_id: string | null;
  related_claim_id: string | null;
  transfer_pair_id: string | null;
  notes: string;
  created_at: string;
}

export interface TaxRule {
  id: string;
  user_id: string;
  tax_type: TaxType;
  tax_year: string;
  effective_date: string;
  end_date: string | null;
  version: number;
  rate: number;
  bracket_min: number;
  bracket_max: number | null;
  bracket_rate: number;
  source: string;
  source_url: string;
  is_active: boolean;
  is_verified: boolean;
  last_verified: string | null;
  created_at: string;
}

export interface AppSettings {
  id: string;
  user_id: string;
  language: Language;
  backup_time: string;
  backup_enabled: boolean;
  last_backup_at: string | null;
  last_backup_status: string;
  last_backup_size: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ExtraWork {
  id: string;
  user_id: string;
  work_date: string;
  mode: ExtraWorkMode;
  company: string;
  contractor_id: string | null;
  workshop_id: string | null;
  subject: string;
  work_description: string;
  quantity: number | null;
  unit_price: number | null;
  total_price: number;
  notes: string;
  status: ExtraWorkStatus;
  related_claim_id: string | null;
  from_time: string;
  to_time: string;
  created_at: string;
  updated_at: string;
  contractor?: Contractor;
  workshop?: Workshop;
}

export interface DocumentItem {
  id: string;
  user_id: string;
  title: string;
  category: DocumentCategory;
  image_url: string;
  document_date: string | null;
  due_date: string | null;
  invoice_number: string;
  supplier_name: string;
  amount: number;
  vat_amount: number;
  total: number;
  description: string;
  ocr_data: Record<string, unknown>;
  ocr_reviewed: boolean;
  contractor_id: string | null;
  workshop_id: string | null;
  related_claim_id: string | null;
  status: DocumentStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  contractor?: Contractor;
  workshop?: Workshop;
}

export interface TaxSubmission {
  id: string;
  user_id: string;
  obligation_type: TaxObligationType;
  reporting_period: string;
  period_start: string | null;
  period_end: string | null;
  due_date: string;
  status: TaxSubmissionStatus;
  amount: number | null;
  source: string;
  notes: string;
  reminder_enabled: boolean;
  last_rules_update: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaxInvoice {
  id: string;
  user_id: string;
  invoice_number: string;
  assignment_number: string;
  claim_id: string | null;
  contractor_id: string | null;
  issue_date: string;
  taxable_amount: number;
  vat_amount: number;
  total: number;
  status: 'draft' | 'issued' | 'sent' | 'paid' | 'void' | 'cancelled';
  notes: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  contractor?: Contractor;
  claim?: Claim;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: 'claims' | 'payments' | 'documents' | 'tax' | 'backup' | 'agreements' | 'workshops' | 'general';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  related_entity_type: string;
  related_entity_id: string | null;
  status: 'pending' | 'completed' | 'postponed' | 'dismissed';
  is_auto_generated: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id: string;
  user_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_data: string;
  related_entity_type: string;
  related_entity_id: string | null;
  uploaded_by: string;
  checksum: string;
  created_at: string;
}

export interface FeatureFlag {
  id: string;
  user_id: string;
  feature_key: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: 'owner' | 'manager' | 'employee' | 'accountant' | 'viewer';
  permissions: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AccountManagement {
  id: string;
  user_id: string;
  account_status: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
  plan: 'free' | 'basic' | 'pro' | 'business';
  subscription_status: string;
  deletion_requested_at: string | null;
  deletion_scheduled_for: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaxCalculation {
  id: string;
  user_id: string;
  calculation_type: 'vat' | 'income_tax' | 'bituach_leumi' | 'health' | 'combined';
  reporting_period: string;
  period_start: string | null;
  period_end: string | null;
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
  calculation_date: string;
  notes: string;
}

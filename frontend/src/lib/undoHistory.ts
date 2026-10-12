import { isOnline, supabase } from '@/lib/supabase';
import { clearUserCache } from '@/lib/localCache';

const STORAGE_KEY = 'contractor_pro_last_undo_v1';
export const UNDO_CHANGE_EVENT = 'contractor-pro-undo-change';

export type UndoTable =
  | 'workers'
  | 'worker_wage_history'
  | 'worker_overtime_history'
  | 'team_memberships'
  | 'contractors'
  | 'workshops'
  | 'workshop_contracts'
  | 'daily_registrations'
  | 'claims'
  | 'worker_payments'
  | 'wallet_accounts'
  | 'wallet_transactions'
  | 'tax_calculations'
  | 'extra_work'
  | 'documents'
  | 'tax_submissions'
  | 'tax_invoices'
  | 'tasks'
  | 'attachments';

export interface UndoChange {
  table: UndoTable;
  ids: string[];
}

export interface UndoRestore {
  table: UndoTable;
  rows: Record<string, unknown>[];
}

export interface UndoAction {
  userId: string;
  changes: UndoChange[];
  restoreRows?: UndoRestore[];
  unclaimRegistrationIds?: string[];
  restoreClaim?: { id: string; status: string };
  createdAt: string;
}

function notifyUndoChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(UNDO_CHANGE_EVENT));
  }
}

export function getLastUndoAction(userId: string): UndoAction | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const action = JSON.parse(value) as UndoAction;
    if (action.userId !== userId || !Array.isArray(action.changes)) return null;
    if (action.changes.length === 0 && !action.restoreRows?.some((group) => group.rows.length > 0)) return null;
    return action;
  } catch {
    return null;
  }
}

export function recordUndoAction(
  userId: string,
  changes: UndoChange[],
  options: Pick<UndoAction, 'restoreRows' | 'unclaimRegistrationIds' | 'restoreClaim'> = {},
): void {
  if (!userId || (!changes.length && !options.restoreRows?.some((group) => group.rows.length > 0))) return;
  try {
    const action: UndoAction = {
      userId,
      changes,
      ...options,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(action));
    notifyUndoChange();
  } catch {
    // Undo history is best-effort and must not block a successful write.
  }
}

export function clearLastUndoAction(userId: string): void {
  const action = getLastUndoAction(userId);
  if (!action) return;
  localStorage.removeItem(STORAGE_KEY);
  notifyUndoChange();
}

export async function undoLastAddition(userId: string): Promise<boolean> {
  if (!isOnline()) throw new Error('Undo requires an internet connection');
  const action = getLastUndoAction(userId);
  if (!action) return false;

  for (const change of action.changes) {
    const { error } = await supabase
      .from(change.table)
      .delete()
      .eq('user_id', userId)
      .in('id', change.ids);
    if (error) throw error;
  }

  for (const group of action.restoreRows ?? []) {
    for (const row of group.rows) {
      const { id, user_id: rowUserId, ...values } = row;
      if (typeof id !== 'string' || rowUserId !== userId) continue;
      const { error } = await supabase
        .from(group.table)
        .update(values)
        .eq('user_id', userId)
        .eq('id', id);
      if (error) throw error;
    }
  }

  if (action.unclaimRegistrationIds?.length) {
    const { error } = await supabase
      .from('daily_registrations')
      .update({ is_claimed: false })
      .eq('user_id', userId)
      .in('id', action.unclaimRegistrationIds);
    if (error) throw error;
  }

  if (action.restoreClaim) {
    const { error } = await supabase
      .from('claims')
      .update({ status: action.restoreClaim.status })
      .eq('user_id', userId)
      .eq('id', action.restoreClaim.id);
    if (error) throw error;
  }

  await clearUserCache(userId);
  clearLastUndoAction(userId);
  return true;
}

import { supabase } from '@/lib/supabase';
import { createTask, getTasks, deleteTask } from '@/lib/dataAccess';
import type { Task } from '@/types';

export async function generateAutoTasks(userId: string): Promise<void> {
  const existing = await getTasks(userId, 'pending');
  const existingKeys = new Set(existing.filter((t) => t.is_auto_generated).map((t) => `${t.category}|${t.title}`));

  const today = new Date().toISOString().split('T')[0];
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  };

  const candidates: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at'>[] = [];

  // Claims not yet sent
  const { data: claims } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['draft', 'prepared']);
  for (const c of claims || []) {
    candidates.push({
      user_id: userId, title: `Claim ${c.claim_number} not yet sent`,
      description: `Claim ${c.claim_number} is prepared but not sent to the contractor.`,
      category: 'claims', priority: 'high', due_date: today,
      related_entity_type: 'claim', related_entity_id: c.id,
      status: 'pending', is_auto_generated: true,
    });
  }

  // Claims sent but not received
  const { data: sentClaims } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['sent', 'partially_received']);
  for (const c of sentClaims || []) {
    candidates.push({
      user_id: userId, title: `Claim ${c.claim_number} awaiting payment`,
      description: `Claim ${c.claim_number} was sent but not yet fully received.`,
      category: 'claims', priority: 'medium', due_date: inDays(7),
      related_entity_type: 'claim', related_entity_id: c.id,
      status: 'pending', is_auto_generated: true,
    });
  }

  // Documents not reviewed
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title')
    .eq('user_id', userId)
    .eq('ocr_reviewed', false);
  for (const d of docs || []) {
    candidates.push({
      user_id: userId, title: `Document "${d.title}" needs review`,
      description: `Document OCR data has not been reviewed yet.`,
      category: 'documents', priority: 'medium', due_date: today,
      related_entity_type: 'document', related_entity_id: d.id,
      status: 'pending', is_auto_generated: true,
    });
  }

  // Tax submissions approaching deadline
  const { data: taxSubs } = await supabase
    .from('tax_submissions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending');
  for (const s of taxSubs || []) {
    const daysUntil = Math.ceil((new Date(s.due_date).getTime() - Date.now()) / 86400000);
    if (daysUntil <= 14 && daysUntil >= -30) {
      candidates.push({
        user_id: userId, title: `Tax deadline approaching: ${s.obligation_type} for ${s.reporting_period}`,
        description: `Due date: ${s.due_date}. Status: ${s.status}.`,
        category: 'tax', priority: daysUntil <= 3 ? 'urgent' : 'high',
        due_date: s.due_date,
        related_entity_type: 'tax_submission', related_entity_id: s.id,
        status: 'pending', is_auto_generated: true,
      });
    }
  }

  // Workshops nearing end date
  const { data: workshops } = await supabase
    .from('workshops')
    .select('id, name, end_date')
    .eq('user_id', userId)
    .eq('is_active', true)
    .not('end_date', 'is', null);
  for (const w of workshops || []) {
    if (!w.end_date) continue;
    const daysUntil = Math.ceil((new Date(w.end_date).getTime() - Date.now()) / 86400000);
    if (daysUntil <= 14 && daysUntil >= 0) {
      candidates.push({
        user_id: userId, title: `Workshop "${w.name}" nearing end date`,
        description: `End date: ${w.end_date}.`,
        category: 'workshops', priority: 'medium', due_date: w.end_date,
        related_entity_type: 'workshop', related_entity_id: w.id,
        status: 'pending', is_auto_generated: true,
      });
    }
  }

  // Backup status
  const { data: settings } = await supabase
    .from('app_settings')
    .select('last_backup_at, last_backup_status, backup_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (settings?.backup_enabled && settings?.last_backup_status === 'failed') {
    candidates.push({
      user_id: userId, title: 'Backup failed',
      description: 'The last backup attempt failed. Please check your connection and try again.',
      category: 'backup', priority: 'high', due_date: today,
      related_entity_type: '', related_entity_id: null,
      status: 'pending', is_auto_generated: true,
    });
  }
  if (settings?.backup_enabled && settings?.last_backup_at) {
    const daysSinceBackup = Math.ceil((Date.now() - new Date(settings.last_backup_at).getTime()) / 86400000);
    if (daysSinceBackup > 2) {
      candidates.push({
        user_id: userId, title: 'Backup overdue',
        description: `Last backup was ${daysSinceBackup} days ago.`,
        category: 'backup', priority: 'medium', due_date: today,
        related_entity_type: '', related_entity_id: null,
        status: 'pending', is_auto_generated: true,
      });
    }
  }

  // Only create tasks that don't already exist
  for (const c of candidates) {
    const key = `${c.category}|${c.title}`;
    if (!existingKeys.has(key)) {
      await createTask(c);
    }
  }

  // Clean up old dismissed/completed auto-tasks that are no longer relevant
  const oldTasks = await getTasks(userId);
  const relevantKeys = new Set(candidates.map((c) => `${c.category}|${c.title}`));
  for (const t of oldTasks) {
    if (t.is_auto_generated && (t.status === 'dismissed' || t.status === 'completed')) {
      const key = `${t.category}|${t.title}`;
      if (!relevantKeys.has(key)) {
        await deleteTask(t.id);
      }
    }
  }
}

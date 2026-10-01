import { supabase } from '@/lib/supabase';
import { addAuditLog } from '@/lib/dataAccess';

function downloadJsonFile(jsonStr: string, fileName: string) {
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const reader = new FileReader();

  reader.onloadend = () => {
    const dataUri = reader.result as string;
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 100);
  };

  reader.onerror = () => {
    // Fallback: try Blob URL approach (works on some desktop browsers)
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 200);
    } catch {
      // Last resort: open the JSON in a new tab so the user can save manually
      window.open('data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr), '_blank');
    }
  };

  // Convert blob to data URI — this works on mobile Safari/Chrome where
  // programmatic Blob URL clicks are silently blocked.
  reader.readAsDataURL(blob);
}

const BACKUP_TABLES = [
  'business_profiles', 'workers', 'worker_wage_history', 'worker_overtime_history',
  'team_memberships', 'contractors', 'workshops', 'workshop_contracts',
  'daily_registrations', 'claims', 'claim_lines', 'worker_payments',
  'wallet_accounts', 'wallet_transactions', 'tax_rules', 'app_settings',
  'audit_logs', 'extra_work', 'documents', 'tax_submissions',
  'tax_invoices', 'tasks', 'attachments', 'feature_flags', 'user_roles',
  'account_management', 'tax_calculations',
];

export interface BackupResult {
  success: boolean;
  recordId: string;
  fileSize: number;
  recordCount: number;
  filePath: string;
  error?: string;
}

export async function performBackup(userId: string, type: 'manual' | 'scheduled' = 'manual'): Promise<BackupResult> {
  // Create backup record as in_progress
  const { data: record, error: recordError } = await supabase
    .from('backup_records')
    .insert({
      user_id: userId,
      status: 'in_progress',
      backup_type: type,
    })
    .select()
    .single();

  if (recordError || !record) {
    return { success: false, recordId: '', fileSize: 0, recordCount: 0, filePath: '', error: 'Failed to create backup record' };
  }

  const recordId = record.id;

  try {
    // Collect all business data
    const exportData: Record<string, unknown> = {
      schema_version: '1.0.0',
      backup_created_at: new Date().toISOString(),
      user_id: userId,
    };

    let totalRecords = 0;
    for (const table of BACKUP_TABLES) {
      const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);
      if (error) {
        console.warn(`Backup: could not read table ${table}:`, error.message);
        continue;
      }
      if (data && data.length > 0) {
        exportData[table] = data;
        totalRecords += data.length;
      }
    }

    const jsonStr = JSON.stringify(exportData, null, 2);
    const fileSize = new Blob([jsonStr]).size;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = `${userId}/backup-${timestamp}.json`;
    const fileName = `backup-${timestamp}.json`;

    // Mobile-friendly local download — this is the primary delivery method.
    // Blob URLs + programmatic a.click() fail on mobile Safari/Chrome.
    // We use a data-URI with a DOM-attached anchor instead, which works everywhere.
    downloadJsonFile(jsonStr, fileName);

    // Best-effort cloud upload to Supabase Storage (non-fatal if it fails)
    let cloudUploaded = false;
    try {
      await supabase.storage.createBucket('backups', { public: false }).catch(() => {});
      const { error: uploadError } = await supabase.storage
        .from('backups')
        .upload(filePath, jsonStr, {
          contentType: 'application/json',
          upsert: false,
        });
      cloudUploaded = !uploadError;
    } catch {
      // Storage upload is optional — local download already succeeded
    }

    // Update backup record as success
    await supabase.from('backup_records').update({
      status: 'success',
      file_path: cloudUploaded ? filePath : `local:${fileName}`,
      file_size: fileSize,
      record_count: totalRecords,
      completed_at: new Date().toISOString(),
    }).eq('id', recordId);

    // Update app_settings with last backup info
    await supabase.from('app_settings').upsert({
      user_id: userId,
      last_backup_at: new Date().toISOString(),
      last_backup_status: 'success',
      last_backup_size: fileSize,
    }, { onConflict: 'user_id' });

    await addAuditLog({
      user_id: userId,
      action: 'backup_created',
      entity_type: 'backup',
      entity_id: recordId,
      details: { status: 'success', file_size: fileSize, record_count: totalRecords, file_path: filePath },
    });

    return { success: true, recordId, fileSize, recordCount: totalRecords, filePath };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';

    // Mark backup record as failed — do NOT delete previous successful backups
    await supabase.from('backup_records').update({
      status: 'failed',
      error_message: errorMsg,
      completed_at: new Date().toISOString(),
    }).eq('id', recordId);

    // Update app_settings with failed status but keep previous last_backup_at
    await supabase.from('app_settings').upsert({
      user_id: userId,
      last_backup_status: 'failed',
    }, { onConflict: 'user_id' });

    await addAuditLog({
      user_id: userId,
      action: 'backup_failed',
      entity_type: 'backup',
      entity_id: recordId,
      details: { status: 'failed', error: errorMsg },
    });

    return { success: false, recordId, fileSize: 0, recordCount: 0, filePath: '', error: errorMsg };
  }
}

export async function checkAndRunScheduledBackup(userId: string, settings: { backup_enabled: boolean; backup_time: string; last_backup_at: string | null }): Promise<BackupResult | null> {
  if (!settings.backup_enabled) return null;

  const now = new Date();
  const [bh, bm] = settings.backup_time.split(':').map(Number);
  const target = new Date(now);
  target.setHours(bh, bm, 0, 0);

  if (now < target) return null;

  const todayStr = now.toISOString().split('T')[0];
  if (settings.last_backup_at && settings.last_backup_at.split('T')[0] === todayStr) {
    const lastDate = new Date(settings.last_backup_at);
    if (lastDate.getTime() >= target.getTime()) return null;
  }

  return performBackup(userId, 'scheduled');
}

export async function performBackupWithRetry(userId: string, type: 'manual' | 'scheduled' = 'manual', maxRetries = 3): Promise<BackupResult> {
  let lastResult: BackupResult | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    lastResult = await performBackup(userId, type);
    if (lastResult.success) return lastResult;
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return lastResult!;
}

export async function getBackupRecords(userId: string) {
  const { data, error } = await supabase
    .from('backup_records')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data;
}

export async function restoreBackup(userId: string, filePath: string): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const { data, error } = await supabase.storage
      .from('backups')
      .download(filePath);

    if (error || !data) {
      return { success: false, error: error?.message || 'Download failed' };
    }

    const text = await data.text();
    const parsed = JSON.parse(text);
    return { success: true, data: parsed };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

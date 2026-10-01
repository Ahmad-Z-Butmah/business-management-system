import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon, Building2, Upload, Trash2, Loader2,
  Globe, Clock, Database, RefreshCw, CheckCircle2, AlertCircle,
  History, Shield, Info, Download, UserX, FileJson,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { LoadingSpinner } from '@/components/Common';
import {
  getBusinessProfile, upsertBusinessProfile,
  getSettings, upsertSettings, getAuditLogs, addAuditLog,
} from '@/lib/dataAccess';
import { supabase, isOnline, enqueueWrite } from '@/lib/supabase';
import { performBackup, getBackupRecords } from '@/lib/backupService';
import type { BusinessProfile, AppSettings, Language, AuditLog } from '@/types';

const FAVICON_LINK_ID = 'dynamic-favicon';
const MANIFEST_LINK_ID = 'dynamic-manifest';

/**
 * Update the browser tab favicon and PWA manifest icons to the uploaded logo.
 * Falls back to the default icon when no logo is set.
 */
function applyDynamicFavicon(logoUrl: string | null) {
  if (!logoUrl) return;

  // --- Favicon (browser tab + home screen icon) ---
  let iconLink = document.querySelector<HTMLLinkElement>(`#${FAVICON_LINK_ID}`);
  if (!iconLink) {
    iconLink = document.createElement('link');
    iconLink.id = FAVICON_LINK_ID;
    iconLink.rel = 'icon';
    document.head.appendChild(iconLink);
  }
  iconLink.href = logoUrl;

  // Also update apple-touch-icon (iOS home screen)
  let appleLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!appleLink) {
    appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    document.head.appendChild(appleLink);
  }
  appleLink.href = logoUrl;

  // --- PWA Manifest ---
  let manifestLink = document.querySelector<HTMLLinkElement>(`#${MANIFEST_LINK_ID}`);
  if (!manifestLink) {
    manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  }

  if (manifestLink) {
    try {
      const manifestHref = manifestLink.href;
      // Fetch the existing manifest, patch icons, and re-inject as a blob URL
      fetch(manifestHref)
        .then((r) => r.json())
        .then((manifest: { icons?: { src: string; sizes: string; type?: string }[] }) => {
          if (!manifest.icons) manifest.icons = [];
          const iconSizes = ['192x192', '512x512', 'any'];
          for (const size of iconSizes) {
            const existing = manifest.icons.find((i) => i.sizes === size);
            if (existing) {
              existing.src = logoUrl;
            } else {
              manifest.icons.push({ src: logoUrl, sizes: size, type: 'image/png' });
            }
          }
          const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
          const blobUrl = URL.createObjectURL(blob);
          const newLink = document.createElement('link');
          newLink.id = MANIFEST_LINK_ID;
          newLink.rel = 'manifest';
          newLink.href = blobUrl;
          // Remove old manifest link and replace
          const oldLink = document.querySelector('link[rel="manifest"]');
          if (oldLink) oldLink.remove();
          document.head.appendChild(newLink);
        })
        .catch(() => { /* manifest fetch optional */ });
    } catch { /* no manifest support */ }
  }
}

function restoreDefaultFavicon() {
  const dynamicIcon = document.querySelector(`#${FAVICON_LINK_ID}`);
  if (dynamicIcon) dynamicIcon.remove();
  const appleLink = document.querySelector('link[rel="apple-touch-icon"]');
  if (appleLink) appleLink.remove();
  const dynamicManifest = document.querySelector(`#${MANIFEST_LINK_ID}`);
  if (dynamicManifest) dynamicManifest.remove();

  // Restore original manifest if it existed
  const originalManifest = document.querySelector('link[data-original-manifest]');
  if (originalManifest) {
    const restored = document.createElement('link');
    restored.rel = 'manifest';
    restored.href = originalManifest.getAttribute('data-original-manifest') || '/manifest.webmanifest';
    document.head.appendChild(restored);
  }
}

export function Settings() {
  const { t, language, setLanguage, formatDate, formatNumber } = useI18n();
  const { user, settings, refreshSettings } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backupRecords, setBackupRecords] = useState<{ id: string; status: string; file_size: number; record_count: number; backup_type: string; created_at: string; completed_at: string | null; error_message: string }[]>([]);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [logoUrl, setLogoUrl] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [profileForm, setProfileForm] = useState({
    business_name: '',
    phone: '',
    address: '',
    logo_url: '',
    currency: 'ILS',
  });

  const [settingsForm, setSettingsForm] = useState({
    language: 'ar' as Language,
    backup_time: '02:00',
    backup_enabled: true,
  });

  const PROFILE_KEY = 'company_profile';

  const load = async () => {
    if (!user) return;

    // Step 1: Immediately load from localStorage so the form is never empty
    const localJson = localStorage.getItem(PROFILE_KEY);
    if (localJson) {
      try {
        const local = JSON.parse(localJson);
        setProfileForm({
          business_name: local.business_name || '',
          phone: local.phone || '',
          address: local.address || '',
          logo_url: local.logo_url || '',
          currency: local.currency || 'ILS',
        });
        setLogoUrl(local.logo_url || '');
        if (local.logo_url) applyDynamicFavicon(local.logo_url);
      } catch { /* corrupt JSON — ignore */ }
    }

    // Step 2: Load from Supabase (authoritative) and merge if online
    try {
      const [p, logs, backups] = await Promise.all([
        getBusinessProfile(user.id),
        getAuditLogs(user.id, 20),
        getBackupRecords(user.id),
      ]);
      setProfile(p);
      const existingCurrency = p?.currency || 'ILS';
      const formValues = {
        business_name: p?.business_name || '',
        phone: p?.phone || '',
        address: p?.address || '',
        logo_url: p?.logo_url || '',
        currency: existingCurrency,
      };
      setProfileForm(formValues);
      setLogoUrl(formValues.logo_url);
      if (formValues.logo_url) {
        applyDynamicFavicon(formValues.logo_url);
      }
      // Persist the authoritative copy to localStorage too
      localStorage.setItem(PROFILE_KEY, JSON.stringify(formValues));
      setAuditLogs(logs as AuditLog[]);
      setBackupRecords(backups);
    } catch (e) {
      // DB error / offline — localStorage copy from Step 1 is already loaded
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (settings) {
      setSettingsForm({
        language: settings.language,
        backup_time: settings.backup_time,
        backup_enabled: settings.backup_enabled,
      });
    }
  }, [settings]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Group ALL profile fields (name, phone, address, logo) into a single object
      const companyProfile = {
        business_name: profileForm.business_name,
        phone: profileForm.phone,
        address: profileForm.address,
        logo_url: profileForm.logo_url,
        currency: profileForm.currency,
      };

      // Step 1: Always save to localStorage immediately — guaranteed persistence
      localStorage.setItem(PROFILE_KEY, JSON.stringify(companyProfile));

      // Update favicon/PWA icon with the logo string
      if (companyProfile.logo_url) {
        applyDynamicFavicon(companyProfile.logo_url);
      } else {
        restoreDefaultFavicon();
      }

      // Step 2: Save to Supabase (the authoritative source)
      const supabasePayload = {
        user_id: user.id,
        ...companyProfile,
      };

      if (isOnline()) {
        await upsertBusinessProfile(supabasePayload);
        await addAuditLog({ user_id: user.id, action: 'profile_updated', entity_type: 'business_profile' });
      } else {
        // Offline: queue the write for background sync when connection returns
        await enqueueWrite('business_profiles', 'upsert', supabasePayload, 'user_id');
      }

      showToast('success', t('profileSaved'));
    } catch (e) {
      // Even if Supabase fails, all data is already in localStorage
      console.error('Save profile error:', e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = { user_id: user.id, ...settingsForm };

      if (isOnline()) {
        await upsertSettings(payload);
        setLanguage(settingsForm.language);
        await refreshSettings();
        await addAuditLog({ user_id: user.id, action: 'settings_updated', entity_type: 'app_settings' });
      } else {
        await enqueueWrite('app_settings', 'upsert', payload, 'user_id');
        setLanguage(settingsForm.language);
      }

      showToast('success', t('settingsSaved'));
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      showToast('error', t('failedToSave'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('error', t('failedToSave'));
      return;
    }

    setUploadingLogo(true);

    // Generate a preview immediately via FileReader (instant UI feedback)
    const reader = new FileReader();
    reader.onloadend = () => {
      const preview = reader.result as string;
      setLogoUrl(preview);
      applyDynamicFavicon(preview);
    };
    reader.readAsDataURL(file);

    try {
      if (isOnline()) {
        // Upload to Supabase Storage — get a public URL that persists
        const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `logos/${user.id}/logo.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, file, { upsert: true });

        let publicUrl: string;
        if (uploadError) {
          // If storage fails, fall back to base64 data URL
          const dataUrl = await new Promise<string>((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.readAsDataURL(file);
          });
          publicUrl = dataUrl;
        } else {
          const { data: urlData } = supabase.storage
            .from('documents')
            .getPublicUrl(fileName);
          publicUrl = urlData.publicUrl + `?t=${Date.now()}`; // cache-bust
        }

        setLogoUrl(publicUrl);
        setProfileForm((prev) => ({ ...prev, logo_url: publicUrl }));
        applyDynamicFavicon(publicUrl);
      } else {
        // Offline: store as base64 data URL locally, queue will sync metadata later
        const dataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result as string);
          r.readAsDataURL(file);
        });
        setLogoUrl(dataUrl);
        setProfileForm((prev) => ({ ...prev, logo_url: dataUrl }));
        applyDynamicFavicon(dataUrl);
      }
    } catch (err) {
      console.error('Logo upload failed:', err);
      // Still keep the FileReader preview that was set earlier
      setProfileForm((prev) => ({ ...prev, logo_url: logoUrl }));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
    setProfileForm((prev) => ({ ...prev, logo_url: '' }));
    restoreDefaultFavicon();
  };

  const handleBackupNow = async () => {
    if (!user) return;
    setBackingUp(true);
    try {
      const result = await performBackup(user.id, 'manual');
      if (result.success) {
        showToast('success', `${t('backupSuccess')} (${result.recordCount} ${t('records')}, ${formatNumber(Math.round(result.fileSize / 1024))} KB)`);
      } else {
        showToast('error', `${t('backupFailed')}: ${result.error}`);
      }
      await refreshSettings();
      await load();
    } catch (e) {
      console.error(e);
      showToast('error', t('backupFailed'));
    } finally {
      setBackingUp(false);
    }
  };

  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const tables = [
        'business_profiles', 'workers', 'worker_wage_history', 'worker_overtime_history',
        'team_memberships', 'contractors', 'workshops', 'workshop_contracts',
        'daily_registrations', 'claims', 'claim_lines', 'worker_payments',
        'wallet_accounts', 'wallet_transactions', 'tax_rules', 'app_settings',
        'audit_logs', 'extra_work', 'documents', 'tax_submissions',
        'tax_invoices', 'tasks', 'attachments', 'feature_flags', 'user_roles', 'account_management',
      ];
      const exportData: Record<string, unknown> = {
        schema_version: '1.0.0',
        exported_at: new Date().toISOString(),
        user_id: user.id,
      };
      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').eq('user_id', user.id);
        if (!error && data) {
          exportData[table] = data;
        }
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contractor-pro-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('success', t('dataExported'));
    } catch (e) {
      console.error(e);
      showToast('error', t('exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !deleteConfirm) return;
    setDeleting(true);
    try {
      const { error } = await supabase.auth.admin?.deleteUser?.(user.id) ?? { error: null };
      if (error && !error.message.includes('not')) {
        // Fallback: mark account as pending deletion
        await supabase.from('account_management').upsert({
          user_id: user.id,
          account_status: 'pending_deletion',
          plan: 'free',
          deletion_requested_at: new Date().toISOString(),
          deletion_scheduled_for: new Date(Date.now() + 30 * 86400000).toISOString(),
        }, { onConflict: 'user_id' });
      }
      await addAuditLog({ user_id: user.id, action: 'account_deletion_requested', entity_type: 'account' });
      showToast('success', t('accountDeleted'));
      await supabase.auth.signOut();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const languages: { code: Language; label: string }[] = [
    { code: 'ar', label: t('arabic') },
    { code: 'he', label: t('hebrew') },
    { code: 'en', label: t('english') },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">{t('settings')}</h1>

      {/* Business Profile */}
      <div className="card p-6">
        <h3 className="section-title mb-5 flex items-center gap-2">
          <Building2 size={18} className="text-primary-600" />
          {t('businessProfile')}
        </h3>

        {/* Logo */}
        <div className="mb-5">
          <label className="label">{t('logo')}</label>
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="logo" className="w-20 h-20 rounded-xl object-cover border border-neutral-200" />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-400">
                <Building2 size={32} />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className={`btn-secondary cursor-pointer text-sm ${uploadingLogo ? 'pointer-events-none opacity-60' : ''}`}>
                {uploadingLogo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {uploadingLogo ? t('saving') : logoUrl ? t('replaceLogo') : t('uploadLogo')}
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
              </label>
              {logoUrl && (
                <button onClick={handleRemoveLogo} className="btn-ghost text-error-600 text-sm">
                  <Trash2 size={16} /> {t('removeLogo')}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="input-group">
            <label className="label">{t('businessName')}</label>
            <input value={profileForm.business_name} onChange={(e) => setProfileForm({ ...profileForm, business_name: e.target.value })} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('phone')}</label>
            <input value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} className="input" />
          </div>
          <div className="sm:col-span-2 input-group">
            <label className="label">{t('address')}</label>
            <input value={profileForm.address} onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })} className="input" />
          </div>
        </div>

        <button onClick={handleSaveProfile} className="btn-primary mt-5" disabled={saving}>
          {saving && <Loader2 size={16} className="animate-spin" />}
          {t('saveChanges')}
        </button>
      </div>

      {/* App Settings */}
      <div className="card p-6">
        <h3 className="section-title mb-5 flex items-center gap-2">
          <Globe size={18} className="text-primary-600" />
          {t('settings')}
        </h3>

        <div className="space-y-5">
          <div className="input-group">
            <label className="label">{t('language')}</label>
            <div className="flex gap-2">
              {languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setSettingsForm({ ...settingsForm, language: l.code })}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    settingsForm.language === l.code
                      ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:-translate-y-0.5'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSaveSettings} className="btn-primary" disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" />}
            {t('saveChanges')}
          </button>
        </div>
      </div>

      {/* Backup Settings */}
      <div className="card p-6">
        <h3 className="section-title mb-5 flex items-center gap-2">
          <Database size={18} className="text-primary-600" />
          {t('backupStatus')}
        </h3>

        <div className="space-y-5">
          <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-neutral-50/80">
            <span className="text-sm text-neutral-600">{t('backupEnabled')}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settingsForm.backup_enabled}
                onChange={(e) => setSettingsForm({ ...settingsForm, backup_enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-200 rounded-full peer peer-checked:bg-success-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:start-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5"></div>
            </label>
          </div>

          <div className="input-group">
            <label className="label flex items-center gap-2"><Clock size={14} /> {t('backupTime')}</label>
            <input type="time" value={settingsForm.backup_time} onChange={(e) => setSettingsForm({ ...settingsForm, backup_time: e.target.value })} className="input max-w-xs" />
          </div>

          {/* Backup status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-neutral-50/80">
              <p className="text-xs text-neutral-400">{t('lastBackup')}</p>
              <p className="text-sm font-semibold text-neutral-900 mt-1">
                {settings?.last_backup_at ? formatDate(settings.last_backup_at) : t('noBackup')}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50/80">
              <p className="text-xs text-neutral-400">{t('backupSize')}</p>
              <p className="text-sm font-semibold text-neutral-900 mt-1">
                {settings?.last_backup_size ? `${formatNumber(Math.round(settings.last_backup_size / 1024))} KB` : '-'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleBackupNow} className="btn-primary" disabled={backingUp}>
              {backingUp ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {t('backupNow')}
            </button>
            <button onClick={handleSaveSettings} className="btn-secondary" disabled={saving}>
              {t('saveChanges')}
            </button>
          </div>
        </div>
      </div>

      {/* Security info */}
      <div className="card p-6">
        <h3 className="section-title mb-4 flex items-center gap-2">
          <Shield size={18} className="text-success-600" />
          {t('secureAuth')}
        </h3>
        <div className="flex items-start gap-3 p-4 rounded-xl bg-success-50 text-success-700 text-sm">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          <div>
            <p>{t('yourDataIsSafe')}</p>
            <p className="text-xs mt-1 text-success-600">{t('dataIsolated')} · {t('newDeviceRecovery')}: {t('recoveryInstructions')}</p>
          </div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="card p-6">
        <h3 className="section-title mb-5 flex items-center gap-2">
          <History size={18} className="text-primary-600" />
          {t('backupHistory')}
        </h3>
        {backupRecords.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-6">{t('noBackupHistory')}</p>
        ) : (
          <div className="space-y-1.5">
            {backupRecords.map((rec) => (
              <div key={rec.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl hover:bg-neutral-50 text-sm transition-colors">
                <div className="flex items-center gap-2.5">
                  {rec.status === 'success' ? (
                    <CheckCircle2 size={16} className="text-success-600" />
                  ) : rec.status === 'failed' ? (
                    <AlertCircle size={16} className="text-error-500" />
                  ) : (
                    <Loader2 size={16} className="text-warning-500 animate-spin" />
                  )}
                  <span className="text-neutral-600">
                    {rec.status === 'success' ? t('backupSuccess') : rec.status === 'failed' ? t('backupFailed') : t('saving')}
                    {rec.record_count > 0 && ` · ${rec.record_count} ${t('records')}`}
                    {rec.file_size > 0 && ` · ${formatNumber(Math.round(rec.file_size / 1024))} KB`}
                  </span>
                </div>
                <span className="text-xs text-neutral-400">{formatDate(rec.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Data Export */}
      <div className="card p-6">
        <h3 className="section-title mb-4 flex items-center gap-2">
          <Download size={18} className="text-primary-600" />
          {t('exportData')}
        </h3>
        <p className="text-sm text-neutral-500 mb-5">{t('exportDescription')}</p>
        <button onClick={handleExportData} className="btn-primary" disabled={exporting}>
          {exporting ? <Loader2 size={16} className="animate-spin" /> : <FileJson size={16} />}
          {t('exportData')}
        </button>
      </div>

      {/* Account Management */}
      <div className="card p-6">
        <h3 className="section-title mb-4 flex items-center gap-2">
          <Shield size={18} className="text-primary-600" />
          {t('accountManagement')}
        </h3>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <CheckCircle2 size={16} className="text-success-600" />
            <span>{t('privacyPolicy')}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <CheckCircle2 size={16} className="text-success-600" />
            <span>{t('termsOfService')}</span>
          </div>
          <div className="pt-4 border-t border-neutral-100">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-error-50 text-error-700 text-sm mb-4">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <p>{t('deleteAccountWarning')}</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer mb-4">
              <input type="checkbox" checked={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.checked)} className="w-4 h-4 rounded text-error-600" />
              <span className="text-sm text-neutral-700">{t('deleteAccountConfirm')}</span>
            </label>
            <button onClick={handleDeleteAccount} className="btn-error" disabled={!deleteConfirm || deleting}>
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <UserX size={16} />}
              {t('deleteAccount')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

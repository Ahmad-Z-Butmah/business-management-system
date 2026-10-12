import { useState, useEffect } from 'react';
import {
  Plus, FileStack, Edit2, Trash2, Loader2, Camera, Upload,
  Check, AlertCircle, FileText, Search,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/Common';
import {
  getDocuments, createDocument, updateDocument, deleteDocument,
  getContractors, getWorkshops, addAuditLog,
} from '@/lib/dataAccess';
import type { DocumentItem, DocumentCategory, DocumentStatus, Contractor, Workshop } from '@/types';

export function DocumentVault() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | DocumentCategory>('all');
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    title: '',
    category: 'business_expense' as DocumentCategory,
    image_url: '',
    document_date: new Date().toISOString().split('T')[0],
    due_date: '',
    invoice_number: '',
    supplier_name: '',
    amount: 0,
    vat_amount: 0,
    total: 0,
    description: '',
    ocr_reviewed: false,
    contractor_id: '',
    workshop_id: '',
    status: 'pending' as DocumentStatus,
    notes: '',
  });

  const load = async () => {
    if (!user) return;
    try {
      const [d, c, w] = await Promise.all([
        getDocuments(user.id),
        getContractors(user.id, true),
        getWorkshops(user.id, true),
      ]);
      setDocuments(d);
      setContractors(c);
      setWorkshops(w);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const filtered = documents.filter((d) => {
    const matchesCat = filterCategory === 'all' || d.category === filterCategory;
    const matchesSearch = !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
      d.invoice_number.includes(search);
    return matchesCat && matchesSearch;
  });

  const toReview = documents.filter((d) => !d.ocr_reviewed);
  const notSent = documents.filter((d) => d.category === 'customer_billing' && d.status === 'pending');
  const customerDocs = documents.filter((d) => d.category === 'customer_billing');
  const expenseDocs = documents.filter((d) => d.category === 'business_expense');

  const openAdd = () => {
    setEditing(null);
    setForm({
      title: '', category: 'business_expense', image_url: '',
      document_date: new Date().toISOString().split('T')[0], due_date: '',
      invoice_number: '', supplier_name: '', amount: 0, vat_amount: 0, total: 0,
      description: '', ocr_reviewed: false, contractor_id: '', workshop_id: '',
      status: 'pending', notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (doc: DocumentItem) => {
    setEditing(doc);
    setForm({
      title: doc.title, category: doc.category, image_url: doc.image_url,
      document_date: doc.document_date || '', due_date: doc.due_date || '',
      invoice_number: doc.invoice_number, supplier_name: doc.supplier_name,
      amount: doc.amount, vat_amount: doc.vat_amount, total: doc.total,
      description: doc.description, ocr_reviewed: doc.ocr_reviewed,
      contractor_id: doc.contractor_id || '', workshop_id: doc.workshop_id || '',
      status: doc.status, notes: doc.notes,
    });
    setModalOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setForm((prev) => ({ ...prev, image_url: reader.result as string }));
      // Simulate OCR extraction
      setForm((prev) => ({
        ...prev,
        ocr_reviewed: false,
        title: prev.title || file.name.replace(/\.[^/.]+$/, ''),
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!user || !form.title.trim()) return;
    setSaving(true);
    try {
      const data = {
        ...form,
        contractor_id: form.contractor_id || null,
        workshop_id: form.workshop_id || null,
        document_date: form.document_date || null,
        due_date: form.due_date || null,
        related_claim_id: null,
        user_id: user.id,
        ocr_data: {},
      };
      if (editing) {
        await updateDocument(editing.id, data);
        showToast('success', t('changesSaved'));
      } else {
        await createDocument(data);
        await addAuditLog({ user_id: user.id, action: 'document_created', entity_type: 'document' });
        showToast('success', t('createSuccess'));
      }
      setModalOpen(false);
      await load();
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
      await deleteDocument(deleteTarget.id);
      showToast('success', t('deleteSuccess'));
      setDeleteTarget(null);
      await load();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    }
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">{t('documentVault')}</h1>
        <button onClick={openAdd} className="btn-primary"><Plus size={18} /> {t('addDocument')}</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('documentsToReview')}</p>
          <p className="text-lg font-bold text-warning-600 mt-1">{toReview.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('documentsNotSent')}</p>
          <p className="text-lg font-bold text-error-600 mt-1">{notSent.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('customerBillingDocs')}</p>
          <p className="text-lg font-bold text-primary-600 mt-1">{customerDocs.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('expenseDocs')}</p>
          <p className="text-lg font-bold text-neutral-700 mt-1">{expenseDocs.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute top-3.5 start-3.5 text-neutral-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} className="input ps-11" />
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value as typeof filterCategory)} className="input sm:w-48">
          <option value="all">{t('all')}</option>
          <option value="customer_billing">{t('customerBilling')}</option>
          <option value="business_expense">{t('businessExpense')}</option>
        </select>
      </div>

      {/* Documents list */}
      {filtered.length === 0 ? (
        <EmptyState icon={<FileStack size={48} />} title={t('noDocuments')} action={<button onClick={openAdd} className="btn-primary"><Plus size={16} /> {t('addDocument')}</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc) => (
            <div key={doc.id} className="card-hover p-5">
              <div className="flex items-start gap-3 mb-4">
                {doc.image_url ? (
                  <img src={doc.image_url} alt={doc.title} className="w-14 h-14 rounded-xl object-cover border border-neutral-200 shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-neutral-100 flex items-center justify-center text-neutral-400 shrink-0">
                    <FileText size={24} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-neutral-900 truncate">{doc.title}</p>
                  <p className="text-xs text-neutral-500">{doc.supplier_name || '-'} · {doc.document_date ? formatDate(doc.document_date) : '-'}</p>
                </div>
                <span className={doc.category === 'customer_billing' ? 'badge-primary' : 'badge-neutral'}>
                  {doc.category === 'customer_billing' ? t('customerBilling') : t('businessExpense')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mb-3">
                <span className="text-neutral-500">{doc.invoice_number || '-'}</span>
                {doc.total > 0 && <span className="font-semibold text-neutral-900">{formatCurrency(doc.total)}</span>}
              </div>
              {!doc.ocr_reviewed && (
                <div className="flex items-center gap-1.5 text-xs text-warning-700 bg-warning-50 px-3 py-1.5 rounded-lg mb-3">
                  <AlertCircle size={12} /> {t('reviewOcr')}
                </div>
              )}
              <div className="flex gap-2 pt-3 border-t border-neutral-100">
                <button onClick={() => openEdit(doc)} className="btn-ghost flex-1 text-xs"><Edit2 size={14} /> {t('edit')}</button>
                {!doc.ocr_reviewed && (
                  <button onClick={async () => { await updateDocument(doc.id, { ocr_reviewed: true }); await load(); }} className="btn-ghost text-xs text-success-600"><Check size={14} /> {t('reviewOcr')}</button>
                )}
                <button onClick={() => setDeleteTarget(doc)} className="btn-ghost text-error-600 text-xs"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t('edit') : t('addDocument')} size="lg">
        <div className="space-y-4">
          {/* Image upload */}
          <div className="input-group">
            <label className="label">{t('scanDocument')} / {t('uploadDocument')}</label>
            <div className="flex gap-2">
              <label className="btn-secondary cursor-pointer text-sm">
                <Upload size={16} /> {t('uploadDocument')}
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
              <label className="btn-secondary cursor-pointer text-sm">
                <Camera size={16} /> {t('takePhoto')}
                <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
            {form.image_url && (
              <img src={form.image_url} alt="preview" className="mt-3 w-full max-h-48 object-contain rounded-xl border border-neutral-200" />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="input-group">
              <label className="label">{t('documentCategory')}</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as DocumentCategory })} className="input">
                <option value="business_expense">{t('businessExpense')}</option>
                <option value="customer_billing">{t('customerBilling')}</option>
              </select>
            </div>
            <div className="input-group">
              <label className="label">{t('title')} *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('documentDate')}</label>
              <input type="date" value={form.document_date} onChange={(e) => setForm({ ...form, document_date: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('dueDate')}</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('invoiceNo')}</label>
              <input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('supplierName')}</label>
              <input value={form.supplier_name} onChange={(e) => setForm({ ...form, supplier_name: e.target.value })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('amount')}</label>
              <input type="number" min="0" step="0.01" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('vatAmount')}</label>
              <input type="number" min="0" step="0.01" value={form.vat_amount || ''} onChange={(e) => setForm({ ...form, vat_amount: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('total')}</label>
              <input type="number" min="0" step="0.01" value={form.total || ''} onChange={(e) => setForm({ ...form, total: parseFloat(e.target.value) || 0 })} className="input" />
            </div>
            <div className="input-group">
              <label className="label">{t('contractor')}</label>
              <select value={form.contractor_id} onChange={(e) => setForm({ ...form, contractor_id: e.target.value })} className="input">
                <option value="">-</option>
                {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label className="label">{t('workshop')}</label>
              <select value={form.workshop_id} onChange={(e) => setForm({ ...form, workshop_id: e.target.value })} className="input">
                <option value="">-</option>
                {workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>

          <div className="input-group">
            <label className="label">{t('description')}</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('notes')}</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.ocr_reviewed} onChange={(e) => setForm({ ...form, ocr_reviewed: e.target.checked })} className="w-4 h-4 rounded text-primary-600" />
            <span className="text-sm text-neutral-700">{t('ocrReviewed')}</span>
          </label>

          <div className="flex gap-3 justify-end">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('delete')}
        message={`${t('confirmDelete')} ${deleteTarget?.title}`}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

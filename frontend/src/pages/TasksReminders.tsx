import { useState, useEffect } from 'react';
import {
  Plus, Check, Clock, Bell, Trash2, Loader2,
  Calendar, FileText, Wallet, Receipt, Database, Building2,
  X,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { Modal } from '@/components/Modal';
import { EmptyState, LoadingSpinner } from '@/components/Common';
import { getTasks, createTask, updateTask, deleteTask } from '@/lib/dataAccess';
import { generateAutoTasks } from '@/lib/taskGenerator';
import type { Task } from '@/types';

export function TasksReminders() {
  const { t, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '', description: '', category: 'general' as Task['category'],
    priority: 'medium' as Task['priority'], due_date: '',
  });

  const load = async () => {
    if (!user) return;
    try {
      await generateAutoTasks(user.id);
      const data = await getTasks(user.id);
      setTasks(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  const filtered = tasks.filter((t) => filter === 'all' || t.status === filter);

  const pending = tasks.filter((t) => t.status === 'pending');
  const urgent = pending.filter((t) => t.priority === 'urgent');
  const overdue = pending.filter((t) => t.due_date && t.due_date < new Date().toISOString().split('T')[0]);

  const handleStatusChange = async (task: Task, status: Task['status']) => {
    try {
      await updateTask(task.id, {
        status,
        completed_at: status === 'completed' ? new Date().toISOString() : null,
      });
      await load();
    } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    if (!user || !form.title.trim()) return;
    setSaving(true);
    try {
      await createTask({
        user_id: user.id,
        ...form,
        due_date: form.due_date || null,
        related_entity_type: '',
        related_entity_id: null,
        status: 'pending',
        is_auto_generated: false,
      });
      showToast('success', t('createSuccess'));
      setModalOpen(false);
      setForm({ title: '', description: '', category: 'general', priority: 'medium', due_date: '' });
      await load();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (task: Task) => {
    try {
      await deleteTask(task.id);
      await load();
    } catch (e) { console.error(e); }
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const categoryIcon = (cat: string) => {
    const map: Record<string, typeof Bell> = {
      claims: FileText, payments: Wallet, documents: FileText, tax: Receipt,
      backup: Database, agreements: Building2, workshops: Building2, general: Bell,
    };
    const Icon = map[cat] || Bell;
    return <Icon size={16} />;
  };

  const priorityColor = (p: string) => {
    const map: Record<string, string> = {
      urgent: 'text-error-600 bg-error-50', high: 'text-warning-600 bg-warning-50',
      medium: 'text-primary-600 bg-primary-50', low: 'text-neutral-500 bg-neutral-50',
    };
    return map[p] || map.medium;
  };

  const renderTask = (task: Task) => (
    <div key={task.id} className="card p-4 hover:shadow-card-hover transition-all duration-200">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${priorityColor(task.priority)}`}>
          {categoryIcon(task.category)}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
            {task.title}
          </p>
          {task.description && <p className="text-xs text-neutral-500 mt-1">{task.description}</p>}
          <div className="flex items-center gap-2 mt-2">
            {task.due_date && (
              <span className={`text-xs ${task.due_date < new Date().toISOString().split('T')[0] && task.status === 'pending' ? 'text-error-600' : 'text-neutral-400'}`}>
                <Calendar size={10} className="inline me-1" />{formatDate(task.due_date)}
              </span>
            )}
            {task.is_auto_generated && <span className="badge-neutral">Auto</span>}
            <span className={priorityColor(task.priority).split(' ')[0] === 'text-error-600' ? 'badge-error' : priorityColor(task.priority).split(' ')[0] === 'text-warning-600' ? 'badge-warning' : priorityColor(task.priority).split(' ')[0] === 'text-primary-600' ? 'badge-primary' : 'badge-neutral'}>{task.priority}</span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {task.status === 'pending' && (
            <>
              <button onClick={() => handleStatusChange(task, 'completed')} className="p-2 rounded-lg text-success-600 hover:bg-success-50 transition-all" title={t('complete')}>
                <Check size={16} />
              </button>
              <button onClick={() => handleStatusChange(task, 'postponed')} className="p-2 rounded-lg text-neutral-400 hover:bg-neutral-100 transition-all" title={t('postpone')}>
                <Clock size={16} />
              </button>
              <button onClick={() => handleStatusChange(task, 'dismissed')} className="p-2 rounded-lg text-neutral-400 hover:bg-neutral-100 transition-all" title={t('dismiss')}>
                <X size={16} />
              </button>
            </>
          )}
          <button onClick={() => handleDelete(task)} className="p-2 rounded-lg text-error-400 hover:bg-error-50 transition-all">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-neutral-900">{t('tasksReminders')}</h1>
        <button onClick={() => setModalOpen(true)} className="btn-primary"><Plus size={18} /> {t('addTask')}</button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('pending')}</p>
          <p className="text-lg font-bold text-warning-600 mt-1">{pending.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('urgent')}</p>
          <p className="text-lg font-bold text-error-600 mt-1">{urgent.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('overdue')}</p>
          <p className="text-lg font-bold text-error-600 mt-1">{overdue.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-neutral-400">{t('completed')}</p>
          <p className="text-lg font-bold text-success-600 mt-1">{tasks.filter((t2) => t2.status === 'completed').length}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['pending', 'completed', 'all'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${filter === f ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
            {t(f)}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Bell size={48} />} title={t('noTasks')} />
      ) : (
        <div className="space-y-3">
          {filtered.map(renderTask)}
        </div>
      )}

      {/* Add Task Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('addTask')}>
        <div className="space-y-4">
          <div className="input-group">
            <label className="label">{t('title')} *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" />
          </div>
          <div className="input-group">
            <label className="label">{t('description')}</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input min-h-[60px]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="input-group">
              <label className="label">{t('category')}</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Task['category'] })} className="input">
                <option value="general">{t('general')}</option>
                <option value="claims">{t('claims')}</option>
                <option value="payments">{t('payments')}</option>
                <option value="documents">{t('documents')}</option>
                <option value="tax">{t('tax')}</option>
                <option value="backup">{t('backup')}</option>
              </select>
            </div>
            <div className="input-group">
              <label className="label">{t('priority')}</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })} className="input">
                <option value="low">{t('low')}</option>
                <option value="medium">{t('medium')}</option>
                <option value="high">{t('high')}</option>
                <option value="urgent">{t('urgent')}</option>
              </select>
            </div>
          </div>
          <div className="input-group">
            <label className="label">{t('dueDate')}</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input" />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

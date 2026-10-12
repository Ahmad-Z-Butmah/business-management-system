import { useState, useEffect } from 'react';
import {
  Wallet as WalletIcon, Plus, ArrowUpRight, ArrowDownRight, ArrowLeftRight,
  Loader2, Trash2, TrendingUp, TrendingDown, PiggyBank, Landmark, Banknote,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useDataRefresh } from '@/contexts/DataRefreshProvider';
import { Modal } from '@/components/Modal';
import { ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/Common';
import {
  getWalletAccounts, getWalletTransactions, createWalletTransaction,
  createTransfer, createWalletAccount, deleteWalletTransaction, deleteWalletAccount, addAuditLog,
  updateWalletAccount,
} from '@/lib/dataAccess';
import { calculateAccountBalance } from '@/lib/calculations';
import type { WalletAccount, WalletTransaction, WalletTxType } from '@/types';

export function Wallet() {
  const { t, formatCurrency, formatDate } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { triggerRefresh, refreshKey } = useDataRefresh();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [openingModalOpen, setOpeningModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WalletTransaction | null>(null);
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<WalletAccount | null>(null);
  const [saving, setSaving] = useState(false);

  // Transaction form
  const [txForm, setTxForm] = useState({
    wallet_account_id: '',
    type: 'income' as WalletTxType,
    amount: 0,
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Transfer form
  const [transferForm, setTransferForm] = useState({
    from_account_id: '',
    to_account_id: '',
    amount: 0,
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
  });

  // Opening balance form
  const [openingForm, setOpeningForm] = useState<Record<string, number>>({});

  // New account form
  const [accountForm, setAccountForm] = useState({
    name: '',
    account_type: 'bank' as 'bank' | 'cash',
    opening_balance: 0,
  });

  const load = async () => {
    if (!user) return;
    try {
      const [a, tx] = await Promise.all([
        getWalletAccounts(user.id),
        getWalletTransactions(user.id),
      ]);
      setAccounts(a);
      setTransactions(tx);
      if (a.length > 0 && !selectedAccount) {
        setTxForm((prev) => ({ ...prev, wallet_account_id: a[0].id }));
        setTransferForm((prev) => ({ ...prev, from_account_id: a[0].id, to_account_id: a[1]?.id || '' }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);
  useEffect(() => { if (user) load(); }, [user, refreshKey]);

  const totalBalance = accounts.reduce((sum, acc) => sum + calculateAccountBalance(acc, transactions), 0);
  const totalIncome = transactions
    .filter((tx) => tx.type === 'income' || tx.type === 'claim_receipt')
    .reduce((s, tx) => s + tx.amount, 0);
  const totalExpenses = transactions
    .filter((tx) => tx.type === 'expense' || tx.type === 'worker_payment')
    .reduce((s, tx) => s + tx.amount, 0);

  const handleSaveTx = async () => {
    if (!user || !txForm.wallet_account_id || txForm.amount <= 0) return;
    setSaving(true);
    try {
      await createWalletTransaction({
        user_id: user.id,
        wallet_account_id: txForm.wallet_account_id,
        transaction_date: txForm.transaction_date,
        type: txForm.type,
        amount: txForm.amount,
        description: txForm.description,
        notes: txForm.notes,
        related_worker_id: null,
        related_contractor_id: null,
        related_claim_id: null,
        transfer_pair_id: null,
      });
      await addAuditLog({ user_id: user.id, action: 'wallet_transaction_created', entity_type: 'wallet_transaction' });
      showToast('success', t('createSuccess'));
      setTxModalOpen(false);
      setTxForm({ ...txForm, amount: 0, description: '', notes: '' });
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleTransfer = async () => {
    if (!user || transferForm.from_account_id === transferForm.to_account_id) {
      showToast('warning', t('sameAccountError'));
      return;
    }
    if (transferForm.amount <= 0) {
      showToast('warning', t('invalidTransferAmount'));
      return;
    }
    setSaving(true);
    try {
      await createTransfer(
        user.id,
        transferForm.from_account_id,
        transferForm.to_account_id,
        transferForm.amount,
        transferForm.transaction_date,
        transferForm.description || t('transfer'),
      );
      await addAuditLog({ user_id: user.id, action: 'transfer_created', entity_type: 'wallet_transaction' });
      showToast('success', t('transferSuccess'));
      setTransferModalOpen(false);
      setTransferForm({ ...transferForm, amount: 0, description: '' });
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleSetOpeningBalances = async () => {
    if (!user) return;
    setSaving(true);
    try {
      for (const acc of accounts) {
        const newBalance = openingForm[acc.id] ?? acc.opening_balance;
        if (newBalance !== acc.opening_balance) {
          const oldOpening = transactions.filter((tx) => tx.wallet_account_id === acc.id && tx.type === 'opening_balance');
          for (const tx of oldOpening) {
            await deleteWalletTransaction(tx.id);
          }
          if (newBalance > 0) {
            await createWalletTransaction({
              user_id: user.id,
              wallet_account_id: acc.id,
              transaction_date: new Date().toISOString().split('T')[0],
              type: 'opening_balance',
              amount: newBalance,
              description: t('openingBalance'),
              notes: '',
              related_worker_id: null,
              related_contractor_id: null,
              related_claim_id: null,
              transfer_pair_id: null,
            });
          }
          await updateWalletAccount(acc.id, { opening_balance: newBalance });
        }
      }
      await addAuditLog({ user_id: user.id, action: 'opening_balance_set', entity_type: 'wallet_account' });
      showToast('success', t('openingBalanceSet'));
      setOpeningModalOpen(false);
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!user || !accountForm.name.trim()) return;
    setSaving(true);
    try {
      const acc = await createWalletAccount({
        user_id: user.id,
        name: accountForm.name.trim(),
        account_type: accountForm.account_type,
        opening_balance: accountForm.opening_balance,
      });
      if (accountForm.opening_balance > 0) {
        await createWalletTransaction({
          user_id: user.id,
          wallet_account_id: acc.id,
          transaction_date: new Date().toISOString().split('T')[0],
          type: 'opening_balance',
          amount: accountForm.opening_balance,
          description: t('openingBalance'),
          notes: '',
          related_worker_id: null,
          related_contractor_id: null,
          related_claim_id: null,
          transfer_pair_id: null,
        });
      }
      await addAuditLog({ user_id: user.id, action: 'wallet_account_created', entity_type: 'wallet_account' });
      showToast('success', t('createSuccess'));
      setAccountModalOpen(false);
      setAccountForm({ name: '', account_type: 'bank', opening_balance: 0 });
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTx = async () => {
    if (!user || !deleteTarget) return;
    try {
      await deleteWalletTransaction(deleteTarget.id);
      showToast('success', t('deleteSuccess'));
      setDeleteTarget(null);
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !deleteAccountTarget) return;
    setSaving(true);
    try {
      await deleteWalletAccount(deleteAccountTarget.id);
      await addAuditLog({ user_id: user.id, action: 'wallet_account_deleted', entity_type: 'wallet_account' });
      showToast('success', t('deleteSuccess'));
      if (selectedAccount === deleteAccountTarget.id) setSelectedAccount(null);
      setDeleteAccountTarget(null);
      await load();
      triggerRefresh();
    } catch (e) {
      console.error(e);
      showToast('error', t('deleteFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const filteredTx = selectedAccount
    ? transactions.filter((tx) => tx.wallet_account_id === selectedAccount)
    : transactions;

  const isIncome = (type: string) => type === 'income' || type === 'transfer_in' || type === 'opening_balance' || type === 'claim_receipt';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">{t('wallet')}</h1>
          <p className="text-sm text-neutral-400 mt-0.5">{t('walletOverview')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setAccountModalOpen(true)} className="btn-secondary"><Plus size={18} /> {t('addAccount')}</button>
          <button onClick={() => setTxModalOpen(true)} className="btn-primary"><Plus size={18} /> {t('addTransaction')}</button>
          <button onClick={() => setTransferModalOpen(true)} className="btn-secondary"><ArrowLeftRight size={18} /> {t('transfer')}</button>
          <button onClick={() => { setOpeningForm(Object.fromEntries(accounts.map((a) => [a.id, a.opening_balance]))); setOpeningModalOpen(true); }} className="btn-secondary"><PiggyBank size={18} /> <span className="hidden sm:inline">{t('setOpeningBalances')}</span></button>
        </div>
      </div>

      {/* Total balance hero */}
      <div className="card p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-success-50 via-white to-white" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm text-neutral-500 mb-1">{t('combinedTotal')}</p>
            <p className="text-3xl font-bold text-neutral-900 tracking-tight">{formatCurrency(totalBalance)}</p>
            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-sm text-success-600 font-medium">
                <TrendingUp size={15} />
                {formatCurrency(totalIncome)}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-error-600 font-medium">
                <TrendingDown size={15} />
                {formatCurrency(totalExpenses)}
              </span>
            </div>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-success-100 text-success-600 flex items-center justify-center shadow-sm">
            <WalletIcon size={28} />
          </div>
        </div>
      </div>

      {/* Account cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((acc) => {
          const accTx = transactions.filter((tx) => tx.wallet_account_id === acc.id);
          const balance = calculateAccountBalance(acc, transactions);
          const income = accTx.filter((tx) => isIncome(tx.type)).reduce((s, tx) => s + tx.amount, 0);
          const expenses = accTx.filter((tx) => !isIncome(tx.type)).reduce((s, tx) => s + tx.amount, 0);
          const AccIcon = acc.account_type === 'cash' ? Banknote : Landmark;
          return (
            <button
              key={acc.id}
              onClick={() => setSelectedAccount(selectedAccount === acc.id ? null : acc.id)}
              className={`card-hover p-5 text-start ${selectedAccount === acc.id ? 'border-primary-400 ring-2 ring-primary-200' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${acc.account_type === 'cash' ? 'bg-warning-100 text-warning-600' : 'bg-primary-100 text-primary-600'}`}>
                    <AccIcon size={20} />
                  </div>
                  <p className="text-sm font-semibold text-neutral-700">{acc.name}</p>
                </div>
                <span className={`badge ${acc.account_type === 'cash' ? 'badge-warning' : 'badge-primary'}`}>{acc.account_type === 'cash' ? t('cash') : 'Bank'}</span>
              </div>
              <p className="text-2xl font-bold text-neutral-900">{formatCurrency(balance)}</p>
              <div className="flex items-center justify-between mt-2 text-xs">
                <div className="flex items-center gap-4">
                  <span className="text-success-600 flex items-center gap-1"><TrendingUp size={12} /> {formatCurrency(income)}</span>
                  <span className="text-error-600 flex items-center gap-1"><TrendingDown size={12} /> {formatCurrency(expenses)}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteAccountTarget(acc); }}
                  className="text-neutral-300 hover:text-error-600 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </button>
          );
        })}
      </div>

      {/* Transactions */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="section-title">
            {t('transactions')}
            {selectedAccount && ` — ${accounts.find((a) => a.id === selectedAccount)?.name}`}
          </h3>
          {selectedAccount && (
            <button onClick={() => setSelectedAccount(null)} className="btn-ghost text-xs">{t('allAccounts')}</button>
          )}
        </div>

        {filteredTx.length === 0 ? (
          <EmptyState icon={<WalletIcon size={48} />} title={t('noTransactionsYet')} />
        ) : (
          <div className="space-y-1">
            {filteredTx.slice(0, 50).map((tx) => {
              const account = accounts.find((a) => a.id === tx.wallet_account_id);
              const income = isIncome(tx.type);
              return (
                <div key={tx.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-neutral-50 group transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      income ? 'bg-success-50 text-success-600' : 'bg-error-50 text-error-600'
                    }`}>
                      {income ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-700 truncate">{tx.description || t(tx.type)}</p>
                      <p className="text-xs text-neutral-400">
                        {formatDate(tx.transaction_date)} · {account?.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-sm font-semibold ${income ? 'text-success-600' : 'text-error-600'}`}>
                      {income ? '+' : '-'}{formatCurrency(tx.amount)}
                    </span>
                    <button onClick={() => setDeleteTarget(tx)} className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-error-600 transition-opacity">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Transaction Modal */}
      <Modal open={txModalOpen} onClose={() => setTxModalOpen(false)} title={t('addTransaction')}>
        <div className="space-y-4">
          <div>
            <label className="label">{t('transactionType')}</label>
            <select value={txForm.type} onChange={(e) => setTxForm({ ...txForm, type: e.target.value as WalletTxType })} className="input">
              <option value="income">{t('income')}</option>
              <option value="expense">{t('expense')}</option>
            </select>
          </div>
          <div>
            <label className="label">{t('account')}</label>
            <select value={txForm.wallet_account_id} onChange={(e) => setTxForm({ ...txForm, wallet_account_id: e.target.value })} className="input">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('amount')}</label>
            <input type="number" min="0" step="0.01" value={txForm.amount || ''} onChange={(e) => setTxForm({ ...txForm, amount: parseFloat(e.target.value) || 0 })} className="input" />
          </div>
          <div>
            <label className="label">{t('date')}</label>
            <input type="date" value={txForm.transaction_date} onChange={(e) => setTxForm({ ...txForm, transaction_date: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('description')}</label>
            <input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('notes')}</label>
            <input value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} className="input" />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setTxModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
            <button onClick={handleSaveTx} className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Transfer Modal */}
      <Modal open={transferModalOpen} onClose={() => setTransferModalOpen(false)} title={t('transfer')}>
        <div className="space-y-4">
          <div>
            <label className="label">{t('selectFromAccount')}</label>
            <select value={transferForm.from_account_id} onChange={(e) => setTransferForm({ ...transferForm, from_account_id: e.target.value })} className="input">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('selectToAccount')}</label>
            <select value={transferForm.to_account_id} onChange={(e) => setTransferForm({ ...transferForm, to_account_id: e.target.value })} className="input">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('transferAmount')}</label>
            <input type="number" min="0" step="0.01" value={transferForm.amount || ''} onChange={(e) => setTransferForm({ ...transferForm, amount: parseFloat(e.target.value) || 0 })} className="input" />
          </div>
          <div>
            <label className="label">{t('date')}</label>
            <input type="date" value={transferForm.transaction_date} onChange={(e) => setTransferForm({ ...transferForm, transaction_date: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('description')}</label>
            <input value={transferForm.description} onChange={(e) => setTransferForm({ ...transferForm, description: e.target.value })} className="input" />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setTransferModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
            <button onClick={handleTransfer} className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {t('transfer')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Opening Balance Modal */}
      <Modal open={openingModalOpen} onClose={() => setOpeningModalOpen(false)} title={t('setOpeningBalances')}>
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-primary-50 text-primary-700 text-sm">
            <PiggyBank size={16} className="shrink-0 mt-0.5" />
            {t('openingBalanceHint')}
          </div>
          {accounts.map((acc) => (
            <div key={acc.id}>
              <label className="label">{acc.name}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingForm[acc.id] ?? 0}
                onChange={(e) => setOpeningForm({ ...openingForm, [acc.id]: parseFloat(e.target.value) || 0 })}
                className="input"
              />
            </div>
          ))}
          <div className="flex gap-3 justify-end">
            <button onClick={() => setOpeningModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
            <button onClick={handleSetOpeningBalances} className="btn-primary" disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Account Modal */}
      <Modal open={accountModalOpen} onClose={() => setAccountModalOpen(false)} title={t('addAccount')}>
        <div className="space-y-4">
          <div>
            <label className="label">{t('accountName')}</label>
            <input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} className="input" placeholder={t('accountNamePlaceholder')} />
          </div>
          <div>
            <label className="label">{t('accountType')}</label>
            <select value={accountForm.account_type} onChange={(e) => setAccountForm({ ...accountForm, account_type: e.target.value as 'bank' | 'cash' })} className="input">
              <option value="bank">{t('bankAccount')}</option>
              <option value="cash">{t('cashAccount')}</option>
            </select>
          </div>
          <div>
            <label className="label">{t('openingBalance')}</label>
            <input type="number" min="0" step="0.01" value={accountForm.opening_balance || ''} onChange={(e) => setAccountForm({ ...accountForm, opening_balance: parseFloat(e.target.value) || 0 })} className="input" />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setAccountModalOpen(false)} className="btn-secondary">{t('cancel')}</button>
            <button onClick={handleCreateAccount} className="btn-primary" disabled={saving || !accountForm.name.trim()}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {t('save')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('delete')}
        message={t('confirmDelete')}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDeleteTx}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteAccountTarget}
        title={t('deleteAccount')}
        message={`${t('deleteAccountWarning')} — ${deleteAccountTarget?.name ?? ''}`}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('noCancel')}
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteAccountTarget(null)}
        loading={saving}
      />
    </div>
  );
}

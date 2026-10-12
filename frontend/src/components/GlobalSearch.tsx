import { useState, useEffect, useRef } from 'react';
import { Search, Users, HardHat, Building2, FileText, Wallet, X } from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { supabase } from '@/lib/supabase';
import type { PageId } from '@/components/AppShell';

interface SearchResult {
  type: 'worker' | 'contractor' | 'workshop' | 'claim' | 'payment' | 'document';
  id: string;
  title: string;
  subtitle: string;
}

export function GlobalSearch({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const q = query.toLowerCase();
        const [workers, contractors, workshops, claims, payments, docs] = await Promise.all([
          supabase.from('workers').select('id, full_name, phone, profession').eq('user_id', user.id).ilike('full_name', `%${q}%`).limit(5),
          supabase.from('contractors').select('id, name, company_name, phone').eq('user_id', user.id).ilike('name', `%${q}%`).limit(5),
          supabase.from('workshops').select('id, name').eq('user_id', user.id).ilike('name', `%${q}%`).limit(5),
          supabase.from('claims').select('id, claim_number').eq('user_id', user.id).ilike('claim_number', `%${q}%`).limit(5),
          supabase.from('worker_payments').select('id, amount, payment_date').eq('user_id', user.id).limit(5),
          supabase.from('documents').select('id, title, supplier_name').eq('user_id', user.id).ilike('title', `%${q}%`).limit(5),
        ]);

        const r: SearchResult[] = [];
        (workers.data || []).forEach((w) => r.push({ type: 'worker', id: w.id, title: w.full_name, subtitle: w.phone || w.profession || '' }));
        (contractors.data || []).forEach((c) => r.push({ type: 'contractor', id: c.id, title: c.name, subtitle: c.company_name || c.phone || '' }));
        (workshops.data || []).forEach((w) => r.push({ type: 'workshop', id: w.id, title: w.name, subtitle: '' }));
        (claims.data || []).forEach((c) => r.push({ type: 'claim', id: c.id, title: c.claim_number, subtitle: '' }));
        (payments.data || []).forEach((p) => r.push({ type: 'payment', id: p.id, title: `${t('payment')} ${p.amount}`, subtitle: p.payment_date }));
        (docs.data || []).forEach((d) => r.push({ type: 'document', id: d.id, title: d.title, subtitle: d.supplier_name || '' }));
        setResults(r);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [user, query, t]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const typeIcon = (type: string) => {
    const map: Record<string, typeof Users> = {
      worker: Users, contractor: HardHat, workshop: Building2,
      claim: FileText, payment: Wallet, document: FileText,
    };
    return map[type] || Search;
  };

  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      worker: t('workers'), contractor: t('contractors'), workshop: t('workshops'),
      claim: t('claims'), payment: t('payments'), document: t('documents'),
    };
    return map[type] || type;
  };

  const navigateTo = (type: string) => {
    const pageMap: Record<string, PageId> = {
      worker: 'workers', contractor: 'contractors', workshop: 'workshops',
      claim: 'claims', payment: 'wallet', document: 'documentVault',
    };
    onNavigate(pageMap[type] || 'dashboard');
    setOpen(false);
    setQuery('');
  };

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search size={16} className="absolute top-3 start-3 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={t('search')}
          className="w-40 sm:w-56 ps-9 pe-8 py-2.5 text-sm rounded-xl border border-neutral-200 bg-neutral-50/50 text-neutral-700 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 focus:bg-white transition-all"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); }} className="absolute top-2.5 end-2.5 text-neutral-400 hover:text-neutral-600 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute top-full mt-2 w-80 max-w-[calc(100vw-2rem)] card shadow-elevated z-50 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-5 text-sm text-neutral-400 text-center">{t('loading')}</div>
          ) : results.length === 0 ? (
            <div className="p-5 text-sm text-neutral-400 text-center">{t('noResults')}</div>
          ) : (
            <div className="py-1.5">
              {Object.entries(grouped).map(([type, items]) => (
                <div key={type}>
                  <div className="px-4 py-2 text-xs font-semibold text-neutral-400 bg-neutral-50 uppercase tracking-wide">
                    {typeLabel(type)}
                  </div>
                  {items.map((r) => {
                    const Icon = typeIcon(r.type);
                    return (
                      <button
                        key={`${r.type}-${r.id}`}
                        onClick={() => navigateTo(r.type)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 text-start transition-colors"
                      >
                        <Icon size={16} className="text-neutral-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{r.title}</p>
                          {r.subtitle && <p className="text-xs text-neutral-400 truncate">{r.subtitle}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

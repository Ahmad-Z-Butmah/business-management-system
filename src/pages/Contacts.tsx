import { useState, useEffect } from 'react';
import {
  Users, HardHat, Search, Phone, MessageCircle, Building2,
  Briefcase, MapPin, Loader2,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { LoadingSpinner, EmptyState } from '@/components/Common';
import { getWorkers, getContractors, getWorkshops } from '@/lib/dataAccess';
import type { Worker, Contractor, Workshop } from '@/types';

export function Contacts() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'workers' | 'contractors'>('workers');
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [w, c, ws] = await Promise.all([
          getWorkers(user.id),
          getContractors(user.id),
          getWorkshops(user.id),
        ]);
        setWorkers(w);
        setContractors(c);
        setWorkshops(ws);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  if (loading) return <LoadingSpinner label={t('loading')} />;

  const filteredWorkers = workers.filter((w) =>
    !search ||
    w.full_name.toLowerCase().includes(search.toLowerCase()) ||
    w.phone.includes(search) ||
    w.profession.toLowerCase().includes(search.toLowerCase())
  );

  const filteredContractors = contractors.filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company_name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const openWhatsApp = (phone: string) => {
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean) window.open(`https://wa.me/${clean}`, '_blank');
  };

  const callPhone = (phone: string) => {
    if (phone) window.open(`tel:${phone}`, '_blank');
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-neutral-900">{t('contacts')}</h1>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('workers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            activeTab === 'workers' ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300'
          }`}
        >
          <Users size={18} />
          {t('workersSection')}
        </button>
        <button
          onClick={() => setActiveTab('contractors')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
            activeTab === 'contractors' ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20' : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300'
          }`}
        >
          <HardHat size={18} />
          {t('contractorsSection')}
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={18} className="absolute top-3.5 start-3.5 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={activeTab === 'workers' ? t('searchWorkers') : t('searchContractors')}
          className="input ps-11"
        />
      </div>

      {/* Workers list */}
      {activeTab === 'workers' && (
        filteredWorkers.length === 0 ? (
          <EmptyState icon={<Users size={48} />} title={t('noWorkers')} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkers.map((w) => (
              <div key={w.id} className="card-hover p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform ${
                    w.worker_type === 'team_leader' ? 'bg-primary-100 text-primary-600' : 'bg-neutral-100 text-neutral-600'
                  }`}>
                    <Users size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{w.full_name}</p>
                    <p className="text-xs text-neutral-500">{w.profession || (w.worker_type === 'team_leader' ? t('teamLeader') : t('normalWorker'))}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {w.phone && (
                    <>
                      <button onClick={() => callPhone(w.phone)} className="btn-secondary flex-1 text-xs">
                        <Phone size={14} /> {t('call')}
                      </button>
                      <button onClick={() => openWhatsApp(w.phone)} className="btn-success flex-1 text-xs">
                        <MessageCircle size={14} /> {t('whatsapp')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Contractors list */}
      {activeTab === 'contractors' && (
        filteredContractors.length === 0 ? (
          <EmptyState icon={<HardHat size={48} />} title={t('noContractors')} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredContractors.map((c) => {
              const contractorWorkshops = workshops.filter((w) => w.contractor_id === c.id);
              return (
                <div key={c.id} className="card-hover p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
                      <HardHat size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-900 truncate">{c.name}</p>
                      {c.company_name && <p className="text-xs text-neutral-500 truncate">{c.company_name}</p>}
                    </div>
                  </div>
                  <div className="space-y-1.5 text-xs text-neutral-500 mb-4">
                    {c.phone && <p className="flex items-center gap-1.5"><Phone size={12} /> {c.phone}</p>}
                    {c.address && <p className="flex items-center gap-1.5"><MapPin size={12} /> {c.address}</p>}
                    <p className="flex items-center gap-1.5"><Building2 size={12} /> {contractorWorkshops.length} {t('workshops')}</p>
                  </div>
                  <div className="flex gap-2">
                    {c.phone && (
                      <>
                        <button onClick={() => callPhone(c.phone)} className="btn-secondary flex-1 text-xs">
                          <Phone size={14} /> {t('call')}
                        </button>
                        <button onClick={() => openWhatsApp(c.phone)} className="btn-success flex-1 text-xs">
                          <MessageCircle size={14} /> {t('whatsapp')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

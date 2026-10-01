import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Language } from '@/types';
import { translations, type TranslationKey } from './translations';

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  dir: 'rtl' | 'ltr';
  formatCurrency: (amount: number) => string;
  formatDate: (date: string | Date) => string;
  formatNumber: (num: number) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'contractor_pro_language';

function getDir(lang: Language): 'rtl' | 'ltr' {
  return lang === 'en' ? 'ltr' : 'rtl';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    return stored && ['ar', 'he', 'en'].includes(stored) ? stored : 'ar';
  });

  const dir = getDir(language);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [language, dir]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
  }, []);

  const t = useCallback((key: TranslationKey) => {
    return translations[language][key] ?? translations.en[key] ?? key;
  }, [language]);

  const formatCurrency = useCallback((amount: number) => {
    const formatted = new Intl.NumberFormat(language === 'ar' ? 'ar-IL' : language === 'he' ? 'he-IL' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
    return `${formatted} ₪`;
  }, [language]);

  const formatDate = useCallback((date: string | Date) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const locale = language === 'ar' ? 'ar-IL' : language === 'he' ? 'he-IL' : 'en-US';
    return d.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
  }, [language]);

  const formatNumber = useCallback((num: number) => {
    const locale = language === 'ar' ? 'ar-IL' : language === 'he' ? 'he-IL' : 'en-US';
    return new Intl.NumberFormat(locale).format(num);
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, dir, formatCurrency, formatDate, formatNumber }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

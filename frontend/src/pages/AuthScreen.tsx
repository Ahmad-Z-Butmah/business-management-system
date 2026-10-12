import { useState, type FormEvent } from 'react';
import { Loader2, Building2, Mail, Lock, UserCircle, Shield, CheckCircle2, TrendingUp, Users, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { Language } from '@/types';

type AuthMode = 'signin' | 'signup' | 'reset';

export function AuthScreen() {
  const { t, language, setLanguage } = useI18n();
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!isSupabaseConfigured) {
      setError(language === 'ar'
        ? 'يلزم إعداد VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في ملف .env لتفعيل تسجيل الدخول.'
        : language === 'he'
          ? 'יש להגדיר את VITE_SUPABASE_URL ואת VITE_SUPABASE_ANON_KEY בקובץ .env כדי להפעיל התחברות.'
          : 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable sign-in.');
      return;
    }

    if (!email.trim()) { setError(t('emailRequired')); return; }
    if (mode !== 'reset' && password.length < 6) { setError(t('passwordTooShort')); return; }
    if (mode === 'signup' && password !== confirmPassword) { setError(t('passwordsDoNotMatch')); return; }

    setLoading(true);
    if (mode === 'signin') {
      const { error } = await signIn(email.trim(), password);
      if (error) setError(error);
    } else if (mode === 'signup') {
      const { error } = await signUp(email.trim(), password);
      if (error) setError(error);
      else setInfo(t('checkEmailForReset'));
    } else {
      const { error } = await resetPassword(email.trim());
      if (error) setError(error);
      else setInfo(t('checkEmailForReset'));
    }
    setLoading(false);
  };

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'ar', label: 'العربية', flag: '🇸🇦' },
    { code: 'he', label: 'עברית', flag: '🇮🇱' },
    { code: 'en', label: 'English', flag: '🇬🇧' },
  ];

  const features = [
    { icon: Users, text: t('workers') },
    { icon: Wallet, text: t('wallet') },
    { icon: TrendingUp, text: t('reports') },
  ];

  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 relative overflow-hidden">
        {/* Decorative shapes */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 start-10 w-72 h-72 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 end-10 w-96 h-96 rounded-full bg-success-300 blur-3xl" />
          <div className="absolute top-1/2 start-1/3 w-48 h-48 rounded-full bg-primary-300 blur-2xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20">
              <Building2 size={26} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">{t('appName')}</h1>
              <p className="text-sm text-white/70">Contractor Pro</p>
            </div>
          </div>

          {/* Hero text */}
          <div className="space-y-6">
            <h2 className="text-4xl font-bold leading-tight tracking-tight">
              {t('appNameSubtitle')}
            </h2>
            <p className="text-lg text-white/80 max-w-md leading-relaxed font-medium tracking-wide">
              Run the business. Keep the history.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-3 pt-2">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 text-sm font-medium">
                  <f.icon size={16} />
                  {f.text}
                </div>
              ))}
            </div>
          </div>

          {/* Trust footer */}
          <div className="flex items-center gap-6 text-sm text-white/60">
            <div className="flex items-center gap-1.5">
              <Shield size={16} />
              <span>SSL Secured</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={16} />
              <span>Cloud Backup</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col bg-gradient-to-b from-canvas to-white">
        {/* Language switcher */}
        <div className="flex justify-end p-4 gap-1.5">
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => setLanguage(l.code)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                language === l.code ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/20' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700'
              }`}
            >
              <span className="me-1">{l.flag}</span>
              {l.label}
            </button>
          ))}
        </div>

        <div className="flex-1 flex items-center justify-center px-4 pb-12">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <div className="lg:hidden text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-primary-500 to-primary-700 text-white mb-4 shadow-xl shadow-primary-600/25">
                <Building2 size={32} />
              </div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">{t('appName')}</h1>
              <p className="text-sm text-neutral-400 mt-1">{t('appNameSubtitle')}</p>
            </div>

            {/* Auth card */}
            <div className="card-elevated p-8">
              <h2 className="text-xl font-bold text-neutral-900 mb-1 tracking-tight">
                {mode === 'signin' ? t('welcomeBack') : mode === 'signup' ? t('createAccount') : t('resetPassword')}
              </h2>
              <p className="text-sm text-neutral-400 mb-6">
                {mode === 'signin' ? t('signIn') : mode === 'signup' ? t('signUp') : t('resetPasswordInstructions')}
              </p>

              {!isSupabaseConfigured && (
                <div role="status" className="mb-4 px-4 py-3 rounded-xl bg-warning-50 border border-warning-200/60 text-warning-800 text-sm">
                  {language === 'ar'
                    ? 'التطبيق يعمل، لكن تسجيل الدخول يحتاج إعداد اتصال Supabase.'
                    : language === 'he'
                      ? 'האפליקציה פועלת, אך התחברות דורשת הגדרת חיבור Supabase.'
                      : 'The app is running, but sign-in requires Supabase configuration.'}
                </div>
              )}

              {error && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-error-50 border border-error-200/60 text-error-700 text-sm flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">•</span>
                  {error}
                </div>
              )}
              {info && (
                <div className="mb-4 px-4 py-3 rounded-xl bg-success-50 border border-success-200/60 text-success-700 text-sm flex items-start gap-2">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  {info}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="input-group">
                  <label className="label">{t('email')}</label>
                  <div className="relative">
                    <Mail size={18} className="absolute top-3.5 start-3.5 text-neutral-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input ps-11"
                      placeholder="name@example.com"
                      autoComplete="email"
                    />
                  </div>
                </div>

                {mode !== 'reset' && (
                  <div className="input-group">
                    <label className="label">{t('password')}</label>
                    <div className="relative">
                      <Lock size={18} className="absolute top-3.5 start-3.5 text-neutral-400" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input ps-11"
                        placeholder="••••••••"
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      />
                    </div>
                  </div>
                )}

                {mode === 'signup' && (
                  <div className="input-group">
                    <label className="label">{t('confirmPassword')}</label>
                    <div className="relative">
                      <Lock size={18} className="absolute top-3.5 start-3.5 text-neutral-400" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="input ps-11"
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>
                  </div>
                )}

                <button type="submit" className="btn-primary w-full py-3 text-base" disabled={loading || !isSupabaseConfigured}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <UserCircle size={18} />}
                  {mode === 'signin' ? t('signIn') : mode === 'signup' ? t('signUp') : t('sendResetLink')}
                </button>
              </form>

              <div className="mt-6 space-y-2 text-center text-sm">
                {mode === 'signin' && (
                  <>
                    <button onClick={() => { setMode('reset'); setError(null); setInfo(null); }} className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
                      {t('forgotPassword')}
                    </button>
                    <div>
                      <button onClick={() => { setMode('signup'); setError(null); setInfo(null); }} className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
                        {t('dontHaveAccount')} {t('signUp')}
                      </button>
                    </div>
                  </>
                )}
                {mode === 'signup' && (
                  <button onClick={() => { setMode('signin'); setError(null); setInfo(null); }} className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
                    {t('alreadyHaveAccount')} {t('signIn')}
                  </button>
                )}
                {mode === 'reset' && (
                  <button onClick={() => { setMode('signin'); setError(null); setInfo(null); }} className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
                    {t('backToSignIn')}
                  </button>
                )}
              </div>
            </div>

            {/* Security badge */}
            <div className="flex items-center justify-center gap-1.5 mt-6 text-xs text-neutral-400">
              <Shield size={14} className="text-success-500" />
              <span>{t('yourDataIsSafe')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

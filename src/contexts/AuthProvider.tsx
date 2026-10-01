import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { AppSettings } from '@/types';


interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  settings: AppSettings | null;
  refreshSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const loadSettings = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('app_settings')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();
    setSettings(data as AppSettings | null);
  }, []);

  useEffect(() => {
    // getSession() reads from localStorage — it's synchronous and fast, no network.
    // We set loading=false immediately so the app shell renders without waiting.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        // Load settings in the background — don't block the UI
        loadSettings(session.user.id).catch(() => {});
      }
    }).catch(() => {
      // If getSession fails for any reason, still unblock the UI
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadSettings(session.user.id).catch(() => {});
        } else {
          setSettings(null);
        }
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, [loadSettings]);

  // Refresh token when online — non-blocking, won't affect offline usage
  useEffect(() => {
    const refresh = () => {
      if (navigator.onLine && session) {
        supabase.auth.refreshSession().catch(() => {});
      }
    };
    refresh();
    const interval = setInterval(refresh, 10 * 60 * 1000);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', refresh);
    };
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setSettings(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  }, []);

  const refreshSettings = useCallback(async () => {
    if (user) await loadSettings(user.id);
  }, [user, loadSettings]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, resetPassword, settings, refreshSettings }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Profile, Tier, TIER_LIMITS, UsageCredits } from './types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  credits: UsageCredits | null;
  loading: boolean;
  isAnonymous: boolean;
  tier: Tier;
  messagesLeft: number | null; // null = unlimited
  startAnonymous: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string) => Promise<string | null>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [credits, setCredits] = useState<UsageCredits | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAccount = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setCredits(null);
      return;
    }
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase
        .from('usage_credits')
        .select('*')
        .eq('user_id', s.user.id)
        .maybeSingle(),
    ]);
    setProfile((p as Profile) ?? null);
    setCredits((c as UsageCredits) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadAccount(data.session).finally(() => setLoading(false));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      loadAccount(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadAccount]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadAccount(data.session);
  }, [loadAccount]);

  const startAnonymous = useCallback(async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string) => {
      // If currently anonymous, upgrade in place so trial history is preserved
      if (session?.user?.is_anonymous) {
        const { error } = await supabase.auth.updateUser({ email, password });
        return error ? error.message : null;
      }
      const { error } = await supabase.auth.signUp({ email, password });
      return error ? error.message : null;
    },
    [session]
  );

  const signInWithOAuth = useCallback(async (provider: 'google' | 'apple') => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const tier: Tier = profile?.tier ?? 'free';
  const limit = TIER_LIMITS[tier];
  const messagesLeft =
    limit === null ? null : Math.max(0, limit - (credits?.messages_used ?? 0));

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      credits,
      loading,
      isAnonymous: !!session?.user?.is_anonymous,
      tier,
      messagesLeft,
      startAnonymous,
      signInWithEmail,
      signUpWithEmail,
      signInWithOAuth,
      signOut,
      refresh,
    }),
    [
      session,
      profile,
      credits,
      loading,
      tier,
      messagesLeft,
      startAnonymous,
      signInWithEmail,
      signUpWithEmail,
      signInWithOAuth,
      signOut,
      refresh,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl || '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey || '';

/**
 * True once real Supabase credentials are configured. Until then the app
 * runs in demo mode: UI fully browsable, conversations simulated locally.
 */
export const isBackendConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isBackendConfigured) {
  console.warn(
    'Supabase credentials missing — running in DEMO MODE. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

// Placeholder credentials keep the client constructor from throwing (which
// would blank-screen the whole app) while in demo mode.
export const supabase = createClient(
  supabaseUrl || 'https://demo-placeholder.supabase.co',
  supabaseAnonKey || 'demo-placeholder-anon-key',
  {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`;

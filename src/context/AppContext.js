import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { loadConfig, saveConfig, clearConfig, isConfigured } from '../lib/config';
import { makeClient } from '../lib/supabase';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [cfg, setCfg] = useState(null);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const refresh = useCallback(async () => {
    const c = await loadConfig();
    setCfg(c);
    setReady(true);
    return c;
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const updateConfig = useCallback(async (next) => {
    const saved = await saveConfig(next);
    const c = { ...saved, source: 'saved' };
    setCfg(c);
    return c;
  }, []);

  const resetConfig = useCallback(async () => {
    await clearConfig();
    return refresh();
  }, [refresh]);

  // (Re)build the Supabase client whenever credentials are present.
  const supabase = useMemo(() => {
    if (!isConfigured(cfg)) return null;
    try { return makeClient({ url: cfg.url, anonKey: cfg.anonKey }); }
    catch { return null; }
  }, [cfg]);

  // Track the auth session: restore an existing one and subscribe to changes.
  useEffect(() => {
    let sub = null;
    setAuthChecked(false);
    if (!supabase) { setSession(null); setAuthChecked(true); return; }
    supabase.auth.getSession()
      .then(({ data }) => setSession(data?.session || null))
      .catch(() => setSession(null))
      .finally(() => setAuthChecked(true));
    const res = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    sub = res?.data?.subscription;
    return () => { try { sub?.unsubscribe(); } catch {} };
  }, [supabase]);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) throw new Error('Connect to Supabase first (Settings).');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: (email || '').trim(),
      password: password || '',
    });
    if (error) throw error;
    setSession(data?.session || null);
    return data?.session || null;
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (supabase) { try { await supabase.auth.signOut(); } catch {} }
    setSession(null);
  }, [supabase]);

  const value = useMemo(() => ({
    cfg,
    ready,
    configured: isConfigured(cfg),
    supabase,
    session,
    user: session?.user || null,
    signedIn: !!session,
    authChecked,
    signIn,
    signOut,
    updateConfig,
    resetConfig,
    refresh,
  }), [cfg, ready, supabase, session, authChecked, signIn, signOut, updateConfig, resetConfig, refresh]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

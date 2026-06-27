import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { loadConfig, saveConfig, clearConfig, isConfigured } from '../lib/config';
import { makeClient } from '../lib/supabase';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [cfg, setCfg] = useState(null);
  const [ready, setReady] = useState(false);

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

  const value = useMemo(() => ({
    cfg,
    ready,
    configured: isConfigured(cfg),
    supabase,
    updateConfig,
    resetConfig,
    refresh,
  }), [cfg, ready, supabase, updateConfig, resetConfig, refresh]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

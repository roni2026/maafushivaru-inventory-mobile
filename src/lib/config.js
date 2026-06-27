// ─────────────────────────────────────────────────────────────────────────────
// Backend configuration (Supabase URL + anon key).
//
// Resolution order:
//   1. Values saved in-app (Settings screen)  → AsyncStorage
//   2. Build-time values baked into app.json   → expo extra
//
// This lets a single APK be pointed at the right Supabase project either at
// build time (CI / app.json) OR by pasting the credentials into the in-app
// Settings screen — no rebuild required.
// ─────────────────────────────────────────────────────────────────────────────
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'mvm.supabase.config.v1';

function fromExtra() {
  const extra =
    Constants?.expoConfig?.extra ||
    Constants?.manifest?.extra ||
    Constants?.manifest2?.extra ||
    {};
  return {
    url: extra.SUPABASE_URL || '',
    anonKey: extra.SUPABASE_ANON_KEY || '',
  };
}

export async function loadConfig() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved?.url && saved?.anonKey) return { ...saved, source: 'saved' };
    }
  } catch (e) {
    // ignore — fall back to build-time values
  }
  const extra = fromExtra();
  return { ...extra, source: 'extra' };
}

export async function saveConfig({ url, anonKey }) {
  const clean = { url: (url || '').trim(), anonKey: (anonKey || '').trim() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export async function clearConfig() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export function isConfigured(cfg) {
  return !!(cfg && cfg.url && cfg.anonKey);
}

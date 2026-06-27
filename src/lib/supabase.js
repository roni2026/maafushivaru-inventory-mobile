// A small Supabase client factory. The client is (re)created whenever the
// configured URL / anon key changes (e.g. after editing them in Settings).
//
// The client persists its auth session in AsyncStorage so the user stays
// signed in between launches. Signing in (email/password, same account as the
// web app) is what grants the `authenticated` role full read/write access under
// the database's row-level-security policies — without it the app can only act
// as the anonymous role, which the RLS policies deny.
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

let _client = null;
let _key = '';

export function makeClient({ url, anonKey }) {
  const sig = `${url}::${anonKey}`;
  if (_client && sig === _key) return _client;
  _key = sig;
  _client = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return _client;
}

// ── fetchAll ───────────────────────────────────────────────────────────────
// PostgREST returns at most 1,000 rows per request. This pages through the
// full set so large inventories load completely. `makeQuery` must return a
// FRESH query builder each call.
export async function fetchAll(makeQuery, pageSize = 1000) {
  const all = [];
  let page = 0;
  // Safety cap: 200 pages = 200k rows.
  while (page < 200) {
    const from = page * pageSize;
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    page += 1;
  }
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// activity.js — per-item audit trail (mobile).
// Records who changed an item and when so the item screen can show
// "last updated <when> by <who>" plus a "view more" list of the last 15 changes.
// ─────────────────────────────────────────────────────────────────────────────

// Best-effort log — never throws.
export async function logItemActivity(supabase, itemId, action, detail, actor) {
  if (!supabase || !itemId) return;
  try {
    await supabase.from('item_activity').insert({
      item_id: itemId, action, detail: detail || null, changed_by: actor || 'mobile',
    });
    await supabase.from('items').update({ updated_by: actor || 'mobile' }).eq('id', itemId);
  } catch {
    /* non-critical */
  }
}

export async function fetchItemActivity(supabase, itemId, limit = 15) {
  const { data, error } = await supabase
    .from('item_activity')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

export function actionLabel(action) {
  const map = {
    created: 'Created',
    edited: 'Edited details',
    subcategory_changed: 'Moved sub-category',
    stock_add: 'Stock added',
    stock_remove: 'Stock removed',
    stock_set: 'Stock set',
    photo_added: 'Photo added',
    photo_removed: 'Photo removed',
    received: 'Received (boat note)',
    deactivated: 'Deactivated',
    activated: 'Activated',
  };
  return map[action] || action;
}

export function fmtWhen(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(ts); }
}

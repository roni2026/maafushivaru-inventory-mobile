// ─────────────────────────────────────────────────────────────────────────────
// itemImages.js — multi-image storage for inventory items (max 3), Supabase.
//
// Photos live in the public `item-images` bucket; one row per photo in the
// `item_images` table. The first photo is mirrored to items.image_url so the
// existing single-image screens keep working. Uploads must already be compressed
// to <300 KB by the caller (imageprep.compressImageToLimit).
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_IMAGES = 3;
const BUCKET = 'item-images';

// Decode a base64 string to a Uint8Array (RN has no reliable atob).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64) {
  const clean = String(b64 || '').replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const bytesLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(bytesLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = B64.indexOf(clean[i]);
    const e2 = B64.indexOf(clean[i + 1]);
    const e3 = B64.indexOf(clean[i + 2]);
    const e4 = B64.indexOf(clean[i + 3]);
    const c1 = (e1 << 2) | (e2 >> 4);
    const c2 = ((e2 & 15) << 4) | (e3 >> 2);
    const c3 = ((e3 & 3) << 6) | e4;
    out[p++] = c1;
    if (e3 !== -1) out[p++] = c2;
    if (e4 !== -1) out[p++] = c3;
  }
  return out.subarray(0, p);
}

export async function listItemImages(supabase, itemId) {
  const { data, error } = await supabase
    .from('item_images')
    .select('*')
    .eq('item_id', itemId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return data || [];
}

// Upload one already-compressed photo (base64) for an item. Returns the new row.
export async function uploadItemImage(supabase, itemId, base64, { createdBy, bytes } = {}) {
  const existing = await listItemImages(supabase, itemId);
  if (existing.length >= MAX_IMAGES) throw new Error(`Maximum ${MAX_IMAGES} photos per item.`);
  const pos = existing.length;
  const path = `${itemId}/${Date.now()}_${pos}.jpg`;

  const bytesArr = base64ToBytes(base64);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytesArr, { upsert: true, contentType: 'image/jpeg' });
  if (upErr) throw upErr;

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = `${publicUrl}?t=${Date.now()}`;

  const { data: row, error: dbErr } = await supabase
    .from('item_images')
    .insert({ item_id: itemId, url, storage_path: path, position: pos, size_bytes: bytes || bytesArr.length, created_by: createdBy || null })
    .select()
    .single();
  if (dbErr) throw dbErr;

  await syncPrimary(supabase, itemId);
  return row;
}

export async function removeItemImage(supabase, image) {
  if (image.storage_path) {
    await supabase.storage.from(BUCKET).remove([image.storage_path]).catch(() => {});
  }
  const { error } = await supabase.from('item_images').delete().eq('id', image.id);
  if (error) throw error;
  await syncPrimary(supabase, image.item_id);
}

async function syncPrimary(supabase, itemId) {
  const imgs = await listItemImages(supabase, itemId);
  const primary = imgs[0]?.url || null;
  await supabase.from('items').update({ image_url: primary }).eq('id', itemId).catch(() => {});
}

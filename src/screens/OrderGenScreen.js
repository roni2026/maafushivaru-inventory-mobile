import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { num } from '../lib/format';
import { Loading, EmptyState, Badge, SearchBar, PrimaryButton } from '../components/ui';

const code = (s) => String(s || '').replace(/^0+/, '');
const LOCAL_KW = ['BANANA', 'WATERMELON', 'PINEAPPLE', 'PAPAYA', 'MELON', 'CARROT', 'ONION', 'TOMATO', 'COCONUT', 'FISH', 'REEF', 'GROUPER', 'LIME', 'LETTUCE', 'CUCUMBER', 'CABBAGE', 'LOCAL', 'HERB', 'LEAF'];
const classifyOrigin = (name) => LOCAL_KW.some((k) => String(name || '').toUpperCase().includes(k)) ? 'local' : 'foreign';

// Next Monday or Thursday (whichever is sooner).
function nextDelivery() {
  const today = new Date();
  const day = today.getDay();
  let best = 8, bestDay = 'Monday';
  for (const [t, name] of [[1, 'Monday'], [4, 'Thursday']]) {
    let diff = (t - day + 7) % 7; if (diff === 0) diff = 7;
    if (diff < best) { best = diff; bestDay = name; }
  }
  const d = new Date(today); d.setDate(today.getDate() + best);
  return { date: d.toISOString().split('T')[0], day: bestDay };
}

export default function OrderGenScreen() {
  const { supabase, user } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [delivery] = useState(nextDelivery());

  const generate = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const items = (await fetchAll(() => supabase.from('items').select('id,part_number,name,unit,current_stock,supplier,origin,active,stores(name)'))).filter((i) => i && i.active !== false);

      // Supplier → origin map (Suppliers tab designation).
      let supOrigin = new Map();
      try {
        const { data: sups } = await supabase.from('suppliers').select('name,origin');
        supOrigin = new Map((sups || []).filter((s) => s.origin).map((s) => [String(s.name || '').toUpperCase(), s.origin]));
      } catch { /* suppliers table optional */ }

      // Boat-note STORE demand → average weekly ordered qty per code.
      const bn = await fetchAll(() => supabase.from('boat_note_items').select('part_number,ordered_qty,department,boat_note_id,status'));
      const notes = (await supabase.from('boat_notes').select('id,note_date')).data || [];
      const noteDate = new Map(notes.map((n) => [n.id, n.note_date]));
      const storeBn = bn.filter((b) => (b.department || '').toUpperCase() === 'STORE');
      const byCode = new Map();
      let minD = null, maxD = null;
      for (const b of storeBn) {
        const c = code(b.part_number); if (!c) continue;
        const e = byCode.get(c) || { qty: 0 }; e.qty += num(b.ordered_qty); byCode.set(c, e);
        const d = noteDate.get(b.boat_note_id); if (d) { if (!minD || d < minD) minD = d; if (!maxD || d > maxD) maxD = d; }
      }
      const weeks = (minD && maxD) ? Math.max(1, (new Date(maxD) - new Date(minD)) / 6048e5) : 1;

      const originOf = (it) => supOrigin.get(String(it.supplier || '').toUpperCase()) || it.origin || classifyOrigin(it.name);

      const patternRows = items.map((it) => {
        const bnE = byCode.get(code(it.part_number));
        const avg = bnE ? bnE.qty / weeks : 0;
        const suggested = Math.max(0, Math.round(avg - num(it.current_stock)));
        return {
          id: it.id, part_number: it.part_number, name: it.name, unit: it.unit,
          store: it.stores?.name || '', current_stock: num(it.current_stock),
          supplier: it.supplier || '', origin: originOf(it),
          ordered: suggested, include: suggested > 0, notArrived: false, tag: '',
        };
      }).filter((r) => r.ordered > 0);

      // Not-arrived / short items always first.
      const naSrc = await fetchAll(() => supabase.from('boat_note_items').select('*, boat_notes(note_date)').in('status', ['not_arrived', 'short']));
      const naByCode = new Map();
      for (const b of naSrc) {
        const c = code(b.part_number) || `x-${b.id}`;
        const qty = b.status === 'short' ? (num(b.short_qty) || Math.max(0, num(b.ordered_qty) - num(b.received_qty))) : num(b.ordered_qty);
        const d = b.boat_notes?.note_date || '';
        const prev = naByCode.get(c);
        if (!prev || d > prev._d) naByCode.set(c, { ...b, _qty: qty, _d: d });
      }
      const naRows = [...naByCode.values()].filter((b) => b._qty > 0).map((b) => {
        const it = items.find((x) => code(x.part_number) === code(b.part_number));
        return {
          id: it?.id || `na-${b.id}`, part_number: b.part_number, name: b.product_name || it?.name || b.part_number,
          unit: b.unit || it?.unit || 'EA', store: it?.stores?.name || b.department || '',
          current_stock: num(it?.current_stock), supplier: b.supplier || it?.supplier || '',
          origin: it ? originOf(it) : classifyOrigin(b.product_name), ordered: b._qty, include: true,
          notArrived: true, tag: b.status === 'short' ? 'short' : 'not arrived',
        };
      });
      const naCodes = new Set(naRows.map((r) => code(r.part_number)));
      setRows([...naRows, ...patternRows.filter((r) => !naCodes.has(code(r.part_number)))]);
    } catch (e) {
      Alert.alert('Could not generate', e?.message || 'error');
      setRows([]);
    } finally { setLoading(false); }
  }, [supabase]);

  useEffect(() => { generate(); }, [generate]);

  const filtered = useMemo(() => rows.filter((r) =>
    !search || `${r.name} ${r.part_number} ${r.supplier}`.toLowerCase().includes(search.toLowerCase())
  ), [rows, search]);

  const setQty = (id, val) => setRows((prev) => prev.map((r) => r.id === id ? { ...r, ordered: Math.max(0, num(val)) } : r));
  const bump = (id, d) => setRows((prev) => prev.map((r) => r.id === id ? { ...r, ordered: Math.max(0, r.ordered + d) } : r));
  const toggle = (id) => setRows((prev) => prev.map((r) => r.id === id ? { ...r, include: !r.include } : r));
  const remove = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  const selected = filtered.filter((r) => r.include && r.ordered > 0);

  const save = async () => {
    const toOrder = rows.filter((r) => r.include && r.ordered > 0);
    if (!toOrder.length) { Alert.alert('Nothing to order', 'Select at least one item with a quantity.'); return; }
    setSaving(true);
    try {
      const { data: order, error } = await supabase.from('order_history').insert({
        delivery_date: delivery.date, delivery_day: delivery.day, status: 'pending',
        created_by: user?.email || 'mobile', notes: `Order for ${delivery.day} ${delivery.date}`,
      }).select().single();
      if (error) throw error;
      const { error: e2 } = await supabase.from('order_history_items').insert(
        toOrder.map((r) => ({
          order_id: order.id, item_id: String(r.id).startsWith('na-') ? null : r.id,
          part_number: r.part_number, item_name: r.name, store_name: r.store,
          unit: r.unit, ordered_qty: r.ordered, received_qty: 0,
        }))
      );
      if (e2) throw e2;
      Alert.alert('Order saved', `${toOrder.length} items saved for ${delivery.day} (${delivery.date}).`);
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'error');
    } finally { setSaving(false); }
  };

  const renderItem = ({ item: r }) => (
    <View style={[styles.row, !r.include && { opacity: 0.5 }, r.notArrived && styles.rowNA]}>
      <TouchableOpacity onPress={() => toggle(r.id)} style={styles.check}>
        <Ionicons name={r.include ? 'checkbox' : 'square-outline'} size={22} color={r.include ? colors.primaryLight : colors.textFaint} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <View style={styles.badges}>
          {r.notArrived && <Badge label={r.tag} tone={r.tag === 'short' ? 'yellow' : 'red'} />}
          <Badge label={r.origin === 'local' ? 'Local' : 'Foreign'} tone={r.origin === 'local' ? 'green' : 'sky'} />
        </View>
        <Text style={styles.name} numberOfLines={2}>{r.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>#{r.part_number || '—'} · {r.supplier || r.store || '—'} · stock {r.current_stock}</Text>
      </View>
      <View style={styles.qtyBox}>
        <TouchableOpacity onPress={() => bump(r.id, -1)} style={styles.stepBtn}><Ionicons name="remove" size={16} color={colors.white} /></TouchableOpacity>
        <TextInput style={styles.qtyInput} value={String(r.ordered)} onChangeText={(v) => setQty(r.id, v)} keyboardType="numeric" />
        <TouchableOpacity onPress={() => bump(r.id, 1)} style={styles.stepBtn}><Ionicons name="add" size={16} color={colors.white} /></TouchableOpacity>
      </View>
      <TouchableOpacity onPress={() => remove(r.id)} style={styles.del}><Ionicons name="close" size={18} color={colors.textFaint} /></TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Generate Order</Text>
          <Text style={styles.sub2}>Delivery: {delivery.day} · {delivery.date} · not-arrived items first</Text>
        </View>
        <TouchableOpacity onPress={generate} style={styles.refresh}><Ionicons name="refresh" size={18} color={colors.primaryLight} /></TouchableOpacity>
      </View>
      <View style={{ paddingHorizontal: spacing.md }}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search items…" />
        <Text style={styles.count}>{selected.length} of {filtered.length} selected</Text>
      </View>

      {loading ? (
        <Loading text="Building order…" />
      ) : filtered.length === 0 ? (
        <EmptyState icon="cart-outline" title="Nothing to order" subtitle="No boat-note history or stock shortfalls yet." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={generate} tintColor={colors.primaryLight} />}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <View style={styles.footer}>
        <PrimaryButton label={saving ? 'Saving…' : `Save order (${selected.length})`} icon="save-outline" onPress={save} disabled={saving || !selected.length} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 8 },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  sub2: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  refresh: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  count: { color: colors.textFaint, fontSize: 12, marginTop: 4, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
  rowNA: { borderColor: colors.red, backgroundColor: '#2a1416' },
  check: { padding: 2 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 2 },
  name: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  qtyBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { width: 44, textAlign: 'center', color: colors.text, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 4 },
  del: { padding: 4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
});

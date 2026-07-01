import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, spacing } from '../lib/theme';
import { FormInput, SelectField, PrimaryButton, Loading, ErrorView, SectionLabel } from '../components/ui';
import { logItemActivity } from '../lib/activity';

const UNITS = ['pcs', 'box', 'bottle', 'can', 'kg', 'g', 'L', 'mL', 'pack', 'carton', 'tray', 'roll', 'each'];

// Add a new item or edit an existing one. Existing item is passed via
// route.params.item; absence of it means "create".
export default function ItemFormScreen({ navigation, route }) {
  const { supabase, user } = useApp();
  const actor = user?.email || 'mobile';
  const editing = route.params?.item || null;
  const isEdit = !!editing;

  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    part_number: editing?.part_number || '',
    name: editing?.name || '',
    store_id: editing?.store_id || editing?.stores?.id || '',
    unit: editing?.unit || 'pcs',
    current_stock: editing ? String(editing.current_stock ?? '') : '',
    min_stock: editing ? String(editing.min_stock ?? '') : '',
    pack_size: editing ? String(editing.pack_size ?? '1') : '1',
    unit_cost: editing ? String(editing.unit_cost ?? '') : '',
    expiry_date: editing?.expiry_date || '',
    supplier: editing?.supplier || '',
    location: editing?.location || '',
    notes: editing?.notes || '',
  });

  const f = (k) => (v) => setForm((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Edit item' : 'New item' });
  }, [navigation, isEdit]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) { setLoadErr('Not connected.'); setLoading(false); return; }
      try {
        const rows = await fetchAll(() => supabase.from('stores').select('id,name,category').order('category').order('name'));
        if (!alive) return;
        setStores(rows);
        // Default store for new items if none chosen yet.
        if (!isEdit && !form.store_id && rows.length) setForm((s) => ({ ...s, store_id: rows[0].id }));
      } catch (e) {
        if (alive) setLoadErr(e?.message || 'Failed to load stores');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase]);

  const storeOptions = useMemo(
    () => stores.map((s) => ({ label: `${s.name}  ·  ${s.category}`, value: s.id })),
    [stores]
  );

  const save = async () => {
    if (!form.part_number.trim()) { Alert.alert('Required', 'Enter an item ID (part number).'); return; }
    if (!form.name.trim()) { Alert.alert('Required', 'Enter an item name.'); return; }
    if (!form.store_id) { Alert.alert('Required', 'Pick a store (sub-category).'); return; }

    const numOrNull = (v) => (v === '' || v == null ? null : Number(v));
    const payload = {
      part_number: form.part_number.trim(),
      name: form.name.trim(),
      store_id: form.store_id,
      unit: form.unit?.trim() || 'pcs',
      min_stock: numOrNull(form.min_stock) ?? 0,
      pack_size: numOrNull(form.pack_size) ?? 1,
      unit_cost: numOrNull(form.unit_cost) ?? 0,
      expiry_date: form.expiry_date?.trim() || null,
      supplier: form.supplier?.trim() || null,
      location: form.location?.trim() || null,
      notes: form.notes?.trim() || null,
    };
    // Opening stock is only set when creating a new item; existing stock is
    // changed through "Adjust stock" so every movement is logged.
    if (!isEdit) payload.current_stock = numOrNull(form.current_stock) ?? 0;

    setSaving(true);
    try {
      if (isEdit) {
        payload.updated_by = actor;
        const { error } = await supabase.from('items').update(payload).eq('id', editing.id);
        if (error) throw error;
        if (editing.store_id && editing.store_id !== payload.store_id) {
          const s = stores.find((x) => x.id === payload.store_id);
          logItemActivity(supabase, editing.id, 'subcategory_changed', `Moved to ${s?.name || 'another sub-category'}`, actor);
        } else {
          logItemActivity(supabase, editing.id, 'edited', 'Item details edited', actor);
        }
      } else {
        payload.updated_by = actor;
        const { data: created, error } = await supabase.from('items').insert(payload).select('id').single();
        if (error) throw error;
        if (created?.id) logItemActivity(supabase, created.id, 'created', `Item created: ${payload.name}`, actor);
      }
      navigation.navigate('Tabs', { screen: 'Inventory', params: { refresh: Date.now() } });
    } catch (e) {
      const msg = e?.message || 'Save failed';
      const friendly = /duplicate key|unique/i.test(msg)
        ? 'An item with this ID (part number) already exists.'
        : msg;
      Alert.alert('Could not save', friendly);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading text="Loading…" />;
  if (loadErr) return <ErrorView message={loadErr} onRetry={() => navigation.goBack()} />;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
        <SectionLabel>Identity</SectionLabel>
        <FormInput label="Item ID (part number)" value={form.part_number} onChangeText={f('part_number')} placeholder="e.g. BEV-001" autoCapitalize="characters" />
        <FormInput label="Name" value={form.name} onChangeText={f('name')} placeholder="e.g. Mineral Water 500mL" />

        <SectionLabel>Location</SectionLabel>
        <SelectField label="Store (sub-category)" value={form.store_id} options={storeOptions} onChange={f('store_id')} placeholder="Pick a store" />
        <FormInput label="Shelf / location (optional)" value={form.location} onChangeText={f('location')} placeholder="e.g. Shelf A1" />

        <SectionLabel>Stock</SectionLabel>
        {!isEdit && (
          <FormInput label="Opening stock" value={form.current_stock} onChangeText={f('current_stock')} placeholder="0" keyboardType="numeric" />
        )}
        <SelectField label="Unit" value={form.unit} options={UNITS} onChange={f('unit')} />
        <FormInput label="Minimum stock" value={form.min_stock} onChangeText={f('min_stock')} placeholder="0" keyboardType="numeric" />
        <FormInput label="Pack size" value={form.pack_size} onChangeText={f('pack_size')} placeholder="1" keyboardType="numeric" hint="Order rounding — units per pack (use 1 if loose)." />
        <FormInput label="Unit cost" value={form.unit_cost} onChangeText={f('unit_cost')} placeholder="0.00" keyboardType="numeric" />

        <SectionLabel>Details</SectionLabel>
        <FormInput label="Expiry date (optional)" value={form.expiry_date} onChangeText={f('expiry_date')} placeholder="YYYY-MM-DD" autoCapitalize="none" hint="Leave blank if not perishable." />
        <FormInput label="Supplier (optional)" value={form.supplier} onChangeText={f('supplier')} placeholder="e.g. Maldives Fresh Co" />
        <FormInput label="Description / notes (optional)" value={form.notes} onChangeText={f('notes')} placeholder="Notes…" multiline />

        {isEdit && (
          <Text style={styles.hint}>
            Current stock is {Number(editing.current_stock || 0)} {editing.unit}. Use “Adjust stock” on the item to change it (every change is logged).
          </Text>
        )}

        <PrimaryButton label={saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create item')} icon="save-outline" onPress={save} disabled={saving} />
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hint: { color: colors.textFaint, fontSize: 12, marginTop: 4, marginBottom: 4, lineHeight: 17 },
});

import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, TouchableOpacity, Modal, Pressable,
  TextInput, Alert, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { Badge, PrimaryButton, SecondaryButton, DangerButton } from '../components/ui';
import { daysUntil, fmtDate, num } from '../lib/format';
import { compressImageToLimit } from '../lib/imageprep';
import { listItemImages, uploadItemImage, removeItemImage, MAX_IMAGES } from '../lib/itemImages';
import { logItemActivity, fetchItemActivity, actionLabel, fmtWhen } from '../lib/activity';

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? '—'}</Text>
    </View>
  );
}

export default function ItemDetailScreen({ navigation, route }) {
  const { supabase, user } = useApp();
  const actor = user?.email || 'mobile';
  const [item, setItem] = useState(route.params?.item || null);
  const [busy, setBusy] = useState(false);

  // Stock adjustment modal state.
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjMode, setAdjMode] = useState('add'); // 'add' | 'remove' | 'set'
  const [adjQty, setAdjQty] = useState('');
  const [adjNote, setAdjNote] = useState('');

  // Photos, activity, sub-category state.
  const [images, setImages] = useState([]);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [activity, setActivity] = useState([]);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [stores, setStores] = useState([]);

  const itemId = route.params?.item?.id;

  const reload = useCallback(async () => {
    if (!supabase || !itemId) return;
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*, stores(id,name,category)')
        .eq('id', itemId)
        .single();
      if (!error && data) setItem(data);
    } catch { /* keep current */ }
  }, [supabase, itemId]);

  const reloadMedia = useCallback(async () => {
    if (!supabase || !itemId) return;
    try {
      const [imgs, act] = await Promise.all([
        listItemImages(supabase, itemId),
        fetchItemActivity(supabase, itemId, 15),
      ]);
      setImages(imgs); setActivity(act);
    } catch { /* ignore */ }
  }, [supabase, itemId]);

  useFocusEffect(useCallback(() => { reload(); reloadMedia(); }, [reload, reloadMedia]));

  const active = item?.active !== false;

  // ── Photos ────────────────────────────────────────────────────────────────
  const addPhoto = async (fromCamera) => {
    if (images.length >= MAX_IMAGES) { Alert.alert('Limit reached', `Maximum ${MAX_IMAGES} photos per item.`); return; }
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to add images.'); return; }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 1, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (res.canceled || !res.assets?.length) return;
      setUploadingImg(true);
      const asset = res.assets[0];
      const out = await compressImageToLimit(asset.uri);          // → JPEG < 300 KB
      await uploadItemImage(supabase, itemId, out.base64, { createdBy: actor, bytes: out.bytes });
      await logItemActivity(supabase, itemId, 'photo_added', `Photo added (${Math.round((out.bytes || 0) / 1024)} KB)`, actor);
      await reloadMedia();
    } catch (e) {
      Alert.alert('Upload failed', e?.message || 'error');
    } finally {
      setUploadingImg(false);
    }
  };

  const chooseAddPhoto = () => {
    Alert.alert('Add photo', 'Choose a source', [
      { text: 'Camera', onPress: () => addPhoto(true) },
      { text: 'Photo library', onPress: () => addPhoto(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removePhoto = (img) => {
    Alert.alert('Remove photo', 'Remove this photo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await removeItemImage(supabase, img);
          await logItemActivity(supabase, itemId, 'photo_removed', 'Photo removed', actor);
          await reloadMedia();
        } catch (e) { Alert.alert('Error', e?.message || 'error'); }
      } },
    ]);
  };

  // ── Change sub-category ─────────────────────────────────────────────────────
  const openMove = async () => {
    setMoveOpen(true);
    if (!stores.length) {
      try {
        const rows = await fetchAll(() => supabase.from('stores').select('id,name,category').order('category').order('name'));
        setStores(rows);
      } catch { /* ignore */ }
    }
  };
  const moveSubcategory = async (storeId) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('items').update({ store_id: storeId }).eq('id', item.id);
      if (error) throw error;
      const s = stores.find((x) => x.id === storeId);
      await logItemActivity(supabase, itemId, 'subcategory_changed', `Moved to ${s?.name || 'another sub-category'}`, actor);
      setMoveOpen(false);
      await reload(); await reloadMedia();
    } catch (e) { Alert.alert('Could not move', e?.message || 'error'); }
    finally { setBusy(false); }
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('ItemForm', { item })} style={{ paddingHorizontal: 6 }}>
          <Ionicons name="create-outline" size={22} color={colors.primaryLight} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, item]);

  const days = daysUntil(item?.expiry_date);
  const isLow = num(item?.current_stock) <= num(item?.min_stock);
  const isOut = num(item?.current_stock) === 0;

  const openAdjust = (mode) => {
    setAdjMode(mode);
    setAdjQty(mode === 'set' ? String(num(item?.current_stock)) : '');
    setAdjNote('');
    setAdjOpen(true);
  };

  const applyAdjust = async () => {
    const qty = Number(adjQty);
    if (!Number.isFinite(qty) || (adjMode !== 'set' && qty <= 0)) {
      Alert.alert('Enter a quantity', 'Type a valid number.');
      return;
    }
    const before = num(item?.current_stock);
    let after, delta;
    if (adjMode === 'add') { delta = qty; after = before + qty; }
    else if (adjMode === 'remove') { delta = -qty; after = Math.max(0, before - qty); }
    else { after = Math.max(0, qty); delta = after - before; } // set
    setBusy(true);
    try {
      const { error: upErr } = await supabase.from('items').update({ current_stock: after }).eq('id', item.id);
      if (upErr) throw upErr;
      // Best-effort movement log (table exists in the standard schema).
      try {
        await supabase.from('stock_updates').insert({
          item_id: item.id,
          quantity_change: delta,
          new_quantity: after,
          updated_by: actor,
          note: adjNote?.trim() || (adjMode === 'set' ? 'Stock set (mobile)' : adjMode === 'add' ? 'Stock added (mobile)' : 'Stock removed (mobile)'),
        });
      } catch { /* logging is non-critical */ }
      const act = delta > 0 ? 'stock_add' : delta < 0 ? 'stock_remove' : 'stock_set';
      logItemActivity(supabase, item.id, act, `${delta >= 0 ? '+' : ''}${delta} → ${after}${adjNote?.trim() ? ' · ' + adjNote.trim() : ''}`, actor);
      setAdjOpen(false);
      await reload(); await reloadMedia();
    } catch (e) {
      Alert.alert('Could not update stock', e?.message || 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from('items').update({ active: !active }).eq('id', item.id);
      if (error) throw error;
      logItemActivity(supabase, item.id, !active ? 'activated' : 'deactivated', !active ? 'Item activated' : 'Item deactivated', actor);
      await reload();
    } catch (e) {
      Alert.alert('Could not update', e?.message || 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    Alert.alert(
      'Delete item',
      `Permanently delete “${item?.name}”? This also removes its stock history. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const { error } = await supabase.from('items').delete().eq('id', item.id);
              if (error) throw error;
              navigation.navigate('Tabs', { screen: 'Inventory', params: { refresh: Date.now() } });
            } catch (e) {
              Alert.alert('Could not delete', e?.message || 'error');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (!item) return null;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
        <View style={styles.headCard}>
          <Text style={styles.name}>{item?.name}</Text>
          <Text style={styles.code}>#{item?.part_number}</Text>
          <View style={styles.badges}>
            {!active && <Badge label="INACTIVE" tone="dim" />}
            {isOut ? <Badge label="OUT OF STOCK" tone="red" />
              : isLow ? <Badge label="LOW STOCK" tone="orange" /> : <Badge label="In stock" tone="green" />}
            {days !== null && days < 0 && <Badge label="EXPIRED" tone="red" />}
            {days !== null && days >= 0 && days <= 30 && <Badge label={`${days}d to expiry`} tone={days <= 7 ? 'red' : 'yellow'} />}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.stockRow}>
            <View style={styles.stockBox}>
              <Text style={styles.stockNum}>{num(item?.current_stock)}</Text>
              <Text style={styles.stockLabel}>Current ({item?.unit})</Text>
            </View>
            <View style={styles.stockBox}>
              <Text style={styles.stockNum}>{num(item?.min_stock)}</Text>
              <Text style={styles.stockLabel}>Minimum</Text>
            </View>
          </View>
          <View style={styles.adjRow}>
            <TouchableOpacity style={styles.adjBtn} onPress={() => openAdjust('add')}>
              <Ionicons name="add-circle-outline" size={18} color={colors.green} />
              <Text style={[styles.adjText, { color: colors.green }]}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.adjBtn} onPress={() => openAdjust('remove')}>
              <Ionicons name="remove-circle-outline" size={18} color={colors.orange} />
              <Text style={[styles.adjText, { color: colors.orange }]}>Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.adjBtn} onPress={() => openAdjust('set')}>
              <Ionicons name="create-outline" size={18} color={colors.primaryLight} />
              <Text style={[styles.adjText, { color: colors.primaryLight }]}>Set</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Field label="Category" value={item?.stores?.category} />
          <Field label="Sub-category (store)" value={item?.stores?.name} />
          <Field label="Unit" value={item?.unit} />
          <Field label="Pack size" value={num(item?.pack_size) || 1} />
          <Field label="Unit cost" value={item?.unit_cost != null ? `$${Number(item.unit_cost).toFixed(2)}` : '—'} />
          <Field label="Shelf / location" value={item?.location} />
          <Field label="Expiry date" value={fmtDate(item?.expiry_date)} />
          <Field label="Supplier" value={item?.supplier} />
          <Field label="Description / notes" value={item?.notes} />
        </View>

        {/* Photos (up to 3, auto-compressed to <300 KB) */}
        <View style={styles.card}>
          <View style={styles.photoHead}>
            <Text style={styles.cardTitle}>Photos <Text style={styles.countHint}>{images.length}/{MAX_IMAGES}</Text></Text>
            <TouchableOpacity onPress={chooseAddPhoto} disabled={uploadingImg || images.length >= MAX_IMAGES} style={styles.addPhotoBtn}>
              {uploadingImg
                ? <ActivityIndicator color={colors.primaryLight} size="small" />
                : <><Ionicons name="camera-outline" size={16} color={images.length >= MAX_IMAGES ? colors.textFaint : colors.primaryLight} /><Text style={[styles.addPhotoText, images.length >= MAX_IMAGES && { color: colors.textFaint }]}>Add</Text></>}
            </TouchableOpacity>
          </View>
          {images.length === 0 ? (
            <Text style={styles.emptyPhoto}>No photos yet. Add up to {MAX_IMAGES} — any size is auto-optimised to under 300 KB.</Text>
          ) : (
            <View style={styles.photoRow}>
              {images.map((img, i) => (
                <View key={img.id} style={styles.photoBox}>
                  <Image source={{ uri: img.url }} style={styles.photo} />
                  {i === 0 && <View style={styles.primaryTag}><Text style={styles.primaryTagText}>Primary</Text></View>}
                  <TouchableOpacity style={styles.photoDel} onPress={() => removePhoto(img)}>
                    <Ionicons name="trash" size={13} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Last updated + activity log */}
        <View style={styles.card}>
          <View style={styles.photoHead}>
            <Text style={styles.cardTitle}>Update log</Text>
            {activity.length > 1 && (
              <TouchableOpacity onPress={() => setShowAllActivity((v) => !v)}>
                <Text style={styles.viewMore}>{showAllActivity ? 'Show latest' : `View more (${Math.min(activity.length, 15)})`}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.lastUpdated}>
            Last updated {fmtWhen(item?.updated_at)}{item?.updated_by ? ` · ${item.updated_by}` : ''}
          </Text>
          {activity.length === 0 ? (
            <Text style={styles.emptyPhoto}>No changes recorded yet.</Text>
          ) : (
            (showAllActivity ? activity.slice(0, 15) : activity.slice(0, 1)).map((a) => (
              <View key={a.id} style={styles.actRow}>
                <Badge label={actionLabel(a.action)} tone="dim" />
                <View style={{ flex: 1 }}>
                  {!!a.detail && <Text style={styles.actDetail}>{a.detail}</Text>}
                  <Text style={styles.actMeta}>{fmtWhen(a.created_at)}{a.changed_by ? ` · ${a.changed_by}` : ''}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <PrimaryButton label="Edit item" icon="create-outline" onPress={() => navigation.navigate('ItemForm', { item })} disabled={busy} />
        <SecondaryButton label="Change sub-category" icon="folder-open-outline" onPress={openMove} disabled={busy} />
        <SecondaryButton label={active ? 'Deactivate item' : 'Activate item'} icon={active ? 'eye-off-outline' : 'eye-outline'} onPress={toggleActive} disabled={busy} />
        <DangerButton label="Delete item" icon="trash-outline" onPress={remove} disabled={busy} />
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Stock adjustment modal */}
      <Modal visible={adjOpen} transparent animationType="fade" onRequestClose={() => setAdjOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAdjOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {adjMode === 'add' ? 'Add stock' : adjMode === 'remove' ? 'Remove stock' : 'Set stock level'}
            </Text>
            <Text style={styles.modalSub}>Current: {num(item?.current_stock)} {item?.unit}</Text>
            <Text style={styles.mLabel}>{adjMode === 'set' ? 'New quantity' : 'Quantity'}</Text>
            <TextInput
              style={styles.mInput}
              value={adjQty}
              onChangeText={setAdjQty}
              placeholder="0"
              placeholderTextColor={colors.textFaint}
              keyboardType="numeric"
              autoFocus
            />
            <Text style={styles.mLabel}>Note (optional)</Text>
            <TextInput
              style={styles.mInput}
              value={adjNote}
              onChangeText={setAdjNote}
              placeholder="Reason / reference"
              placeholderTextColor={colors.textFaint}
            />
            <View style={{ marginTop: 6 }}>
              <PrimaryButton label={busy ? 'Saving…' : 'Apply'} icon="checkmark" onPress={applyAdjust} disabled={busy} />
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setAdjOpen(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
            {busy && <ActivityIndicator color={colors.primaryLight} style={{ marginTop: 8 }} />}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Change sub-category modal */}
      <Modal visible={moveOpen} transparent animationType="fade" onRequestClose={() => setMoveOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMoveOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Change sub-category</Text>
            <Text style={styles.modalSub}>Move “{item?.name}” to a different sub-category (store). This does not remove it from inventory.</Text>
            <ScrollView style={{ maxHeight: 320, marginTop: 6 }}>
              {stores.map((s) => {
                const current = s.id === item?.store_id;
                return (
                  <TouchableOpacity key={s.id} style={styles.storeRow} disabled={current || busy} onPress={() => moveSubcategory(s.id)}>
                    <Text style={[styles.storeName, current && { color: colors.textFaint }]}>{s.name}</Text>
                    <Text style={styles.storeCat}>{s.category}{current ? ' · current' : ''}</Text>
                  </TouchableOpacity>
                );
              })}
              {stores.length === 0 && <ActivityIndicator color={colors.primaryLight} style={{ marginVertical: 16 }} />}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setMoveOpen(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md,
  },
  name: { color: colors.text, fontSize: 20, fontWeight: '700' },
  code: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md,
  },
  stockRow: { flexDirection: 'row', gap: spacing.md },
  stockBox: {
    flex: 1, alignItems: 'center', backgroundColor: colors.cardAlt,
    borderRadius: radius.md, paddingVertical: spacing.md,
  },
  stockNum: { color: colors.primaryLight, fontSize: 26, fontWeight: '800' },
  stockLabel: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  adjRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  adjBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: 10,
  },
  adjText: { fontSize: 13, fontWeight: '700' },
  field: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  label: { color: colors.textFaint, fontSize: 13 },
  value: { color: colors.text, fontSize: 14, flex: 1, textAlign: 'right' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg,
  },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  modalSub: { color: colors.textDim, fontSize: 13, marginTop: 4, marginBottom: 8 },
  mLabel: { color: colors.textDim, fontSize: 13, marginTop: 10, marginBottom: 6 },
  mInput: {
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontSize: 15,
  },
  modalClose: { marginTop: spacing.sm, alignItems: 'center', paddingVertical: 8 },
  modalCloseText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },

  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  countHint: { color: colors.textFaint, fontSize: 12, fontWeight: '500' },
  photoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addPhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: colors.cardAlt },
  addPhotoText: { color: colors.primaryLight, fontSize: 13, fontWeight: '600' },
  emptyPhoto: { color: colors.textFaint, fontSize: 12, lineHeight: 17 },
  photoRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  photoBox: { width: 92, height: 92, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.cardAlt },
  photo: { width: '100%', height: '100%' },
  primaryTag: { position: 'absolute', top: 4, left: 4, backgroundColor: colors.primary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  primaryTagText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  photoDel: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: 4 },
  viewMore: { color: colors.primaryLight, fontSize: 13, fontWeight: '600' },
  lastUpdated: { color: colors.textDim, fontSize: 12, marginBottom: 8 },
  actRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  actDetail: { color: colors.text, fontSize: 13 },
  actMeta: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  storeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  storeName: { color: colors.text, fontSize: 14 },
  storeCat: { color: colors.textFaint, fontSize: 12 },
});

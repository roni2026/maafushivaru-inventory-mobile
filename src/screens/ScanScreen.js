import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { PrimaryButton, SecondaryButton, Badge } from '../components/ui';
import { prepForOcr } from '../lib/imageprep';
import { ocrSpaceBase64 } from '../lib/ocrspace';
import { parseFuel, parseItems, parseExpiry } from '../lib/parsers';

// OCR modes the user can pick before taking the photo.
const MODES = [
  { key: 'fuel',    icon: 'water',           title: 'Fuel chit',       sub: 'Petrol / diesel → Dive Centre fuel log',  table: true },
  { key: 'expiry',  icon: 'calendar',        title: 'Expiry dates',    sub: 'Update item expiry by code match',         table: true },
  { key: 'boatnote',icon: 'boat',            title: 'Boat note',       sub: 'Capture received items as a draft note',   table: true },
  { key: 'reqs',    icon: 'document-text',   title: 'Requisition',     sub: 'Preview issued items (review only)',       table: true },
  { key: 'text',    icon: 'text',            title: 'Plain text',      sub: 'Raw recognised text',                       table: false },
];

const today = () => new Date().toISOString().split('T')[0];

export default function ScanScreen({ navigation }) {
  const { supabase } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const camRef = useRef(null);

  const [mode, setMode] = useState(null);     // selected OCR mode
  const [stage, setStage] = useState('pick'); // pick | camera | busy | review
  const [progress, setProgress] = useState(null);
  const [rawText, setRawText] = useState('');
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setMode(null); setStage('pick'); setProgress(null); setRawText(''); setRows([]);
  }, []);

  const chooseMode = async (m) => {
    setMode(m);
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) { Alert.alert('Camera needed', 'Allow camera access to scan.'); setMode(null); return; }
    }
    setStage('camera');
  };

  const capture = async () => {
    if (!camRef.current) return;
    setStage('busy'); setProgress({ label: 'Capturing…', pct: 10 });
    try {
      const photo = await camRef.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
      setProgress({ label: 'Enhancing image…', pct: 20 });
      const { base64 } = await prepForOcr(photo.uri, photo.width);
      const apiKeyRow = await supabase.from('settings').select('value').eq('key', 'ocr_space_api_key').maybeSingle();
      const text = await ocrSpaceBase64(base64, { apiKey: apiKeyRow?.data?.value, isTable: mode.table, onProgress: setProgress });
      setRawText(text);
      let parsed = [];
      if (mode.key === 'fuel') parsed = parseFuel(text);
      else if (mode.key === 'expiry') parsed = parseExpiry(text);
      else if (mode.key === 'boatnote' || mode.key === 'reqs') parsed = parseItems(text);
      setRows(parsed);
      setStage('review');
    } catch (e) {
      Alert.alert('Scan failed', e?.message || 'error');
      setStage('camera');
    } finally {
      setProgress(null);
    }
  };

  // ── per-mode save ──
  const save = async () => {
    setSaving(true);
    try {
      if (mode.key === 'fuel') {
        const payload = rows.filter((r) => r.boat_name && r.fuel_date && Number(r.qty) > 0).map((r) => ({
          fuel_type: (r.fuel_type || 'PETROL').toUpperCase() === 'DIESEL' ? 'DIESEL' : 'PETROL',
          fuel_date: r.fuel_date, boat_name: String(r.boat_name).trim(), qty: Number(r.qty),
          unit: r.unit || 'Ltrs', month_key: r.month_key || r.fuel_date.slice(0, 7), source_file: 'mobile-scan',
        }));
        if (!payload.length) throw new Error('Nothing to save');
        const { error } = await supabase.from('dive_centre_fuel').insert(payload);
        if (error) throw error;
        Alert.alert('Saved', `${payload.length} fuel entr${payload.length !== 1 ? 'ies' : 'y'} added.`);
        navigation.navigate('Fuel');
        reset();
      } else if (mode.key === 'expiry') {
        let matched = 0, missed = 0;
        for (const r of rows) {
          if (!r.expiry_date) continue;
          let q = supabase.from('items').update({ expiry_date: r.expiry_date });
          q = r.part_number ? q.eq('part_number', r.part_number) : q.ilike('name', `%${r.name}%`);
          const { data, error } = await q.select('id');
          if (!error && data && data.length) matched += data.length; else missed += 1;
        }
        Alert.alert('Expiry updated', `Updated ${matched} item(s). ${missed} not matched.`);
        reset();
      } else if (mode.key === 'boatnote') {
        const items = rows.filter((r) => r.product_name);
        if (!items.length) throw new Error('No items to save');
        const { data: note, error: nErr } = await supabase.from('boat_notes').insert({
          label: `Mobile scan · ${today()}`, note_date: today(), status: 'draft',
          source_file: 'mobile-scan', total_items: items.length,
        }).select().single();
        if (nErr) throw nErr;
        const { error: iErr } = await supabase.from('boat_note_items').insert(items.map((r, i) => ({
          boat_note_id: note.id, line_no: i + 1, part_number: r.part_number || null,
          product_name: r.product_name, unit: r.unit || 'EA', ordered_qty: Number(r.qty) || 0,
          received_qty: Number(r.qty) || 0, status: 'pending',
        })));
        if (iErr) throw iErr;
        Alert.alert('Draft saved', `Boat note draft created with ${items.length} item(s). Verify & post on the web app.`);
        navigation.navigate('BoatNote');
        reset();
      } else {
        Alert.alert('Review only', 'Requisition / text scans are preview-only here.');
      }
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── render: mode picker ──
  if (stage === 'pick') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
        <Text style={styles.h1}>Scan with the camera</Text>
        <Text style={styles.sub}>Pick what you're scanning — the photo is enhanced, read with Space OCR, then parsed accordingly.</Text>
        {MODES.map((m) => (
          <TouchableOpacity key={m.key} style={styles.modeCard} onPress={() => chooseMode(m)} activeOpacity={0.85}>
            <View style={styles.modeIcon}><Ionicons name={`${m.icon}-outline`} size={22} color={colors.primaryLight} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modeTitle}>{m.title}</Text>
              <Text style={styles.modeSub}>{m.sub}</Text>
            </View>
            <Ionicons name="camera-outline" size={20} color={colors.textFaint} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  // ── render: camera ──
  if (stage === 'camera') {
    return (
      <View style={styles.camWrap}>
        <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={styles.camTop}>
          <TouchableOpacity onPress={reset} style={styles.camBack}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
          <View style={styles.camPill}><Text style={styles.camPillText}>{mode?.title}</Text></View>
        </View>
        <View style={styles.camBottom}>
          <Text style={styles.camHint}>Frame the {mode?.title.toLowerCase()} and tap to capture</Text>
          <TouchableOpacity style={styles.shutter} onPress={capture} activeOpacity={0.8}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── render: busy ──
  if (stage === 'busy') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryLight} />
        <Text style={styles.busyLabel}>{progress?.label || 'Working…'}</Text>
        {progress?.pct != null && (
          <View style={styles.bar}><View style={[styles.barFill, { width: `${progress.pct}%` }]} /></View>
        )}
      </View>
    );
  }

  // ── render: review ──
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <View style={styles.reviewHead}>
        <Text style={styles.h1}>{mode?.title} · review</Text>
        <Badge label={`${rows.length} found`} tone="teal" />
      </View>

      {mode.key === 'text' ? (
        <View style={styles.card}><Text style={styles.rawText} selectable>{rawText || 'No text recognised.'}</Text></View>
      ) : rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.sub}>Nothing detected. Recognised text:</Text>
          <Text style={styles.rawText} selectable>{rawText}</Text>
        </View>
      ) : mode.key === 'fuel' ? (
        rows.map((r, i) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.rowLine}>
              <Field flex={1.2} label="Date" value={r.fuel_date} onChange={(v) => editRow(i, 'fuel_date', v)} />
              <Field flex={0.8} label="Qty" value={String(r.qty)} keyboard="numeric" onChange={(v) => editRow(i, 'qty', v)} />
            </View>
            <Field label="Boat" value={r.boat_name} onChange={(v) => editRow(i, 'boat_name', v)} />
            <View style={styles.rowLine}>
              <TypeToggle value={r.fuel_type} onChange={(v) => editRow(i, 'fuel_type', v)} />
              <Field flex={1} label="Unit" value={r.unit} onChange={(v) => editRow(i, 'unit', v)} />
            </View>
            <DeleteRow onPress={() => delRow(i)} />
          </View>
        ))
      ) : mode.key === 'expiry' ? (
        rows.map((r, i) => (
          <View key={r.id} style={styles.card}>
            <Field label="Item (code / name)" value={`${r.part_number ? '#' + r.part_number + ' · ' : ''}${r.name}`} editable={false} />
            <Field label="Expiry date" value={r.expiry_date} onChange={(v) => editRow(i, 'expiry_date', v)} />
            <DeleteRow onPress={() => delRow(i)} />
          </View>
        ))
      ) : (
        rows.map((r, i) => (
          <View key={r.id} style={styles.card}>
            <Field label="Code" value={r.part_number} onChange={(v) => editRow(i, 'part_number', v)} />
            <Field label="Product" value={r.product_name} onChange={(v) => editRow(i, 'product_name', v)} />
            <View style={styles.rowLine}>
              <Field flex={1} label="Qty" value={String(r.qty)} keyboard="numeric" onChange={(v) => editRow(i, 'qty', v)} />
              <Field flex={1} label="Unit" value={r.unit} onChange={(v) => editRow(i, 'unit', v)} />
            </View>
            <DeleteRow onPress={() => delRow(i)} />
          </View>
        ))
      )}

      {mode.key !== 'text' && mode.key !== 'reqs' && rows.length > 0 && (
        <PrimaryButton label={saving ? 'Saving…' : `Save ${rows.length}`} icon="checkmark" onPress={save} disabled={saving} />
      )}
      <SecondaryButton label="Scan again" icon="camera-outline" onPress={() => setStage('camera')} />
      <SecondaryButton label="Back to types" icon="grid-outline" onPress={reset} />
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  function editRow(i, field, val) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: field === 'qty' ? val.replace(/[^0-9.]/g, '') : val } : r));
  }
  function delRow(i) { setRows((prev) => prev.filter((_, idx) => idx !== i)); }
}

function Field({ label, value, onChange, keyboard, flex, editable = true }) {
  return (
    <View style={[{ marginBottom: spacing.sm }, flex ? { flex } : null]}>
      <Text style={styles.fLabel}>{label}</Text>
      <TextInput
        style={[styles.fInput, !editable && { opacity: 0.7 }]}
        value={value} onChangeText={onChange} editable={editable && !!onChange}
        keyboardType={keyboard} placeholder="—" placeholderTextColor={colors.textFaint}
        autoCapitalize="none" autoCorrect={false}
      />
    </View>
  );
}
function TypeToggle({ value, onChange }) {
  return (
    <View style={{ flex: 1, marginBottom: spacing.sm }}>
      <Text style={styles.fLabel}>Type</Text>
      <View style={styles.toggle}>
        {['PETROL', 'DIESEL'].map((t) => (
          <TouchableOpacity key={t} onPress={() => onChange(t)} style={[styles.toggleBtn, value === t && styles.toggleOn]}>
            <Text style={[styles.toggleText, value === t && { color: '#fff' }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
function DeleteRow({ onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.delRow}>
      <Ionicons name="trash-outline" size={16} color={colors.red} />
      <Text style={{ color: colors.red, fontSize: 13, fontWeight: '600' }}>Remove</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 14, padding: spacing.xl },
  h1: { color: colors.text, fontSize: 20, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 13, marginTop: 4, marginBottom: spacing.md },
  modeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  modeIcon: { width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  modeTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  modeSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  camWrap: { flex: 1, backgroundColor: '#000' },
  camTop: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, paddingTop: 48 },
  camBack: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  camPill: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  camPillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  camBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingBottom: 40, gap: 14 },
  camHint: { color: '#fff', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  shutter: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.2)' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  busyLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  bar: { width: '70%', height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primaryLight },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  rowLine: { flexDirection: 'row', gap: spacing.sm },
  fLabel: { color: colors.textDim, fontSize: 12, marginBottom: 4 },
  fInput: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, color: colors.text, fontSize: 14 },
  toggle: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  toggleOn: { backgroundColor: colors.primary },
  toggleText: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  delRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginTop: 2 },
  rawText: { color: colors.text, fontSize: 13, fontFamily: 'monospace' },
});

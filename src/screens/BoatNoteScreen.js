import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, Modal, Pressable, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { Chip, Loading, EmptyState, ErrorView, Badge, SearchBar, SelectField } from '../components/ui';
import { thisWeekRange, fmtDate, num } from '../lib/format';
import { logItemActivity } from '../lib/activity';
import { printReport, sharePdf, shareExcel, counts as reportCounts } from '../lib/boatNoteReport';
import { sendBoatNoteReport } from '../lib/brevo';

const SORTS = [
  { key: 'product_name', label: 'Name' },
  { key: 'ordered_qty', label: 'Ordered' },
  { key: 'received_qty', label: 'Received' },
  { key: 'department', label: 'Dept' },
  { key: 'supplier', label: 'Supplier' },
];

const cleanCode = (s) => String(s || '').replace(/^0+/, '') || '';
const rid = () => Math.random().toString(36).slice(2);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());

export default function BoatNoteScreen({ navigation }) {
  const { supabase, user } = useApp();
  const [scope, setScope] = useState('week'); // week | latest
  const [deptFilter, setDeptFilter] = useState('');  // '' = all departments
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('product_name');
  const [asc, setAsc] = useState(true);

  // Receive modal state
  const [recv, setRecv] = useState(null);            // boat_note_item being received
  const [recvItemId, setRecvItemId] = useState('');  // chosen inventory item id
  const [invSearch, setInvSearch] = useState('');
  const [batches, setBatches] = useState([]);        // [{ id, qty, exp }]
  const [recvNote, setRecvNote] = useState('');      // note for not-arrived / wrong-item
  const [busy, setBusy] = useState(false);

  // Report state
  const [reportBusy, setReportBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [recipient, setRecipient] = useState('');

  // ── Load inventory once (for matching + receiving) ──
  useEffect(() => {
    if (!supabase) return;
    fetchAll(() => supabase.from('items').select('id,name,part_number,unit,current_stock,origin').eq('active', true))
      .then(setInventory)
      .catch(() => { /* tolerate */ });
  }, [supabase]);
  const codeMap = useMemo(() => {
    const m = new Map(); for (const it of inventory) m.set(cleanCode(it.part_number), it); return m;
  }, [inventory]);
  const matchOf = useCallback((line) => {
    if (!line) return null;
    return inventory.find((i) => i.id === line.item_id) || codeMap.get(cleanCode(line.part_number)) || null;
  }, [inventory, codeMap]);

  const loadNotes = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    setLoadingNotes(true);
    try {
      let q = supabase
        .from('boat_notes')
        .select('id,note_date,label,delivery_day,status,total_items,posted_items,created_by')
        .order('note_date', { ascending: false });
      if (scope === 'week') {
        const { from, to } = thisWeekRange();
        q = q.gte('note_date', from).lte('note_date', to);
      } else {
        q = q.limit(15);
      }
      const { data, error: e } = await q;
      if (e) throw e;
      const list = data || [];
      setNotes(list);
      setSelectedId((prev) => (list.find((n) => n.id === prev) ? prev : (list[0]?.id || null)));
    } catch (e2) {
      setError(e2?.message || 'Failed to load boat notes');
    } finally {
      setLoadingNotes(false);
      setRefreshing(false);
    }
  }, [supabase, scope]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const loadItems = useCallback(async () => {
    if (!supabase || !selectedId) { setItems([]); return; }
    setLoadingItems(true);
    try {
      const { data, error: e } = await supabase
        .from('boat_note_items')
        .select('id,line_no,supplier,po_number,part_number,product_name,unit,ordered_qty,received_qty,expiry_date,department,status,is_sample,item_id,matched,note,received_by,received_at')
        .eq('boat_note_id', selectedId);
      if (e) throw e;
      setItems(data || []);
    } catch (e2) {
      setError(e2?.message || 'Failed to load boat note items');
    } finally {
      setLoadingItems(false);
    }
  }, [supabase, selectedId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const onRefresh = () => { setRefreshing(true); loadNotes(); };

  // ── Open the receive modal for a line ──
  const openReceive = (item) => {
    setRecv(item);
    const m = matchOf(item);
    setRecvItemId(item.item_id || m?.id || '');
    setInvSearch('');
    setRecvNote(item.note || '');
    setBatches([{ id: rid(), qty: item.received_qty != null ? String(item.received_qty) : String(item.ordered_qty ?? ''), exp: item.expiry_date || '' }]);
  };
  const closeReceive = () => { setRecv(null); setBatches([]); setRecvItemId(''); setInvSearch(''); setRecvNote(''); };

  // Flag a line as not arrived / wrong item (with the typed note).
  const markIssue = async (kind) => {
    if (!recv) return;
    setBusy(true);
    try {
      const patch = { status: kind, note: recvNote.trim() || null };
      const { error } = await supabase.from('boat_note_items').update(patch).eq('id', recv.id);
      if (error) throw error;
      setItems((prev) => prev.map((r) => (r.id === recv.id ? { ...r, ...patch } : r)));
      closeReceive();
    } catch (e) {
      Alert.alert('Could not update', e?.message || 'error');
    } finally { setBusy(false); }
  };

  const setBatch = (id, field, val) => setBatches((prev) => prev.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
  const addBatch = () => setBatches((prev) => [...prev, { id: rid(), qty: '', exp: '' }]);
  const delBatch = (id) => setBatches((prev) => (prev.length > 1 ? prev.filter((b) => b.id !== id) : prev));
  const totalQty = useMemo(() => batches.reduce((s, b) => s + (Number(b.qty) || 0), 0), [batches]);

  // ── Reports (Excel / Print / PDF / Send via Brevo) ─────────────────────────
  const reportNote = () => {
    const n = notes.find((x) => x.id === selectedId);
    return { label: n?.label || 'Boat note', note_date: n?.note_date || null, created_by: n?.created_by || (user?.email || 'mobile') };
  };
  const runReport = async (fn) => {
    if (!items.length) { Alert.alert('Nothing to export', 'This boat note has no items.'); return; }
    setReportBusy(true);
    try { await fn(reportNote(), items); }
    catch (e) { Alert.alert('Report error', e?.message || 'error'); }
    finally { setReportBusy(false); }
  };
  const doExcel = () => runReport(shareExcel);
  const doPrint = () => runReport(printReport);
  const doPdf   = () => runReport(sharePdf);
  const doSend  = async () => {
    if (!items.length) { Alert.alert('Nothing to send', 'This boat note has no items.'); return; }
    setReportBusy(true);
    try {
      const res = await sendBoatNoteReport(supabase, { note: reportNote(), lines: items, recipientEmail: recipient.trim() || undefined });
      setSendOpen(false);
      Alert.alert('Report sent', `Emailed to ${res.to}`);
    } catch (e) {
      Alert.alert('Could not send', e?.message || 'error');
    } finally { setReportBusy(false); }
  };


  const recvItem = useMemo(() => inventory.find((i) => i.id === recvItemId) || null, [inventory, recvItemId]);
  const invMatches = useMemo(() => {
    if (recvItemId) return [];
    const q = invSearch.trim().toLowerCase();
    const base = q
      ? inventory.filter((i) => `${i.name} ${i.part_number}`.toLowerCase().includes(q))
      : (recv ? inventory.filter((i) => cleanCode(i.part_number) === cleanCode(recv.part_number)) : []);
    return base.slice(0, 12);
  }, [inventory, recvItemId, invSearch, recv]);

  const postReceive = async () => {
    if (!recv) return;
    if (!recvItemId) { Alert.alert('Pick item', 'Choose the inventory item to receive into.'); return; }
    if (totalQty <= 0) { Alert.alert('Quantity', 'Enter a received quantity.'); return; }
    setBusy(true);
    try {
      const dated = batches.filter((b) => isDate(b.exp) && Number(b.qty) > 0);
      const earliest = dated.map((b) => b.exp).sort()[0] || null;
      const inv = recvItem;
      const newStock = num(inv?.current_stock) + totalQty;

      const upd = { current_stock: newStock };
      if (earliest) upd.expiry_date = earliest;
      const { error: uErr } = await supabase.from('items').update(upd).eq('id', recvItemId);
      if (uErr) throw uErr;

      const noteLabel = (notes.find((n) => n.id === selectedId)?.label) || 'Boat note';
      const noteDate = notes.find((n) => n.id === selectedId)?.note_date || null;
      await supabase.from('stock_updates').insert({
        item_id: recvItemId, date: noteDate, quantity_change: totalQty, new_quantity: newStock,
        updated_by: user?.email || 'mobile', note: `Boat note ${noteLabel}`,
      });
      // One inventory batch per expiry (multiple expiry supported).
      const batchRows = (dated.length ? dated.map((b) => ({ exp: b.exp, qty: Number(b.qty) || 0 })) : [{ exp: null, qty: totalQty }]);
      for (const b of batchRows) {
        try {
          await supabase.from('item_batches').insert({ item_id: recvItemId, expiry_date: b.exp, quantity: b.qty, note: `Boat note ${noteLabel}` });
        } catch { /* table may be missing */ }
      }
      try {
        await supabase.from('receiving').insert({
          item_id: recvItemId, item_name: inv?.name || recv.product_name, date: noteDate,
          quantity_received: totalQty, unit: recv.unit, supplier_name: recv.supplier,
          received_by: user?.email || 'mobile', invoice_number: recv.po_number, note: `Boat note: ${noteLabel}`,
        });
      } catch { /* optional */ }

      const patch = {
        received_qty: totalQty, expiry_date: earliest, status: 'received', matched: true, item_id: recvItemId,
        received_by: user?.email || 'mobile', received_at: new Date().toISOString(),
      };
      const { error: lErr } = await supabase.from('boat_note_items').update(patch).eq('id', recv.id);
      if (lErr) throw lErr;

      logItemActivity(supabase, recvItemId, 'received', `Received ${totalQty} ${recv.unit || ''} · Boat note ${noteLabel}`, user?.email || 'mobile');

      const note = notes.find((n) => n.id === selectedId);
      try { await supabase.from('boat_notes').update({ posted_items: num(note?.posted_items) + 1 }).eq('id', selectedId); } catch {}

      // Reflect locally.
      setItems((prev) => prev.map((r) => (r.id === recv.id ? { ...r, ...patch } : r)));
      setInventory((prev) => prev.map((i) => (i.id === recvItemId ? { ...i, current_stock: newStock, expiry_date: earliest || i.expiry_date } : i)));
      setNotes((prev) => prev.map((n) => (n.id === selectedId ? { ...n, posted_items: num(n.posted_items) + 1 } : n)));
      closeReceive();
    } catch (e) {
      Alert.alert('Could not receive', e?.message || 'error');
    } finally { setBusy(false); }
  };

  const delItem = (item) => {
    Alert.alert('Remove item', `Remove "${item.product_name}" from this boat note?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('boat_note_items').delete().eq('id', item.id);
        if (error) return Alert.alert('Error', error.message);
        setItems((prev) => prev.filter((r) => r.id !== item.id));
        closeReceive();
      } },
    ]);
  };

  const deleteNote = () => {
    if (!selectedId) return;
    Alert.alert('Delete boat note', 'Delete this whole boat note and all its items? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('boat_notes').delete().eq('id', selectedId);
        if (error) return Alert.alert('Error', error.message);
        setSelectedId(null);
        loadNotes();
      } },
    ]);
  };

  const deptOptions = useMemo(() => {
    const ds = [...new Set(items.map((i) => i.department).filter(Boolean))].sort();
    return [{ label: 'All stores / depts', value: '' }, ...ds.map((d) => ({ label: d, value: d }))];
  }, [items]);

  const sorted = useMemo(() => {
    let list = [...items];
    if (deptFilter) list = list.filter((i) => i.department === deptFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) =>
        (i.product_name || '').toLowerCase().includes(q) ||
        (i.part_number || '').toLowerCase().includes(q) ||
        (i.supplier || '').toLowerCase().includes(q)
      );
    }
    const numeric = sortKey === 'ordered_qty' || sortKey === 'received_qty';
    list.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (numeric) { va = num(va); vb = num(vb); return asc ? va - vb : vb - va; }
      va = (va || '').toString().toLowerCase();
      vb = (vb || '').toString().toLowerCase();
      return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }, [items, deptFilter, search, sortKey, asc]);

  const selectedNote = notes.find((n) => n.id === selectedId);

  const renderItem = ({ item }) => {
    const received = item.status === 'received';
    return (
      <TouchableOpacity
        style={[styles.row, received && { opacity: 0.7 }]}
        onPress={() => (received ? null : openReceive(item))}
        activeOpacity={received ? 1 : 0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>
            {item.product_name || 'Item'} {item.is_sample ? '🧪' : ''}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            #{item.part_number || '—'} · {item.supplier || '—'}
          </Text>
          <View style={styles.badges}>
            {!!item.department && <Badge label={item.department} tone="sky" />}
            {!!item.expiry_date && <Badge label={`exp ${fmtDate(item.expiry_date)}`} tone="yellow" />}
            {received ? <Badge label="received" tone="green" />
              : item.status === 'damaged' ? <Badge label="damaged" tone="red" />
              : item.status === 'not_arrived' ? <Badge label="not arrived" tone="red" />
              : item.status === 'wrong_item' ? <Badge label="wrong item" tone="orange" />
              : <Badge label="pending" tone="dim" />}
          </View>
        </View>
        <View style={styles.qtyBox}>
          <Text style={styles.qty}>{num(item.received_qty)}/{num(item.ordered_qty)}</Text>
          <Text style={styles.unit}>{item.unit || ''}</Text>
        </View>
        <Ionicons name={received ? 'checkmark-circle' : 'add-circle-outline'} size={20} color={received ? colors.green : colors.primaryLight} />
      </TouchableOpacity>
    );
  };

  if (loadingNotes) return <Loading text="Loading boat notes…" />;
  if (error && !notes.length) return <ErrorView message={error} onRetry={loadNotes} />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.chips}>
          <Chip label="This week" active={scope === 'week'} onPress={() => setScope('week')} />
          <Chip label="Latest" active={scope === 'latest'} onPress={() => setScope('latest')} />
        </View>

        {notes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {notes.map((n) => (
              <Chip
                key={n.id}
                label={`${fmtDate(n.note_date)}${n.delivery_day ? ` · ${n.delivery_day}` : ''}`}
                active={selectedId === n.id}
                onPress={() => setSelectedId(n.id)}
              />
            ))}
          </ScrollView>
        )}

        {selectedNote ? (
          <View style={styles.noteTitleRow}>
            <Text style={styles.noteTitle} numberOfLines={1}>
              {selectedNote.label || `Boat note · ${fmtDate(selectedNote.note_date)}`}
            </Text>
            <View style={styles.noteActions}>
              <TouchableOpacity onPress={() => navigation.navigate('NotArrived')} style={styles.naBtn}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.orange} />
                <Text style={styles.naText}>Not arrived</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={deleteNote} style={styles.delNoteBtn}>
                <Ionicons name="trash-outline" size={16} color={colors.red} />
                <Text style={styles.delNoteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {!!selectedId && items.length > 0 && (
          <View style={styles.reportBar}>
            <TouchableOpacity style={styles.reportBtn} onPress={doExcel} disabled={reportBusy}>
              <Ionicons name="grid-outline" size={15} color={colors.green} />
              <Text style={styles.reportText}>Excel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportBtn} onPress={doPrint} disabled={reportBusy}>
              <Ionicons name="print-outline" size={15} color={colors.primaryLight} />
              <Text style={styles.reportText}>Print</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportBtn} onPress={doPdf} disabled={reportBusy}>
              <Ionicons name="document-outline" size={15} color={colors.sky} />
              <Text style={styles.reportText}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reportBtn} onPress={() => setSendOpen(true)} disabled={reportBusy}>
              <Ionicons name="mail-outline" size={15} color={colors.yellow} />
              <Text style={styles.reportText}>Send</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!selectedId && (
          <>
            <Text style={styles.hint}>Tap an item to receive it into inventory (set qty &amp; one or more expiry dates), or flag it as not arrived / wrong.</Text>
            {deptOptions.length > 1 && (
              <SelectField label="Filter by store / department" value={deptFilter} options={deptOptions} onChange={setDeptFilter} />
            )}
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search items in this boat note…" />
            <View style={styles.sortRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexGrow: 1 }}>
                {SORTS.map((s) => (
                  <Chip key={s.key} label={s.label} active={sortKey === s.key} onPress={() => setSortKey(s.key)} />
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.dirBtn} onPress={() => setAsc((v) => !v)}>
                <Ionicons name={asc ? 'arrow-up' : 'arrow-down'} size={16} color={colors.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.count}>{sorted.length} item{sorted.length !== 1 ? 's' : ''}</Text>
          </>
        )}
      </View>

      {!selectedId ? (
        <EmptyState
          icon="boat-outline"
          title={scope === 'week' ? 'No boat note this week' : 'No boat notes found'}
          subtitle={scope === 'week' ? 'Switch to "Latest" to see earlier notes.' : 'Pull down to refresh.'}
        />
      ) : loadingItems ? (
        <Loading text="Loading items…" />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.md, paddingTop: 0 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primaryLight} />}
          ListEmptyComponent={<EmptyState icon="cube-outline" title="No items match" />}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* ── Receive into inventory (multiple expiry) ── */}
      <Modal visible={!!recv} transparent animationType="fade" onRequestClose={closeReceive}>
        <Pressable style={styles.backdrop} onPress={closeReceive}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle} numberOfLines={2}>{recv?.product_name || 'Item'}</Text>
              <Text style={styles.modalSub}>#{recv?.part_number || '—'} · ordered {num(recv?.ordered_qty)} {recv?.unit || ''}</Text>

              {/* Inventory link */}
              {recvItem ? (
                <View style={styles.matchBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchName} numberOfLines={1}>{recvItem.name}</Text>
                    <Text style={styles.matchSub}>#{recvItem.part_number} · stock {num(recvItem.current_stock)}</Text>
                  </View>
                  <TouchableOpacity onPress={() => { setRecvItemId(''); setInvSearch(''); }}>
                    <Text style={styles.changeLink}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={styles.warnBox}>No matched item — pick the inventory item to receive into.</Text>
                  <TextInput style={styles.mInput} value={invSearch} onChangeText={setInvSearch} placeholder="Search inventory by name or code…" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
                  <View style={styles.pickList}>
                    {invMatches.length === 0 ? (
                      <Text style={styles.pickEmpty}>No matching items.</Text>
                    ) : invMatches.map((i) => (
                      <TouchableOpacity key={i.id} style={styles.pickRow} onPress={() => setRecvItemId(i.id)}>
                        <Text style={styles.pickName} numberOfLines={1}>{i.name}</Text>
                        <Text style={styles.pickCode}>{i.part_number}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Multiple expiry batches */}
              <View style={styles.batchHead}>
                <Text style={styles.mLabel}>Quantity &amp; expiry</Text>
                <TouchableOpacity style={styles.addBatchBtn} onPress={addBatch}>
                  <Ionicons name="add" size={16} color={colors.primaryLight} />
                  <Text style={styles.addBatchText}>Add expiry</Text>
                </TouchableOpacity>
              </View>
              {batches.map((b) => (
                <View key={b.id} style={styles.batchRow}>
                  <TextInput style={[styles.mInput, { width: 78 }]} value={b.qty}
                    onChangeText={(v) => setBatch(b.id, 'qty', v.replace(/[^0-9.]/g, ''))}
                    keyboardType="numeric" placeholder="Qty" placeholderTextColor={colors.textFaint} />
                  <TextInput style={[styles.mInput, { flex: 1 }]} value={b.exp}
                    onChangeText={(v) => setBatch(b.id, 'exp', v)}
                    placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} autoCapitalize="none" />
                  <TouchableOpacity onPress={() => delBatch(b.id)} disabled={batches.length === 1} style={{ padding: 6, opacity: batches.length === 1 ? 0.3 : 1 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.red} />
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={styles.totalHint}>Total: {totalQty || 0} {recv?.unit || ''}{batches.length > 1 ? ` · ${batches.filter((b) => Number(b.qty) > 0).length} batches` : ''}. Leave date blank if no expiry.</Text>

              <TouchableOpacity style={[styles.saveBtn, busy && { opacity: 0.6 }]} onPress={postReceive} disabled={busy}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveText}>{busy ? 'Receiving…' : `Receive ${totalQty || ''} into inventory`}</Text>
              </TouchableOpacity>

              {/* Problem with this delivery? */}
              <View style={styles.issueDivider} />
              <Text style={styles.mLabel}>Problem? Add a note, then flag it</Text>
              <TextInput style={[styles.mInput, { height: 64, textAlignVertical: 'top', marginTop: 6 }]} value={recvNote}
                onChangeText={setRecvNote} multiline placeholder="e.g. 2 cases short / wrong size sent" placeholderTextColor={colors.textFaint} />
              <View style={styles.issueRow}>
                <TouchableOpacity style={[styles.issueBtn, { borderColor: colors.red }]} onPress={() => markIssue('not_arrived')} disabled={busy}>
                  <Ionicons name="close-circle-outline" size={16} color={colors.red} />
                  <Text style={[styles.issueText, { color: colors.red }]}>Didn't arrive</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.issueBtn, { borderColor: colors.orange }]} onPress={() => markIssue('wrong_item')} disabled={busy}>
                  <Ionicons name="swap-horizontal-outline" size={16} color={colors.orange} />
                  <Text style={[styles.issueText, { color: colors.orange }]}>Wrong item</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.issueBtn, { borderColor: colors.red }]} onPress={() => markIssue('damaged')} disabled={busy}>
                  <Ionicons name="warning-outline" size={16} color={colors.red} />
                  <Text style={[styles.issueText, { color: colors.red }]}>Damaged</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.delItemBtn} onPress={() => delItem(recv)}>
                <Ionicons name="trash-outline" size={16} color={colors.red} />
                <Text style={styles.delItemText}>Remove item from note</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalClose} onPress={closeReceive}><Text style={styles.modalCloseText}>Cancel</Text></TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Send report modal */}
      <Modal visible={sendOpen} transparent animationType="fade" onRequestClose={() => setSendOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSendOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Send boat note report</Text>
            <Text style={styles.modalSub}>
              Emails the categorised report (Received, Damaged, Wrong Item, Not Arrived, Pending) with the Excel file attached, via Brevo. Configure the API key & sender in the web app Settings.
            </Text>
            <Text style={styles.mLabel}>Recipient email (optional — uses saved recipient if blank)</Text>
            <TextInput
              style={styles.mInput}
              value={recipient}
              onChangeText={setRecipient}
              placeholder="manager@resort.com"
              placeholderTextColor={colors.textFaint}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={{ marginTop: 10 }}>
              <TouchableOpacity style={styles.saveBtn} onPress={doSend} disabled={reportBusy}>
                <Ionicons name="mail" size={18} color="#fff" />
                <Text style={styles.saveText}>{reportBusy ? 'Sending…' : 'Send report'}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSendOpen(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.md, gap: spacing.sm },
  chips: { flexDirection: 'row', gap: 8 },
  hint: { color: colors.textFaint, fontSize: 12 },
  noteTitle: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  noteTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  delNoteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.red, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  delNoteText: { color: colors.red, fontSize: 12, fontWeight: '600' },
  noteActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  naBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.orange, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  naText: { color: colors.orange, fontSize: 12, fontWeight: '600' },
  issueDivider: { height: 1, backgroundColor: colors.border, marginTop: 16, marginBottom: 12 },
  issueRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  reportBar: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 4 },
  reportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt },
  reportText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  issueBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: radius.md, paddingVertical: 10 },
  issueText: { fontSize: 13, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, maxHeight: '88%' },
  modalTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  modalSub: { color: colors.textDim, fontSize: 12, marginTop: 4, marginBottom: 8 },
  matchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)', borderRadius: radius.md, padding: 10, marginBottom: 4 },
  matchName: { color: colors.green, fontSize: 14, fontWeight: '700' },
  matchSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  changeLink: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  warnBox: { color: colors.orange, fontSize: 12, marginBottom: 8 },
  pickList: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: 8, maxHeight: 180, overflow: 'hidden' },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickName: { color: colors.text, fontSize: 14, flex: 1 },
  pickCode: { color: colors.sky, fontSize: 12, fontFamily: 'monospace' },
  pickEmpty: { color: colors.textFaint, fontSize: 12, padding: 12 },
  mLabel: { color: colors.textDim, fontSize: 13 },
  mInput: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11, color: colors.text, fontSize: 15 },
  batchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 },
  addBatchBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 4 },
  addBatchText: { color: colors.primaryLight, fontSize: 12, fontWeight: '600' },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  totalHint: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.md, marginTop: 14 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  delItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 6 },
  delItemText: { color: colors.red, fontSize: 13, fontWeight: '600' },
  modalClose: { alignItems: 'center', paddingVertical: 8 },
  modalCloseText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dirBtn: { backgroundColor: colors.primary, borderRadius: radius.md, width: 38, height: 34, alignItems: 'center', justifyContent: 'center' },
  count: { color: colors.textFaint, fontSize: 12 },
  row: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  name: { color: colors.text, fontSize: 14, fontWeight: '600' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  qtyBox: { alignItems: 'flex-end', minWidth: 54 },
  qty: { color: colors.text, fontSize: 15, fontWeight: '700' },
  unit: { color: colors.textFaint, fontSize: 11 },
});

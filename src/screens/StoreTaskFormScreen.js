import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform,
  TouchableOpacity, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { FormInput, PrimaryButton, SectionLabel } from '../components/ui';
import { scheduleTaskReminder, cancelTaskReminder, ensurePermission } from '../lib/notifications';

let DateTimePicker = null;
try { DateTimePicker = require('@react-native-community/datetimepicker').default; }
catch { DateTimePicker = null; }

// Round up to the next whole hour as a sensible default reminder time.
function defaultDue() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

function fmtDate(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(d) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
// Manual fallback parsing when the native picker isn't available.
function parseManual(dateStr, timeStr) {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr || '').trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec((timeStr || '').trim());
  if (!dm || !tm) return null;
  const d = new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]), 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function StoreTaskFormScreen({ navigation, route }) {
  const { supabase, user } = useApp();
  const editing = route.params?.task || null;
  const isEdit = !!editing;

  const [title, setTitle] = useState(editing?.title || '');
  const [details, setDetails] = useState(editing?.details || '');
  const [remind, setRemind] = useState(editing ? !!editing.due_at : true);
  const [due, setDue] = useState(editing?.due_at ? new Date(editing.due_at) : defaultDue());
  const [picker, setPicker] = useState(null); // 'date' | 'time' | null
  const [manualDate, setManualDate] = useState(''); // YYYY-MM-DD (fallback)
  const [manualTime, setManualTime] = useState(''); // HH:MM (fallback)
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Edit task' : 'New store task' });
  }, [navigation, isEdit]);

  useEffect(() => { if (remind) ensurePermission(); }, [remind]);

  const onPickerChange = (event, selected) => {
    // Android fires once and closes; keep the chosen value.
    if (Platform.OS === 'android') setPicker(null);
    if (event?.type === 'dismissed' || !selected) return;
    setDue((prev) => {
      const next = new Date(prev);
      if (picker === 'date') {
        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      } else {
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      }
      return next;
    });
  };

  const save = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Enter a task title.'); return; }

    let dueAt = null;
    if (remind) {
      let when = due;
      if (!DateTimePicker) {
        const parsed = parseManual(manualDate, manualTime);
        if (!parsed) { Alert.alert('Reminder time', 'Enter date as YYYY-MM-DD and time as HH:MM.'); return; }
        when = parsed;
      }
      dueAt = when.toISOString();
    }

    const payload = {
      title: title.trim(),
      details: details.trim() || null,
      due_at: dueAt,
    };
    if (!isEdit) {
      payload.status = 'pending';
      payload.created_by = user?.email || 'mobile';
    }

    setSaving(true);
    try {
      let saved;
      if (isEdit) {
        const { data, error } = await supabase.from('store_tasks').update(payload).eq('id', editing.id).select().single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase.from('store_tasks').insert(payload).select().single();
        if (error) throw error;
        saved = data;
      }

      // Sync the local reminder with the saved task.
      await cancelTaskReminder(saved.id);
      if (remind && saved.due_at && saved.status !== 'done') {
        const ok = await scheduleTaskReminder(saved);
        if (!ok) {
          Alert.alert('Saved', 'Task saved, but the reminder could not be scheduled (notifications may be off or the time is in the past).');
        }
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
        <SectionLabel>Task</SectionLabel>
        <FormInput label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Restock chiller before service" />
        <FormInput label="Details (optional)" value={details} onChangeText={setDetails} placeholder="What needs doing…" multiline />

        <SectionLabel>Reminder</SectionLabel>
        <View style={styles.remindRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.remindTitle}>Notify at a time</Text>
            <Text style={styles.remindSub}>Plays an alert sound and shows a notification.</Text>
          </View>
          <Switch
            value={remind}
            onValueChange={setRemind}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.white}
          />
        </View>

        {remind && (DateTimePicker ? (
          <View style={styles.pickRow}>
            <TouchableOpacity style={styles.pickBtn} onPress={() => setPicker('date')} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={16} color={colors.primaryLight} />
              <Text style={styles.pickText}>{fmtDate(due)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickBtn} onPress={() => setPicker('time')} activeOpacity={0.8}>
              <Ionicons name="time-outline" size={16} color={colors.primaryLight} />
              <Text style={styles.pickText}>{fmtTime(due)}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <FormInput label="Date" value={manualDate} onChangeText={setManualDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
            <FormInput label="Time (24h)" value={manualTime} onChangeText={setManualTime} placeholder="HH:MM" autoCapitalize="none" />
          </View>
        ))}

        {remind && DateTimePicker && picker && (
          <DateTimePicker
            value={due}
            mode={picker}
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onPickerChange}
          />
        )}

        <PrimaryButton
          label={saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create task')}
          icon="save-outline"
          onPress={save}
          disabled={saving}
        />
        <Text style={styles.foot}>Tasks and their status are shared with the website.</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  remindRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.sm },
  remindTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  remindSub: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  pickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  pickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingVertical: 12,
  },
  pickText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  foot: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing.md },
});

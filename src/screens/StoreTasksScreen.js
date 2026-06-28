import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { fetchAll } from '../lib/supabase';
import { colors, radius, spacing } from '../lib/theme';
import { Loading, ErrorView, EmptyState, FAB } from '../components/ui';
import { cancelTaskReminder, scheduleTaskReminder } from '../lib/notifications';

const STATUSES = ['pending', 'working', 'done'];
const STATUS_META = {
  pending: { label: 'Pending', tone: colors.yellow, icon: 'time-outline' },
  working: { label: 'Working', tone: colors.sky, icon: 'sync-outline' },
  done: { label: 'Done', tone: colors.green, icon: 'checkmark-done-outline' },
};
const ORDER = { working: 0, pending: 1, done: 2 };

function fmtDue(due) {
  if (!due) return null;
  try {
    const d = new Date(due);
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  } catch { return null; }
}

export default function StoreTasksScreen({ navigation }) {
  const { supabase } = useApp();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) { setErr('Not connected.'); setLoading(false); return; }
    try {
      const rows = await fetchAll(() =>
        supabase.from('store_tasks').select('*').order('created_at', { ascending: false })
      );
      const sorted = [...rows].sort((a, b) => {
        const s = (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9);
        if (s !== 0) return s;
        const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
        const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
        return ad - bd;
      });
      setTasks(sorted);
      setErr(null);
    } catch (e) {
      setErr(e?.message || 'Failed to load tasks');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const setStatus = async (task, status) => {
    if (task.status === status) return;
    setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      const { error } = await supabase.from('store_tasks').update({ status }).eq('id', task.id);
      if (error) throw error;
      // Stop reminding once a task is done; (re)schedule otherwise if still due.
      if (status === 'done') await cancelTaskReminder(task.id);
      else await scheduleTaskReminder({ ...task, status });
    } catch (e) {
      Alert.alert('Update failed', e?.message || 'Could not change status');
      load();
    }
  };

  const remove = (task) => {
    Alert.alert('Delete task', `Delete "${task.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('store_tasks').delete().eq('id', task.id);
            if (error) throw error;
            await cancelTaskReminder(task.id);
            setTasks((list) => list.filter((t) => t.id !== task.id));
          } catch (e) {
            Alert.alert('Delete failed', e?.message || 'Could not delete task');
          }
        },
      },
    ]);
  };

  if (loading) return <Loading text="Loading tasks…" />;
  if (err) return <ErrorView message={err} onRetry={load} />;

  const renderItem = ({ item }) => {
    const meta = STATUS_META[item.status] || STATUS_META.pending;
    const due = fmtDue(item.due_at);
    const overdue = item.due_at && item.status !== 'done' && new Date(item.due_at).getTime() < Date.now();
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('StoreTaskForm', { task: item })}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={[styles.title, item.status === 'done' && styles.titleDone]} numberOfLines={2}>
              {item.title}
            </Text>
            {!!item.details && (
              <Text style={styles.details} numberOfLines={3}>{item.details}</Text>
            )}
            {!!due && (
              <View style={styles.dueRow}>
                <Ionicons name="alarm-outline" size={13} color={overdue ? colors.red : colors.textFaint} />
                <Text style={[styles.due, overdue && { color: colors.red }]}>
                  {due}{overdue ? '  · overdue' : ''}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity onPress={() => remove(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="trash-outline" size={18} color={colors.red} />
          </TouchableOpacity>
        </View>

        <View style={styles.statusRow}>
          {STATUSES.map((s) => {
            const m = STATUS_META[s];
            const active = item.status === s;
            return (
              <TouchableOpacity
                key={s}
                style={[styles.statusBtn, active && { backgroundColor: m.tone, borderColor: m.tone }]}
                onPress={() => setStatus(item, s)}
                activeOpacity={0.8}
              >
                <Ionicons name={m.icon} size={14} color={active ? colors.bg : m.tone} />
                <Text style={[styles.statusText, { color: active ? colors.bg : m.tone }]}>{m.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={tasks}
        keyExtractor={(t) => String(t.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primaryLight} />
        }
        ListEmptyComponent={
          <EmptyState icon="list-outline" title="No tasks yet" subtitle="Tap + to create your first store task." />
        }
      />
      <FAB icon="add" onPress={() => navigation.navigate('StoreTaskForm')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { color: colors.text, fontSize: 15, fontWeight: '700' },
  titleDone: { textDecorationLine: 'line-through', color: colors.textDim },
  details: { color: colors.textDim, fontSize: 13, marginTop: 4, lineHeight: 18 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  due: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: spacing.md },
  statusBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt,
    borderRadius: radius.md, paddingVertical: 8,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
});

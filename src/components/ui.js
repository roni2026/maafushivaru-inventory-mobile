import React, { useState } from 'react';
import {
  View, Text, ActivityIndicator, TextInput, TouchableOpacity, StyleSheet,
  Modal, ScrollView, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'dim' }) {
  const toneColor = {
    dim: colors.textFaint, red: colors.red, orange: colors.orange,
    yellow: colors.yellow, green: colors.green, teal: colors.primaryLight, sky: colors.sky,
  }[tone] || colors.textFaint;
  return (
    <View style={[styles.badge, { borderColor: toneColor }]}>
      <Text style={[styles.badgeText, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

export function Loading({ text = 'Loading…' }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primaryLight} />
      <Text style={styles.dim}>{text}</Text>
    </View>
  );
}

export function EmptyState({ icon = 'cube-outline', title, subtitle }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={48} color={colors.textFaint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.dim}>{subtitle}</Text>}
    </View>
  );
}

export function ErrorView({ message, onRetry }) {
  return (
    <View style={styles.center}>
      <Ionicons name="warning-outline" size={44} color={colors.orange} />
      <Text style={styles.emptyTitle}>Something went wrong</Text>
      <Text style={[styles.dim, { textAlign: 'center', paddingHorizontal: 24 }]}>{message}</Text>
      {!!onRetry && (
        <TouchableOpacity style={styles.btn} onPress={onRetry}>
          <Ionicons name="refresh" size={16} color={colors.white} />
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder }) {
  return (
    <View style={styles.searchWrap}>
      <Ionicons name="search" size={18} color={colors.textFaint} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {!!value && (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={18} color={colors.textFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PrimaryButton({ label, icon, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.btn, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      {!!icon && <Ionicons name={icon} size={16} color={colors.white} />}
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({ label, icon, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.btnSecondary, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      {!!icon && <Ionicons name={icon} size={16} color={colors.primaryLight} />}
      <Text style={styles.btnSecondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function DangerButton({ label, icon, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[styles.btnDanger, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      {!!icon && <Ionicons name={icon} size={16} color={colors.red} />}
      <Text style={styles.btnDangerText}>{label}</Text>
    </TouchableOpacity>
  );
}

// Floating action button (bottom-right).
export function FAB({ icon = 'add', onPress }) {
  return (
    <TouchableOpacity style={styles.fab} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={28} color={colors.white} />
    </TouchableOpacity>
  );
}

export function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// Labelled text input for forms.
export function FormInput({
  label, value, onChangeText, placeholder, keyboardType, multiline,
  autoCapitalize = 'sentences', secureTextEntry, hint,
}) {
  return (
    <View style={styles.fieldWrap}>
      {!!label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        style={[styles.input, multiline && { height: 88, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
      />
      {!!hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

// Dropdown-style selector that opens a modal list of options.
// options: array of { label, value } (or plain strings).
export function SelectField({ label, value, options = [], onChange, placeholder = 'Select…' }) {
  const [open, setOpen] = useState(false);
  const norm = options.map((o) => (typeof o === 'string' ? { label: o, value: o } : o));
  const current = norm.find((o) => o.value === value);
  return (
    <View style={styles.fieldWrap}>
      {!!label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TouchableOpacity style={styles.select} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[styles.selectText, !current && { color: colors.textFaint }]} numberOfLines={1}>
          {current ? current.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{label || 'Select'}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {norm.length === 0 && <Text style={styles.dim}>No options.</Text>}
              {norm.map((o) => (
                <TouchableOpacity
                  key={String(o.value)}
                  style={styles.optionRow}
                  onPress={() => { onChange?.(o.value); setOpen(false); }}
                >
                  <Text style={[styles.optionText, o.value === value && { color: colors.primaryLight, fontWeight: '700' }]}>
                    {o.label}
                  </Text>
                  {o.value === value && <Ionicons name="checkmark" size={18} color={colors.primaryLight} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setOpen(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  badge: {
    borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: 8 },
  dim: { color: colors.textDim, fontSize: 13 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 4 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, height: 44,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: radius.md, marginTop: 8,
  },
  btnText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  btnSecondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md, marginTop: 8,
  },
  btnSecondaryText: { color: colors.primaryLight, fontWeight: '600', fontSize: 14 },
  btnDanger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.red,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.md, marginTop: 8,
  },
  btnDangerText: { color: colors.red, fontWeight: '600', fontSize: 14 },
  fab: {
    position: 'absolute', right: 18, bottom: 24,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  sectionLabel: {
    color: colors.textDim, fontSize: 13, fontWeight: '700',
    marginTop: spacing.lg, marginBottom: spacing.sm,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  fieldWrap: { marginBottom: spacing.md },
  fieldLabel: { color: colors.textDim, fontSize: 13, marginBottom: 6 },
  fieldHint: { color: colors.textFaint, fontSize: 11, marginTop: 4 },
  input: {
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    color: colors.text, fontSize: 15,
  },
  select: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12,
  },
  selectText: { color: colors.text, fontSize: 15, flex: 1, marginRight: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg,
  },
  modalTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.sm },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  optionText: { color: colors.text, fontSize: 15 },
  modalClose: { marginTop: spacing.md, alignItems: 'center', paddingVertical: 10 },
  modalCloseText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
});

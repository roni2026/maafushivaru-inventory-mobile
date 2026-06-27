import React, { useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, spacing } from '../lib/theme';
import { FormInput, SelectField, PrimaryButton } from '../components/ui';

// The 3 main categories, matching the web app and the database CHECK constraint.
const CATEGORIES = ['Food', 'General', 'Beverage'];

export default function StoreFormScreen({ navigation, route }) {
  const { supabase } = useApp();
  const editing = route.params?.store || null;
  const isEdit = !!editing;

  const [name, setName] = useState(editing?.name || '');
  const [category, setCategory] = useState(editing?.category || 'Food');
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Edit store' : 'New store' });
  }, [navigation, isEdit]);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Enter a store name.'); return; }
    if (!CATEGORIES.includes(category)) { Alert.alert('Required', 'Pick a category.'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), category };
      if (isEdit) {
        const { error } = await supabase.from('stores').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('stores').insert(payload);
        if (error) throw error;
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
      <FormInput label="Store name" value={name} onChangeText={setName} placeholder="e.g. Dry Store 1" />
      <SelectField
        label="Main category"
        value={category}
        options={CATEGORIES}
        onChange={setCategory}
      />
      <Text style={styles.hint}>
        Category must be one of Food, General or Beverage — these are the three main groups used across the web and mobile apps.
      </Text>
      <PrimaryButton label={saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create store')} icon="save-outline" onPress={save} disabled={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  hint: { color: colors.textFaint, fontSize: 12, marginBottom: spacing.md, lineHeight: 17 },
});

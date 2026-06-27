import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { useApp } from '../context/AppContext';
import { colors, radius, spacing } from '../lib/theme';
import { PrimaryButton, Badge } from '../components/ui';

export default function SettingsScreen() {
  const { cfg, updateConfig, resetConfig, supabase } = useApp();
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testMsg, setTestMsg] = useState(null);

  useEffect(() => {
    if (cfg) { setUrl(cfg.url || ''); setAnonKey(cfg.anonKey || ''); }
  }, [cfg]);

  const save = async () => {
    if (!url.trim() || !anonKey.trim()) {
      Alert.alert('Missing values', 'Enter both the Supabase URL and anon key.');
      return;
    }
    setSaving(true);
    try {
      await updateConfig({ url, anonKey });
      Alert.alert('Saved', 'Connection settings updated.');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTestMsg('Testing…');
    try {
      if (!supabase) { setTestMsg('Save settings first.'); return; }
      const { error } = await supabase.from('items').select('id', { count: 'exact', head: true });
      setTestMsg(error ? `Failed: ${error.message}` : 'Connected ✓');
    } catch (e) {
      setTestMsg(`Failed: ${e?.message || 'error'}`);
    }
  };

  const reset = async () => {
    await resetConfig();
    setTestMsg(null);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <View style={styles.card}>
        <Text style={styles.title}>Backend connection</Text>
        <Text style={styles.help}>
          Connect to the same Supabase project as the web app. Find these in your Supabase
          dashboard → Project Settings → API.
        </Text>

        <Text style={styles.label}>Supabase URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="https://xxxx.supabase.co"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Anon public key</Text>
        <TextInput
          style={[styles.input, { height: 90 }]}
          value={anonKey}
          onChangeText={setAnonKey}
          placeholder="eyJhbGciOi…"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />

        <PrimaryButton label={saving ? 'Saving…' : 'Save'} icon="save-outline" onPress={save} disabled={saving} />
        <View style={{ height: 8 }} />
        <PrimaryButton label="Test connection" icon="pulse-outline" onPress={test} />

        {!!testMsg && (
          <View style={{ marginTop: 12 }}>
            <Badge label={testMsg} tone={testMsg.startsWith('Connected') ? 'green' : testMsg.startsWith('Failed') ? 'red' : 'dim'} />
          </View>
        )}

        <Text style={[styles.help, { marginTop: 16 }]}>
          Source: {cfg?.source === 'saved' ? 'saved on this device' : 'build defaults (app.json)'}
        </Text>
        <View style={{ height: 8 }} />
        <PrimaryButton label="Reset to build defaults" icon="refresh-outline" onPress={reset} />
      </View>

      <Text style={styles.footer}>
        Read-only companion app for the Maafushivaru Inventory system. Uses the public anon key only.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  help: { color: colors.textDim, fontSize: 13, marginTop: 6, lineHeight: 18 },
  label: { color: colors.textDim, fontSize: 13, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    color: colors.text, fontSize: 14, textAlignVertical: 'top',
  },
  footer: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: 20, lineHeight: 17 },
});

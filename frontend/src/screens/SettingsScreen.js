import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import TopNav from '../components/TopNav';
import { useToast } from '../components/Toast';
import {
  getGeminiApiKey,
  setGeminiApiKey,
  clearGeminiApiKey,
  maskGeminiApiKey,
  hasGeminiApiKey,
  getGeminiProxyUrl,
  setGeminiProxyUrl,
  fingerprintGeminiApiKey,
  parseGeminiKeyFromEnvText,
} from '../lib/settings';
import { testGeminiConnection } from '../lib/gemini';
import { colors, typography } from '../theme';

export default function SettingsScreen({ navigation }) {
  const [keyInput, setKeyInput] = useState('');
  const [proxyInput, setProxyInput] = useState(getGeminiProxyUrl());
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const toast = useToast();
  const saved = hasGeminiApiKey();
  const savedFp = saved ? fingerprintGeminiApiKey() : null;
  const fileRef = useRef(null);

  const applyKey = (raw, source = 'paste') => {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
      toast.show('No key found.', { tone: 'danger' });
      return;
    }
    if (!trimmed.startsWith('AIza')) {
      toast.show(
        `Key must start with AIza (got "${trimmed.slice(0, 4)}"). Check letter 2 is capital I.`,
        { tone: 'danger' },
      );
      return;
    }
    setGeminiApiKey(trimmed);
    setKeyInput('');
    setTestResult(null);
    const fp = fingerprintGeminiApiKey(trimmed);
    toast.show(`Key loaded from ${source} (${fp.length} chars, …${fp.suffix})`, {
      tone: 'success',
    });
  };

  const handleLoadEnvFile = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const key = parseGeminiKeyFromEnvText(text) || text.trim();
      applyKey(key, file.name);
    } catch (e) {
      toast.show('Could not read file', { tone: 'danger' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = () => applyKey(keyInput, 'paste');

  const handleSaveProxy = () => {
    setGeminiProxyUrl(proxyInput);
    setTestResult(null);
    toast.show(
      proxyInput.trim() ? 'Proxy URL saved' : 'Using direct SDK (no proxy)',
      { tone: 'success' },
    );
  };

  const handleClear = () => {
    clearGeminiApiKey();
    setKeyInput('');
    setTestResult(null);
    toast.show('API key removed', { tone: 'success' });
  };

  const handleTest = async () => {
    const pendingKey = keyInput.trim();
    const testKey = pendingKey || getGeminiApiKey();
    if (!testKey && !proxyInput.trim()) {
      toast.show('Save a key first', { tone: 'danger' });
      return;
    }
    if (pendingKey) setGeminiApiKey(pendingKey);
    setGeminiProxyUrl(proxyInput);
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testGeminiConnection(testKey);
      setTestResult({
        ok: true,
        message: `Connected (${result.via}, ${result.model}).`,
      });
      toast.show('Gemini connection OK', { tone: 'success' });
    } catch (e) {
      const message = e.message || 'Connection failed';
      setTestResult({ ok: false, message });
      toast.show(message.slice(0, 140), { tone: 'danger' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={styles.container}>
      <TopNav navigation={navigation} currentRoute="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Gemini API key</Text>
          <Text style={styles.body}>
            Paste your Google AI Studio key. It is stored only in this browser
            and sent directly to Google via the official Gemini SDK.
          </Text>

          {saved ? (
            <View style={styles.savedRow}>
              <Text style={styles.savedLabel}>Saved</Text>
              <Text style={styles.savedValue}>{maskGeminiApiKey()}</Text>
            </View>
          ) : (
            <Text style={styles.warn}>No key saved yet.</Text>
          )}

          {saved && savedFp ? (
            <Text
              style={[
                styles.hint,
                savedFp.pos2.includes('lowercase') && styles.hintDanger,
              ]}
            >
              Stored: {savedFp.length} chars, prefix {savedFp.prefix}, pos2={savedFp.pos2},
              ends …{savedFp.suffix}
            </Text>
          ) : null}

          {Platform.OS === 'web' ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <input
                ref={fileRef}
                type="file"
                accept=".env,.txt,text/plain"
                style={{ display: 'none' }}
                onChange={handleLoadEnvFile}
              />
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => fileRef.current?.click()}
              >
                <Text style={styles.linkBtnText}>Load from .env file (recommended)</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="AIzaSy..."
            placeholderTextColor={colors.textLight}
            value={keyInput}
            onChangeText={setKeyInput}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            {...(Platform.OS === 'web'
              ? { autoComplete: 'off', 'data-1p-ignore': true }
              : {})}
          />
          <TouchableOpacity onPress={() => setShowKey(!showKey)}>
            <Text style={styles.toggleShow}>
              {showKey ? 'Hide key' : 'Show key while typing'}
            </Text>
          </TouchableOpacity>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
              <Text style={styles.primaryBtnText}>Save key</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleTest}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={styles.secondaryBtnText}>Test connection</Text>
              )}
            </TouchableOpacity>
            {saved ? (
              <TouchableOpacity style={styles.dangerBtn} onPress={handleClear}>
                <Text style={styles.dangerBtnText}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {testResult ? (
            <View
              style={[
                styles.testResult,
                testResult.ok ? styles.testOk : styles.testFail,
              ]}
            >
              <Text
                style={[
                  styles.testResultText,
                  testResult.ok ? styles.testOkText : styles.testFailText,
                ]}
              >
                {testResult.message}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Local proxy (optional)</Text>
          <Text style={styles.body}>
            Leave blank for normal use. Only needed if your key has HTTP referrer
            restrictions — then run npm run gemini-proxy and enter
            http://127.0.0.1:8787
          </Text>
          <TextInput
            style={styles.input}
            placeholder="http://127.0.0.1:8787"
            placeholderTextColor={colors.textLight}
            value={proxyInput}
            onChangeText={setProxyInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.linkBtn} onPress={handleSaveProxy}>
            <Text style={styles.linkBtnText}>Save proxy URL</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 24,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  title: { ...typography.heading, marginBottom: 4 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  sectionTitle: { ...typography.subheading },
  body: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },
  hint: { fontSize: 12, color: colors.textSecondary, lineHeight: 18 },
  hintDanger: { color: colors.danger, fontWeight: '600' },
  warn: { fontSize: 13, color: '#a86e00', fontStyle: 'italic' },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  savedLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  savedValue: {
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    fontSize: 13,
    color: colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  toggleShow: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  linkBtn: { alignSelf: 'flex-start' },
  linkBtnText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  dangerBtn: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dangerBtnText: { color: colors.danger, fontWeight: '700', fontSize: 14 },
  testResult: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  testOk: { backgroundColor: '#ecfdf3', borderColor: '#86efac' },
  testFail: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  testResultText: { fontSize: 13, lineHeight: 20 },
  testOkText: { color: '#166534' },
  testFailText: { color: '#991b1b' },
});

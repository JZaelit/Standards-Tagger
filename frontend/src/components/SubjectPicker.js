// Single-select subject picker for the AddAssignment / AddCurriculum forms.
//
// Three known subjects (ELA / Math / History) appear as pills. A trailing
// "Other..." pill reveals a text input so a teacher whose subject is e.g.
// "Art" or "PE" can type whatever they need without us pretending to know
// it. Custom subjects roundtrip as the lowercased string.
//
//   <SubjectPicker value={subject} onChange={setSubject} />
//
// value is always a string ("ela" | "math" | "history" | "<custom>") or ''.

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { ALL_SUBJECTS, SUBJECT_LABEL } from '../lib/evalFilters';
import { colors } from '../theme';

function isKnown(v) {
  return ALL_SUBJECTS.includes((v || '').toLowerCase());
}

export default function SubjectPicker({ value, onChange }) {
  const knownSelected = isKnown(value);
  // When the form starts with a custom value, open the input pre-filled.
  const [showCustom, setShowCustom] = useState(!!value && !knownSelected);
  const [customText, setCustomText] = useState(
    !knownSelected ? (value || '') : '',
  );

  // Keep the local input in sync if the parent resets the form.
  useEffect(() => {
    if (!isKnown(value)) {
      setCustomText(value || '');
      setShowCustom(!!value);
    } else {
      setShowCustom(false);
    }
  }, [value]);

  const pickKnown = (s) => {
    setShowCustom(false);
    setCustomText('');
    onChange(s);
  };

  const startCustom = () => {
    setShowCustom(true);
    if (knownSelected) {
      // Clear the known selection so the value reflects what's in the input.
      onChange('');
    }
  };

  const onCustomChange = (txt) => {
    setCustomText(txt);
    onChange(txt.trim().toLowerCase());
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.pillRow}>
        {ALL_SUBJECTS.map((s) => {
          const active = (value || '').toLowerCase() === s;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => pickKnown(s)}
              style={[styles.pill, active && styles.pillActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.pillText, active && styles.pillTextActive]}>
                {SUBJECT_LABEL[s] || s}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={startCustom}
          style={[styles.pill, showCustom && styles.pillActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: showCustom }}
        >
          <Text style={[styles.pillText, showCustom && styles.pillTextActive]}>
            Other...
          </Text>
        </TouchableOpacity>
      </View>
      {showCustom ? (
        <TextInput
          style={styles.input}
          placeholder="e.g. Art, PE, Spanish"
          placeholderTextColor={colors.textLight}
          value={customText}
          onChangeText={onCustomChange}
          autoCapitalize="words"
          autoFocus
        />
      ) : null}
      {showCustom && customText.trim() ? (
        <Text style={styles.hint}>
          Custom subject won&apos;t auto-tag against ELA / Math / History
          standards.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  hint: {
    fontSize: 11,
    color: colors.textLight,
    fontStyle: 'italic',
  },
});

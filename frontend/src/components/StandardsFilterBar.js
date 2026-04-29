// Search box + "Used by my assignments only" toggle.
// Sits below StandardsSummary on CurriculumDetailScreen.

import React from 'react';
import { View, Text, TextInput, StyleSheet, Switch } from 'react-native';
import { colors } from '../theme';

export default function StandardsFilterBar({
  query,
  onQuery,
  usedOnly,
  onUsedOnlyChange,
  usedCount,
}) {
  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={onQuery}
        placeholder="Search by code or text..."
        placeholderTextColor={colors.textLight}
      />
      <View style={styles.toggle}>
        <Switch
          value={usedOnly}
          onValueChange={onUsedOnlyChange}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor="#fff"
        />
        <Text style={styles.toggleLabel}>
          {`Used by my assignments${usedCount != null ? ` (${usedCount})` : ''}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  input: {
    flex: 1,
    minWidth: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: colors.white,
    color: colors.textPrimary,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});

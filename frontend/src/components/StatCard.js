// One summary card for the Dashboard hero row.
//   <StatCard label="Objectives" value="94" sub="64 aligned (68.1%)" />
// Optionally takes a children renderer for rich sub-content (e.g. the
// confidence-mix bar that appears under the High Confidence card).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, shadows, typography } from '../theme';

export default function StatCard({ label, value, sub, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      {children ? <View style={styles.extra}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  label: {
    ...typography.label,
    fontSize: 11,
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 32,
    marginTop: 4,
  },
  sub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  extra: {
    marginTop: 8,
  },
});

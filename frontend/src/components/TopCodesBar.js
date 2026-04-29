// Horizontal bar list of the most-frequently-assigned codes across all
// curated edusperiences, mirroring the dashboard's "Top codes" panel.
// Each bar is strand-colored via strandColor().

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { strandColor } from '../lib/strandColor';
import { colors, typography } from '../theme';

export default function TopCodesBar({ topCodes }) {
  if (!topCodes || !topCodes.length) {
    return <Text style={styles.empty}>No codes yet.</Text>;
  }
  const max = topCodes[0].n;

  return (
    <View style={styles.wrap}>
      {topCodes.map((row) => {
        const color = strandColor(row.code, null);
        const pct = max > 0 ? (100 * row.n) / max : 0;
        return (
          <View key={row.code} style={styles.row}>
            <Text style={[styles.code, { color }]} numberOfLines={1}>
              {row.code}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
            </View>
            <Text style={styles.n}>{row.n}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  code: {
    width: 110,
    fontFamily: 'Menlo',
    fontSize: 12,
    fontWeight: '600',
  },
  track: {
    flex: 1,
    height: 10,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
  n: {
    width: 28,
    textAlign: 'right',
    fontSize: 12,
    color: colors.textSecondary,
  },
  empty: {
    ...typography.body,
    fontStyle: 'italic',
    color: colors.textLight,
  },
});

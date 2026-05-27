// Horizontal bar list of the most-frequently-assigned codes across all
// curated edusperiences, mirroring the dashboard's "Top codes" panel.
// Each bar is strand-colored via strandColor().
//
// Optional onCodePress(code) makes each row a button so clicking jumps
// straight to the code in its curriculum (Dashboard wires this to
// CurriculumDetail with focusCode).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { strandColor } from '../lib/strandColor';
import { colors, typography } from '../theme';

export default function TopCodesBar({ topCodes, onCodePress }) {
  if (!topCodes || !topCodes.length) {
    return <Text style={styles.empty}>No codes yet.</Text>;
  }
  const max = topCodes[0].n;
  const isInteractive = !!onCodePress;

  return (
    <View style={styles.wrap}>
      {topCodes.map((row) => {
        const color = strandColor(row.code, null);
        const pct = max > 0 ? (100 * row.n) / max : 0;
        const RowWrapper = isInteractive ? TouchableOpacity : View;
        const wrapperProps = isInteractive
          ? {
              onPress: () => onCodePress(row.code),
              accessibilityRole: 'link',
              accessibilityLabel: `Open ${row.code} in its curriculum`,
              activeOpacity: 0.7,
            }
          : {};
        return (
          <RowWrapper
            key={row.code}
            style={[styles.row, isInteractive && styles.rowInteractive]}
            {...wrapperProps}
          >
            <Text style={[styles.code, { color }]} numberOfLines={1}>
              {row.code}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
            </View>
            <Text style={styles.n}>{row.n}</Text>
          </RowWrapper>
        );
      })}
      {isInteractive ? (
        <Text style={styles.hint}>Tap any code to view it in its curriculum</Text>
      ) : null}
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
    paddingVertical: 2,
  },
  rowInteractive: {
    borderRadius: 6,
    paddingHorizontal: 6,
    marginHorizontal: -6,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
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
  hint: {
    fontSize: 11,
    color: colors.textLight,
    fontStyle: 'italic',
    marginTop: 6,
  },
});

// One row in the per-assignment alignment view. Left column: objective title,
// description, path, optional note, and a "View original" link. Right column:
// the StandardChip stack, or a "no standard applies" fallback.
//
// Each StandardChip becomes interactive:
//   - Tap the chip body  -> jump to source (calls onViewSource)
//   - Tap the code badge -> open in curriculum (calls onOpenInCurriculum)
//
// onOpenInCurriculum is parameterised by code so the screen can navigate
// to the right curriculum + focus on that specific standard row.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import StandardChip from './StandardChip';
import { colors, typography } from '../theme';

const FALLBACK_BY_SUBJECT = {
  ela: 'No ELA standard applies.',
  math: 'No math standard applies.',
  history: 'No history standard applies.',
};

export default function ObjectiveRow({
  objective,
  subject = 'ela',
  showStandardText = true,
  hasSource = false,
  onViewSource,
  onOpenInCurriculum,
}) {
  const o = objective || {};
  const alignments = o.alignments || [];
  const fallback = FALLBACK_BY_SUBJECT[subject] || 'No standard applies.';

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={styles.title}>{o.title || ''}</Text>
        {o.description ? (
          <Text style={styles.desc}>{o.description}</Text>
        ) : null}
        {o.path ? (
          <Text style={styles.path}>{o.path}</Text>
        ) : null}
        {o.note ? (
          <Text style={styles.note}>{`Note: ${o.note}`}</Text>
        ) : null}
        {hasSource && onViewSource ? (
          <TouchableOpacity onPress={onViewSource}>
            <Text style={styles.viewOriginal}>{'View original \u2192'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.right}>
        {alignments.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{o.note || fallback}</Text>
          </View>
        ) : (
          alignments.map((a, i) => (
            <StandardChip
              key={i}
              alignment={a}
              showText={showStandardText}
              onJumpToSource={hasSource && onViewSource ? onViewSource : undefined}
              onOpenInCurriculum={
                onOpenInCurriculum ? () => onOpenInCurriculum(a.code) : undefined
              }
            />
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  left: {
    flex: 1,
    minWidth: 220,
    maxWidth: 360,
  },
  right: {
    flex: 1.4,
    gap: 10,
  },
  title: {
    ...typography.subheading,
    fontSize: 14,
  },
  desc: {
    ...typography.body,
    fontSize: 13,
    marginTop: 4,
  },
  path: {
    fontSize: 11,
    color: colors.textLight,
    fontFamily: 'Menlo',
    marginTop: 6,
  },
  note: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 6,
  },
  viewOriginal: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  empty: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    fontSize: 13,
  },
});

// One row in the per-assignment alignment view. Left column: objective title
// and description. Right column: the StandardChip stack with expandable
// source-match panels.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import StandardChip from './StandardChip';
import { stripHtml } from '../lib/htmlText';
import { sourceExcerptForAlignment } from '../lib/sourceExcerpt';
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
  onJumpToSource,
  onOpenInCurriculum,
}) {
  const o = objective || {};
  const alignments = o.alignments || [];
  const fallback = FALLBACK_BY_SUBJECT[subject] || 'No standard applies.';
  const title = o.title || o.objective_title || '';
  const description = stripHtml(o.description || o.objective_description || '');

  const objectiveContext = {
    title,
    description,
    path: o.path || '',
    sectionTitle: o.section_title || '',
    sectionDescription: o.section_description || '',
  };

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {description ? (
          <Text style={styles.desc}>{description}</Text>
        ) : null}
        {o.note ? (
          <Text style={styles.note}>{`Note: ${o.note}`}</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {alignments.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{o.note || fallback}</Text>
          </View>
        ) : (
          alignments.map((a, i) => {
            const sourceExcerpt = sourceExcerptForAlignment(description, a, alignments);
            return (
            <StandardChip
              key={i}
              alignment={a}
              showText={showStandardText}
              objectiveContext={objectiveContext}
              sourceExcerpt={sourceExcerpt}
              onJumpToSource={
                hasSource && onJumpToSource
                  ? () => onJumpToSource(a, sourceExcerpt)
                  : undefined
              }
              onOpenInCurriculum={
                onOpenInCurriculum ? () => onOpenInCurriculum(a.code) : undefined
              }
            />
            );
          })
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
    lineHeight: 19,
  },
  note: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 6,
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

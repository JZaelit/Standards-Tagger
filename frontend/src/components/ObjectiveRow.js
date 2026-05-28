// One row in the per-assignment alignment view. Left column: objective title
// and description. Right column: the StandardChip stack with expandable
// source-match panels.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import StandardChip from './StandardChip';
import ExpandableText from './ExpandableText';
import { stripHtml } from '../lib/htmlText';
import { sourceExcerptForAlignment } from '../lib/sourceExcerpt';
import { isLikelyNonStudentObjective } from '../lib/alignmentScope';
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
  standardTextByCode = null,
  hasSource = false,
  onJumpToSource,
  onOpenInCurriculum,
  onSaveAlignments,
}) {
  const o = objective || {};
  const alignments = o.alignments || [];
  const fallback = FALLBACK_BY_SUBJECT[subject] || 'No standard applies.';
  const nonStudent = isLikelyNonStudentObjective(o);
  const title = o.title || o.objective_title || '';
  const description = stripHtml(o.description || o.objective_description || '');

  const objectiveContext = {
    title,
    description,
    path: o.path || '',
    sectionTitle: o.section_title || '',
    sectionDescription: o.section_description || '',
  };
  const [draftCodes, setDraftCodes] = useState('');
  const codeHint = useMemo(
    () => alignments.map((a) => a.code).filter(Boolean).join(', '),
    [alignments],
  );
  const applyCodes = () => {
    if (!onSaveAlignments) return;
    const codes = (draftCodes || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    const next = [...new Set(codes)].map((code) => {
      const existing = alignments.find((a) => a.code === code);
      return existing || { code };
    });
    onSaveAlignments(next);
  };

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {description ? (
          <ExpandableText
            text={description}
            style={styles.descWrap}
            bodyStyle={styles.desc}
            maxChars={180}
          />
        ) : null}
        {o.note ? (
          <Text style={styles.note}>{`Note: ${o.note}`}</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        {alignments.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {o.note || (nonStudent
                ? 'Not a student learning task (logistics, grading, or educator-only).'
                : fallback)}
            </Text>
          </View>
        ) : (
          alignments.map((a, i) => {
            const sourceExcerpt = sourceExcerptForAlignment(description, a, alignments);
            return (
            <StandardChip
              key={i}
              alignment={a}
              showText={showStandardText}
              standardTextByCode={standardTextByCode}
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
        {!nonStudent ? (
        <View style={styles.editRow}>
          <Text style={styles.editLabel}>Edit codes (comma separated)</Text>
          <TextInput
            style={styles.editInput}
            value={draftCodes}
            onChangeText={setDraftCodes}
            placeholder={codeHint || 'e.g. RST.9-10.3, RST.9-10.4'}
            placeholderTextColor={colors.textLight}
          />
          <TouchableOpacity style={styles.editBtn} onPress={applyCodes}>
            <Text style={styles.editBtnText}>Save alignments</Text>
          </TouchableOpacity>
        </View>
        ) : null}
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
  descWrap: {
    marginTop: 4,
  },
  desc: {
    ...typography.body,
    fontSize: 13,
    color: colors.textPrimary,
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
  editRow: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    gap: 6,
  },
  editLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  editInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  editBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  editBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});

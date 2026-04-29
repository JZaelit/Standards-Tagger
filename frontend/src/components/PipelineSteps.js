// 3-stage pipeline explainer card for DashboardScreen. Static copy lifted
// from the HTML dashboard so users see the same explanation of how the
// curated alignments were produced.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../theme';

const STAGES = [
  {
    n: 'Stage 1',
    title: 'TF-IDF Shortlist',
    desc:
      'CA-ELA: 1,078 standards. CA-MATH: 519 standards. CA-HISTORY: 642 standards. ' +
      '1-2 ngrams + sublinear TF, top-15 candidates per objective by cosine similarity.',
  },
  {
    n: 'Stage 2',
    title: 'Heuristic Rerank',
    desc:
      'Subject auto-detection. Grade-band inference and keyword-to-strand/domain ' +
      'boost rules. Hard-skip for purely metacognitive objectives.',
  },
  {
    n: 'Stage 3',
    title: 'LLM Curation',
    desc:
      'Claude reads shortlist+rerank and commits codes per objective with confidence ' +
      'and rationale.',
  },
];

export default function PipelineSteps() {
  return (
    <View style={styles.row}>
      {STAGES.map((s) => (
        <View key={s.n} style={styles.step}>
          <Text style={styles.n}>{s.n.toUpperCase()}</Text>
          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.desc}>{s.desc}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  step: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 220,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  n: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  title: {
    ...typography.subheading,
    fontSize: 14,
    marginTop: 2,
    marginBottom: 4,
  },
  desc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});

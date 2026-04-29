// Dashboard - cross-edusperience overview, mirroring the HTML
// alignment_dashboard.html report.
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │  Standards Alignment Dashboard                                │
//   │  California - 4 ELA + 2 Math edusperiences. ...               │
//   └──────────────────────────────────────────────────────────────┘
//   [Edusperiences] [Objectives] [Code assignments] [High conf] [DBs]
//
//   Pipeline                           |  Top codes
//   [Stage 1] [Stage 2] [Stage 3]      |  [bar list]
//
//   Edusperiences (cards, tap -> Output)

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { dataClient } from '../lib/dataClient';
import { colors, typography, shadows } from '../theme';
import StatCard from '../components/StatCard';
import PipelineSteps from '../components/PipelineSteps';
import TopCodesBar from '../components/TopCodesBar';

function ConfidenceMix({ mix }) {
  const total = (mix?.high || 0) + (mix?.medium || 0) + (mix?.low || 0) || 1;
  const segs = [
    { key: 'hi', n: mix?.high || 0, color: '#0e7a3e' },
    { key: 'md', n: mix?.medium || 0, color: '#a86e00' },
    { key: 'lo', n: mix?.low || 0, color: '#9b3838' },
  ];
  return (
    <View style={mixStyles.bar}>
      {segs.map((s) => (
        <View
          key={s.key}
          style={[mixStyles.seg, { width: `${(100 * s.n) / total}%`, backgroundColor: s.color }]}
        />
      ))}
    </View>
  );
}

const mixStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  seg: { height: '100%' },
});

const SUBJECT_LABEL = { ela: 'ELA', math: 'Math', history: 'History' };

function EdusperienceCard({ edu, onPress }) {
  const subjLabel = SUBJECT_LABEL[edu.subject] || edu.subject;
  const pct =
    edu.n_total > 0 ? Math.round((100 * edu.n_aligned) / edu.n_total) : 0;
  return (
    <TouchableOpacity style={cardStyles.card} onPress={onPress}>
      <View style={cardStyles.headerRow}>
        <Text style={cardStyles.subjPill}>{subjLabel}</Text>
        <Text style={cardStyles.gradePill}>{edu.grade ? `Grade ${edu.grade}` : ''}</Text>
      </View>
      <Text style={cardStyles.title} numberOfLines={2}>{edu.name}</Text>
      <View style={cardStyles.statRow}>
        <Text style={cardStyles.statBig}>{`${edu.n_aligned}/${edu.n_total}`}</Text>
        <Text style={cardStyles.statLabel}>objectives aligned</Text>
      </View>
      <View style={cardStyles.progressTrack}>
        <View style={[cardStyles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={cardStyles.distinctText}>
        {edu.distinct_codes} distinct {edu.distinct_codes === 1 ? 'code' : 'codes'}
      </Text>
      <Text style={cardStyles.viewLink}>{'View detail \u2192'}</Text>
    </TouchableOpacity>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 240,
    minWidth: 240,
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  subjPill: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gradePill: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  title: {
    ...typography.subheading,
    fontSize: 14,
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  statBig: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  distinctText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
  },
  viewLink: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 10,
  },
});

export default function DashboardScreen({ navigation }) {
  const [summary, setSummary] = useState(null);
  const [edus, setEdus] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [s, e] = await Promise.all([
        dataClient.dashboard.summary(),
        dataClient.dashboard.edusperiences(),
      ]);
      if (cancelled) return;
      setSummary(s);
      setEdus(e || []);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading || !summary) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const subjectsTxt = Object.entries(summary.by_subject || {})
    .map(([k, v]) => `${v} ${SUBJECT_LABEL[k] || k}`)
    .join(' \u00b7 ');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'\u2190 Back'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Standards Alignment Dashboard</Text>
      <Text style={styles.subtitle}>
        {`California - ${subjectsTxt} edusperiences. ` +
          'TF-IDF shortlist \u2192 heuristic rerank \u2192 LLM curation.'}
      </Text>

      {/* Stat cards */}
      <View style={styles.cardsRow}>
        <StatCard
          label="Edusperiences"
          value={summary.edusperiences}
          sub={subjectsTxt || 'curated'}
        />
        <StatCard
          label="Objectives"
          value={summary.total_objectives}
          sub={`${summary.aligned_objectives} aligned (${summary.pct_aligned}%)`}
        />
        <StatCard
          label="Code assignments"
          value={summary.total_code_assignments}
          sub={`${summary.distinct_codes} distinct codes`}
        />
        <StatCard
          label="High confidence"
          value={summary.confidence_mix.high}
          sub={`${summary.confidence_mix.medium} med \u00b7 ${summary.confidence_mix.low} low`}
        >
          <ConfidenceMix mix={summary.confidence_mix} />
        </StatCard>
        <StatCard
          label="Standards DBs"
          value={summary.standards_dbs}
          sub="CA-ELA + CA-MATH + CA-HISTORY"
        />
      </View>

      {/* Pipeline */}
      <View style={styles.box}>
        <Text style={styles.sectionLabel}>Pipeline</Text>
        <PipelineSteps />
      </View>

      {/* Top codes */}
      <View style={styles.box}>
        <Text style={styles.sectionLabel}>
          Top codes (across all curated edusperiences)
        </Text>
        <TopCodesBar topCodes={summary.top_codes || []} />
      </View>

      {/* Edusperiences */}
      <View style={styles.box}>
        <Text style={styles.sectionLabel}>Edusperiences</Text>
        <View style={styles.eduRow}>
          {edus.map((e) => (
            <EdusperienceCard
              key={e.id}
              edu={e}
              onPress={() =>
                navigation.navigate('Output', {
                  assignment: { id: e.id, name: e.name, grade: e.grade,
                                 curriculum_id: e.curriculum_id,
                                 subject: e.subject },
                })
              }
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 24,
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  back: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  title: {
    ...typography.heading,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  cardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  box: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  sectionLabel: {
    ...typography.label,
    marginBottom: 10,
  },
  eduRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { dataClient } from '../lib/dataClient';
import TopNav from '../components/TopNav';
import StandardCodeLink from '../components/StandardCodeLink';
import { strandColor } from '../lib/strandColor';
import { colors, typography } from '../theme';

const CONF_COLOR = {
  high: '#0e7a3e',
  medium: '#a86e00',
  low: '#64748b',
};

function ConfidenceBadge({ level }) {
  if (!level) return null;
  return (
    <Text style={[styles.confBadge, { color: CONF_COLOR[level] || colors.textSecondary }]}>
      {level.toUpperCase()}
    </Text>
  );
}

function exportPdfWeb(title) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const prev = document.title;
  document.title = title || 'Alignment Report';
  window.print();
  document.title = prev;
}

export default function ReportScreen({ route, navigation }) {
  const assignmentId = route?.params?.assignmentId;
  const [detail, setDetail] = useState(null);
  const [curriculum, setCurriculum] = useState(null);
  const [standardTextByCode, setStandardTextByCode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!assignmentId) {
        setLoading(false);
        return;
      }
      const d = await dataClient.assignments.detail(assignmentId);
      const cId = d?.alignment_curriculum_id || d?.curriculum_id;
      const [c, texts] = await Promise.all([
        cId ? dataClient.curricula.get(cId) : null,
        cId ? dataClient.standards.textByCode(cId) : null,
      ]);
      if (!cancelled) {
        setDetail(d);
        setCurriculum(c);
        setStandardTextByCode(texts);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [assignmentId]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.container}>
        <TopNav navigation={navigation} currentRoute="Report" />
        <View style={styles.center}>
          <Text style={styles.empty}>No report data.</Text>
        </View>
      </View>
    );
  }

  const objectives = detail.objectives || [];
  const excluded = new Set(detail.excluded_sections || []);
  const includedObjectives = objectives.filter((o) => !excluded.has(o.section_idx));
  const tagged = includedObjectives.filter((o) => (o.alignments || []).length > 0);
  const confMix = { high: 0, medium: 0, low: 0 };
  for (const o of includedObjectives) {
    for (const al of o.alignments || []) {
      if (confMix[al.confidence] != null) confMix[al.confidence] += 1;
    }
  }

  let lastSec = -1;
  const rows = [];
  for (const o of includedObjectives) {
    if (o.section_idx !== lastSec) {
      rows.push({ type: 'section', title: o.section_title, key: `s-${o.section_idx}` });
      lastSec = o.section_idx;
    }
    rows.push({ type: 'objective', data: o, key: o.path });
  }

  return (
    <View style={styles.container}>
      <TopNav navigation={navigation} currentRoute="Report" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={styles.back}>{'\u2190 Back'}</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Alignment Report</Text>
            <Text style={styles.subtitle}>{detail.name}</Text>
          </View>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={() => exportPdfWeb(`${detail.name} — Alignment Report`)}
          >
            <Text style={styles.exportBtnText}>Export PDF</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryCard} nativeID="report-print-root">
          <Text style={styles.summaryTitle}>Summary</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>
                {detail.n_aligned}/{detail.n_total}
              </Text>
              <Text style={styles.statLabel}>Objectives tagged</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>
                {detail.n_total > 0
                  ? `${Math.round((100 * detail.n_aligned) / detail.n_total)}%`
                  : '0%'}
              </Text>
              <Text style={styles.statLabel}>Coverage</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{confMix.high}</Text>
              <Text style={styles.statLabel}>High conf.</Text>
            </View>
          </View>
          <Text style={styles.meta}>
            {`Standards: ${curriculum?.title || 'Unknown'} · Grade ${detail.grade || '—'}`}
          </Text>
          {detail.tagged_at ? (
            <Text style={styles.meta}>{`Tagged ${new Date(detail.tagged_at).toLocaleString()}`}</Text>
          ) : null}
        </View>

        <Text style={styles.sectionHeading}>Mapping — where each standard is tagged</Text>

        {tagged.length === 0 ? (
          <Text style={styles.empty}>No alignments yet. Run the tagger first.</Text>
        ) : (
          rows.map((row) => {
            if (row.type === 'section') {
              return (
                <Text key={row.key} style={styles.sectionTitle}>
                  {row.title}
                </Text>
              );
            }
            const o = row.data;
            if (!(o.alignments || []).length) return null;
            return (
              <View key={row.key} style={styles.objCard}>
                <Text style={styles.objPath}>{o.path}</Text>
                <Text style={styles.objDesc}>{o.objective_description}</Text>
                {(o.alignments || []).map((al) => {
                  const standardDescription =
                    (al.text || '').trim()
                    || (standardTextByCode && al.code ? standardTextByCode[al.code] : '')
                    || '';
                  return (
                  <View key={al.code} style={styles.alignRow}>
                    <View style={styles.alignHeader}>
                      <StandardCodeLink
                        code={al.code}
                        standardText={standardDescription}
                        color={strandColor(al.code, al.badge || al.strand)}
                        onPress={
                          curriculum
                            ? () =>
                                navigation.navigate('CurriculumDetail', {
                                  curriculum,
                                  focusCode: al.code,
                                })
                            : undefined
                        }
                      />
                      <ConfidenceBadge level={al.confidence} />
                    </View>
                    <Text style={styles.rationale}>{al.rationale}</Text>
                  </View>
                  );
                })}
              </View>
            );
          })
        )}

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() =>
            navigation.navigate('Output', {
              assignment: { id: assignmentId, name: detail.name },
            })
          }
        >
          <Text style={styles.linkBtnText}>Open full alignment view</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: {
    padding: 24,
    maxWidth: 800,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 48,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 16,
  },
  back: { color: colors.primary, fontWeight: '600', marginBottom: 8 },
  title: { ...typography.heading },
  subtitle: { fontSize: 15, color: colors.textSecondary, marginTop: 4 },
  exportBtn: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  exportBtnText: { fontWeight: '700', color: colors.primary, fontSize: 13 },
  summaryCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  summaryTitle: { ...typography.subheading, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 24, marginBottom: 12 },
  stat: { gap: 2 },
  statVal: { fontSize: 22, fontWeight: '800', color: colors.primaryDark },
  statLabel: { fontSize: 12, color: colors.textSecondary },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  sectionHeading: {
    ...typography.subheading,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  objCard: {
    backgroundColor: colors.white,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    gap: 8,
  },
  objPath: {
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    fontSize: 11,
    color: colors.textLight,
  },
  objDesc: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  alignRow: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: 12,
    marginTop: 4,
    gap: 4,
  },
  alignHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  code: {
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    fontWeight: '700',
    fontSize: 13,
    color: colors.primaryDark,
  },
  confBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  rationale: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  linkBtn: { marginTop: 24, alignSelf: 'flex-start' },
  linkBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  empty: { fontSize: 14, color: colors.textLight, fontStyle: 'italic' },
});

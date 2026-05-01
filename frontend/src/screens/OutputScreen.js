import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { dataClient } from '../lib/dataClient';
import { previewText, parseHtmlBlocks } from '../lib/htmlText';
import { colors, typography, shadows } from '../theme';
import SourcePanel from '../components/SourcePanel';
import ObjectiveRow from '../components/ObjectiveRow';
import TopNav from '../components/TopNav';

function StatPill({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function OutputScreen({ route, navigation }) {
  const { assignment } = route.params || {};
  const [detail, setDetail] = useState(null);
  const [curriculum, setCurriculum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showStandardText, setShowStandardText] = useState(true);

  const scrollRef = useRef(null);
  const sourceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [d, curr] = await Promise.all([
        dataClient.assignments.detail(assignment?.id),
        assignment?.curriculum_id
          ? dataClient.curricula.get(assignment.curriculum_id)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setDetail(d);
      setCurriculum(curr);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [assignment?.id, assignment?.curriculum_id]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const hasObjectives = detail && detail.objectives && detail.objectives.length > 0;
  const subject = detail?.subject || 'ela';

  // Group the objectives by section_idx for the section headers in the
  // alignment view (mirrors the dashboard's per-edusperience tab).
  const groupedSections = [];
  let lastSecIdx = -Infinity;
  for (const o of detail?.objectives || []) {
    if (o.section_idx !== lastSecIdx) {
      groupedSections.push({
        idx: o.section_idx,
        title: o.section_title,
        rows: [],
      });
      lastSecIdx = o.section_idx;
    }
    groupedSections[groupedSections.length - 1].rows.push(o);
  }

  return (
    <View style={styles.container}>
      <TopNav navigation={navigation} currentRoute="Output" />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>{'\u2190 Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{detail?.name || assignment?.name || 'Output'}</Text>
          <Text style={styles.subtitle}>
            {`${(detail?.subject || assignment?.subject || 'ela').toUpperCase()} \u00b7 Grade ${detail?.grade || assignment?.grade || ''}`}
          </Text>
        </View>

      {/* Summary card */}
      <View style={styles.box}>
        <View style={styles.statsRow}>
          <StatPill
            label="Objectives"
            value={`${detail?.n_aligned ?? 0}/${detail?.n_total ?? 0}`}
          />
          <StatPill
            label="Aligned"
            value={
              detail && detail.n_total > 0
                ? `${Math.round((100 * detail.n_aligned) / detail.n_total)}%`
                : '0%'
            }
          />
          <StatPill
            label="Curriculum"
            value={curriculum ? curriculum.title : 'Unlinked'}
          />
        </View>
        {detail?.notes ? (
          <Text style={styles.notes}>{detail.notes}</Text>
        ) : null}
      </View>

      {/* Source viewer */}
      {detail?.source ? (
        <View style={styles.boxFlat}>
          <SourcePanel
            ref={sourceRef}
            source={detail.source}
            scrollViewRef={scrollRef}
          />
        </View>
      ) : null}

      {/* Alignment list */}
      <View style={styles.box}>
        <View style={styles.alignmentHeader}>
          <Text style={styles.sectionLabel}>
            {hasObjectives ? 'Tagged Standards' : 'Standards'}
          </Text>
          {hasObjectives ? (
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Show standard text</Text>
              <Switch
                value={showStandardText}
                onValueChange={setShowStandardText}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={'#fff'}
              />
            </View>
          ) : null}
        </View>

        {!hasObjectives ? (
          <View style={styles.emptyStandards}>
            <Text style={styles.empty}>No standards tagged yet.</Text>
            <Text style={styles.emptyHint}>
              {detail?.is_seed === false
                ? 'New uploads need the AI tagger to run before standards appear here.'
                : 'Standards will appear here after the AI tagger runs.'}
            </Text>
          </View>
        ) : (
          groupedSections.map((sec) => (
            <View key={sec.idx} style={styles.sectionGroup}>
              <Text style={styles.sectionHdr}>
                {`Section ${sec.idx + 1}: ${sec.title}`}
              </Text>
              {sec.rows.map((o, i) => (
                <ObjectiveRow
                  key={`${sec.idx}-${o.objective_idx}-${i}`}
                  objective={o}
                  subject={subject}
                  showStandardText={showStandardText}
                  hasSource={!!detail?.source}
                  onViewSource={() => {
                    if (sourceRef.current?.jumpTo) {
                      sourceRef.current.jumpTo(o.section_idx, o.objective_idx);
                    }
                  }}
                  onOpenInCurriculum={
                    curriculum
                      ? (code) =>
                          navigation.navigate('CurriculumDetail', {
                            curriculum,
                            focusCode: code,
                          })
                      : undefined
                  }
                />
              ))}
            </View>
          ))
        )}
      </View>

        {/* Assignment description (kept from the original screen — handy for
            quick reference at the bottom). */}
        <View style={styles.box}>
          <Text style={styles.sectionLabel}>Assignment description</Text>
          {parseHtmlBlocks(assignment?.description || detail?.description).length === 0 ? (
            <Text style={styles.empty}>(none)</Text>
          ) : (
            parseHtmlBlocks(assignment?.description || detail?.description).map((b, i) => (
              <Text key={i} style={styles.descBody}>{b}</Text>
            ))
          )}
        </View>
      </ScrollView>
    </View>
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
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  header: {
    marginBottom: 8,
  },
  back: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 10,
  },
  title: {
    ...typography.heading,
  },
  subtitle: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  box: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  boxFlat: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  stat: {
    minWidth: 120,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  notes: {
    marginTop: 12,
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  alignmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionLabel: {
    ...typography.label,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  sectionGroup: {
    marginTop: 4,
  },
  sectionHdr: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 4,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyStandards: {
    paddingVertical: 18,
    alignItems: 'center',
    gap: 4,
  },
  emptyHint: {
    color: colors.textLight,
    fontSize: 12,
    textAlign: 'center',
  },
  descBody: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 21,
    marginBottom: 8,
  },
});

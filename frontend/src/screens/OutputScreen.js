import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { assignmentIsRaw } from '../lib/evalFilters';
import { parseHtmlBlocks } from '../lib/htmlText';
import { colors, typography, shadows } from '../theme';
import SourcePanel from '../components/SourcePanel';
import ObjectiveRow from '../components/ObjectiveRow';
import AlignPanel from '../components/AlignPanel';
import SectionVisibilityToggle from '../components/SectionVisibilityToggle';
import ExpandableText from '../components/ExpandableText';
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
  const [standardTextByCode, setStandardTextByCode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showStandardText, setShowStandardText] = useState(true);

  const scrollRef = useRef(null);
  const sourceRef = useRef(null);

  const loadDetail = useCallback(async (opts = {}) => {
    if (opts.showSpinner !== false) {
      setLoading(true);
    }
    const d = await dataClient.assignments.detail(assignment?.id);
    const cId = d?.alignment_curriculum_id || d?.curriculum_id || assignment?.curriculum_id;
    const [c, texts] = await Promise.all([
      cId ? dataClient.curricula.get(cId) : null,
      cId ? dataClient.standards.textByCode(cId) : null,
    ]);
    setDetail(d);
    setCurriculum(c);
    setStandardTextByCode(texts);
    setLoading(false);
  }, [assignment?.id, assignment?.curriculum_id]);

  useEffect(() => {
    loadDetail({ showSpinner: true });
  }, [loadDetail]);

  const handleSectionToggle = useCallback(async (sectionIdx, currentlyExcluded) => {
    const idx = Number(sectionIdx);
    await dataClient.assignments.setSectionIncluded(
      assignment?.id,
      idx,
      currentlyExcluded,
    );
    const d = await dataClient.assignments.detail(assignment?.id);
    setDetail(d);
  }, [assignment?.id]);

  if (loading && !detail) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const isRaw = detail && assignmentIsRaw(detail);
  const hasObjectives = detail && detail.objectives && detail.objectives.length > 0;
  const hasAlignments = detail && (detail.n_aligned || 0) > 0;
  const subject = detail?.subject || 'ela';

  const groupedSections = [];
  let lastSecIdx = -Infinity;
  for (const o of detail?.objectives || []) {
    if (o.section_idx !== lastSecIdx) {
      const srcSec = detail?.source?.sections?.[o.section_idx];
      groupedSections.push({
        idx: o.section_idx,
        title: o.section_title,
        description: o.section_description || srcSec?.description || '',
        rows: [],
      });
      lastSecIdx = o.section_idx;
    }
    groupedSections[groupedSections.length - 1].rows.push(o);
  }

  const excludedSections = new Set((detail?.excluded_sections || []).map(Number));

  return (
    <View style={styles.container}>
      <TopNav navigation={navigation} currentRoute="Output" />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>{'\u2190 Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{detail?.name || assignment?.name || 'EduSperience'}</Text>
          <Text style={styles.subtitle}>
            {`${(detail?.subject || assignment?.subject || 'ela').toUpperCase()} \u00b7 Grade ${detail?.grade || assignment?.grade || ''}`}
            {isRaw ? ' \u00b7 RAW' : hasAlignments ? ' \u00b7 ALIGNED' : ''}
          </Text>
        </View>

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
              label="Standards"
              value={curriculum ? curriculum.title : 'Not set'}
            />
          </View>
          {detail?.file_name || assignment?.file_name ? (
            <Text style={styles.fileLine}>
              {`\ud83d\udcce ${detail?.file_name || assignment?.file_name}`}
            </Text>
          ) : null}
          {detail?.notes ? (
            <Text style={styles.notes}>{detail.notes}</Text>
          ) : null}
        </View>

        {isRaw ? (
          <AlignPanel
            assignmentId={assignment?.id}
            navigation={navigation}
            onAligned={loadDetail}
          />
        ) : null}

        {hasAlignments ? (
          <TouchableOpacity
            style={styles.reportLink}
            onPress={() =>
              navigation.navigate('Report', { assignmentId: assignment?.id })
            }
          >
            <Text style={styles.reportLinkText}>View alignment report / export PDF</Text>
          </TouchableOpacity>
        ) : null}

        {detail?.source ? (
          <View style={styles.boxFlat}>
            <SourcePanel
              ref={sourceRef}
              source={detail.source}
              scrollViewRef={scrollRef}
            />
          </View>
        ) : null}

        <View style={styles.box}>
          <View style={styles.alignmentHeader}>
            <Text style={styles.sectionLabel}>
              {hasAlignments ? 'Tagged standards' : 'Standards'}
            </Text>
            {hasAlignments ? (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Show standard text</Text>
                <Switch
                  value={showStandardText}
                  onValueChange={setShowStandardText}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>
            ) : null}
          </View>

          {!hasObjectives ? (
            <View style={styles.emptyStandards}>
              <Text style={styles.empty}>No objectives extracted yet.</Text>
              <Text style={styles.emptyHint}>
                {isRaw
                  ? 'Use Align with AI above once you have a standards set selected.'
                  : 'Upload a PDF/DOCX EduSperience to extract objectives.'}
              </Text>
            </View>
          ) : !hasAlignments ? (
            <View style={styles.emptyStandards}>
              <Text style={styles.empty}>
                {`${detail.n_total} objective${detail.n_total === 1 ? '' : 's'} ready to align.`}
              </Text>
              {isRaw ? (
                <Text style={styles.emptyHint}>
                  Pick a standards set in the panel above and click Align with AI.
                </Text>
              ) : null}
            </View>
          ) : (
            groupedSections.map((sec) => {
              const included = !excludedSections.has(sec.idx);
              if (!included) return null;
              return (
              <View key={sec.idx} style={styles.sectionGroup}>
                <View style={styles.sectionHeaderBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHdr}>
                      {`Section ${sec.idx + 1}: ${sec.title}`}
                    </Text>
                    <SectionVisibilityToggle
                      included={included}
                      onPress={() => handleSectionToggle(sec.idx, excludedSections.has(sec.idx))}
                    />
                  </View>
                  {sec.description ? (
                    parseHtmlBlocks(sec.description).map((b, i) => (
                      <ExpandableText
                        key={i}
                        text={b}
                        style={styles.sectionDescWrap}
                        bodyStyle={styles.sectionDesc}
                        maxChars={200}
                      />
                    ))
                  ) : null}
                </View>
                {sec.rows.map((o, i) => (
                  <ObjectiveRow
                    key={`${sec.idx}-${o.objective_idx}-${i}`}
                    objective={o}
                    subject={subject}
                    showStandardText={showStandardText}
                    standardTextByCode={standardTextByCode}
                    hasSource={!!detail?.source}
                    onJumpToSource={(alignment, sourceExcerpt) => {
                      if (sourceRef.current?.jumpTo) {
                        sourceRef.current.jumpTo(o.section_idx, o.objective_idx, {
                          standardCode: alignment?.code,
                          highlightExcerpt: sourceExcerpt,
                        });
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
              );
            })
          )}
          {hasAlignments && groupedSections.some((sec) => excludedSections.has(sec.idx)) ? (
            <View style={styles.excludedSectionsBox}>
              <Text style={styles.excludedSectionsTitle}>Excluded sections</Text>
              {groupedSections
                .filter((sec) => excludedSections.has(sec.idx))
                .map((sec) => (
                  <View key={`ex-${sec.idx}`} style={styles.excludedSectionRow}>
                    <Text style={styles.excludedSectionName}>
                      {`Section ${sec.idx + 1}: ${sec.title}`}
                    </Text>
                    <SectionVisibilityToggle
                      included={false}
                      onPress={() => handleSectionToggle(sec.idx, excludedSections.has(sec.idx))}
                    />
                  </View>
                ))}
            </View>
          ) : null}
        </View>

        <View style={styles.box}>
          <Text style={styles.sectionLabel}>Description</Text>
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
  fileLine: {
    marginTop: 12,
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  reportLink: {
    alignSelf: 'flex-start',
  },
  reportLinkText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
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
  sectionHeaderBlock: {
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    flexWrap: 'nowrap',
  },
  sectionHdr: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  excludedSectionsBox: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  excludedSectionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  excludedSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  excludedSectionName: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sectionDescWrap: {
    marginTop: 6,
  },
  sectionDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
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

// Standards browser for a single curriculum. Pulls all records from
// dataClient.standards.byCurriculum, plus the subset used by the user's
// assignments under this curriculum, and combines them into a single
// virtualized FlatList with strand/grade/search/used filters.
//
// User-uploaded curricula (no bundled standards DB) get a friendly empty
// state explaining that standards will appear once their pipeline runs.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { dataClient } from '../lib/dataClient';
import { colors, typography, shadows } from '../theme';
import StandardsSummary from '../components/StandardsSummary';
import StandardsFilterBar from '../components/StandardsFilterBar';
import StandardRow from '../components/StandardRow';

const PAGE_INCREMENT = 100;

export default function CurriculumDetailScreen({ route, navigation }) {
  const { curriculum } = route.params || {};
  const [summary, setSummary] = useState(null);
  const [usedCodes, setUsedCodes] = useState(new Set());
  const [allRows, setAllRows] = useState([]); // unfiltered records
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [strand, setStrand] = useState(null);
  const [grade, setGrade] = useState(null);
  const [usedOnly, setUsedOnly] = useState(true);
  const [renderLimit, setRenderLimit] = useState(PAGE_INCREMENT);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [s, page, used] = await Promise.all([
        dataClient.standards.summary(curriculum.id),
        dataClient.standards.byCurriculum(curriculum.id),
        dataClient.standards.usedBy(curriculum.id),
      ]);
      if (cancelled) return;
      setSummary(s);
      setAllRows(page.rows || []);
      setUsedCodes(new Set((used || []).map((r) => r.code)));
      // If "used only" produces nothing (e.g. user has no assignments under
      // this curriculum), default to showing the full DB instead.
      if (!used || used.length === 0) setUsedOnly(false);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [curriculum?.id]);

  const filtered = useMemo(() => {
    let rows = allRows;
    if (usedOnly && usedCodes.size > 0) {
      rows = rows.filter((r) => usedCodes.has(r.code));
    }
    if (strand) {
      rows = rows.filter((r) => {
        const bucket = r.strand || r.category || r.skill_category_code
          || r.domain || r.section || (r.is_practice ? 'MP' : 'Other');
        return bucket === strand;
      });
    }
    if (grade) {
      rows = rows.filter((r) => r.grade === grade || r.grade_band === grade);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter((r) =>
        (r.code || '').toLowerCase().includes(q) ||
        (r.text || '').toLowerCase().includes(q) ||
        (r.strand_name || r.category_name || r.domain_name ||
         r.skill_category || r.course_title || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [allRows, usedCodes, usedOnly, strand, grade, query]);

  const visible = filtered.slice(0, renderLimit);
  const hasMore = renderLimit < filtered.length;

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{'\u2190 Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{curriculum.title}</Text>
        <Text style={styles.grade}>{`Grade ${curriculum.grade}`}</Text>
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={visible}
        keyExtractor={(r) => r.code + (r.full_code || '')}
        renderItem={({ item }) => (
          <StandardRow rec={item} used={usedCodes.has(item.code)} />
        )}
        ListHeaderComponent={
          <View style={styles.headerCard}>
            {summary ? (
              <>
                <StandardsSummary
                  summary={summary}
                  selectedStrand={strand}
                  onSelectStrand={(s) => { setStrand(s); setRenderLimit(PAGE_INCREMENT); }}
                  selectedGrade={grade}
                  onSelectGrade={(g) => { setGrade(g); setRenderLimit(PAGE_INCREMENT); }}
                />
                <View style={styles.divider} />
                <StandardsFilterBar
                  query={query}
                  onQuery={(q) => { setQuery(q); setRenderLimit(PAGE_INCREMENT); }}
                  usedOnly={usedOnly}
                  onUsedOnlyChange={(v) => { setUsedOnly(v); setRenderLimit(PAGE_INCREMENT); }}
                  usedCount={usedCodes.size}
                />
                <Text style={styles.resultLine}>
                  {`Showing ${visible.length.toLocaleString()} of ${filtered.length.toLocaleString()} ${
                    filtered.length === 1 ? 'standard' : 'standards'
                  }${
                    filtered.length !== summary.total ? ` (filtered from ${summary.total.toLocaleString()})` : ''
                  }`}
                </Text>
              </>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No standards extracted yet.</Text>
                <Text style={styles.emptyHint}>
                  Standards will appear here once the scraper and AI sorter have processed this curriculum.
                </Text>
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          hasMore ? (
            <TouchableOpacity
              style={styles.loadMore}
              onPress={() => setRenderLimit((n) => n + PAGE_INCREMENT)}
            >
              <Text style={styles.loadMoreText}>{`Load ${Math.min(PAGE_INCREMENT, filtered.length - renderLimit)} more`}</Text>
            </TouchableOpacity>
          ) : filtered.length > 0 ? (
            <Text style={styles.endText}>{`End of ${filtered.length.toLocaleString()} ${filtered.length === 1 ? 'standard' : 'standards'}.`}</Text>
          ) : null
        }
        ListEmptyComponent={
          summary ? (
            <Text style={styles.endText}>No standards match your filters.</Text>
          ) : null
        }
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
        removeClippedSubviews
      />
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
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
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
  grade: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    maxWidth: 1100,
    width: '100%',
    alignSelf: 'center',
  },
  headerCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    gap: 8,
    ...shadows.card,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  resultLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  loadMore: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  loadMoreText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  endText: {
    fontSize: 12,
    color: colors.textLight,
    textAlign: 'center',
    paddingVertical: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 6,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textLight,
    textAlign: 'center',
    maxWidth: 380,
    lineHeight: 18,
  },
});

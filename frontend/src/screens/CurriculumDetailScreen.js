import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, typography, shadows } from '../theme';

export default function CurriculumDetailScreen({ route, navigation }) {
  const { curriculum } = route.params || {};
  const [standards, setStandards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStandards = async () => {
      const { data } = await supabase
        .from('standards')
        .select('*')
        .eq('curriculum_id', curriculum.id)
        .order('created_at', { ascending: true });
      setStandards(data || []);
      setLoading(false);
    };
    fetchStandards();
  }, [curriculum]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{curriculum.title}</Text>
        <Text style={styles.grade}>Grade {curriculum.grade}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Standards</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : standards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No standards extracted yet.</Text>
            <Text style={styles.emptyHint}>
              Standards will appear here once the scraper and AI sorter have processed this curriculum.
            </Text>
          </View>
        ) : (
          <View style={styles.table}>
            {/* Table Header */}
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={[styles.tableCell, styles.cellCode, styles.headerText]}>Code</Text>
              <Text style={[styles.tableCell, styles.cellDomain, styles.headerText]}>Domain</Text>
              <Text style={[styles.tableCell, styles.cellDesc, styles.headerText]}>Description</Text>
            </View>

            {/* Table Rows */}
            {standards.map((s, i) => (
              <View
                key={s.id}
                style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}
              >
                <View style={[styles.tableCell, styles.cellCode]}>
                  <View style={styles.codeBadge}>
                    <Text style={styles.codeText}>{s.code}</Text>
                  </View>
                </View>
                <Text style={[styles.tableCell, styles.cellDomain, styles.cellText]}>
                  {s.domain || '—'}
                </Text>
                <Text style={[styles.tableCell, styles.cellDesc, styles.cellText]}>
                  {s.description}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 24,
    maxWidth: 900,
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
  grade: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  sectionLabel: {
    ...typography.label,
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
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
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRowAlt: {
    backgroundColor: colors.background,
  },
  tableHeader: {
    backgroundColor: colors.background,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  headerText: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableCell: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cellCode: {
    width: 130,
  },
  cellDomain: {
    width: 160,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  cellDesc: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  cellText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  codeBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  codeText: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 12,
  },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { dataClient } from '../lib/dataClient';
import { previewText } from '../lib/htmlText';
import { colors, shadows, typography } from '../theme';

function ColumnHeader({ title, onAdd }) {
  return (
    <View style={styles.columnHeader}>
      <Text style={styles.columnTitle}>{title}</Text>
      <TouchableOpacity style={styles.addButton} onPress={onAdd}>
        <Text style={styles.addButtonText}>+ Add</Text>
      </TouchableOpacity>
    </View>
  );
}

function AssignmentCard({ item, onPress }) {
  const desc = previewText(item.description);
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <Text style={styles.cardSub}>Grade {item.grade}</Text>
      {desc ? (
        <Text style={styles.cardDesc} numberOfLines={2}>{desc}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

function CurriculumCard({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)}>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardSub}>Grade {item.grade}</Text>
    </TouchableOpacity>
  );
}

export default function EvalScreen({ navigation }) {
  const [assignments, setAssignments] = useState([]);
  const [curricula, setCurricula] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const [asgn, curr] = await Promise.all([
      dataClient.assignments.list(),
      dataClient.curricula.listForUser(),
    ]);
    setAssignments(asgn || []);
    setCurricula(curr || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const unsubscribe = navigation.addListener('focus', fetchData);
    return unsubscribe;
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.appTitle}>GradeFlow</Text>
        <View style={styles.topBarRight}>
          <TouchableOpacity onPress={() => navigation.navigate('Dashboard')}>
            <Text style={styles.topLink}>Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await supabase.auth.signOut();
              navigation.replace('Login');
            }}
          >
            <Text style={styles.signOut}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} size="large" />
      ) : (
        <View style={styles.columns}>
          {/* Assignments Column */}
          <View style={styles.column}>
            <ColumnHeader
              title="Assignments"
              onAdd={() => navigation.navigate('AddAssignment')}
            />
            <ScrollView contentContainerStyle={styles.list}>
              {assignments.length === 0 ? (
                <Text style={styles.empty}>No assignments yet.</Text>
              ) : (
                assignments.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    item={a}
                    onPress={(item) => navigation.navigate('Output', { assignment: item })}
                  />
                ))
              )}
            </ScrollView>
          </View>

          <View style={styles.divider} />

          {/* Curriculum Column */}
          <View style={styles.column}>
            <ColumnHeader
              title="Curriculum"
              onAdd={() => navigation.navigate('AddCurriculum')}
            />
            <ScrollView contentContainerStyle={styles.list}>
              {curricula.length === 0 ? (
                <Text style={styles.empty}>No curriculum added yet.</Text>
              ) : (
                curricula.map((c) => (
                  <CurriculumCard
                    key={c.id}
                    item={c}
                    onPress={(item) => navigation.navigate('CurriculumDetail', { curriculum: item })}
                  />
                ))
              )}
            </ScrollView>
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Created for GradeFlow by SDSU AI Club &nbsp;·&nbsp; Jake, Ryan, Jacob, Dominic
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  topLink: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  signOut: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
  },
  column: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  divider: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  columnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 4,
  },
  columnTitle: {
    ...typography.heading,
    fontSize: 18,
  },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  list: {
    paddingBottom: 24,
    gap: 10,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardTitle: {
    ...typography.subheading,
    marginBottom: 2,
  },
  cardSub: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 4,
  },
  cardDesc: {
    ...typography.body,
    fontSize: 13,
    marginTop: 4,
  },
  empty: {
    color: colors.textLight,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
  },
  footer: {
    backgroundColor: '#1f2937',
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  footerText: {
    color: '#9ca3af',
    fontSize: 13,
  },
});

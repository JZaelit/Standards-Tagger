import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { dataClient } from '../lib/dataClient';
import { previewText } from '../lib/htmlText';
import { colors, shadows, typography } from '../theme';
import Menu, { MenuTrigger } from '../components/Menu';
import SkeletonRow from '../components/SkeletonRow';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

function ColumnHeader({ title, onAdd, addLabel = '+ Add' }) {
  return (
    <View style={styles.columnHeader}>
      <Text style={styles.columnTitle}>{title}</Text>
      <TouchableOpacity style={styles.addButton} onPress={onAdd}>
        <Text style={styles.addButtonText}>{addLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function AssignmentCard({ item, onPress, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const desc = previewText(item.description);
  const isEditable = !item.is_seed;
  return (
    <View style={styles.cardWrap}>
      <TouchableOpacity style={styles.card} onPress={() => onPress(item)}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
          {item.is_seed ? (
            <Text style={styles.seedPill}>SAMPLE</Text>
          ) : null}
        </View>
        <Text style={styles.cardSub}>Grade {item.grade}</Text>
        {desc ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{desc}</Text>
        ) : null}
      </TouchableOpacity>
      {isEditable ? (
        <>
          <View style={styles.cardMenuAnchor}>
            <MenuTrigger
              onPress={() => setMenuOpen(true)}
              accessibilityLabel={`Actions for ${item.name}`}
            />
          </View>
          <Menu
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            options={[
              { label: 'Edit', onPress: () => onEdit(item) },
              { label: 'Delete', onPress: () => onDelete(item), destructive: true },
            ]}
          />
        </>
      ) : null}
    </View>
  );
}

function CurriculumCard({ item, onPress, onEdit, onDelete, onUnadopt }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Seed/library curricula are read-only and only support "remove from
  // my list" (unadopt). User-created curricula support full edit/delete.
  const isLibrary = item.is_seed !== false;
  const options = isLibrary
    ? [{ label: 'Remove from my list', onPress: () => onUnadopt(item) }]
    : [
        { label: 'Edit', onPress: () => onEdit(item) },
        { label: 'Delete', onPress: () => onDelete(item), destructive: true },
      ];
  return (
    <View style={styles.cardWrap}>
      <TouchableOpacity style={styles.card} onPress={() => onPress(item)}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
          {isLibrary ? <Text style={styles.seedPill}>LIBRARY</Text> : null}
        </View>
        <Text style={styles.cardSub}>Grade {item.grade}</Text>
      </TouchableOpacity>
      <View style={styles.cardMenuAnchor}>
        <MenuTrigger
          onPress={() => setMenuOpen(true)}
          accessibilityLabel={`Actions for ${item.title}`}
        />
      </View>
      <Menu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        options={options}
      />
    </View>
  );
}

function EmptyState({ message, ctaLabel, onCta }) {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>{message}</Text>
      {ctaLabel ? (
        <TouchableOpacity style={styles.emptyCta} onPress={onCta}>
          <Text style={styles.emptyCtaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function ListSkeleton() {
  return (
    <View style={{ gap: 10 }}>
      <SkeletonRow height={84} />
      <SkeletonRow height={84} />
      <SkeletonRow height={84} />
    </View>
  );
}

export default function EvalScreen({ navigation }) {
  const [assignments, setAssignments] = useState([]);
  const [curricula, setCurricula] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const confirm = useConfirm();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [asgn, curr] = await Promise.all([
      dataClient.assignments.list(),
      dataClient.curricula.listForUser(),
    ]);
    setAssignments(asgn || []);
    setCurricula(curr || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const unsubscribe = navigation.addListener('focus', fetchData);
    return unsubscribe;
  }, [navigation, fetchData]);

  const handleEditAssignment = (assignment) => {
    navigation.navigate('AddAssignment', { assignment });
  };

  const handleDeleteAssignment = async (assignment) => {
    // Optimistic remove from the local list so the UI reflects the action
    // immediately. The undo toast can re-insert it via dataClient.restore.
    const prior = assignments;
    setAssignments((rows) => rows.filter((a) => a.id !== assignment.id));
    const removed = await dataClient.assignments.delete(assignment.id);
    if (!removed) {
      // Restore optimistic change if delete didn't take effect.
      setAssignments(prior);
      toast.show('Could not delete assignment', { tone: 'danger' });
      return;
    }
    toast.show(`Deleted "${assignment.name}"`, {
      durationMs: 5000,
      action: {
        label: 'Undo',
        onPress: async () => {
          const restored = await dataClient.assignments.restore(
            removed.row,
            removed.index,
          );
          if (restored) {
            // Refresh from storage so order matches the persisted state.
            const list = await dataClient.assignments.list();
            setAssignments(list || []);
          }
        },
      },
    });
  };

  const handleEditCurriculum = (curriculum) => {
    navigation.navigate('AddCurriculum', { curriculum });
  };

  // User-created curricula: confirm-dialog (destructive, dangles assignment
  // links) then hard-delete with undo. Different from assignment delete
  // because dropping a curriculum has wider consequences.
  const handleDeleteCurriculum = async (curriculum) => {
    const ok = await confirm({
      title: `Delete "${curriculum.title}"?`,
      body:
        'Assignments using this curriculum will lose their link. ' +
        'You can undo this action for a few seconds.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    const prior = curricula;
    setCurricula((rows) => rows.filter((c) => c.id !== curriculum.id));
    const removed = await dataClient.curricula.delete(curriculum.id);
    if (!removed) {
      setCurricula(prior);
      toast.show('Could not delete curriculum', { tone: 'danger' });
      return;
    }
    toast.show(`Deleted "${curriculum.title}"`, {
      durationMs: 5000,
      action: {
        label: 'Undo',
        onPress: async () => {
          const restored = await dataClient.curricula.restore(
            removed.row,
            removed.index,
            removed.was_adopted,
          );
          if (restored) {
            const list = await dataClient.curricula.listForUser();
            setCurricula(list || []);
          }
        },
      },
    });
  };

  // Library/seed curricula: just unadopt. No confirm needed - the curriculum
  // itself stays in the public library and can be re-adopted via search.
  const handleUnadoptCurriculum = async (curriculum) => {
    const prior = curricula;
    setCurricula((rows) => rows.filter((c) => c.id !== curriculum.id));
    const wasAdopted = await dataClient.curricula.unadopt(curriculum.id);
    if (!wasAdopted) {
      setCurricula(prior);
      return;
    }
    toast.show(`Removed "${curriculum.title}" from your list`, {
      durationMs: 5000,
      action: {
        label: 'Undo',
        onPress: async () => {
          await dataClient.curricula.addToUser(curriculum.id);
          const list = await dataClient.curricula.listForUser();
          setCurricula(list || []);
        },
      },
    });
  };

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

      <View style={styles.columns}>
        {/* Assignments Column */}
        <View style={styles.column}>
          <ColumnHeader
            title="Assignments"
            onAdd={() => navigation.navigate('AddAssignment')}
            addLabel="+ New"
          />
          <ScrollView contentContainerStyle={styles.list}>
            {loading ? (
              <ListSkeleton />
            ) : assignments.length === 0 ? (
              <EmptyState
                message="No assignments yet."
                ctaLabel="+ Create your first assignment"
                onCta={() => navigation.navigate('AddAssignment')}
              />
            ) : (
              assignments.map((a) => (
                <AssignmentCard
                  key={a.id}
                  item={a}
                  onPress={(item) =>
                    navigation.navigate('Output', { assignment: item })
                  }
                  onEdit={handleEditAssignment}
                  onDelete={handleDeleteAssignment}
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
            addLabel="+ Add"
          />
          <ScrollView contentContainerStyle={styles.list}>
            {loading ? (
              <ListSkeleton />
            ) : curricula.length === 0 ? (
              <EmptyState
                message="No curricula adopted."
                ctaLabel="+ Add a curriculum"
                onCta={() => navigation.navigate('AddCurriculum')}
              />
            ) : (
              curricula.map((c) => (
                <CurriculumCard
                  key={c.id}
                  item={c}
                  onPress={(item) =>
                    navigation.navigate('CurriculumDetail', { curriculum: item })
                  }
                  onEdit={handleEditCurriculum}
                  onDelete={handleDeleteCurriculum}
                  onUnadopt={handleUnadoptCurriculum}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>

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
  cardWrap: {
    position: 'relative',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    paddingRight: 44, // leave room for menu trigger
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  cardTitle: {
    ...typography.subheading,
    flexShrink: 1,
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
  cardMenuAnchor: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  seedPill: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    letterSpacing: 0.5,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
    gap: 12,
  },
  emptyTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  emptyCta: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  emptyCtaText: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 13,
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

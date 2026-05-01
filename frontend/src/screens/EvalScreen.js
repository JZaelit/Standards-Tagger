import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { dataClient } from '../lib/dataClient';
import { previewText } from '../lib/htmlText';
import { storage } from '../lib/storage';
import {
  ALL_SUBJECTS,
  DEFAULT_EVAL_STATE,
  SUBJECT_LABEL,
  SORT_LABEL,
  filterAssignments,
  sortAssignments,
  filterCurricula,
  sortCurricula,
  mergeEvalState,
} from '../lib/evalFilters';
import { colors, shadows, typography } from '../theme';
import Menu, { MenuTrigger } from '../components/Menu';
import SkeletonRow from '../components/SkeletonRow';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import TopNav from '../components/TopNav';

const EVAL_STATE_KEY = 'eval_state';

// Persist toolbar state per-user (storage.js namespaces by Supabase userId)
// so filters survive refresh and don't leak across accounts.
function loadEvalState() {
  return mergeEvalState(storage.get(EVAL_STATE_KEY, null));
}
function saveEvalState(state) {
  storage.set(EVAL_STATE_KEY, state);
}

// ---------- Small UI primitives used by the toolbar ----------

function ColumnHeader({ title, count, onAdd, addLabel = '+ Add' }) {
  return (
    <View style={styles.columnHeader}>
      <View style={styles.columnTitleWrap}>
        <Text style={styles.columnTitle}>{title}</Text>
        {count != null ? (
          <Text style={styles.columnCount}>{count}</Text>
        ) : null}
      </View>
      <TouchableOpacity style={styles.addButton} onPress={onAdd}>
        <Text style={styles.addButtonText}>{addLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SearchField({ value, onChange, placeholder }) {
  return (
    <View style={styles.searchWrap}>
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={colors.textLight}
        value={value}
        onChangeText={onChange}
      />
      {value ? (
        <TouchableOpacity
          style={styles.searchClear}
          onPress={() => onChange('')}
          accessibilityLabel="Clear search"
        >
          <Text style={styles.searchClearText}>{'\u00d7'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SortButton({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity style={styles.sortBtn} onPress={() => setOpen(true)}>
        <Text style={styles.sortBtnText}>{`Sort: ${SORT_LABEL[value] || value}`}</Text>
        <Text style={styles.sortBtnCaret}>{'\u25be'}</Text>
      </TouchableOpacity>
      <Menu
        visible={open}
        onClose={() => setOpen(false)}
        anchor="center"
        options={options.map((opt) => ({
          label: SORT_LABEL[opt] || opt,
          onPress: () => onChange(opt),
        }))}
      />
    </>
  );
}

function Pill({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ToggleSwitch({ label, value, onChange }) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      style={styles.toggleWrap}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------- Cards ----------

function ProgressBar({ pct }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%` }]} />
    </View>
  );
}

function StatusPill({ status }) {
  if (!status) return null;
  const stylesByKind = {
    sample: styles.statusSample,
    tagged: styles.statusTagged,
    pending: styles.statusPending,
  };
  const labelByKind = {
    sample: 'SAMPLE',
    tagged: 'TAGGED',
    pending: 'PENDING',
  };
  return (
    <Text style={[styles.statusPill, stylesByKind[status]]}>
      {labelByKind[status]}
    </Text>
  );
}

// Derive the at-a-glance status pill for an assignment row. Order matters:
// seeds always read as SAMPLE; otherwise the presence of any aligned
// objective is what differentiates a tagged assignment from a pending one.
function statusOf(item) {
  if (item.is_seed) return 'sample';
  if (item.n_aligned && item.n_aligned > 0) return 'tagged';
  return 'pending';
}

function AssignmentCard({ item, onPress, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const desc = previewText(item.description);
  const isEditable = !item.is_seed;
  const pct =
    item.n_total > 0 ? Math.round((100 * item.n_aligned) / item.n_total) : null;
  const status = statusOf(item);
  return (
    <View style={styles.cardWrap}>
      <TouchableOpacity style={styles.card} onPress={() => onPress(item)}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
          <StatusPill status={status} />
        </View>
        <Text style={styles.cardSub}>
          {`Grade ${item.grade}${item.subject ? ` \u00b7 ${SUBJECT_LABEL[item.subject] || item.subject.toUpperCase()}` : ''}`}
        </Text>
        {desc ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{desc}</Text>
        ) : null}
        {item.file_name ? (
          <Text style={styles.cardFile} numberOfLines={1}>
            {`\ud83d\udcce ${item.file_name}`}
          </Text>
        ) : null}
        {item.n_total != null && item.n_total > 0 ? (
          <View style={styles.cardProgress}>
            <ProgressBar pct={pct} />
            <Text style={styles.cardProgressText}>
              {`${item.n_aligned}/${item.n_total} aligned (${pct}%)`}
            </Text>
          </View>
        ) : status === 'pending' ? (
          <Text style={styles.pendingHint}>
            Awaiting AI tagger
          </Text>
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

function CompactAssignmentRow({ item, onPress, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isEditable = !item.is_seed;
  const pct =
    item.n_total > 0 ? Math.round((100 * item.n_aligned) / item.n_total) : null;
  const status = statusOf(item);
  return (
    <View style={styles.compactRow}>
      <TouchableOpacity
        style={styles.compactRowMain}
        onPress={() => onPress(item)}
      >
        <Text style={styles.compactName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.compactMeta}>
          <Text style={styles.compactMetaText}>{`Grade ${item.grade}`}</Text>
          {item.subject ? (
            <Text style={styles.compactMetaText}>
              {SUBJECT_LABEL[item.subject] || item.subject.toUpperCase()}
            </Text>
          ) : null}
          {pct != null ? (
            <Text style={styles.compactMetaTextStrong}>{`${pct}%`}</Text>
          ) : null}
          <StatusPill status={status} />
        </View>
      </TouchableOpacity>
      {isEditable ? (
        <>
          <MenuTrigger
            onPress={() => setMenuOpen(true)}
            accessibilityLabel={`Actions for ${item.name}`}
          />
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
        <Text style={styles.cardSub}>
          {`Grade ${item.grade}${item.subject ? ` \u00b7 ${SUBJECT_LABEL[item.subject] || item.subject}` : ''}`}
        </Text>
        {item.standards_count != null && item.standards_count > 0 ? (
          <Text style={styles.cardDesc}>
            {`${item.standards_count.toLocaleString()} standards`}
          </Text>
        ) : null}
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

function CompactCurriculumRow({ item, onPress, onEdit, onDelete, onUnadopt }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isLibrary = item.is_seed !== false;
  const options = isLibrary
    ? [{ label: 'Remove from my list', onPress: () => onUnadopt(item) }]
    : [
        { label: 'Edit', onPress: () => onEdit(item) },
        { label: 'Delete', onPress: () => onDelete(item), destructive: true },
      ];
  return (
    <View style={styles.compactRow}>
      <TouchableOpacity
        style={styles.compactRowMain}
        onPress={() => onPress(item)}
      >
        <Text style={styles.compactName} numberOfLines={1}>{item.title}</Text>
        <View style={styles.compactMeta}>
          <Text style={styles.compactMetaText}>{`Grade ${item.grade}`}</Text>
          {item.standards_count ? (
            <Text style={styles.compactMetaText}>
              {`${item.standards_count.toLocaleString()} standards`}
            </Text>
          ) : null}
          {isLibrary ? (
            <Text style={styles.compactSeedPill}>LIBRARY</Text>
          ) : null}
        </View>
      </TouchableOpacity>
      <MenuTrigger
        onPress={() => setMenuOpen(true)}
        accessibilityLabel={`Actions for ${item.title}`}
      />
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

function ListSkeleton({ density }) {
  const h = density === 'compact' ? 44 : 84;
  return (
    <View style={{ gap: density === 'compact' ? 6 : 10 }}>
      <SkeletonRow height={h} />
      <SkeletonRow height={h} />
      <SkeletonRow height={h} />
    </View>
  );
}

// ---------- Screen ----------

export default function EvalScreen({ navigation }) {
  const [assignments, setAssignments] = useState([]);
  const [curricula, setCurricula] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const confirm = useConfirm();

  // Toolbar state. Initialise from storage so refresh remembers your view.
  const initialState = useRef(loadEvalState()).current;
  const [evalState, setEvalState] = useState(initialState);

  useEffect(() => { saveEvalState(evalState); }, [evalState]);

  const setDensity = (density) => setEvalState((s) => ({ ...s, density }));
  const patchAssignments = (patch) =>
    setEvalState((s) => ({ ...s, assignments: { ...s.assignments, ...patch } }));
  const patchCurricula = (patch) =>
    setEvalState((s) => ({ ...s, curricula: { ...s.curricula, ...patch } }));

  // Enrich the assignment list with n_aligned/n_total/distinct_codes from
  // the dashboard endpoint so cards can show progress and the Aligned-%
  // sort has real numbers to work with. User-created assignments aren't
  // in the dashboard set; they remain at 0/0 (correct for placeholder
  // phase) and sink to the bottom of the aligned-% sort.
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [asgn, curr, edus] = await Promise.all([
      dataClient.assignments.list(),
      dataClient.curricula.listForUser(),
      dataClient.dashboard.edusperiences(),
    ]);
    const eduById = Object.fromEntries((edus || []).map((e) => [e.id, e]));
    const enriched = (asgn || []).map((a) => {
      const e = eduById[a.id];
      if (!e) return a;
      return {
        ...a,
        n_total: e.n_total,
        n_aligned: e.n_aligned,
        distinct_codes: e.distinct_codes,
      };
    });
    setAssignments(enriched);
    setCurricula(curr || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const unsubscribe = navigation.addListener('focus', fetchData);
    return unsubscribe;
  }, [navigation, fetchData]);

  const visibleAssignments = useMemo(
    () => sortAssignments(
      filterAssignments(assignments, evalState.assignments),
      evalState.assignments.sort,
    ),
    [assignments, evalState.assignments],
  );

  const visibleCurricula = useMemo(
    () => sortCurricula(
      filterCurricula(curricula, evalState.curricula),
      evalState.curricula.sort,
    ),
    [curricula, evalState.curricula],
  );

  // ---------- Action handlers ----------

  const handleEditAssignment = (assignment) => {
    navigation.navigate('AddAssignment', { assignment });
  };

  const handleDeleteAssignment = async (assignment) => {
    const prior = assignments;
    setAssignments((rows) => rows.filter((a) => a.id !== assignment.id));
    const removed = await dataClient.assignments.delete(assignment.id);
    if (!removed) {
      setAssignments(prior);
      toast.show('Could not delete assignment', { tone: 'danger' });
      return;
    }
    toast.show(`Deleted "${assignment.name}"`, {
      durationMs: 5000,
      action: {
        label: 'Undo',
        onPress: async () => {
          await dataClient.assignments.restore(removed.row, removed.index);
          fetchData();
        },
      },
    });
  };

  const handleEditCurriculum = (curriculum) => {
    navigation.navigate('AddCurriculum', { curriculum });
  };

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
          await dataClient.curricula.restore(
            removed.row, removed.index, removed.was_adopted,
          );
          fetchData();
        },
      },
    });
  };

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
          fetchData();
        },
      },
    });
  };

  // ---------- Render ----------

  const isCompact = evalState.density === 'compact';
  const aState = evalState.assignments;
  const cState = evalState.curricula;

  const toggleSubject = (s) => {
    const set = new Set(aState.subjects);
    if (set.has(s)) set.delete(s);
    else set.add(s);
    patchAssignments({ subjects: [...set] });
  };

  return (
    <View style={styles.container}>
      <TopNav navigation={navigation} currentRoute="Eval" />

      {/* Page-level toolbar: density toggle */}
      <View style={styles.pageToolbar}>
        <View style={styles.viewToggle}>
          <TouchableOpacity
            onPress={() => setDensity('cards')}
            style={[styles.viewToggleBtn, !isCompact && styles.viewToggleBtnActive]}
          >
            <Text style={[styles.viewToggleText, !isCompact && styles.viewToggleTextActive]}>
              Cards
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDensity('compact')}
            style={[styles.viewToggleBtn, isCompact && styles.viewToggleBtnActive]}
          >
            <Text style={[styles.viewToggleText, isCompact && styles.viewToggleTextActive]}>
              Compact
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.columns}>
        {/* ------ Assignments column ------ */}
        <View style={styles.column}>
          <ColumnHeader
            title="Assignments"
            count={visibleAssignments.length}
            onAdd={() => navigation.navigate('AddAssignment')}
            addLabel="+ New"
          />

          <View style={styles.toolbar}>
            <SearchField
              value={aState.search}
              onChange={(v) => patchAssignments({ search: v })}
              placeholder="Search assignments..."
            />
            <View style={styles.toolbarRow}>
              <SortButton
                value={aState.sort}
                options={['recent', 'name', 'aligned']}
                onChange={(v) => patchAssignments({ sort: v })}
              />
              <ToggleSwitch
                label="Hide samples"
                value={aState.hideSamples}
                onChange={(v) => patchAssignments({ hideSamples: v })}
              />
            </View>
            <View style={styles.pillRow}>
              {ALL_SUBJECTS.map((s) => (
                <Pill
                  key={s}
                  label={SUBJECT_LABEL[s] || s}
                  active={aState.subjects.includes(s)}
                  onPress={() => toggleSubject(s)}
                />
              ))}
            </View>
          </View>

          <ScrollView contentContainerStyle={isCompact ? styles.compactList : styles.list}>
            {loading ? (
              <ListSkeleton density={evalState.density} />
            ) : visibleAssignments.length === 0 ? (
              <EmptyState
                message={
                  assignments.length === 0
                    ? 'No assignments yet.'
                    : 'No assignments match these filters.'
                }
                ctaLabel={
                  assignments.length === 0 ? '+ Create your first assignment' : null
                }
                onCta={() => navigation.navigate('AddAssignment')}
              />
            ) : isCompact ? (
              visibleAssignments.map((a) => (
                <CompactAssignmentRow
                  key={a.id}
                  item={a}
                  onPress={(item) =>
                    navigation.navigate('Output', { assignment: item })
                  }
                  onEdit={handleEditAssignment}
                  onDelete={handleDeleteAssignment}
                />
              ))
            ) : (
              visibleAssignments.map((a) => (
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

        {/* ------ Curriculum column ------ */}
        <View style={styles.column}>
          <ColumnHeader
            title="Curriculum"
            count={visibleCurricula.length}
            onAdd={() => navigation.navigate('AddCurriculum')}
            addLabel="+ Add"
          />

          <View style={styles.toolbar}>
            <SearchField
              value={cState.search}
              onChange={(v) => patchCurricula({ search: v })}
              placeholder="Search curricula..."
            />
            <View style={styles.toolbarRow}>
              <SortButton
                value={cState.sort}
                options={['recent', 'name']}
                onChange={(v) => patchCurricula({ sort: v })}
              />
              <ToggleSwitch
                label="Hide library"
                value={cState.hideLibrary}
                onChange={(v) => patchCurricula({ hideLibrary: v })}
              />
            </View>
          </View>

          <ScrollView contentContainerStyle={isCompact ? styles.compactList : styles.list}>
            {loading ? (
              <ListSkeleton density={evalState.density} />
            ) : visibleCurricula.length === 0 ? (
              <EmptyState
                message={
                  curricula.length === 0
                    ? 'No curricula adopted.'
                    : 'No curricula match these filters.'
                }
                ctaLabel={
                  curricula.length === 0 ? '+ Add a curriculum' : null
                }
                onCta={() => navigation.navigate('AddCurriculum')}
              />
            ) : isCompact ? (
              visibleCurricula.map((c) => (
                <CompactCurriculumRow
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
            ) : (
              visibleCurricula.map((c) => (
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
  pageToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  viewToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.primary,
  },
  viewToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  viewToggleTextActive: {
    color: '#fff',
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
  },
  column: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    minWidth: 0,
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
  columnTitleWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  columnTitle: {
    ...typography.heading,
    fontSize: 18,
  },
  columnCount: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
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
  // Toolbar (per-column)
  toolbar: {
    gap: 8,
    marginBottom: 12,
  },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 12,
    paddingRight: 4,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.textPrimary,
  },
  searchClear: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  searchClearText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  sortBtnText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  sortBtnCaret: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: '#fff',
  },
  toggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleTrack: {
    width: 32,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.border,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  toggleTrackOn: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.white,
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  toggleLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  // Card / list
  list: {
    paddingBottom: 24,
    gap: 10,
  },
  compactList: {
    paddingBottom: 24,
    gap: 6,
  },
  cardWrap: {
    position: 'relative',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    paddingRight: 44,
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
  cardProgress: {
    marginTop: 10,
    gap: 4,
  },
  cardProgressText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  progressTrack: {
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  cardMenuAnchor: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  // Compact row
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  compactRowMain: {
    flex: 1,
    minWidth: 0,
  },
  compactName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  compactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  compactMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  compactMetaTextStrong: {
    fontSize: 11,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  compactSeedPill: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    letterSpacing: 0.5,
  },
  // Tagging status pill (TAGGED / PENDING / SAMPLE) on assignment rows.
  statusPill: {
    fontSize: 9,
    fontWeight: '700',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    letterSpacing: 0.5,
    overflow: 'hidden',
    borderWidth: 1,
  },
  statusSample: {
    color: colors.textSecondary,
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  statusTagged: {
    color: '#0e7a3e',
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  statusPending: {
    color: '#a86e00',
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
  },
  cardFile: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  pendingHint: {
    marginTop: 8,
    fontSize: 11,
    color: colors.textLight,
    fontStyle: 'italic',
  },
  // Pills (sample/library marker on curriculum cards - kept since
  // curricula don't have a tagging status).
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
  // Empty
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

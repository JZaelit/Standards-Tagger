// In-assignment alignment UI: pick one or more standards sets and run Gemini.
// Embedded on OutputScreen for raw EduSperiences (not a top-level tab).

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { dataClient } from '../lib/dataClient';
import { hasGeminiConfigured } from '../lib/settings';
import {
  tagAssignmentToStandards,
  mergeTagResults,
} from '../lib/gemini';
import { ensureParsedEdusperience } from '../lib/parseUpload';
import { useToast } from '../components/Toast';
import { colors, typography } from '../theme';

export default function AlignPanel({ assignmentId, navigation, onAligned }) {
  const [curricula, setCurricula] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loadingCurricula, setLoadingCurricula] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    dataClient.curricula.listForUser().then((rows) => {
      if (!cancelled) {
        setCurricula(rows || []);
        setLoadingCurricula(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!assignmentId) return;
    let cancelled = false;
    dataClient.assignments.detail(assignmentId).then((d) => {
      if (cancelled || !d) return;
      const ids = d.alignment_curriculum_ids?.length
        ? d.alignment_curriculum_ids
        : (d.alignment_curriculum_id ? [d.alignment_curriculum_id] : []);
      if (ids.length) setSelectedIds(ids);
    });
    return () => { cancelled = true; };
  }, [assignmentId]);

  const toggleCurriculum = (id) => {
    setSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const handleRun = async () => {
    if (!hasGeminiConfigured()) {
      toast.show('Add your Gemini API key in Settings first', { tone: 'danger' });
      navigation.navigate('Settings');
      return;
    }
    if (!selectedIds.length) {
      toast.show('Select at least one standards set to align against', { tone: 'danger' });
      return;
    }

    setRunning(true);
    setStatus('Preparing…');
    try {
      setStatus('Loading objectives…');
      const parsed = await ensureParsedEdusperience(assignmentId);
      await dataClient.assignments.saveParsed(assignmentId, parsed);
      const assignment = await dataClient.assignments.get(assignmentId);

      setStatus('Loading standards…');
      const standardsRecords = await dataClient.standards.recordsForCurricula(selectedIds);
      if (!standardsRecords?.length) {
        throw new Error(
          'No standards in the selected set(s). Upload a standards PDF/DOCX first.',
        );
      }

      const selectedCurricula = await Promise.all(
        selectedIds.map((id) => dataClient.curricula.get(id)),
      );
      const sourceLabel = selectedCurricula
        .filter(Boolean)
        .map((c) => c.title)
        .join(' + ');

      setStatus(`Aligning ${parsed.objectives.length} objectives…`);
      const tagResults = await tagAssignmentToStandards({
        objectives: parsed.objectives,
        standardsRecords,
        grade: assignment?.grade || parsed.grade,
        subject: assignment?.subject || parsed.subject,
        assignmentName: assignment?.name || parsed.title,
        standardsSourceLabel: sourceLabel,
      });

      const merged = mergeTagResults(parsed.objectives, tagResults);
      await dataClient.assignments.saveAlignment(assignmentId, {
        curriculum_id: selectedIds[0],
        curriculum_ids: selectedIds,
        curriculum_title: sourceLabel,
        objectives: merged.objectives,
        n_total: merged.n_total,
        n_aligned: merged.n_aligned,
      });

      setStatus('');
      toast.show(
        `Aligned ${merged.n_aligned}/${merged.n_total} objectives using ${selectedIds.length} standards set(s)`,
        { tone: 'success' },
      );
      onAligned && onAligned();
    } catch (e) {
      setStatus('');
      toast.show(e.message || 'Alignment failed', { tone: 'danger' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Align to standards</Text>
      <Text style={styles.body}>
        This EduSperience is uploaded but not tagged yet. Choose one or more
        standards sets (e.g. ELA + Math for cross-disciplinary work), then run
        AI alignment.
      </Text>

      {!hasGeminiConfigured() ? (
        <TouchableOpacity
          style={styles.keyBanner}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={styles.keyBannerText}>
            Add Gemini API key in Settings to align
          </Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>Standards sets (select one or more)</Text>
      {loadingCurricula ? (
        <ActivityIndicator color={colors.primary} />
      ) : curricula.length === 0 ? (
        <Text style={styles.empty}>
          No standards yet — upload one from the Workspace curricula column.
        </Text>
      ) : (
        <View style={styles.options}>
          {curricula.map((c) => {
            const selected = selectedIds.includes(c.id);
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.option, selected && styles.optionSelected]}
                onPress={() => toggleCurriculum(c.id)}
              >
                <View style={styles.optionRow}>
                  <View style={[styles.check, selected && styles.checkOn]}>
                    {selected ? (
                      <Text style={styles.checkMark}>{'\u2713'}</Text>
                    ) : null}
                  </View>
                  <Text
                    style={[
                      styles.optionText,
                      selected && styles.optionTextSelected,
                    ]}
                  >
                    {c.title}
                    {c.is_seed !== false ? ' · SAMPLE' : ''}
                    {c.standards_count ? ` · ${c.standards_count} stds` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {selectedIds.length > 0 ? (
        <Text style={styles.selectedHint}>
          {`${selectedIds.length} set${selectedIds.length === 1 ? '' : 's'} selected — standards are merged for tagging.`}
        </Text>
      ) : null}

      {status ? (
        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.statusText}>{status}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[
          styles.runBtn,
          (running || !selectedIds.length) && styles.runBtnDisabled,
        ]}
        onPress={handleRun}
        disabled={running || !selectedIds.length}
      >
        {running ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.runBtnText}>Align with AI</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#f0f7ff',
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  keyBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
  },
  keyBannerText: { fontSize: 13, color: '#78350f', fontWeight: '600' },
  label: { ...typography.label, marginTop: 4 },
  empty: { fontSize: 13, color: colors.textLight, fontStyle: 'italic' },
  options: { gap: 8 },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkMark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  optionText: { flex: 1, fontSize: 14, color: colors.textPrimary },
  optionTextSelected: { color: colors.primaryDark, fontWeight: '600' },
  selectedHint: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { fontSize: 13, color: colors.textSecondary },
  runBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  runBtnDisabled: { opacity: 0.5 },
  runBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

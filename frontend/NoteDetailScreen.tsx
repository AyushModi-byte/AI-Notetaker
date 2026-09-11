import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { deleteNote, reclassifyNote, summarizeNote, updateNote } from './api';
import { colors, radii, cardShadow, spacing, tagColors } from './theme';
import { ItemType, Note } from './types';

interface EditableItem {
  localId: string;
  serverId: number | null;
  type: ItemType;
  content: string;
  due_date: string | null;
}

interface NoteDetailScreenProps {
  visible: boolean;
  note: Note | null;
  onClose: () => void;
  onNoteUpdated: (note: Note) => void;
  onNoteDeleted: (noteId: number) => void;
}

const CATEGORY_CONFIG: { type: ItemType; label: string; hasDueDate: boolean }[] = [
  { type: 'task', label: 'Action Items', hasDueDate: true },
  { type: 'decision', label: 'Key Decisions', hasDueDate: false },
  { type: 'deadline', label: 'Deadlines', hasDueDate: true },
  { type: 'idea', label: 'Ideas', hasDueDate: false },
  { type: 'name', label: 'People Mentioned', hasDueDate: false },
];

function toEditableItems(note: Note): EditableItem[] {
  return note.structured_items.map((item) => ({
    localId: `server-${item.id}`,
    serverId: item.id,
    type: item.type,
    content: item.content,
    due_date: item.due_date,
  }));
}

let localIdCounter = 0;

export default function NoteDetailScreen({
  visible,
  note,
  onClose,
  onNoteUpdated,
  onNoteDeleted,
}: NoteDetailScreenProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [items, setItems] = useState<EditableItem[]>([]);
  const [checkedTasks, setCheckedTasks] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const currentNoteId = useRef<number | null>(null);

  useEffect(() => {
    if (note && note.id !== currentNoteId.current) {
      currentNoteId.current = note.id;
      setTitle(note.title ?? '');
      setSummary(note.summary ?? '');
      setItems(toEditableItems(note));
      setCheckedTasks({});
      setIsEditing(false);
    }
  }, [note]);

  if (!note) return null;

  const updateItem = (localId: string, patch: Partial<EditableItem>) => {
    setItems((prev) => prev.map((it) => (it.localId === localId ? { ...it, ...patch } : it)));
  };

  const removeItem = (localId: string) => {
    setItems((prev) => prev.filter((it) => it.localId !== localId));
  };

  const addItem = (type: ItemType) => {
    localIdCounter += 1;
    setItems((prev) => [
      ...prev,
      { localId: `new-${localIdCounter}`, serverId: null, type, content: '', due_date: null },
    ]);
  };

  const handleToggleEdit = async () => {
    if (!isEditing) {
      setIsEditing(true);
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title,
        summary,
        structured_items: items
          .filter((it) => it.content.trim().length > 0)
          .map((it) => ({ type: it.type, content: it.content.trim(), due_date: it.due_date })),
      };
      const updated = await updateNote(note.id, payload);
      onNoteUpdated(updated);
      setItems(toEditableItems(updated));
      setIsEditing(false);
    } catch (err) {
      Alert.alert(
        'Could not save',
        err instanceof Error ? `Could not reach the backend: ${err.message}` : 'Network error.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSummarize = async () => {
    setIsBusy('summarize');
    try {
      const updated = await summarizeNote(note.id);
      setSummary(updated.summary ?? '');
      onNoteUpdated(updated);
    } catch (err) {
      Alert.alert(
        'Could not summarize',
        err instanceof Error ? `Could not reach the backend: ${err.message}` : 'Network error.'
      );
    } finally {
      setIsBusy(null);
    }
  };

  const handleReclassify = async () => {
    setIsBusy('reclassify');
    try {
      const updated = await reclassifyNote(note.id);
      setItems(toEditableItems(updated));
      setCheckedTasks({});
      onNoteUpdated(updated);
      Alert.alert('Tags updated', 'Categories were re-classified from the transcript.');
    } catch (err) {
      Alert.alert(
        'Could not re-classify',
        err instanceof Error ? `Could not reach the backend: ${err.message}` : 'Network error.'
      );
    } finally {
      setIsBusy(null);
    }
  };

  const handleCopyTasks = async () => {
    const tasks = items.filter((it) => it.type === 'task' && it.content.trim());
    if (tasks.length === 0) {
      Alert.alert('No action items', 'This note has no action items to copy.');
      return;
    }
    const text = tasks
      .map((t) => `- ${t.content}${t.due_date ? ` (due: ${t.due_date})` : ''}`)
      .join('\n');
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${tasks.length} action item${tasks.length === 1 ? '' : 's'} copied to clipboard.`);
  };

  const handleExtractActionItems = () => {
    // Client-side only: toggles a checklist view of the current action items.
    // There is no "completed" field on the backend yet, so checks are session-local.
    const taskChecks: Record<string, boolean> = {};
    items
      .filter((it) => it.type === 'task')
      .forEach((it) => {
        taskChecks[it.localId] = false;
      });
    setCheckedTasks(taskChecks);
    Alert.alert('Action items', 'Tap each item below to check it off (not saved to the server yet).');
  };

  const notAvailableYet = (feature: string) => {
    Alert.alert(feature, 'This is a placeholder — not wired up to persistence yet.');
  };

  const handleDelete = () => {
    Alert.alert('Delete note', 'This permanently deletes this note and its audio file.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNote(note.id);
            onNoteDeleted(note.id);
            onClose();
          } catch (err) {
            Alert.alert(
              'Could not delete',
              err instanceof Error ? `Could not reach the backend: ${err.message}` : 'Network error.'
            );
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Context Detail</Text>
          <View style={styles.headerActions}>
            <Pressable onPress={handleDelete} hitSlop={10}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
            <Pressable onPress={handleToggleEdit} disabled={isSaving} hitSlop={10}>
              {isSaving ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text style={styles.editToggle}>{isEditing ? 'Save' : 'Edit'}</Text>
              )}
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.fieldLabel}>Title</Text>
          {isEditing ? (
            <TextInput style={styles.titleInput} value={title} onChangeText={setTitle} placeholder="Title" />
          ) : (
            <Text style={styles.titleText}>{title || 'Untitled note'}</Text>
          )}

          <Text style={styles.fieldLabel}>Summary</Text>
          {isEditing ? (
            <TextInput
              style={styles.summaryInput}
              value={summary}
              onChangeText={setSummary}
              placeholder="No summary yet — try Summarize Note below."
              multiline
            />
          ) : (
            <Text style={styles.summaryText}>
              {summary || 'No summary yet — try Summarize Note below.'}
            </Text>
          )}

          <View style={styles.tagBar}>
            <Pressable style={styles.tagPill} onPress={() => notAvailableYet('Add Tag')}>
              <Ionicons name="pricetag-outline" size={14} color={colors.primary} />
              <Text style={styles.tagPillText}>Add Tag</Text>
            </Pressable>
            <Pressable style={styles.tagPill} onPress={() => notAvailableYet('Add Category')}>
              <Ionicons name="folder-outline" size={14} color={colors.primary} />
              <Text style={styles.tagPillText}>Add Category</Text>
            </Pressable>
            <Pressable style={styles.tagPill} onPress={() => notAvailableYet('Reminder')}>
              <Ionicons name="alarm-outline" size={14} color={colors.primary} />
              <Text style={styles.tagPillText}>Reminder</Text>
            </Pressable>
          </View>

          {CATEGORY_CONFIG.map((category) => {
            const categoryItems = items.filter((it) => it.type === category.type);
            const colorSet = tagColors[category.type];
            return (
              <View key={category.type} style={styles.section}>
                <View style={[styles.sectionTag, { backgroundColor: colorSet.bg }]}>
                  <Text style={[styles.sectionTagText, { color: colorSet.text }]}>{category.label}</Text>
                </View>

                {categoryItems.length === 0 && !isEditing ? (
                  <Text style={styles.emptyCategoryText}>None</Text>
                ) : null}

                {categoryItems.map((item) =>
                  isEditing ? (
                    <View key={item.localId} style={styles.editableRow}>
                      <TextInput
                        style={styles.editableRowInput}
                        value={item.content}
                        onChangeText={(text) => updateItem(item.localId, { content: text })}
                        placeholder="Content"
                      />
                      {category.hasDueDate ? (
                        <TextInput
                          style={styles.editableDueDateInput}
                          value={item.due_date ?? ''}
                          onChangeText={(text) => updateItem(item.localId, { due_date: text || null })}
                          placeholder="Due date"
                        />
                      ) : null}
                      <Pressable onPress={() => removeItem(item.localId)} hitSlop={10}>
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  ) : category.type === 'task' && checkedTasks[item.localId] !== undefined ? (
                    <Pressable
                      key={item.localId}
                      style={styles.checklistRow}
                      onPress={() =>
                        setCheckedTasks((prev) => ({ ...prev, [item.localId]: !prev[item.localId] }))
                      }
                    >
                      <Ionicons
                        name={checkedTasks[item.localId] ? 'checkbox' : 'square-outline'}
                        size={18}
                        color={colors.primary}
                      />
                      <Text
                        style={[
                          styles.viewRowText,
                          checkedTasks[item.localId] && styles.viewRowTextChecked,
                        ]}
                      >
                        {item.content}
                        {item.due_date ? ` — due ${item.due_date}` : ''}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text key={item.localId} style={styles.viewRowText}>
                      • {item.content}
                      {item.due_date ? ` — due ${item.due_date}` : ''}
                    </Text>
                  )
                )}

                {isEditing ? (
                  <Pressable style={styles.addRowButton} onPress={() => addItem(category.type)}>
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={styles.addRowButtonText}>Add</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          <Text style={styles.sectionHeading}>AI Assist</Text>
          <View style={styles.aiGrid}>
            <Pressable style={styles.aiButton} onPress={handleSummarize} disabled={isBusy !== null}>
              {isBusy === 'summarize' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
              )}
              <Text style={styles.aiButtonText}>Summarize Note</Text>
            </Pressable>

            <Pressable style={styles.aiButton} onPress={handleExtractActionItems} disabled={isBusy !== null}>
              <Ionicons name="checkbox-outline" size={20} color={colors.primary} />
              <Text style={styles.aiButtonText}>Extract Action Items</Text>
            </Pressable>

            <Pressable style={styles.aiButton} onPress={handleCopyTasks} disabled={isBusy !== null}>
              <Ionicons name="copy-outline" size={20} color={colors.primary} />
              <Text style={styles.aiButtonText}>Copy to Clipboard</Text>
            </Pressable>

            <Pressable style={styles.aiButton} onPress={handleReclassify} disabled={isBusy !== null}>
              {isBusy === 'reclassify' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="refresh-outline" size={20} color={colors.primary} />
              )}
              <Text style={styles.aiButtonText}>Re-classify Tags</Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Full transcript</Text>
          <Text style={styles.transcriptText}>{note.raw_transcript}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  editToggle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textFaint,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: 6,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  titleInput: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    paddingVertical: 4,
  },
  summaryText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  summaryInput: {
    fontSize: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.sm,
    padding: spacing.sm,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  tagBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tagPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginTop: spacing.md,
    ...cardShadow,
  },
  sectionTag: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    marginBottom: spacing.sm,
  },
  sectionTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyCategoryText: {
    fontSize: 13,
    color: colors.textFaint,
  },
  viewRowText: {
    fontSize: 14,
    color: colors.text,
    marginBottom: 6,
  },
  viewRowTextChecked: {
    textDecorationLine: 'line-through',
    color: colors.textFaint,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 6,
  },
  editableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  editableRowInput: {
    flex: 2,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 13,
  },
  editableDueDateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 13,
  },
  addRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  addRowButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  aiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  aiButton: {
    width: '48%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    padding: spacing.md,
    alignItems: 'flex-start',
    gap: 6,
    ...cardShadow,
  },
  aiButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  transcriptText: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    fontStyle: 'italic',
  },
});

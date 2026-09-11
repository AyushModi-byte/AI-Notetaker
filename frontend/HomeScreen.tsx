import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, cardShadow, spacing, tagColors } from './theme';
import { Note } from './types';
import { formatRelativeTime, groupByType, SECTION_LABELS } from './utils';

interface HomeScreenProps {
  notes: Note[];
  refreshing: boolean;
  onRefresh: () => void;
  onOpenRecording: () => void;
  onOpenChat: () => void;
  onOpenManualNote: () => void;
  onExportTasks: () => void;
  onOpenNoteDetail: (note: Note) => void;
  onOpenSettings: () => void;
  onDeleteNote: (noteId: number) => void;
}

const CARD_PILL_TYPES: (keyof typeof tagColors)[] = ['task', 'decision', 'name'];

function NoteCard({
  note,
  onPress,
  onDelete,
}: {
  note: Note;
  onPress: () => void;
  onDelete: () => void;
}) {
  const grouped = groupByType(note.structured_items);
  const previewItems = (grouped['task'] ?? grouped['decision'] ?? note.structured_items).slice(0, 2);
  const title = note.title || note.raw_transcript.slice(0, 60);
  const presentTypes = CARD_PILL_TYPES.filter((t) => grouped[t] && grouped[t].length > 0);

  const handleMenuPress = () => {
    Alert.alert(title, undefined, [
      { text: 'Open', onPress },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Pressable style={styles.noteCard} onPress={onPress}>
      <View style={styles.noteCardHeader}>
        <Text style={styles.noteTitle} numberOfLines={1}>
          {title}
        </Text>
        <Pressable hitSlop={10} onPress={handleMenuPress}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textFaint} />
        </Pressable>
      </View>
      <Text style={styles.noteTimestamp}>{formatRelativeTime(note.created_at)}</Text>

      {previewItems.length > 0 ? (
        <View style={styles.previewList}>
          {previewItems.map((item) => (
            <Text key={item.id} style={styles.previewItem} numberOfLines={1}>
              • {item.content}
            </Text>
          ))}
        </View>
      ) : null}

      {presentTypes.length > 0 ? (
        <View style={styles.pillRow}>
          {presentTypes.map((type) => {
            const label = SECTION_LABELS.find((s) => s.key === type)?.label ?? type;
            const c = tagColors[type];
            return (
              <View key={type} style={[styles.pill, { backgroundColor: c.bg }]}>
                <Text style={[styles.pillText, { color: c.text }]}>{label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </Pressable>
  );
}

export default function HomeScreen({
  notes,
  refreshing,
  onRefresh,
  onOpenRecording,
  onOpenChat,
  onOpenManualNote,
  onExportTasks,
  onOpenNoteDetail,
  onOpenSettings,
  onDeleteNote,
}: HomeScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredNotes = useMemo(() => {
    // `notes` is already newest-first: GET /notes sorts by created_at desc, and new
    // notes are prepended locally after a successful recording/manual entry.
    const query = searchQuery.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter((note) => {
      if (note.title?.toLowerCase().includes(query)) return true;
      if (note.raw_transcript.toLowerCase().includes(query)) return true;
      return note.structured_items.some((item) => item.content.toLowerCase().includes(query));
    });
  }, [notes, searchQuery]);

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      data={filteredNotes}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <NoteCard
          note={item}
          onPress={() => onOpenNoteDetail(item)}
          onDelete={() => onDeleteNote(item.id)}
        />
      )}
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={22} color="#fff" />
              </View>
              <View>
                <Text style={styles.userName}>Ayush</Text>
                <Text style={styles.userSubtitle}>AI Notetaker</Text>
              </View>
            </View>
            <Pressable onPress={onOpenSettings} hitSlop={10}>
              <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search notes, names, categories…"
              placeholderTextColor={colors.textFaint}
            />
          </View>

          <View style={styles.grid}>
            <Pressable style={[styles.gridCard, styles.gridCardPrimary]} onPress={onOpenRecording}>
              <Ionicons name="mic" size={24} color="#fff" />
              <Text style={styles.gridCardTitlePrimary}>Voice Note</Text>
              <Text style={styles.gridCardSubtitlePrimary}>Record and capture context</Text>
            </Pressable>

            <Pressable style={styles.gridCard} onPress={onOpenChat}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={colors.primary} />
              <Text style={styles.gridCardTitle}>Ask Context</Text>
              <Text style={styles.gridCardSubtitle}>Query your memory</Text>
            </Pressable>

            <Pressable style={styles.gridCard} onPress={onExportTasks}>
              <Ionicons name="clipboard-outline" size={22} color={colors.primary} />
              <Text style={styles.gridCardTitle}>Tasks</Text>
              <Text style={styles.gridCardSubtitle}>Copy all action items</Text>
            </Pressable>

            <Pressable style={styles.gridCard} onPress={onOpenManualNote}>
              <Ionicons name="create-outline" size={22} color={colors.primary} />
              <Text style={styles.gridCardTitle}>Text Note</Text>
              <Text style={styles.gridCardSubtitle}>Type quick thoughts</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionHeading}>Recent Contexts</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="mic-circle-outline" size={56} color={colors.textFaint} />
          <Text style={styles.emptyStateText}>
            No context captured yet. Tap Voice Note to start listening.
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: spacing.md,
    paddingTop: 60,
    paddingBottom: 140,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  userSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  gridCard: {
    width: '48%',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    ...cardShadow,
  },
  gridCardPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  gridCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  gridCardSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  gridCardTitlePrimary: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginTop: spacing.sm,
  },
  gridCardSubtitlePrimary: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  noteCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...cardShadow,
  },
  noteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginRight: spacing.sm,
  },
  noteTimestamp: {
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  previewList: {
    marginBottom: spacing.sm,
  },
  previewItem: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 2,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 20,
  },
});

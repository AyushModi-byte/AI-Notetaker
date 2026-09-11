import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StatusBar as RNStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { createManualNote, deleteNote, fetchNotes, fetchTasks, uploadAudioNote } from './api';
import ChatScreen from './ChatScreen';
import HomeScreen from './HomeScreen';
import NoteDetailScreen from './NoteDetailScreen';
import RecordingScreen from './RecordingScreen';
import SettingsScreen from './SettingsScreen';
import TabBar, { TabKey } from './TabBar';
import { colors, radii, spacing } from './theme';
import { isDiscarded, Note, UploadResponse } from './types';

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('home');

  const [isRecordingOpen, setIsRecordingOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastRecordingUri = useRef<string | null>(null);

  const [noteDetail, setNoteDetail] = useState<Note | null>(null);

  const [isManualNoteOpen, setIsManualNoteOpen] = useState(false);
  const [manualNoteText, setManualNoteText] = useState('');
  const [isSavingManualNote, setIsSavingManualNote] = useState(false);

  const loadNotes = async () => {
    setRefreshing(true);
    try {
      const data = await fetchNotes();
      setNotes(data);
    } catch (err) {
      Alert.alert(
        'Could not refresh',
        err instanceof Error ? `Could not reach the backend: ${err.message}` : 'Network error.'
      );
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const handleUploadResult = (result: UploadResponse) => {
    if (isDiscarded(result)) {
      Alert.alert('No meaningful context found', result.message);
      return;
    }
    setNotes((prev) => [result, ...prev.filter((n) => n.id !== result.id)]);
    setActiveTab('home');
    setNoteDetail(result);
  };

  const handleRecordingSave = async (uri: string) => {
    setIsRecordingOpen(false);
    lastRecordingUri.current = uri;
    setIsProcessing(true);
    try {
      const result = await uploadAudioNote(uri);
      handleUploadResult(result);
    } catch (err) {
      const message =
        err instanceof Error
          ? `Could not reach the backend: ${err.message}`
          : 'Could not reach the backend. Please try again.';
      Alert.alert('Upload failed', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry', onPress: () => handleRecordingSave(uri) },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportTasks = async () => {
    try {
      const tasks = await fetchTasks();
      if (tasks.length === 0) {
        Alert.alert('No tasks yet', 'Record or write a note with action items first.');
        return;
      }
      const text = tasks
        .map((t) => `- ${t.content}${t.due_date ? ` (due: ${t.due_date})` : ''}`)
        .join('\n');
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied', `${tasks.length} task${tasks.length === 1 ? '' : 's'} copied to clipboard.`);
    } catch (err) {
      Alert.alert(
        'Could not export tasks',
        err instanceof Error ? `Could not reach the backend: ${err.message}` : 'Network error.'
      );
    }
  };

  const handleSaveManualNote = async () => {
    const trimmed = manualNoteText.trim();
    if (!trimmed) return;
    setIsSavingManualNote(true);
    try {
      const result = await createManualNote(trimmed);
      setIsManualNoteOpen(false);
      setManualNoteText('');
      handleUploadResult(result);
    } catch (err) {
      Alert.alert(
        'Could not save note',
        err instanceof Error ? `Could not reach the backend: ${err.message}` : 'Network error.'
      );
    } finally {
      setIsSavingManualNote(false);
    }
  };

  const handleNoteUpdated = (updated: Note) => {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    setNoteDetail((current) => (current && current.id === updated.id ? updated : current));
  };

  const removeNoteFromState = (noteId: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    setNoteDetail((current) => (current && current.id === noteId ? null : current));
  };

  // Used by the Home screen's card menu — performs the actual delete call.
  // (NoteDetailScreen's own delete button calls the API itself and only needs
  // removeNoteFromState to sync this component's state afterward.)
  const handleDeleteNote = async (noteId: number) => {
    try {
      await deleteNote(noteId);
      removeNoteFromState(noteId);
    } catch (err) {
      Alert.alert(
        'Could not delete',
        err instanceof Error ? `Could not reach the backend: ${err.message}` : 'Network error.'
      );
    }
  };

  const handleAllNotesDeleted = () => {
    setNotes([]);
    setNoteDetail(null);
  };

  const handleOpenNoteById = (noteId: number) => {
    const found = notes.find((n) => n.id === noteId);
    if (found) {
      setNoteDetail(found);
    } else {
      Alert.alert('Note not found', 'This note may have been removed.');
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {activeTab === 'home' ? (
        <HomeScreen
          notes={notes}
          refreshing={refreshing}
          onRefresh={loadNotes}
          onOpenRecording={() => setIsRecordingOpen(true)}
          onOpenChat={() => setActiveTab('chat')}
          onOpenManualNote={() => setIsManualNoteOpen(true)}
          onExportTasks={handleExportTasks}
          onOpenNoteDetail={setNoteDetail}
          onOpenSettings={() => setActiveTab('settings')}
          onDeleteNote={handleDeleteNote}
        />
      ) : activeTab === 'chat' ? (
        <ChatScreen onOpenNote={handleOpenNoteById} />
      ) : (
        <SettingsScreen onAllNotesDeleted={handleAllNotesDeleted} />
      )}

      {isProcessing ? (
        <View style={styles.processingBanner}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.processingBannerText}>Transcribing and extracting notes…</Text>
        </View>
      ) : null}

      <TabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRecordPress={() => setIsRecordingOpen(true)}
      />

      <RecordingScreen
        visible={isRecordingOpen}
        onCancel={() => setIsRecordingOpen(false)}
        onSave={handleRecordingSave}
      />

      <NoteDetailScreen
        visible={noteDetail !== null}
        note={noteDetail}
        onClose={() => setNoteDetail(null)}
        onNoteUpdated={handleNoteUpdated}
        onNoteDeleted={removeNoteFromState}
      />

      <Modal visible={isManualNoteOpen} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.manualNoteContainer}>
          <View style={styles.manualNoteHeader}>
            <Pressable
              onPress={() => {
                setIsManualNoteOpen(false);
                setManualNoteText('');
              }}
              disabled={isSavingManualNote}
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.manualNoteTitle}>Text Note</Text>
            <Pressable
              onPress={handleSaveManualNote}
              disabled={isSavingManualNote || !manualNoteText.trim()}
              hitSlop={10}
            >
              {isSavingManualNote ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text
                  style={[
                    styles.manualNoteSaveText,
                    !manualNoteText.trim() && styles.manualNoteSaveTextDisabled,
                  ]}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>

          <TextInput
            style={styles.manualNoteInput}
            value={manualNoteText}
            onChangeText={setManualNoteText}
            placeholder="Type your quick thought here…"
            placeholderTextColor={colors.textFaint}
            multiline
            autoFocus
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: RNStatusBar.currentHeight ?? 0,
  },
  processingBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 100,
    backgroundColor: colors.tabBarBackground,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  processingBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  manualNoteContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  manualNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  manualNoteTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  manualNoteInput: {
    margin: spacing.md,
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  manualNoteSaveText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 15,
  },
  manualNoteSaveTextDisabled: {
    color: colors.textFaint,
  },
});

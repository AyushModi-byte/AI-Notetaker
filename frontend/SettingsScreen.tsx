import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { deleteAllNotes } from './api';
import { API_BASE_URL } from './config';
import { colors, radii, cardShadow, spacing } from './theme';

interface SettingsScreenProps {
  onAllNotesDeleted: () => void;
}

export default function SettingsScreen({ onAllNotesDeleted }: SettingsScreenProps) {
  const handleClearChatHistory = () => {
    Alert.alert('Clear chat history', 'This removes all saved chat messages from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.removeItem('chat_messages');
          Alert.alert('Done', 'Chat history cleared.');
        },
      },
    ]);
  };

  const handleDeleteAllNotes = () => {
    Alert.alert(
      'Delete all notes',
      'This permanently deletes every note and audio recording on the server. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAllNotes();
              onAllNotesDeleted();
              Alert.alert('Done', 'All notes have been deleted.');
            } catch (err) {
              Alert.alert(
                'Could not delete notes',
                err instanceof Error ? `Could not reach the backend: ${err.message}` : 'Network error.'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Backend URL</Text>
        <Text style={styles.value}>{API_BASE_URL}</Text>
        <Text style={styles.hint}>Edit config.ts to change this.</Text>
      </View>

      <Pressable style={styles.actionRow} onPress={handleClearChatHistory}>
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
        <Text style={styles.actionText}>Clear chat history</Text>
      </Pressable>

      <View style={{ height: spacing.sm }} />

      <Pressable style={styles.actionRow} onPress={handleDeleteAllNotes}>
        <Ionicons name="warning-outline" size={18} color={colors.danger} />
        <Text style={styles.actionText}>Delete all notes</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingTop: 60,
    paddingBottom: 140,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...cardShadow,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textFaint,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  value: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.danger,
  },
});

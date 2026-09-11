import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { askChat } from './api';
import { colors, radii, spacing } from './theme';
import { ChatMessage, ChatSource, Note } from './types';

interface PendingError {
  question: string;
  message: string;
}

interface ChatScreenProps {
  onOpenNote: (noteId: number) => void;
}

const STORAGE_KEY = 'chat_messages';

const SUGGESTED_PROMPTS = [
  'What did I promise to do this week?',
  'What were my key decisions recently?',
  'What are all pending tasks?',
];

function formatSourceLabel(source: ChatSource): string {
  const date = new Date(source.timestamp);
  const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return source.title ? `${source.title} (${dateLabel})` : `Note from ${dateLabel}`;
}

export default function ChatScreen({ onOpenNote }: ChatScreenProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingError, setPendingError] = useState<PendingError | null>(null);
  const nextId = useRef(0);
  const hasLoadedHistory = useRef(false);

  const generateId = () => {
    nextId.current += 1;
    return `${Date.now()}-${nextId.current}`;
  };

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const parsed: ChatMessage[] = JSON.parse(stored);
          setMessages(parsed);
          nextId.current = parsed.length;
        }
      })
      .catch(() => {
        // Non-fatal: chat just starts empty if history can't be read.
      })
      .finally(() => {
        hasLoadedHistory.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hasLoadedHistory.current) return; // avoid overwriting stored history before it loads
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages)).catch(() => {
      // Non-fatal: persistence is a nice-to-have, not required for the chat to function.
    });
  }, [messages]);

  const sendQuestion = async (question: string) => {
    setIsSending(true);
    setPendingError(null);

    try {
      const data = await askChat(question);
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: 'assistant', text: data.answer, sources: data.sources },
      ]);
    } catch (err) {
      setPendingError({
        question,
        message:
          err instanceof Error
            ? `Could not reach the backend: ${err.message}`
            : 'Could not reach the backend. Please try again.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const submitQuestion = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isSending) return;
    setMessages((prev) => [...prev, { id: generateId(), role: 'user', text: trimmed }]);
    setInputText('');
    sendQuestion(trimmed);
  };

  const handleSend = () => submitQuestion(inputText);

  const handleRetry = () => {
    if (pendingError) {
      sendQuestion(pendingError.question);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={110}
    >
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}
          >
            <Text style={item.role === 'user' ? styles.userText : styles.assistantText}>
              {item.text}
            </Text>
            {item.sources && item.sources.length > 0 ? (
              <View style={styles.sourceRow}>
                {item.sources.map((source) => (
                  <Pressable
                    key={source.id}
                    style={styles.sourceChip}
                    onPress={() => onOpenNote(source.id)}
                  >
                    <Text style={styles.sourceChipText}>📌 {formatSourceLabel(source)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Ask a question about your recorded notes.</Text>
            {SUGGESTED_PROMPTS.map((prompt) => (
              <Pressable
                key={prompt}
                style={styles.promptPill}
                onPress={() => submitQuestion(prompt)}
              >
                <Text style={styles.promptPillText}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        }
      />

      {isSending ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" />
          <Text style={styles.statusText}>Thinking…</Text>
        </View>
      ) : null}

      {pendingError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{pendingError.message}</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask about your notes…"
          placeholderTextColor={colors.textFaint}
          editable={!isSending}
          onSubmitEditing={handleSend}
          returnKeyType="send"
        />
        <Pressable
          style={[
            styles.sendButton,
            (isSending || !inputText.trim()) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={isSending || !inputText.trim()}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  messageList: {
    padding: spacing.md,
    paddingTop: 60,
    paddingBottom: 140,
    flexGrow: 1,
  },
  emptyState: {
    marginTop: 40,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  promptPill: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  promptPillText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  bubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: radii.md,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  userText: {
    color: '#fff',
    fontSize: 15,
  },
  assistantText: {
    color: colors.text,
    fontSize: 15,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  sourceChip: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  sourceChipText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  statusText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.textMuted,
  },
  errorBox: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: 12,
    borderRadius: radii.sm,
    backgroundColor: '#fdecea',
  },
  errorText: {
    color: '#a4292c',
    marginBottom: 8,
  },
  retryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#a4292c',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingBottom: 100,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.background,
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});

import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { colors, radii, spacing } from './theme';
import { formatDuration } from './utils';

const BAR_COUNT = 24;

interface RecordingScreenProps {
  visible: boolean;
  onCancel: () => void;
  onSave: (uri: string) => void;
}

function Waveform({ active }: { active: boolean }) {
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    if (!active) {
      bars.forEach((bar) => bar.setValue(0.3));
      return;
    }

    let cancelled = false;

    const animateBar = (bar: Animated.Value) => {
      if (cancelled) return;
      const target = 0.25 + Math.random() * 0.75;
      Animated.timing(bar, {
        toValue: target,
        duration: 150 + Math.random() * 150,
        useNativeDriver: true,
      }).start(() => animateBar(bar));
    };

    bars.forEach((bar) => animateBar(bar));

    return () => {
      cancelled = true;
    };
  }, [active, bars]);

  return (
    <View style={styles.waveform}>
      {bars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[
            styles.waveformBar,
            {
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function RecordingScreen({ visible, onCancel, onSave }: RecordingScreenProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);
  const [starting, setStarting] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      hasStartedRef.current = false;
      return;
    }
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    const start = async () => {
      setStarting(true);
      try {
        const { granted } = await requestRecordingPermissionsAsync();
        if (!granted) {
          Alert.alert(
            'Microphone permission needed',
            'This app needs microphone access to record voice notes. Please enable it in your device Settings.'
          );
          onCancel();
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      } catch {
        Alert.alert('Recording error', 'Could not start recording. Please try again.');
        onCancel();
      } finally {
        setStarting(false);
      }
    };

    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!recorderState.isRecording) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [recorderState.isRecording, pulseAnim]);

  const handleCancel = async () => {
    try {
      if (recorderState.isRecording) {
        await recorder.stop();
      }
    } catch {
      // Ignore — we're discarding this recording anyway.
    }
    onCancel();
  };

  const handleSave = async () => {
    try {
      await recorder.stop();
    } catch {
      Alert.alert('Recording error', 'Something went wrong while stopping the recording.');
      onCancel();
      return;
    }
    const uri = recorder.uri;
    if (uri) {
      onSave(uri);
    } else {
      onCancel();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={handleCancel} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {starting ? 'Preparing…' : 'Listening…'}
          </Text>
          <Pressable onPress={handleCancel} hitSlop={10}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.transcriptBox}>
          <Text style={styles.transcriptText}>
            {starting
              ? 'Requesting microphone access…'
              : 'Recording audio. Transcription and extraction will run once you save.'}
          </Text>
        </View>

        <View style={styles.center}>
          <Waveform active={recorderState.isRecording} />
          <Text style={styles.timer}>{formatDuration(recorderState.durationMillis ?? 0)}</Text>
        </View>

        <View style={styles.controls}>
          <Pressable style={styles.cancelButton} onPress={handleCancel}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <View style={styles.micButton}>
              <Ionicons name="mic" size={30} color="#fff" />
            </View>
          </Animated.View>

          <Pressable style={styles.saveButton} onPress={handleSave} disabled={starting}>
            <Ionicons name="checkmark" size={28} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111318',
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  transcriptBox: {
    marginTop: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radii.md,
    padding: spacing.md,
  },
  transcriptText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 19,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 80,
    gap: 4,
  },
  waveformBar: {
    width: 4,
    height: 60,
    borderRadius: 2,
    backgroundColor: colors.primaryLight,
  },
  timer: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    marginTop: spacing.lg,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingBottom: spacing.xl,
  },
  cancelButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

export type TabKey = 'home' | 'chat' | 'settings';

interface TabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onRecordPress: () => void;
}

export default function TabBar({ activeTab, onTabChange, onRecordPress }: TabBarProps) {
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.capsule}>
        <Pressable style={styles.item} onPress={() => onTabChange('home')}>
          <Ionicons
            name={activeTab === 'home' ? 'home' : 'home-outline'}
            size={24}
            color={activeTab === 'home' ? colors.tabBarActive : colors.tabBarInactive}
          />
        </Pressable>

        <Pressable style={styles.item} onPress={() => onTabChange('chat')}>
          <Ionicons
            name={activeTab === 'chat' ? 'chatbubble' : 'chatbubble-outline'}
            size={22}
            color={activeTab === 'chat' ? colors.tabBarActive : colors.tabBarInactive}
          />
        </Pressable>

        <Pressable style={styles.recordButton} onPress={onRecordPress}>
          <Ionicons name="mic" size={24} color="#fff" />
        </Pressable>

        <Pressable style={styles.item} onPress={() => onTabChange('settings')}>
          <Ionicons
            name={activeTab === 'settings' ? 'settings' : 'settings-outline'}
            size={22}
            color={activeTab === 'settings' ? colors.tabBarActive : colors.tabBarInactive}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tabBarBackground,
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 8,
  },
  item: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

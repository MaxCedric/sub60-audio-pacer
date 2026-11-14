import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { HomeScreen } from './src/screens/HomeScreen';
import { RunHudScreen } from './src/screens/RunHudScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { useBleHeartRate } from './src/hooks/useBleHeartRate';
import { WorkoutPlan } from './src/hooks/useRunningPacer';

type ActiveBottomTab = 'PLAN' | 'STATS';

export default function App() {
  const [activeWorkout, setActiveWorkout] = useState<WorkoutPlan | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveBottomTab>('PLAN');

  const {
    status: bleStatus,
    heartRate,
    deviceName,
    errorMessage: bleError,
    isSimulated: isSimulatedBle,
    startScanAndConnect,
    disconnect,
    toggleSimulationMode,
  } = useBleHeartRate();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {activeWorkout ? (
        <RunHudScreen
          workout={activeWorkout}
          heartRate={heartRate}
          bleStatus={bleStatus}
          onToggleSimBle={toggleSimulationMode}
          onBackToHome={() => setActiveWorkout(null)}
        />
      ) : (
        <>
          <View style={styles.contentArea}>
            {activeTab === 'PLAN' ? (
              <HomeScreen
                bleStatus={bleStatus}
                heartRate={heartRate}
                deviceName={deviceName}
                bleError={bleError}
                isSimulatedBle={isSimulatedBle}
                onScanBle={startScanAndConnect}
                onDisconnectBle={disconnect}
                onToggleSimBle={toggleSimulationMode}
                onSelectWorkout={(workout) => setActiveWorkout(workout)}
              />
            ) : (
              <StatsScreen />
            )}
          </View>

          {/* Thanh điều hướng dưới cùng (2 Section: Giáo án & Tiến độ/Note) */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'PLAN' && styles.tabBtnActiveVolt]}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab('PLAN');
              }}
            >
              <Text style={[styles.tabText, activeTab === 'PLAN' && styles.tabTextActiveDark]}>
                GIÁO ÁN 10 TUẦN
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'STATS' && styles.tabBtnActiveCyan]}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveTab('STATS');
              }}
            >
              <Text style={[styles.tabText, activeTab === 'STATS' && styles.tabTextActiveDark]}>
                TIẾN ĐỘ & NOTE PT
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#07090D',
  },
  contentArea: {
    flex: 1,
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#10141D',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#1E2534',
    gap: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#1A2130',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActiveVolt: {
    backgroundColor: '#D2FF00',
  },
  tabBtnActiveCyan: {
    backgroundColor: '#00F0FF',
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  tabTextActiveDark: {
    color: '#07090D',
  },
});

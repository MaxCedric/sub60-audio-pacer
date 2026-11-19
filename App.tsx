import React, { useState, Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { HomeScreen } from './src/screens/HomeScreen';
import { RunHudScreen } from './src/screens/RunHudScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { useBleHeartRate } from './src/hooks/useBleHeartRate';
import { WorkoutPlan } from './src/hooks/useRunningPacer';

// ─── Global Error Boundary ────────────────────────────────────────────────────
interface EBState { hasError: boolean; error: string }
class AppErrorBoundary extends Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { hasError: true, error: error?.message || String(error) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#08090C', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Text style={{ color: '#FF4444', fontSize: 18, fontWeight: '900', marginBottom: 12 }}>❌ App gặp lỗi</Text>
          <ScrollView style={{ maxHeight: 300 }}>
            <Text style={{ color: '#94A3B8', fontSize: 12, fontFamily: 'monospace' }}>{this.state.error}</Text>
          </ScrollView>
          <TouchableOpacity
            style={{ marginTop: 24, backgroundColor: '#C8FF00', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
            onPress={() => this.setState({ hasError: false, error: '' })}
          >
            <Text style={{ color: '#08090C', fontWeight: '900' }}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}

function AppInner() {
  type ActiveBottomTab = 'PLAN' | 'HUD' | 'STATS';
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
          {/* Contest Broadcast Top Header */}
          <View style={styles.headerBar}>
            <View style={styles.headerTopStrip}>
              <Text style={styles.headerStripLeft}>SUB60 WRISTBAND // 10.77°N 106.70°E</Text>
              <View style={styles.bibBadge}>
                <Text style={styles.bibText}>BIB #0060</Text>
              </View>
            </View>
            <View style={styles.headerMain}>
              <View style={styles.headerBrand}>
                <Text style={styles.headerTitle}>Sub60 Pacer</Text>
                <Text style={styles.headerSubtitle}>10 KM · 16.01.2027</Text>
              </View>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.headerIconBtn}
                  onPress={() => { setActiveTab('HUD'); }}
                >
                  <Text style={styles.headerIconBtnText}>⚡</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

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
            ) : activeTab === 'HUD' ? (
              <RunHudScreen
                workout={activeWorkout || { id: 'open', title: 'Chạy Tự Do', totalDistanceKm: 0, segments: [] } as any}
                heartRate={heartRate}
                bleStatus={bleStatus}
                onToggleSimBle={toggleSimulationMode}
                onBackToHome={() => setActiveTab('PLAN')}
              />
            ) : (
              <StatsScreen />
            )}
          </View>

          {/* Clean Contest Bottom Navigation */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'PLAN' && styles.tabBtnActiveLime]}
              onPress={() => { Haptics.selectionAsync(); setActiveTab('PLAN'); }}
            >
              <Text style={[styles.tabText, activeTab === 'PLAN' && styles.tabTextActiveDark]}>📋 Giáo Án</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'HUD' && styles.tabBtnActiveLime]}
              onPress={() => { Haptics.selectionAsync(); setActiveTab('HUD'); }}
            >
              <Text style={[styles.tabText, activeTab === 'HUD' && styles.tabTextActiveDark]}>⚡ Run HUD</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'STATS' && styles.tabBtnActivePurple]}
              onPress={() => { Haptics.selectionAsync(); setActiveTab('STATS'); }}
            >
              <Text style={[styles.tabText, activeTab === 'STATS' && styles.tabTextActiveDark]}>📊 Chỉ Số & AI</Text>
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
    backgroundColor: '#08090C',
  },
  // Contest Broadcast Header
  headerBar: {
    backgroundColor: '#08090C',
    borderBottomWidth: 2,
    borderBottomColor: '#4B2EFF',
  },
  headerTopStrip: {
    backgroundColor: '#4B2EFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  headerStripLeft: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  bibBadge: {
    backgroundColor: '#C8FF00',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bibText: {
    color: '#08090C',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerBrand: {
    flex: 1,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: '#9D85FF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#14151D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtnText: {
    fontSize: 16,
  },
  contentArea: {
    flex: 1,
  },
  // Bottom Navigation
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(8,9,12,0.95)',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#14151D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActiveLime: {
    backgroundColor: '#C8FF00',
  },
  tabBtnActivePurple: {
    backgroundColor: '#4B2EFF',
  },
  tabBtnActiveVolt: {
    backgroundColor: '#C8FF00',
  },
  tabBtnActiveCyan: {
    backgroundColor: '#4B2EFF',
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  tabTextActiveDark: {
    color: '#08090C',
  },
});

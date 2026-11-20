import React, { useState, useEffect, Component } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon, Rect, Line, Path } from 'react-native-svg';
import { HomeScreen } from './src/screens/HomeScreen';
import { RunHudScreen } from './src/screens/RunHudScreen';
import { StatsScreen } from './src/screens/StatsScreen';
import { useBleHeartRate } from './src/hooks/useBleHeartRate';
import { WorkoutPlan } from './src/hooks/useRunningPacer';
import { buildSchedule } from './src/logic/schedule';

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
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>{this.state.error}</Text>
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
    <SafeAreaProvider>
      <AppErrorBoundary>
        <AppInner />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}

function AppInner() {
  const insets = useSafeAreaInsets();
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

  // Auto scan & connect on app startup
  useEffect(() => {
    startScanAndConnect();
  }, [startScanAndConnect]);

  const defaultWorkout = buildSchedule('sub60')[0].workouts[0];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* ── Contest Broadcast Top Header ── */}
      <View style={[styles.headerBar, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 20) }]}>
        {/* Purple top strip */}
        <View style={styles.headerTopStrip}>
          {/* Checker-mini left */}
          <View style={styles.checkerRow}>
            <CheckerMini />
            <Text style={styles.headerStripText}>SUB60 WRISTBAND // 10.77°N 106.70°E</Text>
          </View>
          {/* BIB badge + checker-bw right */}
          <View style={styles.checkerRow}>
            <View style={styles.bibBadge}>
              <Text style={styles.bibText}>BIB #0060</Text>
            </View>
            <CheckerBw />
          </View>
        </View>

        {/* Main header row */}
        <View style={styles.headerMain}>
          <View style={styles.headerBrand}>
            <Image
              source={require('./assets/app-icon-variant-b.jpg')}
              style={styles.headerCrestImg}
            />
            <View>
              <Text style={styles.headerTitle}>Sub60 Pacer</Text>
              <Text style={styles.headerSubtitle}>10 KM · 16.01.2027</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {/* Checkpoint icon */}
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setActiveTab('STATS')}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth={2.3}>
                <Path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <Path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <Path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                <Path d="M4 22h16" />
              </Svg>
            </TouchableOpacity>
            {/* Audio/HUD quick button */}
            <TouchableOpacity style={[styles.headerIconBtn, styles.headerAudioBtn]} onPress={() => setActiveTab('HUD')}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth={2.3}>
                <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <Path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </Svg>
              <View style={styles.audioDot} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Content Area ── */}
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
            onSelectWorkout={(workout) => {
              setActiveWorkout(workout);
              setActiveTab('HUD');
            }}
          />
        ) : activeTab === 'HUD' ? (
          <RunHudScreen
            workout={activeWorkout || defaultWorkout}
            heartRate={heartRate}
            bleStatus={bleStatus}
            deviceName={deviceName}
            onScanBle={startScanAndConnect}
            onDisconnectBle={disconnect}
            onToggleSimBle={toggleSimulationMode}
            onBackToHome={() => setActiveTab('PLAN')}
          />
        ) : (
          <StatsScreen />
        )}
      </View>

      {/* ── Clean Contest Bottom Navigation ── */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {/* Giáo Án tab */}
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'PLAN' && styles.tabBtnActiveLime]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab('PLAN'); }}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke={activeTab === 'PLAN' ? '#08090C' : '#94A3B8'} strokeWidth={2.4}>
            <Rect x={3} y={4} width={18} height={18} rx={2} />
            <Line x1={16} y1={2} x2={16} y2={6} />
            <Line x1={8} y1={2} x2={8} y2={6} />
            <Line x1={3} y1={10} x2={21} y2={10} />
          </Svg>
          <Text style={[styles.tabText, activeTab === 'PLAN' && styles.tabTextActiveDark]}>Giáo Án</Text>
        </TouchableOpacity>

        {/* Run HUD tab */}
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'HUD' && styles.tabBtnActiveLime]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab('HUD'); }}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill={activeTab === 'HUD' ? '#08090C' : '#94A3B8'}>
            <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </Svg>
          <Text style={[styles.tabText, activeTab === 'HUD' && styles.tabTextActiveDark]}>Run HUD</Text>
        </TouchableOpacity>

        {/* Chỉ Số & AI tab */}
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'STATS' && styles.tabBtnActivePurple]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab('STATS'); }}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
            stroke={activeTab === 'STATS' ? '#FFFFFF' : '#94A3B8'} strokeWidth={2.4}>
            <Line x1={18} y1={20} x2={18} y2={10} />
            <Line x1={12} y1={20} x2={12} y2={4} />
            <Line x1={6} y1={20} x2={6} y2={14} />
          </Svg>
          <Text style={[styles.tabText, activeTab === 'STATS' && styles.tabTextActiveWhite]}>Chỉ Số & AI</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Checker pattern components ──────────────────────────────────────────────
function CheckerMini() {
  return (
    <View style={styles.checkerMini}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, backgroundColor: '#08090C' }} />
        <View style={{ flex: 1, backgroundColor: '#C8FF00' }} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, backgroundColor: '#C8FF00' }} />
        <View style={{ flex: 1, backgroundColor: '#08090C' }} />
      </View>
    </View>
  );
}
function CheckerBw() {
  return (
    <View style={styles.checkerMini}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, backgroundColor: '#08090C' }} />
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }} />
      </View>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, backgroundColor: '#F8FAFC' }} />
        <View style={{ flex: 1, backgroundColor: '#08090C' }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#08090C',
  },
  // ── Header ─────────────────────────────────────────────────────────────────
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
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  checkerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkerMini: {
    width: 16,
    height: 16,
    flexDirection: 'column',
  },
  headerStripText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerCrestImg: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  headerTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 24,
  },
  headerSubtitle: {
    color: '#9D85FF',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
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
  headerAudioBtn: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    width: 'auto' as any,
    gap: 6,
  },
  audioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C8FF00',
  },
  contentArea: {
    flex: 1,
  },
  // ── Bottom Nav ──────────────────────────────────────────────────────────────
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(8,9,12,0.97)',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#14151D',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  tabBtnActiveLime: {
    backgroundColor: '#C8FF00',
  },
  tabBtnActivePurple: {
    backgroundColor: '#4B2EFF',
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  tabTextActiveDark: {
    color: '#08090C',
  },
  tabTextActiveWhite: {
    color: '#FFFFFF',
  },
});

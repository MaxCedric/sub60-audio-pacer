import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import {
  WorkoutPlan,
  useRunningPacer,
  formatPaceDisplay,
  formatDurationDisplay,
} from '../hooks/useRunningPacer';
import { BleConnectionStatus } from '../hooks/useBleHeartRate';
import { audioCoach } from '../services/audioCoach';

interface RunHudScreenProps {
  workout: WorkoutPlan;
  heartRate: number | null;
  bleStatus: BleConnectionStatus;
  onToggleSimBle: (highHr?: boolean) => void;
  onBackToHome: () => void;
}

export const RunHudScreen: React.FC<RunHudScreenProps> = ({
  workout,
  heartRate,
  bleStatus,
  onToggleSimBle,
  onBackToHome,
}) => {
  useKeepAwake();

  const {
    isRunning,
    isPaused,
    elapsedSeconds,
    totalDistanceMeters,
    rollingPaceSecPerKm,
    averagePaceSecPerKm,
    currentSegment,
    currentSegmentIndex,
    totalSegments,
    segmentProgressMeters,
    segmentElapsedSeconds,
    splitIntervalMeters,
    setSplitIntervalMeters,
    isMetronomeOn,
    metronomeBpm,
    toggleMetronome,
    changeMetronomeBpm,
    isFallbackSub65Active,
    toggleFallbackSub65,
    isHrDangerActive,
    paceZoneStatus,
    gpsSimulatedPaceSec,
    setGpsSimulatedPaceSec,
    permissionError,
    startRun,
    togglePause,
    stopRun,
  } = useRunningPacer(workout, heartRate);

  const activeZone = audioCoach.getHeartRateZone(heartRate);

  // Ambient Color Shift theo trạng thái chạy thực tế
  const ambientColor = isHrDangerActive
    ? '#FF3B5C'
    : paceZoneStatus === 'IN_ZONE'
    ? '#D2FF00'
    : '#FFB020';

  const statusText = isHrDangerActive
    ? 'QUÁ GIỚI HẠN TIM — ĐI BỘ NGAY'
    : paceZoneStatus === 'IN_ZONE'
    ? 'ĐÚNG NHỊP MỤC TIÊU'
    : paceZoneStatus === 'TOO_FAST'
    ? 'QUÁ NHANH — KÌM CHÂN LẠI'
    : 'HƠI CHẬM — ĐẨY GUỒNG CHÂN';

  const segProgressPct = currentSegment.distanceMeters
    ? Math.min(100, (segmentProgressMeters / currentSegment.distanceMeters) * 100)
    : currentSegment.durationSeconds
    ? Math.min(100, (segmentElapsedSeconds / currentSegment.durationSeconds) * 100)
    : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (!isRunning) onBackToHome();
            }}
            disabled={isRunning}
          >
            <Text style={[styles.backBtnText, isRunning && styles.disabledText]}>
              {isRunning ? 'ĐANG CHẠY' : '← TRỞ LẠI'}
            </Text>
          </TouchableOpacity>

          <View style={styles.bleBadge}>
            <View
              style={[
                styles.bleDot,
                bleStatus === 'CONNECTED' || bleStatus === 'SIMULATED'
                  ? styles.bleDotOn
                  : styles.bleDotOff,
              ]}
            />
            <Text style={styles.bleBadgeText}>
              {bleStatus === 'CONNECTED' ? 'FIT 4 LIVE' : bleStatus === 'SIMULATED' ? 'SIM HR' : 'NO BLE'}
            </Text>
          </View>
        </View>

        {permissionError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{permissionError}</Text>
          </View>
        ) : null}

        {/* Thẻ chặng hiện tại + Progress bar Volt */}
        <View style={styles.segmentCard}>
          <View style={styles.segmentTopRow}>
            <Text style={styles.segmentCounter}>
              CHẶNG {currentSegmentIndex + 1}/{totalSegments}
            </Text>
            <Text style={styles.segmentTarget}>
              Mục tiêu: {formatPaceDisplay(currentSegment.targetPaceMinSec)}–
              {formatPaceDisplay(currentSegment.targetPaceMaxSec)}
            </Text>
          </View>
          <Text style={styles.segmentName} numberOfLines={1}>
            {currentSegment.name}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${segProgressPct}%`, backgroundColor: ambientColor }]} />
          </View>
        </View>

        {/* HERO CARD: ROLLING PACE với viền Ambient Glow */}
        <View style={[styles.heroPaceCard, { borderColor: ambientColor }]}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>ROLLING PACE</Text>
            <View style={[styles.zoneStatusBadge, { backgroundColor: ambientColor }]}>
              <Text style={styles.zoneStatusBadgeText}>{statusText}</Text>
            </View>
          </View>

          <Text style={[styles.heroPaceValue, { color: ambientColor }]}>
            {formatPaceDisplay(rollingPaceSecPerKm)}
          </Text>

          <View style={styles.heroFooterRow}>
            <Text style={styles.heroFooterText}>
              TB: {formatPaceDisplay(averagePaceSecPerKm)}
            </Text>
            <Text style={styles.heroFooterText}>
              Thời gian: {formatDurationDisplay(elapsedSeconds)}
            </Text>
          </View>
        </View>

        {/* BENTO METRICS: Quãng đường & Nhịp tim + Zone */}
        <View style={styles.bentoRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>QUÃNG ĐƯỜNG</Text>
            <View style={styles.metricValRow}>
              <Text style={[styles.metricBigVal, { color: '#00F0FF' }]}>{(totalDistanceMeters / 1000).toFixed(2)}</Text>
              <Text style={styles.metricUnit}>KM</Text>
            </View>
          </View>

          <View style={[styles.metricCard, isHrDangerActive && styles.metricCardDanger]}>
            <Text style={styles.metricLabel}>NHỊP TIM {activeZone ? `• ZONE ${activeZone}` : ''}</Text>
            <View style={styles.metricValRow}>
              <Text style={[styles.metricBigVal, isHrDangerActive && { color: '#FF3B5C' }]}>
                {heartRate ?? '--'}
              </Text>
              <Text style={styles.metricUnit}>BPM</Text>
            </View>
          </View>
        </View>

        {/* Bảng điều khiển nhanh Audio & Metronome */}
        <View style={styles.controlsCard}>
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Metronome ({metronomeBpm} bpm)</Text>
            <View style={styles.controlActions}>
              <TouchableOpacity
                style={styles.miniStepBtn}
                onPress={() => changeMetronomeBpm(metronomeBpm - 2)}
              >
                <Text style={styles.miniStepText}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.miniStepBtn}
                onPress={() => changeMetronomeBpm(metronomeBpm + 2)}
              >
                <Text style={styles.miniStepText}>+</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pillToggle, isMetronomeOn && styles.pillToggleVolt]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleMetronome();
                }}
              >
                <Text style={[styles.pillToggleText, isMetronomeOn && styles.textDark]}>
                  {isMetronomeOn ? 'ĐANG BẬT' : 'TẮT'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Báo mốc khoảng cách</Text>
            <View style={styles.controlActions}>
              <TouchableOpacity
                style={[styles.pillToggle, splitIntervalMeters === 500 && styles.pillToggleVolt]}
                onPress={() => setSplitIntervalMeters(500)}
              >
                <Text style={[styles.pillToggleText, splitIntervalMeters === 500 && styles.textDark]}>
                  500m
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pillToggle, splitIntervalMeters === 1000 && styles.pillToggleVolt]}
                onPress={() => setSplitIntervalMeters(1000)}
              >
                <Text style={[styles.pillToggleText, splitIntervalMeters === 1000 && styles.textDark]}>
                  1 km
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Mục tiêu an toàn Sub 65</Text>
            <TouchableOpacity
              style={[styles.pillToggle, isFallbackSub65Active && styles.pillToggleAmber]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                toggleFallbackSub65();
              }}
            >
              <Text style={[styles.pillToggleText, isFallbackSub65Active && styles.textDark]}>
                {isFallbackSub65Active ? 'ĐANG BẬT SUB 65' : 'MỤC TIÊU SUB 60'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Thanh test nhanh tại nhà */}
        <View style={styles.testRow}>
          <TouchableOpacity
            style={styles.testBtn}
            onPress={() =>
              audioCoach.announceDistanceMilestone(
                Math.max(1, Math.round(totalDistanceMeters / 1000) || 1),
                rollingPaceSecPerKm || 358,
                heartRate || 162
              )
            }
          >
            <Text style={styles.testBtnText}>Thử Audio Coach</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.testBtn, gpsSimulatedPaceSec === 358 && styles.testBtnActive]}
            onPress={() => setGpsSimulatedPaceSec(gpsSimulatedPaceSec ? null : 358)}
          >
            <Text style={styles.testBtnText}>
              {gpsSimulatedPaceSec ? 'Tắt GPS giả lập' : 'Giả lập 5\'58"'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.testBtn} onPress={() => onToggleSimBle(true)}>
            <Text style={[styles.testBtnText, { color: '#FF3B5C' }]}>Sim HR 180</Text>
          </TouchableOpacity>
        </View>

        {/* Nút điều khiển chính: Bắt đầu / Tạm dừng / Giữ 1.2s để Dừng */}
        {!isRunning ? (
          <TouchableOpacity
            style={styles.giantVoltStartBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              startRun();
            }}
          >
            <Text style={styles.giantVoltStartText}>BẮT ĐẦU CHẠY</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.runningActionsRow}>
            <TouchableOpacity
              style={styles.pauseBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                togglePause();
              }}
            >
              <Text style={styles.pauseBtnText}>{isPaused ? 'TIẾP TỤC' : 'TẠM DỪNG'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.holdStopBtn}
              delayLongPress={1200}
              onLongPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                stopRun();
              }}
            >
              <Text style={styles.holdStopBtnText}>GIỮ 1.2S ĐỂ DỪNG</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07090D',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#10141D',
    borderRadius: 10,
  },
  backBtnText: {
    color: '#00F0FF',
    fontSize: 12,
    fontWeight: '800',
  },
  disabledText: {
    color: '#64748B',
  },
  bleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10141D',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E2534',
  },
  bleDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bleDotOn: {
    backgroundColor: '#00F0FF',
  },
  bleDotOff: {
    backgroundColor: '#475569',
  },
  bleBadgeText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '800',
  },
  errorBanner: {
    backgroundColor: '#2A1219',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 12,
  },
  segmentCard: {
    backgroundColor: '#10141D',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E2534',
    marginBottom: 12,
  },
  segmentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  segmentCounter: {
    color: '#D2FF00',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  segmentTarget: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  segmentName: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1A2130',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  heroPaceCard: {
    backgroundColor: '#10141D',
    borderRadius: 26,
    padding: 18,
    borderWidth: 2,
    marginBottom: 12,
    alignItems: 'center',
  },
  heroTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  heroLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  zoneStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  zoneStatusBadgeText: {
    color: '#07090D',
    fontSize: 10,
    fontWeight: '900',
  },
  heroPaceValue: {
    fontSize: 70,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    marginVertical: 4,
  },
  heroFooterRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E2534',
  },
  heroFooterText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#10141D',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E2534',
  },
  metricCardDanger: {
    borderColor: '#FF3B5C',
    backgroundColor: '#1F0E14',
  },
  metricLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  metricValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  metricBigVal: {
    color: '#F8FAFC',
    fontSize: 36,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  metricUnit: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  controlsCard: {
    backgroundColor: '#10141D',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E2534',
    gap: 12,
    marginBottom: 12,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlLabel: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  controlActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniStepBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#1A2130',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStepText: {
    color: '#00F0FF',
    fontSize: 16,
    fontWeight: '800',
  },
  pillToggle: {
    backgroundColor: '#1A2130',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  pillToggleVolt: {
    backgroundColor: '#00F0FF',
  },
  pillToggleAmber: {
    backgroundColor: '#FFB020',
  },
  pillToggleText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '800',
  },
  textDark: {
    color: '#07090D',
  },
  testRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  testBtn: {
    flex: 1,
    backgroundColor: '#10141D',
    borderWidth: 1,
    borderColor: '#1E2534',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  testBtnActive: {
    borderColor: '#00F0FF',
  },
  testBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  giantVoltStartBtn: {
    backgroundColor: '#D2FF00',
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
  },
  giantVoltStartText: {
    color: '#07090D',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  runningActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pauseBtn: {
    flex: 1,
    backgroundColor: '#1A2130',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
  },
  pauseBtnText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '900',
  },
  holdStopBtn: {
    flex: 1,
    backgroundColor: '#2A1219',
    borderWidth: 1,
    borderColor: '#FF3B5C',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
  },
  holdStopBtnText: {
    color: '#FF3B5C',
    fontSize: 13,
    fontWeight: '900',
  },
});
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
  // Giữ màn hình sáng nếu người dùng mở xem, hoặc có thể khóa màn hình bỏ túi bình thường
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
  } = useRunningPacer(workout, heartRate, 178);

  const getPaceColor = () => {
    if (paceZoneStatus === 'TOO_FAST') return '#FFB800';
    if (paceZoneStatus === 'TOO_SLOW') return '#FF6B6B';
    return '#00F5D4';
  };

  const getHrColor = () => {
    if (!heartRate) return '#64748B';
    if (heartRate >= 178) return '#FF2A6D';
    if (heartRate >= 172) return '#FFB800';
    return '#00E676';
  };

  const targetMin = isFallbackSub65Active ? 385 : currentSegment.targetPaceMinSec;
  const targetMax = isFallbackSub65Active ? 390 : currentSegment.targetPaceMaxSec;

  const handleExit = async () => {
    if (isRunning) {
      await stopRun();
    }
    onBackToHome();
  };

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        isHrDangerActive && styles.safeAreaDangerAlert,
      ]}
    >
      <ScrollView contentContainerStyle={styles.container}>
        {/* Thanh trạng thái trên cùng */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={handleExit}>
            <Text style={styles.backBtnText}>← Giáo án</Text>
          </TouchableOpacity>
          <Text style={styles.workoutHeaderTitle} numberOfLines={1}>
            {workout.title}
          </Text>
          <View style={styles.blePill}>
            <Text style={styles.blePillText}>{bleStatus}</Text>
          </View>
        </View>

        {permissionError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{permissionError}</Text>
          </View>
        ) : null}

        {isHrDangerActive ? (
          <View style={styles.criticalHrBanner}>
            <Text style={styles.criticalHrTitle}>
              CẢNH BÁO ĐỎ: NHỊP TIM VƯỢT 178 BPM QUÁ 30 GIÂY!
            </Text>
            <Text style={styles.criticalHrSub}>
              Giảm tốc độ ngay lập tức hoặc đi bộ 30 giây để bảo vệ tim mạch.
            </Text>
          </View>
        ) : null}

        {/* Chặng hiện tại trong State Machine */}
        <View style={styles.segmentBanner}>
          <View style={styles.segmentHeaderRow}>
            <Text style={styles.segmentStepText}>
              CHẶNG {currentSegmentIndex + 1}/{totalSegments}
            </Text>
            <Text style={styles.segmentTargetText}>
              Mục tiêu: {formatPaceDisplay(targetMin)} – {formatPaceDisplay(targetMax)}/km
            </Text>
          </View>
          <Text style={styles.segmentNameText}>{currentSegment.name}</Text>
          <Text style={styles.segmentProgressText}>
            {currentSegment.distanceMeters
              ? `Đã chạy chặng này: ${(segmentProgressMeters / 1000).toFixed(2)} / ${(
                  currentSegment.distanceMeters / 1000
                ).toFixed(2)} km`
              : `Thời gian chặng nghỉ: ${segmentElapsedSeconds}s / ${currentSegment.durationSeconds}s`}
          </Text>
        </View>

        {/* KHỐI HIỂN THỊ CHÍNH (HUD CỠ LỚN TƯƠNG PHẢN CAO) */}
        <View style={styles.hudGrid}>
          {/* ROLLING PACE (15-20s) */}
          <View style={styles.primaryHudBox}>
            <Text style={styles.hudLabel}>ROLLING PACE (20S MƯỢT)</Text>
            <Text style={[styles.giantPaceValue, { color: getPaceColor() }]}>
              {formatPaceDisplay(rollingPaceSecPerKm)}
            </Text>
            <Text style={styles.paceStatusSub}>
              {paceZoneStatus === 'IN_ZONE'
                ? 'ĐÚNG VÙNG TỐC ĐỘ MỤC TIÊU'
                : paceZoneStatus === 'TOO_FAST'
                ? 'ĐANG CHẠY HƠI NHANH'
                : 'ĐANG CHẠY HƠI CHẬM'}
            </Text>
          </View>

          {/* NHỊP TIM BLE 0x2A37 & QUÃNG ĐƯỜNG */}
          <View style={styles.secondaryHudRow}>
            <View style={styles.halfHudBox}>
              <Text style={styles.hudLabel}>NHỊP TIM (WATCH FIT 4)</Text>
              <Text style={[styles.hugeMetricValue, { color: getHrColor() }]}>
                {heartRate ?? '--'}
              </Text>
              <Text style={styles.unitSubText}>
                BPM (Giới hạn đỏ: 178)
              </Text>
            </View>

            <View style={styles.halfHudBox}>
              <Text style={styles.hudLabel}>QUÃNG ĐƯỜNG</Text>
              <Text style={styles.hugeMetricValue}>
                {(totalDistanceMeters / 1000).toFixed(2)}
              </Text>
              <Text style={styles.unitSubText}>
                KM / {workout.totalDistanceKm.toFixed(1)} KM
              </Text>
            </View>
          </View>

          {/* THỜI GIAN & PACE TRUNG BÌNH */}
          <View style={styles.secondaryHudRow}>
            <View style={styles.halfHudBox}>
              <Text style={styles.hudLabel}>THỜI GIAN CHẠY</Text>
              <Text style={styles.mediumMetricValue}>
                {formatDurationDisplay(elapsedSeconds)}
              </Text>
            </View>

            <View style={styles.halfHudBox}>
              <Text style={styles.hudLabel}>PACE TRUNG BÌNH</Text>
              <Text style={styles.mediumMetricValue}>
                {formatPaceDisplay(averagePaceSecPerKm)}
              </Text>
            </View>
          </View>
        </View>

        {/* BỘ ĐIỀU KHIỂN METRONOME (170-175 BPM) & KHOẢNG CÁCH ĐỌC SPLIT */}
        <View style={styles.controlsCard}>
          <View style={styles.controlRow}>
            <View>
              <Text style={styles.controlTitle}>Metronome giữ nhịp chân ({metronomeBpm} spm)</Text>
              <Text style={styles.controlSub}>Giữ sải chân ngắn, bảo vệ khớp gối</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggleBtn, isMetronomeOn && styles.toggleBtnOn]}
              onPress={toggleMetronome}
            >
              <Text style={[styles.toggleBtnText, isMetronomeOn && styles.toggleBtnTextOn]}>
                {isMetronomeOn ? 'ĐANG BẬT' : 'ĐANG TẮT'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.bpmSelectorRow}>
            {[170, 172, 175].map((bpm) => (
              <TouchableOpacity
                key={bpm}
                style={[styles.pillChoice, metronomeBpm === bpm && styles.pillChoiceActive]}
                onPress={() => changeMetronomeBpm(bpm)}
              >
                <Text
                  style={[
                    styles.pillChoiceText,
                    metronomeBpm === bpm && styles.pillChoiceTextActive,
                  ]}
                >
                  {bpm} BPM
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[
                styles.pillChoice,
                splitIntervalMeters === 500 && styles.pillChoiceActive,
              ]}
              onPress={() =>
                setSplitIntervalMeters(splitIntervalMeters === 1000 ? 500 : 1000)
              }
            >
              <Text
                style={[
                  styles.pillChoiceText,
                  splitIntervalMeters === 500 && styles.pillChoiceTextActive,
                ]}
              >
                Báo mỗi: {splitIntervalMeters}m
              </Text>
            </TouchableOpacity>
          </View>

          {/* Công tắc chuyển nhanh sang Phương án B (Sub 65 phút: 6'25"-6'30"/km) */}
          <TouchableOpacity
            style={[
              styles.fallbackGoalBtn,
              isFallbackSub65Active && styles.fallbackGoalBtnActive,
            ]}
            onPress={toggleFallbackSub65}
          >
            <Text style={styles.fallbackGoalBtnText}>
              {isFallbackSub65Active
                ? 'ĐANG DÙNG PHƯƠNG ÁN AN TOÀN SUB 65 (6\'25"–6\'30"/KM) - CHẠM ĐỂ VỀ SUB 60'
                : 'CHUYỂN SANG PHƯƠNG ÁN DỰ PHÒNG SUB 65 PHÚT (6\'25"–6\'30"/KM)'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* BỘ CÔNG CỤ TEST NHANH GIỌNG NÓI & GIẢ LẬP TRONG NHÀ */}
        <View style={styles.testPanel}>
          <Text style={styles.testPanelTitle}>
            KIỂM TRA NHANH TAI NGHE & AUDIO DUCKING (KHÔNG CẦN CHẠY NGOÀI TRỜI)
          </Text>
          <View style={styles.testBtnsRow}>
            <TouchableOpacity
              style={styles.testChip}
              onPress={() =>
                audioCoach.announceDistanceMilestone(
                  1,
                  rollingPaceSecPerKm || 358,
                  heartRate || 156
                )
              }
            >
              <Text style={styles.testChipText}>Đọc thử mốc 1km</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.testChip}
              onPress={() => onToggleSimBle(true)}
            >
              <Text style={styles.testChipText}>Giả lập HR 180 bpm</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.testChip,
                gpsSimulatedPaceSec === 358 && styles.testChipActive,
              ]}
              onPress={() =>
                setGpsSimulatedPaceSec(gpsSimulatedPaceSec ? null : 358)
              }
            >
              <Text style={styles.testChipText}>
                {gpsSimulatedPaceSec ? 'Tắt GPS giả lập' : 'Giả lập Pace 5\'58"'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* NÚT BẤM ĐIỀU KHIỂN BUỔI CHẠY CỠ LỚN */}
        {!isRunning ? (
          <TouchableOpacity style={styles.giantStartBtn} onPress={startRun}>
            <Text style={styles.giantStartBtnText}>BẮT ĐẦU CHẠY (KHÓA MÀN HÌNH BỎ TÚI)</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.runningActionsRow}>
            <TouchableOpacity style={styles.pauseBtn} onPress={togglePause}>
              <Text style={styles.pauseBtnText}>
                {isPaused ? 'TIẾP TỤC CHẠY' : 'TẠM DỪNG'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.stopBtn} onPress={stopRun}>
              <Text style={styles.stopBtnText}>KẾT THÚC</Text>
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
    backgroundColor: '#05070B',
  },
  safeAreaDangerAlert: {
    backgroundColor: '#2B0712',
  },
  container: {
    padding: 16,
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#111722',
    borderRadius: 8,
  },
  backBtnText: {
    color: '#00F5D4',
    fontWeight: '800',
    fontSize: 13,
  },
  workoutHeaderTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  blePill: {
    backgroundColor: '#111722',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  blePillText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  errorBanner: {
    backgroundColor: '#3B101E',
    borderColor: '#FF2A6D',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#FF8FA3',
    fontSize: 12,
    fontWeight: '700',
  },
  criticalHrBanner: {
    backgroundColor: '#FF2A6D',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  criticalHrTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  criticalHrSub: {
    color: '#FFE4E8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  segmentBanner: {
    backgroundColor: '#111722',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#00F5D4',
    marginBottom: 14,
  },
  segmentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  segmentStepText: {
    color: '#00F5D4',
    fontSize: 12,
    fontWeight: '900',
  },
  segmentTargetText: {
    color: '#FACC15',
    fontSize: 12,
    fontWeight: '800',
  },
  segmentNameText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  segmentProgressText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  hudGrid: {
    gap: 12,
    marginBottom: 14,
  },
  primaryHudBox: {
    backgroundColor: '#0B101B',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1E293B',
  },
  hudLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  giantPaceValue: {
    fontSize: 64,
    fontWeight: '900',
    marginVertical: 4,
    fontVariant: ['tabular-nums'],
  },
  paceStatusSub: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '800',
  },
  secondaryHudRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfHudBox: {
    flex: 1,
    backgroundColor: '#0B101B',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  hugeMetricValue: {
    color: '#F8FAFC',
    fontSize: 40,
    fontWeight: '900',
    marginVertical: 4,
    fontVariant: ['tabular-nums'],
  },
  mediumMetricValue: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  unitSubText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  controlsCard: {
    backgroundColor: '#111722',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  controlTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  controlSub: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  toggleBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  toggleBtnOn: {
    backgroundColor: '#00F5D4',
  },
  toggleBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '900',
  },
  toggleBtnTextOn: {
    color: '#04120B',
  },
  bpmSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  pillChoice: {
    flex: 1,
    backgroundColor: '#090D14',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  pillChoiceActive: {
    borderColor: '#00F5D4',
    backgroundColor: '#062825',
  },
  pillChoiceText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  pillChoiceTextActive: {
    color: '#00F5D4',
  },
  fallbackGoalBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  fallbackGoalBtnActive: {
    backgroundColor: '#422006',
    borderWidth: 1,
    borderColor: '#FACC15',
  },
  fallbackGoalBtnText: {
    color: '#FDE047',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  testPanel: {
    backgroundColor: '#0B101B',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 16,
  },
  testPanelTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 8,
  },
  testBtnsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  testChip: {
    flex: 1,
    backgroundColor: '#162032',
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  testChipActive: {
    backgroundColor: '#0284C7',
  },
  testChipText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  giantStartBtn: {
    backgroundColor: '#00E676',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  giantStartBtnText: {
    color: '#04120B',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  runningActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pauseBtn: {
    flex: 1,
    backgroundColor: '#FFB800',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  pauseBtnText: {
    color: '#1A1200',
    fontSize: 16,
    fontWeight: '900',
  },
  stopBtn: {
    flex: 1,
    backgroundColor: '#FF2A6D',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  stopBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
});

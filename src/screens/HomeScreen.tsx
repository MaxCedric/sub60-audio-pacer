import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import trainingPlanData from '../data/trainingPlan.json';
import { BleConnectionStatus } from '../hooks/useBleHeartRate';
import { WorkoutPlan, formatPaceDisplay } from '../hooks/useRunningPacer';

interface HomeScreenProps {
  bleStatus: BleConnectionStatus;
  heartRate: number | null;
  deviceName: string | null;
  bleError: string | null;
  isSimulatedBle: boolean;
  onScanBle: () => void;
  onDisconnectBle: () => void;
  onToggleSimBle: (highHr?: boolean) => void;
  onSelectWorkout: (workout: WorkoutPlan) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  bleStatus,
  heartRate,
  deviceName,
  bleError,
  isSimulatedBle,
  onScanBle,
  onDisconnectBle,
  onToggleSimBle,
  onSelectWorkout,
}) => {
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(0);
  const { athleteProfile, weeks } = trainingPlanData;
  const activeWeek = weeks[selectedWeekIndex] || weeks[0];

  const getBleBadgeColor = () => {
    if (bleStatus === 'CONNECTED' || bleStatus === 'SIMULATED') return '#00E676';
    if (bleStatus === 'SCANNING' || bleStatus === 'CONNECTING' || bleStatus === 'RECONNECTING') {
      return '#FFB800';
    }
    if (bleStatus === 'ERROR') return '#FF2A6D';
    return '#8A99AD';
  };

  const getBleStatusText = () => {
    switch (bleStatus) {
      case 'CONNECTED':
        return `Đã kết nối: ${deviceName || 'HUAWEI WATCH FIT 4'}`;
      case 'SIMULATED':
        return 'Đang chạy chế độ mô phỏng BLE (Test)';
      case 'SCANNING':
        return 'Đang quét BLE 0x180D...';
      case 'CONNECTING':
        return 'Đang kết nối HUAWEI WATCH FIT 4...';
      case 'RECONNECTING':
        return 'Mất tín hiệu - Đang tự kết nối lại...';
      case 'ERROR':
        return 'Lỗi kết nối BLE';
      default:
        return 'Chưa kết nối đồng hồ (Bật HR Broadcast trên Watch Fit 4)';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header & Mục tiêu giải chạy */}
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View>
              <Text style={styles.appTitle}>SUB60 AUDIO PACER</Text>
              <Text style={styles.raceCountdown}>
                Mục tiêu 10 km: 16/01/2027 • Pace 5'58"–6'00"/km
              </Text>
            </View>
            <View style={styles.safetyBadge}>
              <Text style={styles.safetyBadgeLabel}>HARD LIMIT</Text>
              <Text style={styles.safetyBadgeValue}>{athleteProfile.hardLimitHrBpm} BPM</Text>
            </View>
          </View>

          <View style={styles.profileMetricsRow}>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>VO2max</Text>
              <Text style={styles.metricVal}>{athleteProfile.vo2Max}</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Ngưỡng LT</Text>
              <Text style={styles.metricVal}>{athleteProfile.lactateThresholdHrBpm} bpm</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Huyết áp nền</Text>
              <Text style={styles.metricVal}>{athleteProfile.bloodPressureBaseline}</Text>
            </View>
            <View style={styles.metricPill}>
              <Text style={styles.metricLabel}>Cadence đích</Text>
              <Text style={styles.metricVal}>{athleteProfile.targetCadenceBpm} spm</Text>
            </View>
          </View>
        </View>

        {/* Trạng thái kết nối BLE HUAWEI WATCH FIT 4 */}
        <View style={styles.bleCard}>
          <View style={styles.bleHeaderRow}>
            <View style={styles.bleStatusRow}>
              <View style={[styles.statusDot, { backgroundColor: getBleBadgeColor() }]} />
              <Text style={styles.bleStatusTitle}>{getBleStatusText()}</Text>
            </View>
            <Text style={styles.liveHrText}>
              {heartRate ? `${heartRate} BPM` : '-- BPM'}
            </Text>
          </View>

          {bleError ? <Text style={styles.bleErrorText}>{bleError}</Text> : null}

          <View style={styles.bleActionRow}>
            {bleStatus === 'CONNECTED' ? (
              <TouchableOpacity style={styles.secondaryBtn} onPress={onDisconnectBle}>
                <Text style={styles.secondaryBtnText}>Ngắt kết nối</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.primaryBleBtn} onPress={onScanBle}>
                <Text style={styles.primaryBleBtnText}>
                  {bleStatus === 'SCANNING' ? 'Đang quét 0x180D...' : 'Kết nối HUAWEI WATCH FIT 4'}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.simBtn, isSimulatedBle && styles.simBtnActive]}
              onPress={() => onToggleSimBle(false)}
            >
              <Text style={styles.simBtnText}>
                {isSimulatedBle ? 'Tắt Mô phỏng' : 'Test HR 154'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.simDangerBtn}
              onPress={() => onToggleSimBle(true)}
            >
              <Text style={styles.simDangerBtnText}>Test HR 180</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.stravaNote}>
            * Chỉ đọc nhịp tim qua BLE 0x2A37 để nhắc tai nghe. Không đẩy trùng bài lên Strava.
          </Text>
        </View>

        {/* Thanh chọn Tuần (Tuần 1 -> Tuần 10) */}
        <Text style={styles.sectionHeader}>GIÁO ÁN 10 TUẦN (10/11/2026 – 16/01/2027)</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekTabsRow}
        >
          {weeks.map((week, idx) => {
            const isSelected = idx === selectedWeekIndex;
            return (
              <TouchableOpacity
                key={week.weekNumber}
                style={[styles.weekTab, isSelected && styles.weekTabActive]}
                onPress={() => setSelectedWeekIndex(idx)}
              >
                <Text style={[styles.weekTabTitle, isSelected && styles.weekTabTitleActive]}>
                  Tuần {week.weekNumber}
                </Text>
                <Text style={styles.weekTabDate}>{week.dateRange.split(' - ')[0]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Trọng tâm của tuần đang chọn */}
        <View style={styles.weekFocusBanner}>
          <Text style={styles.weekFocusDate}>{activeWeek.dateRange}</Text>
          <Text style={styles.weekFocusText}>{activeWeek.focus}</Text>
          <Text style={styles.badmintonNote}>
            Lịch cố định: Thứ Ba đánh cầu lông • Thứ Năm chạy Tempo/Interval • Thứ Bảy chạy Long Run
          </Text>
        </View>

        {/* Danh sách các buổi chạy trong tuần */}
        {activeWeek.workouts.map((workout) => (
          <View key={workout.id} style={styles.workoutCard}>
            <View style={styles.workoutTopRow}>
              <View style={styles.dayBadge}>
                <Text style={styles.dayBadgeText}>{workout.dayOfWeek}</Text>
              </View>
              <Text style={styles.workoutDateText}>{workout.date}</Text>
              <View style={styles.distanceBadge}>
                <Text style={styles.distanceBadgeText}>{workout.totalDistanceKm} KM</Text>
              </View>
            </View>

            <Text style={styles.workoutTitle}>{workout.title}</Text>
            <Text style={styles.workoutDesc}>{workout.description}</Text>

            {/* Tóm tắt các chặng tự động */}
            <View style={styles.segmentPreviewList}>
              {workout.segments.slice(0, 4).map((seg) => (
                <View key={seg.id} style={styles.segmentPreviewItem}>
                  <Text style={styles.segmentPreviewName} numberOfLines={1}>
                    • {seg.name}
                  </Text>
                  <Text style={styles.segmentPreviewMeta}>
                    {formatPaceDisplay(seg.targetPaceMinSec)}–{formatPaceDisplay(seg.targetPaceMaxSec)} | HR &lt;{seg.maxHrBpm}
                  </Text>
                </View>
              ))}
              {workout.segments.length > 4 ? (
                <Text style={styles.moreSegmentsText}>
                  + {workout.segments.length - 4} chặng tự động tiếp theo...
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.startWorkoutBtn}
              onPress={() => onSelectWorkout(workout as WorkoutPlan)}
            >
              <Text style={styles.startWorkoutBtnText}>MỞ BUỔI CHẠY & KÍCH HOẠT AUDIO COACH</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#070A0F',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: '#111722',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  appTitle: {
    color: '#00F5D4',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  raceCountdown: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: 4,
    fontWeight: '600',
  },
  safetyBadge: {
    backgroundColor: '#2A0F18',
    borderWidth: 1,
    borderColor: '#FF2A6D',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  safetyBadgeLabel: {
    color: '#FF8FA3',
    fontSize: 10,
    fontWeight: '800',
  },
  safetyBadgeValue: {
    color: '#FF2A6D',
    fontSize: 15,
    fontWeight: '900',
  },
  profileMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricPill: {
    flex: 1,
    backgroundColor: '#0B0F17',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  metricVal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  bleCard: {
    backgroundColor: '#111722',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 18,
  },
  bleHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  bleStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  bleStatusTitle: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  liveHrText: {
    color: '#FF2A6D',
    fontSize: 22,
    fontWeight: '900',
  },
  bleErrorText: {
    color: '#FF6B8B',
    fontSize: 12,
    marginBottom: 10,
  },
  bleActionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  primaryBleBtn: {
    flex: 2,
    backgroundColor: '#00F5D4',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBleBtnText: {
    color: '#05080D',
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryBtn: {
    flex: 2,
    backgroundColor: '#1E293B',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 13,
  },
  simBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  simBtnActive: {
    backgroundColor: '#0284C7',
  },
  simBtnText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  simDangerBtn: {
    flex: 1,
    backgroundColor: '#3B101E',
    borderWidth: 1,
    borderColor: '#FF2A6D',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  simDangerBtnText: {
    color: '#FF8FA3',
    fontSize: 11,
    fontWeight: '800',
  },
  stravaNote: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 10,
    fontStyle: 'italic',
  },
  sectionHeader: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  weekTabsRow: {
    gap: 8,
    paddingBottom: 12,
  },
  weekTab: {
    backgroundColor: '#111722',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    alignItems: 'center',
  },
  weekTabActive: {
    backgroundColor: '#00F5D4',
    borderColor: '#00F5D4',
  },
  weekTabTitle: {
    color: '#E2E8F0',
    fontWeight: '800',
    fontSize: 13,
  },
  weekTabTitleActive: {
    color: '#05080D',
  },
  weekTabDate: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '600',
  },
  weekFocusBanner: {
    backgroundColor: '#0D131D',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#00F5D4',
    marginBottom: 14,
  },
  weekFocusDate: {
    color: '#00F5D4',
    fontSize: 12,
    fontWeight: '800',
  },
  weekFocusText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  badmintonNote: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 6,
  },
  workoutCard: {
    backgroundColor: '#111722',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 14,
  },
  workoutTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dayBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayBadgeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  workoutDateText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  distanceBadge: {
    backgroundColor: '#062E26',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00E676',
  },
  distanceBadgeText: {
    color: '#00E676',
    fontSize: 12,
    fontWeight: '900',
  },
  workoutTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  workoutDesc: {
    color: '#CBD5E1',
    fontSize: 13,
    marginBottom: 12,
  },
  segmentPreviewList: {
    backgroundColor: '#090D14',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    gap: 6,
  },
  segmentPreviewItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  segmentPreviewName: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    paddingRight: 8,
  },
  segmentPreviewMeta: {
    color: '#00F5D4',
    fontSize: 11,
    fontWeight: '700',
  },
  moreSegmentsText: {
    color: '#64748B',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  startWorkoutBtn: {
    backgroundColor: '#00E676',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  startWorkoutBtnText: {
    color: '#04120B',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

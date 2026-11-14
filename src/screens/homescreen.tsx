import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import trainingPlanData from '../data/trainingPlan.json';
import { BleConnectionStatus } from '../hooks/useBleHeartRate';
import { WorkoutPlan, formatPaceDisplay } from '../hooks/useRunningPacer';
import { audioCoach } from '../services/audioCoach';

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
  const [ltHrBpm, setLtHrBpm] = useState<number>(() => audioCoach.getLactateThresholdHr());

  const { athleteProfile, weeks } = trainingPlanData;
  const activeWeek = weeks[selectedWeekIndex] || weeks[0];

  const isBleConnected = bleStatus === 'CONNECTED' || bleStatus === 'SIMULATED';
  const isScanning = bleStatus === 'SCANNING' || bleStatus === 'CONNECTING' || bleStatus === 'RECONNECTING';

  const handleAdjustLtHr = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = Math.max(150, Math.min(195, ltHrBpm + delta));
    setLtHrBpm(next);
    audioCoach.setLactateThresholdHr(next);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header Brand */}
        <View style={styles.brandRow}>
          <View>
            <View style={styles.brandTitleRow}>
              <Text style={styles.brandSub60}>SUB60</Text>
              <View style={styles.voltPill}>
                <Text style={styles.voltPillText}>AUDIO PACER</Text>
              </View>
            </View>
            <Text style={styles.brandSubtitle}>
              10 KM RACE • {athleteProfile.raceDate} • VO2MAX {athleteProfile.vo2Max}
            </Text>
          </View>
          <View style={styles.goalChip}>
            <Text style={styles.goalChipLabel}>RACE PACE</Text>
            <Text style={styles.goalChipValue}>5'58"</Text>
          </View>
        </View>

        {/* Bento Grid 2 Cột: Watch Fit 4 + Ngưỡng Lactate */}
        <View style={styles.bentoRow}>
          {/* Tile Trái: Kết nối BLE Watch Fit 4 */}
          <View style={[styles.bentoTile, isBleConnected && styles.bentoTileActiveVolt]}>
            <View style={styles.tileHeader}>
              <View
                style={[
                  styles.statusDot,
                  isBleConnected
                    ? styles.dotVolt
                    : isScanning
                    ? styles.dotAmber
                    : styles.dotMuted,
                ]}
              />
              <Text style={styles.tileLabel}>WATCH FIT 4</Text>
            </View>

            <View style={styles.hrReadoutRow}>
              <Text style={styles.hrBigValue}>{heartRate ?? '--'}</Text>
              <Text style={styles.hrUnit}>BPM</Text>
            </View>

            <Text style={styles.tileSubText} numberOfLines={1}>
              {isBleConnected ? deviceName || 'Đã kết nối BLE' : isScanning ? 'Đang quét...' : 'Chưa kết nối'}
            </Text>

            <TouchableOpacity
              style={[styles.tileBtn, isBleConnected ? styles.tileBtnGhost : styles.tileBtnVolt]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                isBleConnected ? onDisconnectBle() : onScanBle();
              }}
            >
              <Text style={[styles.tileBtnText, !isBleConnected && styles.tileBtnTextDark]}>
                {isBleConnected ? 'Ngắt kết nối' : 'Kết nối BLE'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tile Phải: Ngưỡng Lactate linh hoạt */}
          <View style={styles.bentoTile}>
            <View style={styles.tileHeader}>
              <View style={[styles.statusDot, styles.dotCoral]} />
              <Text style={styles.tileLabel}>NGƯỠNG LACTATE</Text>
            </View>

            <View style={styles.lthrStepperRow}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjustLtHr(-1)}>
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.lthrBigValue}>{ltHrBpm}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjustLtHr(1)}>
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.tileSubText}>
              Sớm: {ltHrBpm - 5} • Đỏ: {ltHrBpm + 3} bpm
            </Text>

            <View style={styles.simMiniRow}>
              <TouchableOpacity
                style={[styles.simMiniBtn, isSimulatedBle && styles.simMiniBtnActive]}
                onPress={() => onToggleSimBle(false)}
              >
                <Text style={styles.simMiniText}>{isSimulatedBle ? 'Tắt Sim' : 'Sim HR'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.simMiniDangerBtn}
                onPress={() => onToggleSimBle(true)}
              >
                <Text style={styles.simMiniDangerText}>Test 180</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {bleError ? (
          <View style={styles.errorPill}>
            <Text style={styles.errorPillText}>{bleError}</Text>
          </View>
        ) : null}

        {/* Thanh chọn Tuần (Pill Carousel) */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>GIÁO ÁN 10 TUẦN</Text>
          <Text style={styles.sectionHint}>T3 Cầu lông • T5/T7 Chạy</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekPillsRow}
        >
          {weeks.map((week, idx) => {
            const isSelected = idx === selectedWeekIndex;
            return (
              <TouchableOpacity
                key={week.weekNumber}
                style={[styles.weekPill, isSelected && styles.weekPillActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedWeekIndex(idx);
                }}
              >
                <Text style={[styles.weekPillNum, isSelected && styles.weekPillTextDark]}>
                  T{week.weekNumber}
                </Text>
                <Text style={[styles.weekPillDate, isSelected && styles.weekPillDateDark]}>
                  {week.dateRange.split(' - ')[0].slice(0, 5)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Banner trọng tâm tuần */}
        <View style={styles.focusCard}>
          <Text style={styles.focusDate}>{activeWeek.dateRange}</Text>
          <Text style={styles.focusText}>{activeWeek.focus}</Text>
        </View>

        {/* Danh sách buổi chạy trong tuần */}
        {activeWeek.workouts.map((workout) => (
          <View key={workout.id} style={styles.workoutCard}>
            <View style={styles.workoutMetaRow}>
              <View style={styles.workoutBadgesLeft}>
                <View style={styles.dayChip}>
                  <Text style={styles.dayChipText}>{workout.dayOfWeek.toUpperCase()}</Text>
                </View>
                <Text style={styles.workoutDate}>{workout.date}</Text>
              </View>
              <View style={styles.kmBadge}>
                <Text style={styles.kmBadgeText}>{workout.totalDistanceKm} KM</Text>
              </View>
            </View>

            <Text style={styles.workoutTitle}>{workout.title}</Text>
            <Text style={styles.workoutDesc}>{workout.description}</Text>

            <View style={styles.segmentsBox}>
              {workout.segments.slice(0, 4).map((seg) => (
                <View key={seg.id} style={styles.segRow}>
                  <Text style={styles.segName} numberOfLines={1}>
                    {seg.name}
                  </Text>
                  <Text style={styles.segTarget}>
                    {formatPaceDisplay(seg.targetPaceMinSec)}–{formatPaceDisplay(seg.targetPaceMaxSec)}
                  </Text>
                </View>
              ))}
              {workout.segments.length > 4 ? (
                <Text style={styles.moreSegText}>
                  + {workout.segments.length - 4} chặng tự động tiếp theo
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              style={styles.ctaVoltBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                onSelectWorkout(workout as WorkoutPlan);
              }}
            >
              <Text style={styles.ctaVoltBtnText}>CHẠY NGAY VỚI AUDIO COACH</Text>
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
    backgroundColor: '#07090D',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandSub60: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  voltPill: {
    backgroundColor: '#00F0FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  voltPillText: {
    color: '#07090D',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  brandSubtitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  goalChip: {
    backgroundColor: '#10141D',
    borderWidth: 1,
    borderColor: '#1E2534',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'flex-end',
  },
  goalChipLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
  },
  goalChipValue: {
    color: '#D2FF00',
    fontSize: 16,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  bentoTile: {
    flex: 1,
    backgroundColor: '#10141D',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E2534',
    justifyContent: 'space-between',
  },
  bentoTileActiveVolt: {
    borderColor: '#00F0FF',
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotVolt: {
    backgroundColor: '#00F0FF',
  },
  dotAmber: {
    backgroundColor: '#FFB020',
  },
  dotCoral: {
    backgroundColor: '#FF3B5C',
  },
  dotMuted: {
    backgroundColor: '#475569',
  },
  tileLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  hrReadoutRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  hrBigValue: {
    color: '#F8FAFC',
    fontSize: 34,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  hrUnit: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  tileSubText: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 10,
  },
  tileBtn: {
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  tileBtnVolt: {
    backgroundColor: '#00F0FF',
  },
  tileBtnGhost: {
    backgroundColor: '#1A2130',
  },
  tileBtnText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '800',
  },
  tileBtnTextDark: {
    color: '#07090D',
  },
  lthrStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#1A2130',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: '#00F0FF',
    fontSize: 18,
    fontWeight: '800',
  },
  lthrBigValue: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  simMiniRow: {
    flexDirection: 'row',
    gap: 6,
  },
  simMiniBtn: {
    flex: 1,
    backgroundColor: '#1A2130',
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
  },
  simMiniBtnActive: {
    borderWidth: 1,
    borderColor: '#00F0FF',
  },
  simMiniText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  simMiniDangerBtn: {
    flex: 1,
    backgroundColor: '#2A1219',
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
  },
  simMiniDangerText: {
    color: '#FF3B5C',
    fontSize: 11,
    fontWeight: '700',
  },
  errorPill: {
    backgroundColor: '#2A1219',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  errorPillText: {
    color: '#FCA5A5',
    fontSize: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sectionHint: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  weekPillsRow: {
    gap: 8,
    paddingBottom: 12,
  },
  weekPill: {
    backgroundColor: '#10141D',
    borderWidth: 1,
    borderColor: '#1E2534',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 58,
  },
  weekPillActive: {
    backgroundColor: '#D2FF00',
    borderColor: '#D2FF00',
  },
  weekPillNum: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '900',
  },
  weekPillDate: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
  },
  weekPillTextDark: {
    color: '#07090D',
  },
  weekPillDateDark: {
    color: '#1E293B',
  },
  focusCard: {
    backgroundColor: '#10141D',
    borderRadius: 16,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#D2FF00',
    marginBottom: 14,
  },
  focusDate: {
    color: '#D2FF00',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  focusText: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
  },
  workoutCard: {
    backgroundColor: '#10141D',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E2534',
    marginBottom: 14,
  },
  workoutMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  workoutBadgesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayChip: {
    backgroundColor: '#1A2130',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dayChipText: {
    color: '#00F0FF',
    fontSize: 10,
    fontWeight: '800',
  },
  workoutDate: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  kmBadge: {
    backgroundColor: '#1A2130',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  kmBadgeText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
  },
  workoutTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  workoutDesc: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 12,
  },
  segmentsBox: {
    backgroundColor: '#0A0D14',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    gap: 6,
  },
  segRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  segName: {
    color: '#CBD5E1',
    fontSize: 12,
    flex: 1,
    paddingRight: 8,
  },
  segTarget: {
    color: '#D2FF00',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  moreSegText: {
    color: '#64748B',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  ctaVoltBtn: {
    backgroundColor: '#D2FF00',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaVoltBtnText: {
    color: '#07090D',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
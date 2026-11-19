import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
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
import { GOAL_TIERS } from '../logic/athlete';
import { storageService } from '../services/storage';

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
    isPlanCompleted,
    isInOpenRun,
    isRunEnded,
    isWalkingRecovery,
    checkInState,
    triggerCheckIn,
    dismissCheckIn,
    respondToCheckIn,
    resumeRunningFromWalk,
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
    isHrDangerActive,
    paceZoneStatus,
    isGpsWeak,
    cadenceSpm,
    currentGoalId,
    downgradeGoal,
    upgradeGoal,
    triggerLap,
    autoPauseEnabled,
    toggleAutoPause,
    aiLiveInsight,
    triggerLiveAiAdvice,
    resolveCurrentSegmentPace,
    gpsSimulatedPaceSec,
    setGpsSimulatedPaceSec,
    permissionError,
    startRun,
    togglePause,
    stopRun,
  } = useRunningPacer(workout, heartRate);

  // Post-run RPE and Notes state
  const [selectedRpe, setSelectedRpe] = useState<number>(7);
  const [goodPoint, setGoodPoint] = useState<string>('');
  const [badPoint, setBadPoint] = useState<string>('');
  const [fixAction, setFixAction] = useState<string>('');
  const [isSavedNote, setIsSavedNote] = useState<boolean>(false);

  const activeZone = audioCoach.getHeartRateZone(heartRate);
  const currentGoal = GOAL_TIERS[currentGoalId];
  const resolvedTarget = resolveCurrentSegmentPace(currentSegment);
  const targetMinSec = resolvedTarget.minSec;
  const targetMaxSec = resolvedTarget.maxSec;

  // Ambient Color Shift theo trạng thái chạy thực tế
  const ambientColor = isHrDangerActive
    ? '#FF3B5C'
    : isWalkingRecovery
    ? '#FF9800'
    : isInOpenRun
    ? '#C8FF00'
    : paceZoneStatus === 'IN_ZONE'
    ? '#C8FF00'
    : '#FFB020';

  const statusText = isHrDangerActive
    ? 'QUÁ GIỚI HẠN TIM — ĐI BỘ NGAY'
    : isWalkingRecovery
    ? 'ĐI BỘ HỒI PHỤC (BẢO VỆ CHÂN)'
    : isInOpenRun
    ? 'CHẠY THÊM TỰ DO — THEO SỨC'
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

  const targetPaceText =
    targetMinSec === 0 && targetMaxSec === 0
      ? 'Theo cảm giác'
      : `${formatPaceDisplay(targetMinSec)}–${formatPaceDisplay(targetMaxSec)}`;

  const handleSaveNoteAndExit = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const runs = await storageService.getRunSessions();
    if (runs.length > 0) {
      const latestRun = runs[0];
      const combinedNote = [
        goodPoint ? `Làm tốt: ${goodPoint}` : '',
        badPoint ? `Chưa được: ${badPoint}` : '',
        fixAction ? `Cách sửa: ${fixAction}` : '',
      ]
        .filter(Boolean)
        .join(' • ');

      await storageService.updateRunSessionNote(
        latestRun.id,
        selectedRpe,
        combinedNote || 'Hoàn thành bài tập.'
      );
    }
    setIsSavedNote(true);
    onBackToHome();
  };

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

          <View style={styles.topRightRow}>
            {/* Goal badge */}
            <View style={styles.goalPill}>
              <Text style={styles.goalPillText}>{currentGoal.name.toUpperCase()}</Text>
            </View>

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
        </View>

        {permissionError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{permissionError}</Text>
          </View>
        ) : null}

        {/* GPS yếu warning */}
        {isGpsWeak ? (
          <View style={styles.gpsWeakBanner}>
            <Text style={styles.gpsWeakText}>⚠️ GPS YẾU (&gt;20m) — TẠM NGỪNG NHẮC ĐỂ TRÁNH SAI SỐ</Text>
          </View>
        ) : null}

        {/* Thẻ chặng hiện tại + Progress bar Volt */}
        <View
          style={[
            styles.segmentCard,
            isInOpenRun && styles.segmentCardOpenRun,
            isWalkingRecovery && styles.segmentCardRecovery,
          ]}
        >
          <View style={styles.segmentTopRow}>
            <Text
              style={[
                styles.segmentCounter,
                isInOpenRun && { color: '#C8FF00' },
                isWalkingRecovery && { color: '#FF9800' },
              ]}
            >
              {isWalkingRecovery
                ? 'ĐI BỘ HỒI PHỤC'
                : isInOpenRun
                ? 'CHẠY THÊM TỰ DO'
                : `CHẶNG ${currentSegmentIndex + 1}/${totalSegments}`}
            </Text>
            <Text style={styles.segmentTarget}>
              {isWalkingRecovery
                ? 'Thả lỏng cơ khớp • Đi bộ nhẹ'
                : isInOpenRun
                ? 'Theo thể lực • Max 178 bpm'
                : `Mục tiêu: ${targetPaceText}`}
            </Text>
          </View>
          <Text style={styles.segmentName} numberOfLines={1}>
            {isWalkingRecovery
              ? 'Tạm dừng chạy để tránh chấn thương — Hãy đi bộ thở đều'
              : isInOpenRun
              ? 'Đã hoàn thành giáo án — Tự do chạy tiếp nếu còn sức'
              : currentSegment.name}
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: isInOpenRun || isWalkingRecovery ? '100%' : `${segProgressPct}%`,
                  backgroundColor: isWalkingRecovery ? '#FF9800' : isInOpenRun ? '#C8FF00' : ambientColor,
                },
              ]}
            />
          </View>
        </View>

        {/* POPUP PT HỎI THĂM THỂ TRẠNG */}
        {checkInState?.isActive && (
          <View style={styles.checkInCard}>
            <View style={styles.checkInHeaderRow}>
              <View style={styles.checkInTagBadge}>
                <Text style={styles.checkInTagText}>🩺 PT HỎI THĂM THỂ TRẠNG</Text>
              </View>
              <TouchableOpacity
                onPress={() => dismissCheckIn()}
                style={styles.checkInCloseBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.checkInCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.checkInTitle}>Bạn có đang đau chân hay mệt quá không?</Text>
            <Text style={styles.checkInSubtitle}>
              {checkInState.reason === 'SLOW_OR_TIRED'
                ? 'PT thấy bạn đang chạy chậm lại so với mục tiêu. Bấm chọn để PT hỗ trợ ngay:'
                : 'Chọn thể trạng hiện tại để PT điều chỉnh phương án an toàn:'}
            </Text>

            <View style={styles.checkInOptionsCol}>
              <TouchableOpacity
                style={[styles.checkInBtn, styles.checkInBtnDanger]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  respondToCheckIn('PAIN');
                }}
              >
                <Text style={styles.checkInBtnIcon}>🦵</Text>
                <View style={styles.checkInBtnContent}>
                  <Text style={styles.checkInBtnHeading}>ĐAU CHÂN / CĂNG CƠ</Text>
                  <Text style={styles.checkInBtnDesc}>Dừng chạy ngay, chuyển sang đi bộ hồi phục</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.checkInBtn, styles.checkInBtnAmber]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  respondToCheckIn('FATIGUED');
                }}
              >
                <Text style={styles.checkInBtnIcon}>😮‍💨</Text>
                <View style={styles.checkInBtnContent}>
                  <Text style={styles.checkInBtnHeading}>ĐANG MỆT / ĐUỐI SỨC</Text>
                  <Text style={styles.checkInBtnDesc}>Chậm lại một nhịp, hạ mục tiêu an toàn</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.checkInBtn, styles.checkInBtnVolt]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  respondToCheckIn('STILL_OK');
                }}
              >
                <Text style={styles.checkInBtnIcon}>⚡</Text>
                <View style={styles.checkInBtnContent}>
                  <Text style={[styles.checkInBtnHeading, styles.textDark]}>VẪN ỔN, ĐANG RÁNG</Text>
                  <Text style={[styles.checkInBtnDesc, styles.textDark]}>Giữ đều chân, tiếp tục bài chạy</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

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

        {/* NÚT THAO TÁC PT THỰC CHIẾN KHI ĐANG CHẠY */}
        {isRunning && isWalkingRecovery ? (
          <View style={styles.recoveryNoticeCard}>
            <Text style={styles.recoveryNoticeTitle}>⚠️ ĐANG Ở CHẾ ĐỘ ĐI BỘ HỒI PHỤC</Text>
            <Text style={styles.recoveryNoticeDesc}>
              Đi bộ nhẹ nhàng để bảo vệ cơ khớp. Khi chân hết đau và sẵn sàng chạy tiếp, bấm nút dưới:
            </Text>
            <TouchableOpacity
              style={styles.resumeRunBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                resumeRunningFromWalk();
              }}
            >
              <Text style={styles.resumeRunBtnText}>🏃‍♂️ ĐÃ HẾT ĐAU — TIẾP TỤC CHẠY</Text>
            </TouchableOpacity>
          </View>
        ) : isRunning && !checkInState?.isActive ? (
          <TouchableOpacity
            style={styles.askPtBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              triggerCheckIn('MANUAL');
            }}
          >
            <Text style={styles.askPtBtnText}>🩺 BÁO PT: ĐAU CHÂN / MỆT QUÁ</Text>
          </TouchableOpacity>
        ) : null}

        {/* LIVE AI PT COPILOT CARD */}
        {isRunning ? (
          <View style={styles.aiLiveCard}>
            <View style={styles.aiLiveTopRow}>
              <View style={styles.aiLiveBadge}>
                <Text style={styles.aiLiveBadgeText}>🤖 AI PT LIVE COPILOT</Text>
              </View>
              <Text style={styles.aiLiveStatusText} numberOfLines={1}>
                {aiLiveInsight ? aiLiveInsight.headline : 'Đang theo dõi nhịp chạy...'}
              </Text>
            </View>

            {aiLiveInsight?.detail ? (
              <Text style={styles.aiLiveDetailText}>{aiLiveInsight.detail}</Text>
            ) : null}

            <TouchableOpacity
              style={styles.aiVoiceConsultBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                triggerLiveAiAdvice();
              }}
            >
              <Text style={styles.aiVoiceConsultBtnText}>🎧 BẤM ĐỂ AI TƯ VẤN (NÓI QUA TAI NGHE)</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* BENTO METRICS: Quãng đường & Nhịp tim + Cadence */}
        <View style={styles.bentoRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>QUÃNG ĐƯỜNG</Text>
            <View style={styles.metricValRow}>
              <Text style={[styles.metricBigVal, { color: '#C8FF00' }]}>{(totalDistanceMeters / 1000).toFixed(2)}</Text>
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

        {/* Hàng phụ: Cadence Guồng Chân + Auto Pause Status */}
        <View style={styles.subMetricsRow}>
          <View style={styles.subMetricChip}>
            <Text style={styles.subMetricLabel}>GUỒNG CHÂN (CADENCE)</Text>
            <Text style={styles.subMetricVal}>
              {cadenceSpm !== null && cadenceSpm > 0 ? `${cadenceSpm} SPM` : '-- SPM'}
            </Text>
          </View>

          <View style={styles.subMetricChip}>
            <Text style={styles.subMetricLabel}>TỰ ĐỘNG DỪNG (AUTO-PAUSE)</Text>
            <TouchableOpacity onPress={toggleAutoPause}>
              <Text style={[styles.subMetricVal, { color: autoPauseEnabled ? '#C8FF00' : '#64748B' }]}>
                {autoPauseEnabled ? 'BẬT (DỪNG KHI NGHỈ)' : 'TẮT'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Bảng điều khiển nhanh Audio & Mục tiêu khi đang chạy */}
        <View style={styles.controlsCard}>
          {/* Nút Hạ / Nâng Mục Tiêu */}
          <View style={styles.controlRow}>
            <View>
              <Text style={styles.controlLabel}>Mục tiêu: {currentGoal.name}</Text>
              <Text style={styles.controlSubLabel}>
                Race pace {formatPaceDisplay(currentGoal.targetPaceMinSec)}–{formatPaceDisplay(currentGoal.targetPaceMaxSec)}
              </Text>
            </View>
            <View style={styles.goalActionsRow}>
              <TouchableOpacity
                style={styles.goalActionBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  downgradeGoal();
                }}
              >
                <Text style={styles.goalActionText}>HẠ MỤC TIÊU ↓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.goalActionBtn, styles.goalActionBtnGhost]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  upgradeGoal();
                }}
              >
                <Text style={styles.goalActionTextGhost}>NÂNG ↑</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Metronome */}
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

          {/* Báo mốc khoảng cách */}
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
              {gpsSimulatedPaceSec ? 'Tắt Giả Lập' : 'Giả Lập 5\'58"'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.testBtn} onPress={() => onToggleSimBle(true)}>
            <Text style={[styles.testBtnText, { color: '#FF3B5C' }]}>Sim HR 180</Text>
          </TouchableOpacity>
        </View>

        {/* Nút điều khiển chính: Chưa chạy vs Đang chạy vs Đã kết thúc */}
        {!isRunning && (isRunEnded || totalDistanceMeters > 50) ? (
          <View style={styles.completedCard}>
            <Text style={styles.completedHeader}>
              {isPlanCompleted ? '🎉 HOÀN THÀNH XUẤT SẮC' : '🎉 ĐÃ DỪNG BUỔI CHẠY'}
            </Text>
            <View style={styles.completedMetricsRow}>
              <View style={styles.completedCol}>
                <Text style={styles.completedLabel}>Quãng đường</Text>
                <Text style={styles.completedVal}>{(totalDistanceMeters / 1000).toFixed(2)} km</Text>
              </View>
              <View style={styles.completedCol}>
                <Text style={styles.completedLabel}>Thời gian</Text>
                <Text style={styles.completedVal}>{formatDurationDisplay(elapsedSeconds)}</Text>
              </View>
              <View style={styles.completedCol}>
                <Text style={styles.completedLabel}>Pace TB</Text>
                <Text style={styles.completedVal}>{formatPaceDisplay(averagePaceSecPerKm)}</Text>
              </View>
            </View>

            {/* Đánh giá RPE 1-10 */}
            <View style={styles.rpeBox}>
              <Text style={styles.rpeTitle}>ĐÁNH GIÁ ĐỘ GẮNG SỨC (RPE 1–10): {selectedRpe}/10</Text>
              <View style={styles.rpeButtonsRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[styles.rpeBtn, selectedRpe === num && styles.rpeBtnSelected]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedRpe(num);
                    }}
                  >
                    <Text style={[styles.rpeBtnText, selectedRpe === num && styles.rpeBtnTextSelected]}>
                      {num}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Post-Run Note 3 Dòng */}
            <View style={styles.postRunNoteForm}>
              <Text style={styles.noteFormTitle}>NHẬT KÝ BUỔI CHẠY (POST-RUN NOTE)</Text>

              <TextInput
                style={styles.noteInput}
                value={goodPoint}
                onChangeText={setGoodPoint}
                placeholder="Làm tốt (VD: Giữ pace đều 2km đầu, guồng chân 172)"
                placeholderTextColor="#64748B"
              />

              <TextInput
                style={styles.noteInput}
                value={badPoint}
                onChangeText={setBadPoint}
                placeholder="Chưa được (VD: Km cuối hụt hơi, tim lên 182)"
                placeholderTextColor="#64748B"
              />

              <TextInput
                style={styles.noteInput}
                value={fixAction}
                onChangeText={setFixAction}
                placeholder="Cách sửa buổi tới (VD: Uống ngụm nước phút 20)"
                placeholderTextColor="#64748B"
              />
            </View>

            <TouchableOpacity
              style={styles.returnHomeBtn}
              onPress={handleSaveNoteAndExit}
            >
              <Text style={styles.returnHomeBtnText}>← LƯU KẾT QUẢ & VỀ TRANG CHỦ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restartBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                startRun();
              }}
            >
              <Text style={styles.restartBtnText}>Chạy lại bài tập này</Text>
            </TouchableOpacity>
          </View>
        ) : !isRunning ? (
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
            {/* Nút Manual LAP */}
            <TouchableOpacity
              style={styles.lapBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                triggerLap();
              }}
            >
              <Text style={styles.lapBtnText}>🏁 LAP</Text>
            </TouchableOpacity>

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
    backgroundColor: '#08090C',
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
    backgroundColor: '#111218',
    borderRadius: 10,
  },
  backBtnText: {
    color: '#C8FF00',
    fontSize: 12,
    fontWeight: '800',
  },
  disabledText: {
    color: '#64748B',
  },
  topRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goalPill: {
    backgroundColor: 'rgba(200,255,0,0.13)',
    borderWidth: 1,
    borderColor: '#C8FF0066',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  goalPillText: {
    color: '#C8FF00',
    fontSize: 10,
    fontWeight: '900',
  },
  bleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111218',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#252838',
  },
  bleDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bleDotOn: {
    backgroundColor: '#C8FF00',
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
    fontWeight: '600',
  },
  gpsWeakBanner: {
    backgroundColor: '#332711',
    borderWidth: 1,
    borderColor: '#FFB02066',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  gpsWeakText: {
    color: '#FFB020',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  segmentCard: {
    backgroundColor: '#111218',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#252838',
  },
  segmentCardOpenRun: {
    borderColor: '#C8FF00',
    backgroundColor: '#071520',
  },
  segmentCardRecovery: {
    borderColor: '#FF9800',
    backgroundColor: '#201205',
  },
  segmentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  segmentCounter: {
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  segmentTarget: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  segmentName: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#252838',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  checkInCard: {
    backgroundColor: '#141824',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#C8FF00',
    padding: 16,
    marginBottom: 16,
  },
  checkInHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkInTagBadge: {
    backgroundColor: 'rgba(200,255,0,0.13)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  checkInTagText: {
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: '900',
  },
  checkInCloseBtn: {
    padding: 4,
  },
  checkInCloseText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '700',
  },
  checkInTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  checkInSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  checkInOptionsCol: {
    gap: 8,
  },
  checkInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  checkInBtnDanger: {
    backgroundColor: '#2A1219',
    borderWidth: 1,
    borderColor: '#FF3B5C',
  },
  checkInBtnAmber: {
    backgroundColor: '#2D1B07',
    borderWidth: 1,
    borderColor: '#FFB020',
  },
  checkInBtnVolt: {
    backgroundColor: '#C8FF00',
  },
  checkInBtnIcon: {
    fontSize: 22,
  },
  checkInBtnContent: {
    flex: 1,
  },
  checkInBtnHeading: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '900',
  },
  checkInBtnDesc: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  textDark: {
    color: '#08090C',
  },
  heroPaceCard: {
    backgroundColor: '#111218',
    borderRadius: 24,
    borderWidth: 2,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  heroLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  zoneStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  zoneStatusBadgeText: {
    color: '#08090C',
    fontSize: 10,
    fontWeight: '900',
  },
  heroPaceValue: {
    fontSize: 72,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    marginVertical: 4,
  },
  heroFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
  heroFooterText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recoveryNoticeCard: {
    backgroundColor: '#201205',
    borderWidth: 1.5,
    borderColor: '#FF9800',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  recoveryNoticeTitle: {
    color: '#FF9800',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 6,
  },
  recoveryNoticeDesc: {
    color: '#F8FAFC',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  resumeRunBtn: {
    backgroundColor: '#C8FF00',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  resumeRunBtnText: {
    color: '#08090C',
    fontSize: 13,
    fontWeight: '900',
  },
  askPtBtn: {
    backgroundColor: '#111218',
    borderWidth: 1,
    borderColor: '#252838',
    paddingVertical: 11,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  askPtBtnText: {
    color: '#C8FF00',
    fontSize: 12,
    fontWeight: '800',
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#111218',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#252838',
  },
  metricCardDanger: {
    borderColor: '#FF3B5C',
    backgroundColor: '#2A1219',
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  metricBigVal: {
    fontSize: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    color: '#F8FAFC',
  },
  metricUnit: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  subMetricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  subMetricChip: {
    flex: 1,
    backgroundColor: '#111218',
    borderWidth: 1,
    borderColor: '#252838',
    borderRadius: 12,
    padding: 10,
  },
  subMetricLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 4,
  },
  subMetricVal: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  controlsCard: {
    backgroundColor: '#111218',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#252838',
    marginBottom: 14,
    gap: 12,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlLabel: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  controlSubLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  goalActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  goalActionBtn: {
    backgroundColor: '#FFB020',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  goalActionBtnGhost: {
    backgroundColor: '#252838',
  },
  goalActionText: {
    color: '#08090C',
    fontSize: 11,
    fontWeight: '900',
  },
  goalActionTextGhost: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
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
    backgroundColor: '#252838',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniStepText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  pillToggle: {
    backgroundColor: '#252838',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pillToggleVolt: {
    backgroundColor: '#C8FF00',
  },
  pillToggleText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  testRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  testBtn: {
    flex: 1,
    backgroundColor: '#111218',
    borderWidth: 1,
    borderColor: '#252838',
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  testBtnActive: {
    borderColor: '#C8FF00',
    backgroundColor: '#071520',
  },
  testBtnText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },
  completedCard: {
    backgroundColor: '#111218',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#C8FF00',
    padding: 18,
    marginBottom: 20,
  },
  completedHeader: {
    color: '#C8FF00',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 14,
  },
  completedMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#252838',
  },
  completedCol: {
    alignItems: 'center',
  },
  completedLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  completedVal: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  rpeBox: {
    marginBottom: 14,
  },
  rpeTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
  },
  rpeButtonsRow: {
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
  },
  rpeBtn: {
    width: 28,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#252838',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rpeBtnSelected: {
    backgroundColor: '#C8FF00',
  },
  rpeBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  rpeBtnTextSelected: {
    color: '#08090C',
  },
  postRunNoteForm: {
    marginBottom: 16,
    gap: 8,
  },
  noteFormTitle: {
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  noteInput: {
    backgroundColor: '#08090C',
    borderWidth: 1,
    borderColor: '#252838',
    borderRadius: 10,
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '500',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  returnHomeBtn: {
    backgroundColor: '#C8FF00',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  returnHomeBtnText: {
    color: '#08090C',
    fontSize: 13,
    fontWeight: '900',
  },
  restartBtn: {
    backgroundColor: '#252838',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  restartBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  giantVoltStartBtn: {
    backgroundColor: '#C8FF00',
    paddingVertical: 18,
    borderRadius: 18,
    alignItems: 'center',
    marginVertical: 10,
  },
  giantVoltStartText: {
    color: '#08090C',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  runningActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 20,
  },
  lapBtn: {
    backgroundColor: '#252838',
    borderWidth: 1,
    borderColor: 'rgba(200,255,0,0.33)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lapBtnText: {
    color: '#C8FF00',
    fontSize: 13,
    fontWeight: '900',
  },
  pauseBtn: {
    flex: 1,
    backgroundColor: '#252838',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  holdStopBtn: {
    flex: 1.2,
    backgroundColor: '#FF3B5C',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdStopBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  aiLiveCard: {
    backgroundColor: '#111218',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#C8FF0066',
    padding: 12,
    marginBottom: 14,
  },
  aiLiveTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  aiLiveBadge: {
    backgroundColor: 'rgba(200,255,0,0.13)',
    borderWidth: 1,
    borderColor: '#C8FF00',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  aiLiveBadgeText: {
    color: '#C8FF00',
    fontSize: 10,
    fontWeight: '900',
  },
  aiLiveStatusText: {
    color: '#C8FF00',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  aiLiveDetailText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 10,
  },
  aiVoiceConsultBtn: {
    backgroundColor: '#C8FF00',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  aiVoiceConsultBtnText: {
    color: '#08090C',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});

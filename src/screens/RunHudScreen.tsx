import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  Animated,
  Pressable,
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

// ─── Tiny pure-RN SVG substitutes ───────────────────────────────────────────

/** Bluetooth icon (polyline approximation with Views) */
const BluetoothIcon = () => (
  <Text style={{ color: '#9D85FF', fontSize: 12, lineHeight: 14 }}>⬡</Text>
);

/** Skip-segment icon */
const SkipIcon = () => (
  <Text style={{ color: '#9D85FF', fontSize: 16 }}>⏭</Text>
);

/** Play triangle */
const PlayIcon = () => (
  <Text style={{ color: '#08090C', fontSize: 24, lineHeight: 28 }}>▶</Text>
);

/** Pause bars */
const PauseIcon = () => (
  <Text style={{ color: '#08090C', fontSize: 20, lineHeight: 28 }}>⏸</Text>
);

/** Warning triangle */
const WarningIcon = () => (
  <Text style={{ color: '#FFB020', fontSize: 16 }}>⚠</Text>
);

/** Stop square */
const StopIcon = () => (
  <Text style={{ color: '#FF3B5C', fontSize: 14 }}>■</Text>
);

// ─── EQ Bar Animation ────────────────────────────────────────────────────────

const EqBars: React.FC<{ active: boolean }> = ({ active }) => {
  const bar1 = useRef(new Animated.Value(0.35)).current;
  const bar2 = useRef(new Animated.Value(0.6)).current;
  const bar3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (!active) {
      Animated.parallel([
        Animated.spring(bar1, { toValue: 0.35, useNativeDriver: true }),
        Animated.spring(bar2, { toValue: 0.35, useNativeDriver: true }),
        Animated.spring(bar3, { toValue: 0.35, useNativeDriver: true }),
      ]).start();
      return;
    }
    const makeLoop = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.35, duration: 350, useNativeDriver: true }),
        ])
      );
    const a1 = makeLoop(bar1, 0);
    const a2 = makeLoop(bar2, 120);
    const a3 = makeLoop(bar3, 240);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [active, bar1, bar2, bar3]);

  return (
    <View style={styles.eqContainer}>
      <Animated.View style={[styles.eqBar, { backgroundColor: '#C8FF00', transform: [{ scaleY: bar1 }] }]} />
      <Animated.View style={[styles.eqBar, { backgroundColor: '#4B2EFF', transform: [{ scaleY: bar2 }] }]} />
      <Animated.View style={[styles.eqBar, { backgroundColor: '#C8FF00', transform: [{ scaleY: bar3 }] }]} />
    </View>
  );
};

// ─── Glow Pulse for START button ─────────────────────────────────────────────

const useGlowPulse = (active: boolean) => {
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { glow.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, glow]);
  return glow;
};

// ─── Hold-Stop progress ──────────────────────────────────────────────────────

const HoldStopButton: React.FC<{ onStop: () => void }> = ({ onStop }) => {
  const progress = useRef(new Animated.Value(0)).current;
  const holdAnim = useRef<Animated.CompositeAnimation | null>(null);

  const onPressIn = () => {
    holdAnim.current = Animated.timing(progress, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: false,
    });
    holdAnim.current.start(({ finished }) => {
      if (finished) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onStop();
      }
    });
  };

  const onPressOut = () => {
    holdAnim.current?.stop();
    Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const fillWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={styles.ctrlBtnWrapper}
    >
      <View style={styles.holdStopCircle}>
        <Animated.View style={[styles.holdStopFill, { width: fillWidth }]} />
        <StopIcon />
      </View>
      <Text style={styles.ctrlLabelRed}>Hold Stop</Text>
    </Pressable>
  );
};

// ─── CheckerMini ─────────────────────────────────────────────────────────────

const CheckerMini = () => (
  <View style={styles.checkerMini}>
    {[0, 1, 2, 3].map(i => (
      <View
        key={i}
        style={[
          styles.checkerCell,
          { backgroundColor: i % 2 === 0 ? '#C8FF00' : '#4B2EFF' },
        ]}
      />
    ))}
  </View>
);

// ─── Main component ───────────────────────────────────────────────────────────

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

  // Post-run state
  const [selectedRpe, setSelectedRpe] = useState<number>(7);
  const [goodPoint, setGoodPoint] = useState<string>('');
  const [badPoint, setBadPoint] = useState<string>('');
  const [fixAction, setFixAction] = useState<string>('');
  const [isSavedNote, setIsSavedNote] = useState<boolean>(false);

  // SIM drawer
  const [simOpen, setSimOpen] = useState<boolean>(false);
  const [simPace, setSimPace] = useState<number>(360);
  const [simHr, setSimHr] = useState<number>(142);
  const [simMode, setSimMode] = useState<'SIM' | 'GPS'>('SIM');
  const [simSpeed, setSimSpeed] = useState<number>(1);

  const activeZone = audioCoach.getHeartRateZone(heartRate);
  const currentGoal = GOAL_TIERS[currentGoalId];
  const resolvedTarget = resolveCurrentSegmentPace(currentSegment);
  const targetMinSec = resolvedTarget.minSec;
  const targetMaxSec = resolvedTarget.maxSec;

  const targetPaceText =
    targetMinSec === 0 && targetMaxSec === 0
      ? 'Theo cảm giác'
      : `${formatPaceDisplay(targetMinSec)}–${formatPaceDisplay(targetMaxSec)}`;

  const segProgressPct = currentSegment.distanceMeters
    ? Math.min(100, (segmentProgressMeters / currentSegment.distanceMeters) * 100)
    : currentSegment.durationSeconds
    ? Math.min(100, (segmentElapsedSeconds / currentSegment.durationSeconds) * 100)
    : 0;

  const segRemainKm = currentSegment.distanceMeters
    ? ((currentSegment.distanceMeters - segmentProgressMeters) / 1000).toFixed(2)
    : '—';

  // Next segment name
  const nextSeg =
    workout.segments && currentSegmentIndex + 1 < workout.segments.length
      ? workout.segments[currentSegmentIndex + 1]?.name ?? '—'
      : '—';

  // Status dot + label
  const statusDotColor = isHrDangerActive
    ? '#FF3B5C'
    : isWalkingRecovery
    ? '#FFB020'
    : isRunning
    ? '#C8FF00'
    : '#94A3B8';

  const statusLabel = isHrDangerActive
    ? 'NGUY HIỂM TIM'
    : isWalkingRecovery
    ? 'ĐI BỘ HỒI PHỤC'
    : isRunning && isPaused
    ? 'TẠM DỪNG'
    : isRunning
    ? 'ĐANG CHẠY'
    : isRunEnded
    ? 'ĐÃ KẾT THÚC'
    : 'SẴN SÀNG';

  // Pace status pill
  const paceStatusLabel =
    paceZoneStatus === 'IN_ZONE'
      ? 'ĐÚNG NHỊP'
      : paceZoneStatus === 'TOO_FAST'
      ? 'QUÁ NHANH'
      : 'HƠI CHẬM';
  const paceStatusColor =
    paceZoneStatus === 'IN_ZONE'
      ? '#C8FF00'
      : paceZoneStatus === 'TOO_FAST'
      ? '#9D85FF'
      : '#FFB020';
  const paceStatusTextColor =
    paceZoneStatus === 'IN_ZONE' ? '#08090C' : '#F8FAFC';

  // Zone badge
  const zoneBadgeLabel = activeZone ? `Z${activeZone}` : 'Z?';

  // Start/Pause button label
  const startPauseLabel = !isRunning
    ? 'START'
    : isPaused
    ? 'RESUME'
    : 'PAUSE';

  // Glow pulse for start button
  const glowPulse = useGlowPulse(!isRunning);
  const glowOpacity = glowPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.25, 0.65],
  });

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

  const handleStartPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (!isRunning) {
      startRun();
    } else {
      togglePause();
    }
  };

  const handleSkipSeg = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    triggerLap();
  };

  const handleSosPress = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    if (isRunning && !checkInState?.isActive) triggerCheckIn('MANUAL');
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const showPostRun = !isRunning && (isRunEnded || totalDistanceMeters > 50);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* ── BAND 1: Title & Mode bar ── */}
        <View style={styles.band1Row}>
          {/* Left: status dot + title */}
          <View style={styles.band1Left}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
              <Text style={[styles.statusLabel, { color: statusDotColor }]}>
                {statusLabel}
              </Text>
            </View>
            <Text style={styles.hudWorkoutTitle} numberOfLines={1}>
              {workout.title ?? '--'}
            </Text>
          </View>

          {/* Right: BLE + SIM */}
          <View style={styles.band1Right}>
            <TouchableOpacity
              style={styles.bleBtn}
              onPress={() => onToggleSimBle()}
            >
              <BluetoothIcon />
              <Text style={styles.bleBtnText}>
                {bleStatus === 'CONNECTED'
                  ? 'BLE ●'
                  : bleStatus === 'SIMULATED'
                  ? 'SIM'
                  : 'BLE'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.simBtn}
              onPress={() => setSimOpen(!simOpen)}
            >
              <Text style={styles.simBtnText}>SIM ▾</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Permission error */}
        {permissionError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{permissionError}</Text>
          </View>
        ) : null}

        {/* GPS weak */}
        {isGpsWeak ? (
          <View style={styles.gpsWeakBanner}>
            <Text style={styles.gpsWeakText}>⚠ GPS YẾU — TẠM NGỪNG NHẮC</Text>
          </View>
        ) : null}

        {/* Walking Recovery Banner */}
        {isWalkingRecovery ? (
          <View style={styles.recoveryBanner}>
            <Text style={styles.recoveryBannerText}>ĐI BỘ HỒI PHỤC BẢO VỆ CHÂN</Text>
            <TouchableOpacity
              style={styles.resumeBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                resumeRunningFromWalk();
              }}
            >
              <Text style={styles.resumeBtnText}>TIẾP TỤC</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── BAND 2: Unified Segment Bar ── */}
        <View style={styles.band2Card}>
          {/* Top row: badge + name + target pace + checker */}
          <View style={styles.band2TopRow}>
            <View style={styles.band2Left}>
              <View style={styles.segBadge}>
                <Text style={styles.segBadgeText}>
                  CHẶNG {currentSegmentIndex + 1}/{totalSegments}
                </Text>
              </View>
              <Text style={styles.segNameText} numberOfLines={1}>
                {isWalkingRecovery
                  ? 'Đi bộ hồi phục'
                  : isInOpenRun
                  ? 'Chạy tự do'
                  : currentSegment.name ?? '--'}
              </Text>
            </View>
            <View style={styles.band2Right}>
              <Text style={styles.segTargetText}>{targetPaceText}</Text>
              <CheckerMini />
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${isInOpenRun || isWalkingRecovery ? 100 : segProgressPct}%`,
                },
              ]}
            />
          </View>

          {/* Bottom row */}
          <View style={styles.band2BottomRow}>
            <Text style={styles.band2BottomLeft}>
              <Text style={styles.pctText}>{Math.round(segProgressPct)}%</Text>
              {' · Còn '}
              {segRemainKm} km
            </Text>
            <Text style={styles.band2BottomRight} numberOfLines={1}>
              Next: <Text style={styles.nextSegText}>{nextSeg}</Text>
            </Text>
          </View>
        </View>

        {/* ── BAND 3: Hero Scoreboard (phi-grid) ── */}
        <View style={styles.band3Row}>
          {/* PACE card — 61.8% */}
          <View style={styles.paceCard}>
            {/* Halftone corner overlay */}
            <View style={styles.halftoneCorner} pointerEvents="none" />
            <View style={styles.scoreCardTopRow}>
              <Text style={styles.cardSuperLabel}>PACE</Text>
              <View style={[styles.paceStatusPill, { backgroundColor: paceStatusColor }]}>
                <Text style={[styles.paceStatusPillText, { color: paceStatusTextColor }]}>
                  {paceStatusLabel}
                </Text>
              </View>
            </View>
            <View style={styles.paceValueWrap}>
              <Text style={styles.heroPaceValue}>
                {formatPaceDisplay(rollingPaceSecPerKm)}
              </Text>
              <Text style={styles.minKmLabel}>MIN / KM</Text>
            </View>
          </View>

          {/* BPM card — 38.2% */}
          <View style={styles.bpmCard}>
            <View style={styles.halftoneCorner} pointerEvents="none" />
            <View style={styles.scoreCardTopRow}>
              <Text style={styles.cardSuperLabel}>BPM</Text>
              <View style={styles.zoneBadge}>
                <Text style={styles.zoneBadgeText}>{zoneBadgeLabel}</Text>
              </View>
            </View>
            <View style={styles.bpmValueWrap}>
              <Text style={[styles.heroBpmValue, isHrDangerActive && { color: '#FF3B5C' }]}>
                {heartRate ?? '--'}
              </Text>
              <Text style={styles.heartLabel}>HEART</Text>
            </View>
          </View>
        </View>

        {/* ── CHECK-IN POPUP ── */}
        {checkInState?.isActive && (
          <View style={styles.checkInCard}>
            <View style={styles.checkInHeaderRow}>
              <View style={styles.checkInTagBadge}>
                <Text style={styles.checkInTagText}>🩺 PT HỎI THĂM THỂ TRẠNG</Text>
              </View>
              <TouchableOpacity
                onPress={() => dismissCheckIn()}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.checkInCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.checkInTitle}>Bạn có đang đau chân hay mệt quá không?</Text>
            <Text style={styles.checkInSubtitle}>
              {checkInState.reason === 'SLOW_OR_TIRED'
                ? 'PT thấy bạn đang chạy chậm lại so với mục tiêu:'
                : 'Chọn thể trạng hiện tại để PT điều chỉnh:'}
            </Text>
            <View style={styles.checkInOptionsCol}>
              <TouchableOpacity
                style={[styles.checkInBtn, styles.checkInBtnDanger]}
                onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); respondToCheckIn('PAIN'); }}
              >
                <Text style={styles.checkInBtnIcon}>🦵</Text>
                <View style={styles.checkInBtnContent}>
                  <Text style={styles.checkInBtnHeading}>ĐAU CHÂN / CĂNG CƠ</Text>
                  <Text style={styles.checkInBtnDesc}>Dừng chạy, chuyển sang đi bộ hồi phục</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.checkInBtn, styles.checkInBtnAmber]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); respondToCheckIn('FATIGUED'); }}
              >
                <Text style={styles.checkInBtnIcon}>😮‍💨</Text>
                <View style={styles.checkInBtnContent}>
                  <Text style={styles.checkInBtnHeading}>ĐANG MỆT / ĐUỐI SỨC</Text>
                  <Text style={styles.checkInBtnDesc}>Chậm lại một nhịp, hạ mục tiêu an toàn</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.checkInBtn, styles.checkInBtnVolt]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); respondToCheckIn('STILL_OK'); }}
              >
                <Text style={styles.checkInBtnIcon}>⚡</Text>
                <View style={styles.checkInBtnContent}>
                  <Text style={[styles.checkInBtnHeading, { color: '#08090C' }]}>VẪN ỔN, ĐANG RÁNG</Text>
                  <Text style={[styles.checkInBtnDesc, { color: '#14151D' }]}>Giữ đều chân, tiếp tục bài chạy</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── BAND 4: Telemetry Strip ── */}
        <View style={styles.band4Card}>
          {/* 3-col metrics */}
          <View style={styles.telemetryRow}>
            <View style={styles.telemetryCol}>
              <Text style={styles.telemetryNum}>
                {(totalDistanceMeters / 1000).toFixed(2)}
              </Text>
              <Text style={styles.telemetryLabel}>KM</Text>
            </View>
            <View style={styles.telemetryDivider} />
            <View style={styles.telemetryCol}>
              <Text style={styles.telemetryNum}>
                {formatDurationDisplay(elapsedSeconds)}
              </Text>
              <Text style={styles.telemetryLabel}>TIME</Text>
            </View>
            <View style={styles.telemetryDivider} />
            <View style={styles.telemetryCol}>
              <Text style={[styles.telemetryNum, { color: '#4B2EFF' }]}>
                {cadenceSpm !== null && cadenceSpm > 0 ? cadenceSpm : '--'}
              </Text>
              <Text style={styles.telemetryLabel}>SPM</Text>
            </View>
          </View>

          {/* Coach row */}
          <View style={styles.coachRow}>
            <View style={styles.coachLeft}>
              <EqBars active={isRunning && !isPaused} />
              <Text style={styles.coachMsg} numberOfLines={1}>
                {aiLiveInsight?.headline ?? 'Audio Coach Ready'}
              </Text>
            </View>
            <View style={styles.coachBtns}>
              <TouchableOpacity
                style={styles.tryBtn}
                onPress={() =>
                  audioCoach.announceDistanceMilestone(
                    Math.max(1, Math.round(totalDistanceMeters / 1000) || 1),
                    rollingPaceSecPerKm || 358,
                    heartRate || 162
                  )
                }
              >
                <Text style={styles.tryBtnText}>Thử</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.metronomeBpmBtn, isMetronomeOn && styles.metronomeBpmBtnOn]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleMetronome(); }}
              >
                <Text style={[styles.metronomeBpmText, isMetronomeOn && { color: '#08090C' }]}>
                  {metronomeBpm} SPM
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── BAND 5: Watch Controls ── */}
        <View style={styles.watchControls}>
          {/* Skip */}
          <TouchableOpacity style={styles.ctrlBtnWrapper} onPress={handleSkipSeg}>
            <View style={styles.skipCircle}>
              <SkipIcon />
            </View>
            <Text style={styles.ctrlLabelGray}>Skip</Text>
          </TouchableOpacity>

          {/* START / PAUSE */}
          <View style={styles.ctrlBtnWrapper}>
            <Animated.View style={[styles.startGlowRing, { opacity: glowOpacity }]} />
            <TouchableOpacity
              style={styles.startCircle}
              onPress={handleStartPause}
            >
              {!isRunning || isPaused ? <PlayIcon /> : <PauseIcon />}
            </TouchableOpacity>
            <Text style={styles.ctrlLabelLime}>{startPauseLabel}</Text>
          </View>

          {/* SOS */}
          <TouchableOpacity style={styles.ctrlBtnWrapper} onPress={handleSosPress}>
            <View style={styles.sosCircle}>
              <WarningIcon />
            </View>
            <Text style={styles.ctrlLabelAmber}>SOS</Text>
          </TouchableOpacity>

          {/* Hold Stop */}
          <HoldStopButton onStop={stopRun} />
        </View>

        {/* ── POST-RUN MODAL ── */}
        {showPostRun && (
          <View style={styles.postRunCard}>
            <Text style={styles.postRunHeader}>
              {isPlanCompleted ? '🎉 HOÀN THÀNH XUẤT SẮC' : '🎉 ĐÃ DỪNG BUỔI CHẠY'}
            </Text>

            {/* 3-col stats */}
            <View style={styles.postRunStatsRow}>
              <View style={styles.postRunStatCol}>
                <Text style={styles.postRunStatVal}>
                  {(totalDistanceMeters / 1000).toFixed(2)}
                </Text>
                <Text style={styles.postRunStatLabel}>KM</Text>
              </View>
              <View style={styles.postRunStatDivider} />
              <View style={styles.postRunStatCol}>
                <Text style={styles.postRunStatVal}>
                  {formatDurationDisplay(elapsedSeconds)}
                </Text>
                <Text style={styles.postRunStatLabel}>THỜI GIAN</Text>
              </View>
              <View style={styles.postRunStatDivider} />
              <View style={styles.postRunStatCol}>
                <Text style={styles.postRunStatVal}>
                  {formatPaceDisplay(averagePaceSecPerKm)}
                </Text>
                <Text style={styles.postRunStatLabel}>PACE TB</Text>
              </View>
            </View>

            {/* RPE Slider (simple row of buttons) */}
            <View style={styles.rpeBox}>
              <Text style={styles.rpeTitle}>ĐỘ GẮNG SỨC (RPE): {selectedRpe}/10</Text>
              <View style={styles.rpeRow}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.rpeBtn, selectedRpe === n && styles.rpeBtnActive]}
                    onPress={() => { Haptics.selectionAsync(); setSelectedRpe(n); }}
                  >
                    <Text style={[styles.rpeBtnText, selectedRpe === n && styles.rpeBtnTextActive]}>
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 3 text inputs */}
            <View style={styles.noteForm}>
              <Text style={styles.noteFormTitle}>NHẬT KÝ BUỔI CHẠY</Text>
              <TextInput
                style={styles.noteInput}
                value={goodPoint}
                onChangeText={setGoodPoint}
                placeholder="Làm tốt (VD: Giữ pace đều 2km đầu)"
                placeholderTextColor="#64748B"
              />
              <TextInput
                style={styles.noteInput}
                value={badPoint}
                onChangeText={setBadPoint}
                placeholder="Chưa được (VD: Km cuối hụt hơi)"
                placeholderTextColor="#64748B"
              />
              <TextInput
                style={styles.noteInput}
                value={fixAction}
                onChangeText={setFixAction}
                placeholder="Cách sửa buổi tới (VD: Uống nước phút 20)"
                placeholderTextColor="#64748B"
              />
            </View>

            {/* LƯU NHẬT KÝ */}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveNoteAndExit}>
              <Text style={styles.saveBtnText}>LƯU NHẬT KÝ</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.restartBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); startRun(); }}
            >
              <Text style={styles.restartBtnText}>Chạy lại bài tập này</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── SIM DRAWER ── */}
        {simOpen && (
          <View style={styles.simDrawer}>
            {/* Mode + speed row */}
            <View style={styles.simTopRow}>
              <View style={styles.simModeToggle}>
                <TouchableOpacity
                  style={[styles.simModeBtn, simMode === 'SIM' && styles.simModeBtnActive]}
                  onPress={() => setSimMode('SIM')}
                >
                  <Text style={[styles.simModeBtnText, simMode === 'SIM' && { color: '#08090C' }]}>
                    SIM
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.simModeBtn, simMode === 'GPS' && styles.simModeBtnActive]}
                  onPress={() => setSimMode('GPS')}
                >
                  <Text style={[styles.simModeBtnText, simMode === 'GPS' && { color: '#08090C' }]}>
                    GPS
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.simSpeedRow}>
                {[1, 5, 15].map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.simSpeedBtn, simSpeed === s && styles.simSpeedBtnActive]}
                    onPress={() => setSimSpeed(s)}
                  >
                    <Text style={[styles.simSpeedText, simSpeed === s && { color: '#08090C' }]}>
                      {s}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Sliders (using text steppers as RN doesn't have Slider without package) */}
            <View style={styles.simSlidersRow}>
              <View style={styles.simSliderCol}>
                <View style={styles.simSliderLabelRow}>
                  <Text style={styles.simSliderLabel}>Pace</Text>
                  <Text style={styles.simSliderVal}>
                    {Math.floor(simPace / 60)}'{String(simPace % 60).padStart(2, '0')}&quot;/km
                  </Text>
                </View>
                <View style={styles.simStepRow}>
                  <TouchableOpacity style={styles.simStepBtn} onPress={() => setSimPace(Math.max(270, simPace - 10))}>
                    <Text style={styles.simStepText}>−</Text>
                  </TouchableOpacity>
                  <View style={styles.simSliderTrack}>
                    <View style={[styles.simSliderFill, { width: `${((simPace - 270) / 330) * 100}%` }]} />
                  </View>
                  <TouchableOpacity style={styles.simStepBtn} onPress={() => setSimPace(Math.min(600, simPace + 10))}>
                    <Text style={styles.simStepText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.simSliderCol}>
                <View style={styles.simSliderLabelRow}>
                  <Text style={styles.simSliderLabel}>Nhịp tim</Text>
                  <Text style={styles.simSliderVal}>{simHr} bpm</Text>
                </View>
                <View style={styles.simStepRow}>
                  <TouchableOpacity style={styles.simStepBtn} onPress={() => setSimHr(Math.max(105, simHr - 1))}>
                    <Text style={styles.simStepText}>−</Text>
                  </TouchableOpacity>
                  <View style={styles.simSliderTrack}>
                    <View style={[styles.simSliderFill, { width: `${((simHr - 105) / 85) * 100}%`, backgroundColor: '#4B2EFF' }]} />
                  </View>
                  <TouchableOpacity style={styles.simStepBtn} onPress={() => setSimHr(Math.min(190, simHr + 1))}>
                    <Text style={styles.simStepText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Preset buttons */}
            <View style={styles.simPresets}>
              <TouchableOpacity style={styles.simPresetBtn} onPress={() => { setSimPace(360); setSimHr(145); onToggleSimBle(false); }}>
                <Text style={[styles.simPresetText, { color: '#C8FF00' }]}>Đúng nhịp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.simPresetBtn} onPress={() => { setSimPace(300); onToggleSimBle(false); }}>
                <Text style={[styles.simPresetText, { color: '#9D85FF' }]}>Vọt tốc</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.simPresetBtn} onPress={() => { setSimPace(420); onToggleSimBle(false); }}>
                <Text style={[styles.simPresetText, { color: '#FFB020' }]}>Chậm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.simPresetBtn} onPress={() => { setSimHr(183); onToggleSimBle(true); }}>
                <Text style={[styles.simPresetText, { color: '#FF3B5C' }]}>Tim 183</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08090C',
  },
  container: {
    padding: 14,
    paddingBottom: 48,
    gap: 10,
  },

  // ── Band 1 ──
  band1Row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  band1Left: {
    flex: 1,
    minWidth: 0,
  },
  band1Right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  hudWorkoutTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#14151D',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(157,133,255,0.5)',
  },
  bleBtnText: {
    color: '#9D85FF',
    fontSize: 11,
    fontWeight: '800',
  },
  simBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(75,46,255,0.25)',
    borderRadius: 8,
  },
  simBtnText: {
    color: '#9D85FF',
    fontSize: 11,
    fontWeight: '800',
  },

  // ── Error / GPS banners ──
  errorBanner: {
    backgroundColor: '#2A1219',
    borderRadius: 10,
    padding: 10,
  },
  errorBannerText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
  gpsWeakBanner: {
    backgroundColor: '#332711',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.4)',
    borderRadius: 10,
    padding: 8,
  },
  gpsWeakText: {
    color: '#FFB020',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },

  // ── Recovery banner ──
  recoveryBanner: {
    backgroundColor: 'rgba(255,176,32,0.15)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recoveryBannerText: {
    color: '#FFB020',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  resumeBtn: {
    backgroundColor: '#C8FF00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resumeBtnText: {
    color: '#08090C',
    fontSize: 11,
    fontWeight: '900',
  },

  // ── Band 2 ──
  band2Card: {
    backgroundColor: '#111218',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  band2TopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  band2Left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  band2Right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  segBadge: {
    backgroundColor: '#4B2EFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
    flexShrink: 0,
  },
  segBadgeText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '900',
  },
  segNameText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  segTargetText: {
    color: '#C8FF00',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#1E202B',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#C8FF00',
    borderRadius: 3,
  },
  band2BottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  band2BottomLeft: {
    color: '#94A3B8',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  pctText: {
    color: '#F8FAFC',
    fontWeight: '700',
  },
  band2BottomRight: {
    color: '#94A3B8',
    fontSize: 11,
    flexShrink: 1,
  },
  nextSegText: {
    color: '#CBD5E1',
    fontWeight: '700',
  },

  // CheckerMini
  checkerMini: {
    width: 14,
    height: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  checkerCell: {
    width: 7,
    height: 7,
  },

  // ── Band 3 ──
  band3Row: {
    flexDirection: 'row',
    gap: 8,
  },
  paceCard: {
    flex: 1.618,
    backgroundColor: '#F8FAFC',
    borderRadius: 2,
    borderBottomWidth: 4,
    borderBottomColor: '#C8FF00',
    padding: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 25,
    elevation: 20,
    justifyContent: 'space-between',
  },
  bpmCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 2,
    borderBottomWidth: 4,
    borderBottomColor: '#4B2EFF',
    padding: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 25,
    elevation: 20,
    justifyContent: 'space-between',
  },
  halftoneCorner: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 60,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderBottomLeftRadius: 60,
  },
  scoreCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardSuperLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  paceStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  paceStatusPillText: {
    fontSize: 10,
    fontWeight: '900',
  },
  paceValueWrap: {
    marginTop: 8,
  },
  heroPaceValue: {
    color: '#08090C',
    fontSize: 72,
    fontWeight: '900',
    fontStyle: 'italic',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    lineHeight: 78,
  },
  minKmLabel: {
    color: '#4B2EFF',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  bpmValueWrap: {
    marginTop: 8,
  },
  heroBpmValue: {
    color: '#08090C',
    fontSize: 48,
    fontWeight: '900',
    fontStyle: 'italic',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  heartLabel: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 2,
  },
  zoneBadge: {
    backgroundColor: '#4B2EFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  zoneBadgeText: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '900',
  },

  // ── Check-in card ──
  checkInCard: {
    backgroundColor: '#141824',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#C8FF00',
    padding: 16,
    gap: 8,
  },
  checkInHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  checkInCloseText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '700',
  },
  checkInTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
  },
  checkInSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
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

  // ── Band 4 ──
  band4Card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 25,
    elevation: 18,
  },
  telemetryRow: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  telemetryCol: {
    flex: 1,
    alignItems: 'center',
  },
  telemetryDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  telemetryNum: {
    color: '#08090C',
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  telemetryLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  coachRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 8,
  },
  coachLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  eqContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 12,
    flexShrink: 0,
  },
  eqBar: {
    width: 4,
    height: 12,
    borderRadius: 2,
  },
  coachMsg: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  coachBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  tryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: '#08090C',
    borderRadius: 4,
  },
  tryBtnText: {
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: '800',
  },
  metronomeBpmBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
  },
  metronomeBpmBtnOn: {
    backgroundColor: '#C8FF00',
  },
  metronomeBpmText: {
    color: '#08090C',
    fontSize: 11,
    fontWeight: '800',
  },

  // ── Band 5: Watch Controls ──
  watchControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 6,
  },
  ctrlBtnWrapper: {
    alignItems: 'center',
    gap: 6,
  },
  skipCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#14151D',
    borderWidth: 1,
    borderColor: 'rgba(75,46,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctrlLabelGray: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
  },
  startGlowRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#C8FF00',
    top: -8,
    alignSelf: 'center',
  },
  startCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#C8FF00',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#C8FF00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  ctrlLabelLime: {
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: '900',
  },
  sosCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#14151D',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctrlLabelAmber: {
    color: '#FFB020',
    fontSize: 10,
    fontWeight: '800',
  },
  holdStopCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,59,92,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,92,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  holdStopFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,59,92,0.4)',
  },
  ctrlLabelRed: {
    color: '#FF3B5C',
    fontSize: 10,
    fontWeight: '800',
  },

  // ── Post-run modal ──
  postRunCard: {
    backgroundColor: '#111218',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#C8FF00',
    padding: 18,
    gap: 14,
  },
  postRunHeader: {
    color: '#C8FF00',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
  },
  postRunStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#252838',
  },
  postRunStatCol: {
    alignItems: 'center',
  },
  postRunStatVal: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  postRunStatLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  postRunStatDivider: {
    width: 1,
    backgroundColor: '#252838',
  },
  rpeBox: {
    gap: 8,
  },
  rpeTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  rpeRow: {
    flexDirection: 'row',
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
  rpeBtnActive: {
    backgroundColor: '#C8FF00',
  },
  rpeBtnText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  rpeBtnTextActive: {
    color: '#08090C',
  },
  noteForm: {
    gap: 8,
  },
  noteFormTitle: {
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
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
  saveBtn: {
    backgroundColor: '#C8FF00',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#08090C',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
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

  // ── SIM Drawer ──
  simDrawer: {
    backgroundColor: '#111218',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  simTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#08090C',
    padding: 2,
    borderRadius: 8,
  },
  simModeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simModeBtnActive: {
    backgroundColor: '#C8FF00',
  },
  simModeBtnText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
  },
  simSpeedRow: {
    flexDirection: 'row',
    gap: 4,
  },
  simSpeedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#181A24',
    borderRadius: 4,
  },
  simSpeedBtnActive: {
    backgroundColor: '#C8FF00',
  },
  simSpeedText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  simSlidersRow: {
    flexDirection: 'row',
    gap: 12,
  },
  simSliderCol: {
    flex: 1,
    gap: 6,
  },
  simSliderLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  simSliderLabel: {
    color: '#94A3B8',
    fontSize: 11,
  },
  simSliderVal: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  simStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  simStepBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#252838',
    justifyContent: 'center',
    alignItems: 'center',
  },
  simStepText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  simSliderTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#252838',
    borderRadius: 2,
    overflow: 'hidden',
  },
  simSliderFill: {
    height: '100%',
    backgroundColor: '#C8FF00',
    borderRadius: 2,
  },
  simPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  simPresetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#181A24',
    borderRadius: 8,
  },
  simPresetText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

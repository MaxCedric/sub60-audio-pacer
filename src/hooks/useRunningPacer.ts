import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Pedometer } from 'expo-sensors';
import { audioCoach, AUDIO_SCRIPTS } from '../services/audioCoach';
import { COACH_CONFIG } from '../config/coachConfig';
import {
  AthleteProfile,
  DEFAULT_ATHLETE_PROFILE,
  GoalId,
  GOAL_TIERS,
  getNextDowngradeGoal,
  getNextUpgradeGoal,
} from '../logic/athlete';
import {
  PaceType,
  resolvePaceRange,
  ResolvedPaceRange,
  formatPaceMinutesSeconds,
} from '../logic/paces';
import {
  evaluateHeartRateAlert,
  HeartRateAlertAction,
} from '../logic/zones';
import {
  isGpsAccuracyReliable,
  isInSegmentGracePeriod,
  evaluateAutoPause,
  evaluatePaceDeviationWithTolerance,
  shouldTriggerPtCheckIn,
  GpsAccuracySample,
  AutoPauseState,
  PaceDeviationStatus,
} from '../logic/gpsFilter';
import {
  calculateEstimatedFinishTime,
  SplitRecord,
} from '../logic/eta';
import {
  analyzeInRunPerformance,
  InRunAiCoachingInsight,
} from '../logic/aiCoach';
import { storageService, CompletedRunSession } from '../services/storage';

export const BACKGROUND_LOCATION_TASK = 'SUB60_BACKGROUND_LOCATION_TASK';

export interface WorkoutSegment {
  id: string;
  name: string;
  type: 'warmup' | 'main' | 'interval_work' | 'interval_rest' | 'stride' | 'cooldown' | 'race_split' | 'tempo';
  paceType?: PaceType;
  distanceMeters?: number;
  durationSeconds?: number;
  targetPaceMinSec?: number;
  targetPaceMaxSec?: number;
  maxHrBpm: number;
  voiceIntro: string;
}

export interface WorkoutPlan {
  id: string;
  dayOfWeek: string;
  date: string;
  title: string;
  type: string;
  totalDistanceKm: number;
  description: string;
  segments: WorkoutSegment[];
  isOptional?: boolean;
}

export type CheckInReason = 'SLOW_OR_TIRED' | 'HIGH_HR' | 'MANUAL';
export type CheckInOption = 'PAIN' | 'FATIGUED' | 'STILL_OK';

export interface CheckInState {
  isActive: boolean;
  reason: CheckInReason;
  question: string;
  timestamp: number;
}

interface GpsSample {
  latitude: number;
  longitude: number;
  timestamp: number;
  cumulativeDistanceM: number;
}

interface HrSample {
  bpm: number;
  timestamp: number;
}

type LocationListener = (locations: Location.LocationObject[]) => void;
const backgroundListeners = new Set<LocationListener>();

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const payload = data as { locations?: Location.LocationObject[] } | undefined;
    if (payload?.locations && payload.locations.length > 0) {
      backgroundListeners.forEach((listener) => listener(payload.locations!));
    }
  });
}

function calculateHaversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatPaceDisplay(paceSecPerKm: number | null | undefined): string {
  return formatPaceMinutesSeconds(paceSecPerKm);
}

export function formatDurationDisplay(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export type SplitAnnouncementInterval = 500 | 1000;

export function useRunningPacer(
  workout: WorkoutPlan,
  currentHeartRate: number | null
) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [totalDistanceMeters, setTotalDistanceMeters] = useState(0);
  const [rollingPaceSecPerKm, setRollingPaceSecPerKm] = useState<number | null>(null);
  const [averagePaceSecPerKm, setAveragePaceSecPerKm] = useState<number | null>(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [segmentProgressMeters, setSegmentProgressMeters] = useState(0);
  const [segmentElapsedSeconds, setSegmentElapsedSeconds] = useState(0);
  const [splitIntervalMeters, setSplitIntervalMeters] = useState<SplitAnnouncementInterval>(1000);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(172);

  // Profile & Goal Tiers
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile>(DEFAULT_ATHLETE_PROFILE);
  const [currentGoalId, setCurrentGoalId] = useState<GoalId>('sub60');

  // Trạng thái chạy & cảnh báo
  const [isPlanCompleted, setIsPlanCompleted] = useState(false);
  const [isInOpenRun, setIsInOpenRun] = useState(false);
  const [isRunEnded, setIsRunEnded] = useState(false);
  const [isHrDangerActive, setIsHrDangerActive] = useState(false);
  const [paceZoneStatus, setPaceZoneStatus] = useState<PaceDeviationStatus>('IN_ZONE');
  const [gpsSimulatedPaceSec, setGpsSimulatedPaceSec] = useState<number | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isGpsWeak, setIsGpsWeak] = useState(false);

  // Cadence sensor
  const [cadenceSpm, setCadenceSpm] = useState<number | null>(null);
  const [autoPauseEnabled, setAutoPauseEnabled] = useState(true);

  // AI Live Copilot
  const [aiLiveInsight, setAiLiveInsight] = useState<InRunAiCoachingInsight | null>(null);

  // PT Check-in tương tác & Đi bộ phục hồi
  const [checkInState, setCheckInState] = useState<CheckInState | null>(null);
  const [isWalkingRecovery, setIsWalkingRecovery] = useState(false);
  const isWalkingRecoveryRef = useRef(false);
  const lastCheckInTimeRef = useRef(0);

  // Phân bổ thời gian trong 5 Zone nhịp tim (giây)
  const zoneTimeRef = useRef<Record<1 | 2 | 3 | 4 | 5, number>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const hrHistoryRef = useRef<HrSample[]>([]);
  const cadenceHistoryRef = useRef<number[]>([]);
  const alertsCountRef = useRef(0);

  // Refs điều khiển trạng thái
  const isPlanCompletedRef = useRef(false);
  const isInOpenRunRef = useRef(false);
  const isWorkoutCompletedRef = useRef(false);
  const announcedHalfwayRef = useRef(false);
  const announced1KmLeftRef = useRef(false);
  const announced500mLeftRef = useRef(false);

  const gpsHistoryRef = useRef<GpsSample[]>([]);
  const gpsAccuracyHistoryRef = useRef<GpsAccuracySample[]>([]);
  const paceTrendSamplesRef = useRef<number[]>([]);
  const splitsHistoryRef = useRef<SplitRecord[]>([]);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);
  const pedometerSubRef = useRef<any>(null);

  const runStartTimeMsRef = useRef<number>(0);
  const totalPausedMsRef = useRef<number>(0);
  const pauseStartedMsRef = useRef<number | null>(null);
  const lastSimTickMsRef = useRef<number>(0);

  const totalDistanceRef = useRef(0);
  const elapsedSecondsRef = useRef(0);
  const segmentIndexRef = useRef(0);
  const segmentStartDistanceRef = useRef(0);
  const segmentStartTimeSecRef = useRef(0);
  const lastAnnouncedSplitIndexRef = useRef(0);

  // Giám sát nhịp tim
  const dangerHrStartMsRef = useRef<number | null>(null);
  const maxHrStartMsRef = useRef<number | null>(null);
  const segmentCeilingStartMsRef = useRef<number | null>(null);

  // Giám sát tốc độ & Auto-pause
  const lowSpeedStartMsRef = useRef<number | null>(null);
  const highSpeedStartMsRef = useRef<number | null>(null);
  const autoPauseStateRef = useRef<AutoPauseState>('RUNNING');

  const slowDriftStartMsRef = useRef<number | null>(null);

  const isPausedRef = useRef(false);
  const isRunningRef = useRef(false);
  const heartRateRef = useRef<number | null>(null);
  const rollingPaceRef = useRef<number | null>(null);
  const shortPace6sRef = useRef<number | null>(null);
  const gpsSimPaceRef = useRef<number | null>(null);

  // Load profile và goal đã lưu
  useEffect(() => {
    storageService.getAthleteProfile().then((p) => {
      setAthleteProfile(p);
      audioCoach.setLactateThresholdHr(p.lactateThresholdHrBpm);
    });
    storageService.getSelectedGoal().then((g) => setCurrentGoalId(g));
    storageService.getAutoPauseEnabled().then((ap) => setAutoPauseEnabled(ap));
  }, []);

  useEffect(() => {
    isWalkingRecoveryRef.current = isWalkingRecovery;
  }, [isWalkingRecovery]);

  useEffect(() => {
    heartRateRef.current = currentHeartRate;
  }, [currentHeartRate]);

  useEffect(() => {
    gpsSimPaceRef.current = gpsSimulatedPaceSec;
  }, [gpsSimulatedPaceSec]);

  // Tự động đóng câu hỏi check-in sau 20s
  useEffect(() => {
    if (!checkInState?.isActive) return;
    const timer = setTimeout(() => {
      setCheckInState(null);
    }, 20000);
    return () => clearTimeout(timer);
  }, [checkInState]);

  // Giải mã dải pace động cho segment hiện tại
  const resolveCurrentSegmentPace = useCallback(
    (seg: WorkoutSegment): ResolvedPaceRange => {
      return resolvePaceRange(seg, athleteProfile, GOAL_TIERS[currentGoalId]);
    },
    [athleteProfile, currentGoalId]
  );

  const safeDefaultSegment: WorkoutSegment = {
    id: 'seg-default',
    name: 'Easy Chạy Nhẹ Z2',
    type: 'main',
    paceType: 'easy',
    distanceMeters: 3000,
    targetPaceMinSec: 360,
    targetPaceMaxSec: 420,
    maxHrBpm: 160,
    voiceIntro: 'Chạy nhẹ nhàng duy trì Zone 2',
  };

  const currentSegment: WorkoutSegment = isWalkingRecovery
    ? {
        id: 'walk-recovery',
        name: 'Đi Bộ Hồi Phục (Bảo vệ chân)',
        type: 'cooldown',
        paceType: 'rest',
        targetPaceMinSec: 540,
        targetPaceMaxSec: 780,
        maxHrBpm: 145,
        voiceIntro: 'Đi bộ thả lỏng để hồi phục',
      }
    : isInOpenRun
    ? {
        id: 'open-run',
        name: 'Chạy Thêm Tự Do (Extra Miles)',
        type: 'cooldown',
        paceType: 'easy',
        targetPaceMinSec: 360,
        targetPaceMaxSec: 600,
        maxHrBpm: 178,
        voiceIntro: 'Tiếp tục chạy tự do theo cảm giác cơ thể',
      }
    : (workout?.segments && workout.segments.length > 0)
    ? (workout.segments[currentSegmentIndex] || workout.segments[workout.segments.length - 1] || safeDefaultSegment)
    : safeDefaultSegment;

  const getActualElapsedSeconds = useCallback((nowMs: number): number => {
    if (!runStartTimeMsRef.current) return 0;
    const pausedMs =
      totalPausedMsRef.current +
      (pauseStartedMsRef.current ? nowMs - pauseStartedMsRef.current : 0);
    return Math.max(0, Math.floor((nowMs - runStartTimeMsRef.current - pausedMs) / 1000));
  }, []);

  const computeWindowPace = useCallback(
    (samples: GpsSample[], windowSec: number, minMeters: number): number | null => {
      if (samples.length < 2) return null;
      const latest = samples[samples.length - 1];

      let anchor = samples[0];
      for (let i = samples.length - 2; i >= 0; i--) {
        const candidate = samples[i];
        const dtSec = (latest.timestamp - candidate.timestamp) / 1000;
        const dMeters = latest.cumulativeDistanceM - candidate.cumulativeDistanceM;
        anchor = candidate;
        if (dtSec >= windowSec || dMeters >= minMeters) {
          break;
        }
      }

      const deltaMeters = latest.cumulativeDistanceM - anchor.cumulativeDistanceM;
      const deltaSeconds = (latest.timestamp - anchor.timestamp) / 1000;

      if (deltaMeters < 8 || deltaSeconds < 3) {
        return null;
      }

      return Math.round((deltaSeconds / deltaMeters) * 1000);
    },
    []
  );

  // Trigger check-in tương tác
  const triggerCheckIn = useCallback((reason: CheckInReason = 'MANUAL') => {
    const now = Date.now();
    lastCheckInTimeRef.current = now;
    setCheckInState({
      isActive: true,
      reason,
      question: 'Bạn ổn không? Đau chân hay mệt quá?',
      timestamp: now,
    });
    audioCoach.announceCheckIn();
  }, []);

  const dismissCheckIn = useCallback(() => {
    setCheckInState(null);
  }, []);

  const respondToCheckIn = useCallback(async (option: CheckInOption) => {
    setCheckInState(null);
    lastCheckInTimeRef.current = Date.now();

    if (option === 'PAIN') {
      setIsWalkingRecovery(true);
      await audioCoach.respondToCheckIn('PAIN');
    } else if (option === 'FATIGUED') {
      // Hạ mục tiêu an toàn 1 bậc
      const next = getNextDowngradeGoal(currentGoalId);
      setCurrentGoalId(next);
      storageService.saveSelectedGoal(next);
      await audioCoach.respondToCheckIn('FATIGUED');
    } else {
      await audioCoach.respondToCheckIn('STILL_OK');
    }
  }, [currentGoalId]);

  const resumeRunningFromWalk = useCallback(async () => {
    setIsWalkingRecovery(false);
    await audioCoach.speak(AUDIO_SCRIPTS.RESUME_RUNNING, 'POSITIVE', 'good');
  }, []);

  // Nút vòng thủ công LAP (kết thúc segment ngay)
  const triggerLap = useCallback(() => {
    if (!isRunningRef.current || isRunEnded) return;
    const nextIdx = segmentIndexRef.current + 1;
    if (nextIdx < workout.segments.length) {
      segmentIndexRef.current = nextIdx;
      segmentStartDistanceRef.current = totalDistanceRef.current;
      segmentStartTimeSecRef.current = elapsedSecondsRef.current;
      setCurrentSegmentIndex(nextIdx);
      setSegmentProgressMeters(0);
      setSegmentElapsedSeconds(0);
      gpsHistoryRef.current = []; // Reset cửa sổ pace đầu đoạn mới
      const nextSeg = workout.segments[nextIdx];
      audioCoach.announceSegmentTransition(nextSeg.voiceIntro);
    } else if (!isPlanCompletedRef.current) {
      isPlanCompletedRef.current = true;
      isInOpenRunRef.current = true;
      setIsPlanCompleted(true);
      setIsInOpenRun(true);
      audioCoach.announceWorkoutCompleted(workout.title);
    }
  }, [isRunEnded, workout]);

  // Nút đổi mục tiêu trên màn hình chạy
  const downgradeGoal = useCallback(() => {
    const next = getNextDowngradeGoal(currentGoalId);
    if (next !== currentGoalId) {
      setCurrentGoalId(next);
      storageService.saveSelectedGoal(next);
      const audioCue = next === 'sub65' ? AUDIO_SCRIPTS.SUB65_ON : AUDIO_SCRIPTS.UNDER70_ON;
      audioCoach.speak(audioCue, 'MILESTONE', 'good');
    }
  }, [currentGoalId]);

  const upgradeGoal = useCallback(() => {
    const next = getNextUpgradeGoal(currentGoalId);
    if (next !== currentGoalId) {
      setCurrentGoalId(next);
      storageService.saveSelectedGoal(next);
      const audioCue = next === 'sub60' ? AUDIO_SCRIPTS.SUB65_OFF : AUDIO_SCRIPTS.SUB65_ON;
      audioCoach.speak(audioCue, 'MILESTONE', 'good');
    }
  }, [currentGoalId]);

  const toggleAutoPause = useCallback(() => {
    setAutoPauseEnabled((prev) => {
      const next = !prev;
      storageService.setAutoPauseEnabled(next);
      return next;
    });
  }, []);

  // Yêu cầu AI PT tư vấn thời gian thực qua giọng nói
  const triggerLiveAiAdvice = useCallback((): InRunAiCoachingInsight => {
    const totalDist = totalDistanceRef.current;
    const elapsed = getActualElapsedSeconds(Date.now());
    const avgPace = totalDist > 20 && elapsed > 0 ? Math.round((elapsed / totalDist) * 1000) : 450;
    const resolved = resolveCurrentSegmentPace(currentSegment);

    const insight = analyzeInRunPerformance({
      elapsedSeconds: elapsed,
      totalDistanceMeters: totalDist,
      targetTotalDistanceMeters: workout.totalDistanceKm * 1000,
      rollingPaceSecPerKm: rollingPaceRef.current || shortPace6sRef.current || 450,
      averagePaceSecPerKm: avgPace,
      heartRate: heartRateRef.current,
      cadenceSpm,
      currentSegmentName: currentSegment.name,
      currentSegmentType: currentSegment.type,
      targetPaceMinSec: resolved.minSec,
      targetPaceMaxSec: resolved.maxSec,
      lthrBpm: athleteProfile.lactateThresholdHrBpm,
      goalName: GOAL_TIERS[currentGoalId].name,
    });

    setAiLiveInsight(insight);
    audioCoach.speak(insight.voiceAudioText, 'POSITIVE', 'good');
    return insight;
  }, [
    athleteProfile.lactateThresholdHrBpm,
    cadenceSpm,
    currentGoalId,
    currentSegment,
    getActualElapsedSeconds,
    resolveCurrentSegmentPace,
    workout.totalDistanceKm,
  ]);

  // Tiến trình chặng
  const evaluateSegmentProgression = useCallback(
    (currentTotalMeters: number, currentElapsedSec: number) => {
      if (isRunEnded) return;
      if (isInOpenRunRef.current) {
        const totalPlanM = workout.totalDistanceKm * 1000;
        const extraM = Math.max(0, currentTotalMeters - totalPlanM);
        setSegmentProgressMeters(extraM);
        return;
      }

      const idx = segmentIndexRef.current;
      const seg = workout.segments[idx];
      if (!seg) return;

      const distInSeg = currentTotalMeters - segmentStartDistanceRef.current;
      const timeInSeg = currentElapsedSec - segmentStartTimeSecRef.current;

      setSegmentProgressMeters(Math.max(0, distInSeg));
      setSegmentElapsedSeconds(Math.max(0, timeInSeg));

      // Mốc động viên tâm lý (Halfway, 1km, 500m)
      const targetTotalM = workout.totalDistanceKm * 1000;
      if (targetTotalM > 0) {
        const remainingM = targetTotalM - currentTotalMeters;
        if (!announcedHalfwayRef.current && currentTotalMeters >= targetTotalM / 2 && remainingM > 1200) {
          announcedHalfwayRef.current = true;
          audioCoach.announceMotivationalCue('halfway');
        } else if (!announced1KmLeftRef.current && remainingM <= 1050 && remainingM > 650 && targetTotalM >= 2000) {
          announced1KmLeftRef.current = true;
          audioCoach.announceMotivationalCue('1km_left');
        } else if (!announced500mLeftRef.current && remainingM <= 550 && remainingM > 80 && targetTotalM >= 1200) {
          announced500mLeftRef.current = true;
          audioCoach.announceMotivationalCue('500m_left');
        }
      }

      const isDistComplete =
        typeof seg.distanceMeters === 'number' && seg.distanceMeters > 0 && distInSeg >= seg.distanceMeters;
      const isTimeComplete =
        typeof seg.durationSeconds === 'number' && seg.durationSeconds > 0 && timeInSeg >= seg.durationSeconds;

      if (isDistComplete || isTimeComplete) {
        triggerLap();
      }
    },
    [isRunEnded, triggerLap, workout]
  );

  // Giám sát huấn luyện nhịp tim & Pace
  const evaluatePtCoaching = useCallback(
    (nowMs: number, currentElapsedSec: number) => {
      if (isWorkoutCompletedRef.current || isPausedRef.current) return;
      const activeSeg = workout.segments[segmentIndexRef.current];
      const hr = heartRateRef.current;
      const currentPaceForCue = rollingPaceRef.current || shortPace6sRef.current;

      // 1. GIÁM SÁT TIM MẠCH
      if (hr !== null && hr > 0) {
        // Cập nhật phân bổ Zone
        const activeZone = audioCoach.getHeartRateZone(hr);
        if (activeZone && activeZone >= 1 && activeZone <= 5) {
          const zKey = activeZone as 1 | 2 | 3 | 4 | 5;
          zoneTimeRef.current[zKey] = (zoneTimeRef.current[zKey] || 0) + 1;
        }

        // Tính sustained duration
        if (hr >= athleteProfile.maxHrBpm) {
          if (!maxHrStartMsRef.current) maxHrStartMsRef.current = nowMs;
        } else {
          maxHrStartMsRef.current = null;
        }

        if (hr >= athleteProfile.dangerHrBpm) {
          if (!dangerHrStartMsRef.current) dangerHrStartMsRef.current = nowMs;
        } else {
          dangerHrStartMsRef.current = null;
        }

        const z2Ceiling = Math.round(athleteProfile.lactateThresholdHrBpm * 0.89);
        const ceilingThreshold = activeSeg?.type === 'tempo' ? athleteProfile.lactateThresholdHrBpm : z2Ceiling;
        if (hr > ceilingThreshold) {
          if (!segmentCeilingStartMsRef.current) segmentCeilingStartMsRef.current = nowMs;
        } else {
          segmentCeilingStartMsRef.current = null;
        }

        const maxSustainedSec = maxHrStartMsRef.current ? Math.floor((nowMs - maxHrStartMsRef.current) / 1000) : 0;
        const dangerSustainedSec = dangerHrStartMsRef.current ? Math.floor((nowMs - dangerHrStartMsRef.current) / 1000) : 0;
        const ceilingSustainedSec = segmentCeilingStartMsRef.current
          ? Math.floor((nowMs - segmentCeilingStartMsRef.current) / 1000)
          : 0;

        const hrAction: HeartRateAlertAction = evaluateHeartRateAlert({
          currentHr: hr,
          segmentType: activeSeg ? activeSeg.type : 'main',
          segmentDurationSeconds: activeSeg?.durationSeconds,
          segmentElapsedSeconds: segmentElapsedSeconds,
          highDangerHrSustainedSeconds: dangerSustainedSec,
          maxHrSustainedSeconds: maxSustainedSec,
          segmentCeilingExceededSeconds: ceilingSustainedSec,
          profile: athleteProfile,
          isFinalRaceSplit: activeSeg?.id === 'w9-sat-split3',
        });

        if (hrAction === 'CRITICAL_DANGER_WALK') {
          setIsHrDangerActive(true);
          alertsCountRef.current++;
          audioCoach.announceCriticalHeartRate(hr, currentPaceForCue);
        } else {
          setIsHrDangerActive(false);
          if (hrAction === 'SLOW_DOWN_SEGMENT_CEILING') {
            alertsCountRef.current++;
            audioCoach.announceHrRisingTrend(hr, currentPaceForCue, true);
          } else if (hrAction === 'REST_READY_NOTIFICATION') {
            audioCoach.speak('Đã sẵn sàng. Chuẩn bị vào tổ mới.', 'INFO', 'good');
          }
        }
      }

      // 2. GIÁM SÁT PACE VỚI DUNG SAI & THỜI GIAN ÂN HẠN
      const segElapsed = currentElapsedSec - segmentStartTimeSecRef.current;
      const segDist = totalDistanceRef.current - segmentStartDistanceRef.current;
      const inGrace = isInSegmentGracePeriod(segElapsed, segDist, COACH_CONFIG.pacer.gracePeriodSeconds, COACH_CONFIG.pacer.gracePeriodMeters);

      // Nếu trong thời gian ân hạn, hoặc đang chạy thêm tự do, hoặc đang đi bộ hồi phục, hoặc GPS yếu: im lặng
      if (inGrace || isInOpenRunRef.current || isWalkingRecoveryRef.current || isGpsWeak) {
        return;
      }

      if (activeSeg) {
        const resolvedPace = resolveCurrentSegmentPace(activeSeg);
        if (!resolvedPace.hasPaceAlert) return;

        const { minSec, maxSec } = resolvedPace;
        const rolling = rollingPaceRef.current;

        // Đối với INTERVAL: dùng pace trung bình của tổ hiện tại
        const isInterval = activeSeg.type === 'interval_work';
        const evaluationPace = isInterval
          ? segDist > 10 && segElapsed > 3
            ? Math.round((segElapsed / segDist) * 1000)
            : null
          : rolling;

        if (evaluationPace) {
          const status = evaluatePaceDeviationWithTolerance(evaluationPace, minSec, maxSec, COACH_CONFIG.pacer.steadyPaceToleranceSec);
          setPaceZoneStatus(status);

          // Kiểm tra drift chậm liên tục
          if (evaluationPace > maxSec + COACH_CONFIG.pacer.checkInPaceDriftToleranceSec) {
            if (!slowDriftStartMsRef.current) slowDriftStartMsRef.current = nowMs;
          } else {
            slowDriftStartMsRef.current = null;
          }

          const slowDriftSec = slowDriftStartMsRef.current
            ? Math.floor((nowMs - slowDriftStartMsRef.current) / 1000)
            : 0;

          // Kiểm tra điều kiện PT Check-in
          if (shouldTriggerPtCheckIn(!isGpsWeak, currentElapsedSec, evaluationPace, maxSec, slowDriftSec)) {
            triggerCheckIn('SLOW_OR_TIRED');
            slowDriftStartMsRef.current = null;
          } else if (status === 'TOO_FAST') {
            alertsCountRef.current++;
            audioCoach.announcePaceDeviation('TOO_FAST', evaluationPace, hr, minSec, maxSec);
          } else if (status === 'TOO_SLOW') {
            alertsCountRef.current++;
            audioCoach.announcePaceDeviation('TOO_SLOW', evaluationPace, hr, minSec, maxSec);
          }
        }
      }
    },
    [
      athleteProfile,
      currentSegmentIndex,
      isGpsWeak,
      resolveCurrentSegmentPace,
      segmentElapsedSeconds,
      triggerCheckIn,
      workout.segments,
    ]
  );

  // HÀM DUY NHẤT TIẾP NHẬN QUÃNG ĐƯỜNG (Unify cả GPS thật và GPS giả lập)
  const ingestDistance = useCallback(
    (deltaMeters: number, nowMs: number, instantSpeedMps: number, accuracyMeters: number) => {
      const actualElapsed = getActualElapsedSeconds(nowMs);
      elapsedSecondsRef.current = actualElapsed;
      setElapsedSeconds(actualElapsed);

      // Lưu accuracy để đánh giá GPS
      gpsAccuracyHistoryRef.current.push({ accuracyMeters, timestamp: nowMs });
      if (gpsAccuracyHistoryRef.current.length > 20) gpsAccuracyHistoryRef.current.shift();
      const gpsEval = isGpsAccuracyReliable(gpsAccuracyHistoryRef.current, nowMs, COACH_CONFIG.pacer.maxGpsAccuracyMeters);
      setIsGpsWeak(!gpsEval.isReliable);

      // AUTO-PAUSE / AUTO-RESUME
      if (autoPauseEnabled) {
        if (instantSpeedMps < COACH_CONFIG.pacer.autoPauseMinSpeedMps) {
          if (!lowSpeedStartMsRef.current) lowSpeedStartMsRef.current = nowMs;
        } else {
          lowSpeedStartMsRef.current = null;
        }

        if (instantSpeedMps > COACH_CONFIG.pacer.autoResumeMinSpeedMps) {
          if (!highSpeedStartMsRef.current) highSpeedStartMsRef.current = nowMs;
        } else {
          highSpeedStartMsRef.current = null;
        }

        const lowSec = lowSpeedStartMsRef.current ? Math.floor((nowMs - lowSpeedStartMsRef.current) / 1000) : 0;
        const highSec = highSpeedStartMsRef.current ? Math.floor((nowMs - highSpeedStartMsRef.current) / 1000) : 0;
        const activeSeg = workout.segments[segmentIndexRef.current];

        const apResult = evaluateAutoPause(
          instantSpeedMps,
          autoPauseStateRef.current,
          lowSec,
          highSec,
          activeSeg?.type === 'interval_rest'
        );

        if (apResult.shouldTriggerPause) {
          autoPauseStateRef.current = 'PAUSED';
          setIsPaused(true);
          isPausedRef.current = true;
          pauseStartedMsRef.current = nowMs;
          audioCoach.speak('Đã tự động tạm dừng.', 'INFO');
          return;
        }

        if (apResult.shouldTriggerResume) {
          autoPauseStateRef.current = 'RUNNING';
          setIsPaused(false);
          isPausedRef.current = false;
          if (pauseStartedMsRef.current) {
            totalPausedMsRef.current += nowMs - pauseStartedMsRef.current;
            pauseStartedMsRef.current = null;
          }
          audioCoach.speak('Tự động tiếp tục chạy.', 'INFO');
        }
      }

      if (isPausedRef.current) return;

      const newTotalMeters = totalDistanceRef.current + deltaMeters;
      totalDistanceRef.current = newTotalMeters;
      setTotalDistanceMeters(newTotalMeters);

      // Cập nhật pace trung bình
      if (actualElapsed > 5 && newTotalMeters > 20) {
        setAveragePaceSecPerKm(Math.round((actualElapsed / newTotalMeters) * 1000));
      }

      // XỬ LÝ MỐC KHOẢNG CÁCH (SPLITS) & TÍNH THỜI GIAN VỀ ĐÍCH DỰ KIẾN (ETA)
      const currentSplitIndex = Math.floor(newTotalMeters / splitIntervalMeters);
      if (currentSplitIndex > lastAnnouncedSplitIndexRef.current && currentSplitIndex > 0) {
        lastAnnouncedSplitIndexRef.current = currentSplitIndex;
        const milestoneKm = (currentSplitIndex * splitIntervalMeters) / 1000;
        const currentPace = rollingPaceRef.current || 450;

        splitsHistoryRef.current.push({
          km: milestoneKm,
          paceSecPerKm: currentPace,
          avgHrBpm: heartRateRef.current ?? undefined,
          elapsedSeconds: actualElapsed,
        });

        const targetMeters = workout.totalDistanceKm * 1000;
        const eta = calculateEstimatedFinishTime(
          actualElapsed,
          newTotalMeters,
          targetMeters,
          splitsHistoryRef.current
        );

        audioCoach.announceDistanceMilestone(
          milestoneKm,
          currentPace,
          eta?.estimatedTotalSeconds
        );
      }

      evaluateSegmentProgression(newTotalMeters, actualElapsed);
      evaluatePtCoaching(nowMs, actualElapsed);
    },
    [
      autoPauseEnabled,
      evaluatePtCoaching,
      evaluateSegmentProgression,
      getActualElapsedSeconds,
      splitIntervalMeters,
      workout.segments,
      workout.totalDistanceKm,
    ]
  );

  const handleLocationsUpdate = useCallback(
    (locations: Location.LocationObject[]) => {
      if (!isRunningRef.current || isPausedRef.current) return;

      const nowMs = Date.now();
      for (const loc of locations) {
        const { latitude, longitude, accuracy } = loc.coords;
        const timestamp = loc.timestamp || nowMs;
        const acc = accuracy !== null && accuracy > 0 ? accuracy : 10;

        if (acc > 50) continue;

        const history = gpsHistoryRef.current;
        if (history.length === 0) {
          history.push({ latitude, longitude, timestamp, cumulativeDistanceM: totalDistanceRef.current });
          continue;
        }

        const prev = history[history.length - 1];
        if (timestamp <= prev.timestamp) continue;

        const dtSec = (timestamp - prev.timestamp) / 1000;
        if (dtSec <= 0.4) continue;

        const stepMeters = calculateHaversineMeters(prev.latitude, prev.longitude, latitude, longitude);
        const instantSpeedMps = stepMeters / dtSec;
        if (stepMeters < 1.0 || instantSpeedMps > 8.0) continue;

        history.push({ latitude, longitude, timestamp, cumulativeDistanceM: totalDistanceRef.current + stepMeters });
        if (history.length > 40) history.shift();

        const short6 = computeWindowPace(history, 6, 25);
        if (short6) shortPace6sRef.current = short6;

        const rolling = computeWindowPace(history, 15, 60);
        if (rolling) {
          rollingPaceRef.current = rolling;
          setRollingPaceSecPerKm(rolling);
        }

        ingestDistance(stepMeters, timestamp, instantSpeedMps, acc);
      }
    },
    [computeWindowPace, ingestDistance]
  );

  // Timer 1s cập nhật thời gian và hỗ trợ mô phỏng GPS
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      if (isPausedRef.current) return;

      const nowMs = Date.now();
      const actualElapsed = getActualElapsedSeconds(nowMs);
      elapsedSecondsRef.current = actualElapsed;
      setElapsedSeconds(actualElapsed);

      if (gpsSimPaceRef.current && gpsSimPaceRef.current > 0) {
        const dtSimSec = lastSimTickMsRef.current ? (nowMs - lastSimTickMsRef.current) / 1000 : 1;
        lastSimTickMsRef.current = nowMs;
        const metersPerSec = 1000 / gpsSimPaceRef.current;
        const stepMeters = metersPerSec * dtSimSec;

        rollingPaceRef.current = gpsSimPaceRef.current;
        shortPace6sRef.current = gpsSimPaceRef.current;
        setRollingPaceSecPerKm(gpsSimPaceRef.current);

        ingestDistance(stepMeters, nowMs, metersPerSec, 5); // accuracy giả lập 5m
      } else {
        lastSimTickMsRef.current = nowMs;
        evaluatePtCoaching(nowMs, actualElapsed);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [evaluatePtCoaching, getActualElapsedSeconds, ingestDistance, isRunning]);

  // Bắt đầu buổi chạy
  const startRun = useCallback(async () => {
    setPermissionError(null);
    await audioCoach.initAudioSession();

    const fgPerm = await Location.requestForegroundPermissionsAsync();
    if (fgPerm.status !== 'granted') {
      setPermissionError('Cần cấp quyền Vị trí (Location) để tính toán Pace chạy bộ.');
      return;
    }

    const bgPerm = await Location.requestBackgroundPermissionsAsync();
    if (bgPerm.status !== 'granted') {
      setPermissionError(
        'Hãy chọn "Luôn luôn (Always)" trong Cài đặt Vị trí iOS để GPS hoạt động cả khi khóa màn hình.'
      );
    }

    const nowMs = Date.now();
    runStartTimeMsRef.current = nowMs;
    totalPausedMsRef.current = 0;
    pauseStartedMsRef.current = null;
    lastSimTickMsRef.current = nowMs;

    gpsHistoryRef.current = [];
    gpsAccuracyHistoryRef.current = [];
    hrHistoryRef.current = [];
    paceTrendSamplesRef.current = [];
    splitsHistoryRef.current = [];
    cadenceHistoryRef.current = [];
    alertsCountRef.current = 0;
    zoneTimeRef.current = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    totalDistanceRef.current = 0;
    elapsedSecondsRef.current = 0;
    segmentIndexRef.current = 0;
    segmentStartDistanceRef.current = 0;
    segmentStartTimeSecRef.current = 0;
    lastAnnouncedSplitIndexRef.current = 0;
    dangerHrStartMsRef.current = null;
    maxHrStartMsRef.current = null;
    segmentCeilingStartMsRef.current = null;
    lowSpeedStartMsRef.current = null;
    highSpeedStartMsRef.current = null;
    autoPauseStateRef.current = 'RUNNING';

    setTotalDistanceMeters(0);
    setElapsedSeconds(0);
    setRollingPaceSecPerKm(null);
    setAveragePaceSecPerKm(null);
    setCurrentSegmentIndex(0);
    setSegmentProgressMeters(0);
    setSegmentElapsedSeconds(0);
    setIsPaused(false);
    isPausedRef.current = false;
    isPlanCompletedRef.current = false;
    isInOpenRunRef.current = false;
    isWorkoutCompletedRef.current = false;
    announcedHalfwayRef.current = false;
    announced1KmLeftRef.current = false;
    announced500mLeftRef.current = false;
    setIsPlanCompleted(false);
    setIsInOpenRun(false);
    setIsRunEnded(false);
    setIsWalkingRecovery(false);
    isWalkingRecoveryRef.current = false;
    setCheckInState(null);
    lastCheckInTimeRef.current = 0;
    setIsRunning(true);
    isRunningRef.current = true;

    // Cảm biến Pedometer đo Cadence
    Pedometer.isAvailableAsync().then((avail) => {
      if (avail) {
        let lastStepCount = 0;
        let lastStepTime = Date.now();
        pedometerSubRef.current = Pedometer.watchStepCount((result) => {
          const now = Date.now();
          const dtMin = (now - lastStepTime) / 60000;
          if (dtMin >= 0.05) {
            const dSteps = result.steps - lastStepCount;
            if (dSteps > 0 && dtMin > 0) {
              const spm = Math.round(dSteps / dtMin);
              if (spm >= 120 && spm <= 220) {
                setCadenceSpm(spm);
                cadenceHistoryRef.current.push(spm);
              }
            }
            lastStepCount = result.steps;
            lastStepTime = now;
          }
        });
      }
    });

    backgroundListeners.add(handleLocationsUpdate);

    try {
      if (watchSubRef.current) watchSubRef.current.remove();
      watchSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1500,
          distanceInterval: 2,
        },
        (location) => handleLocationsUpdate([location])
      );
    } catch (fgErr: any) {
      setPermissionError(`Lỗi GPS: ${fgErr?.message || 'Chưa cấp quyền vị trí'}`);
    }

    if (bgPerm.status === 'granted') {
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (hasStarted) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 3,
          showsBackgroundLocationIndicator: true,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.Fitness,
        });
      } catch {
        // Bỏ qua
      }
    }

    if (workout.segments.length > 0) {
      audioCoach.announceSegmentTransition(workout.segments[0].voiceIntro);
    }
  }, [handleLocationsUpdate, workout.segments]);

  const togglePause = useCallback(() => {
    const nowMs = Date.now();
    const nextPaused = !isPausedRef.current;
    isPausedRef.current = nextPaused;
    setIsPaused(nextPaused);

    if (nextPaused) {
      pauseStartedMsRef.current = nowMs;
      audioCoach.speak('Đã tạm dừng.', 'INFO');
    } else {
      if (pauseStartedMsRef.current) {
        totalPausedMsRef.current += nowMs - pauseStartedMsRef.current;
        pauseStartedMsRef.current = null;
      }
      lastSimTickMsRef.current = nowMs;
      audioCoach.speak('Tiếp tục chạy.', 'INFO');
    }
  }, []);

  // Dừng bài chạy & Lưu trữ lịch sử buổi chạy
  const stopRun = useCallback(async () => {
    isWorkoutCompletedRef.current = true;
    isPlanCompletedRef.current = true;
    isInOpenRunRef.current = false;
    isRunningRef.current = false;
    isPausedRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setIsInOpenRun(false);
    setIsRunEnded(true);
    setIsWalkingRecovery(false);
    isWalkingRecoveryRef.current = false;
    setCheckInState(null);
    setGpsSimulatedPaceSec(null);

    backgroundListeners.delete(handleLocationsUpdate);
    if (watchSubRef.current) {
      watchSubRef.current.remove();
      watchSubRef.current = null;
    }
    if (pedometerSubRef.current) {
      pedometerSubRef.current.remove();
      pedometerSubRef.current = null;
    }

    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStarted) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {
      // Bỏ qua
    }

    await audioCoach.stopAll();
    await audioCoach.stopMetronome();
    setIsMetronomeOn(false);
    audioCoach.speak(AUDIO_SCRIPTS.WORKOUT_STOPPED, 'MILESTONE', 'good');

    // Lưu session vào StorageService
    const avgCadence = cadenceHistoryRef.current.length > 0
      ? Math.round(cadenceHistoryRef.current.reduce((a, b) => a + b, 0) / cadenceHistoryRef.current.length)
      : null;

    const totalDistM = totalDistanceRef.current;
    const elapsedSec = elapsedSecondsRef.current;
    const avgPace = totalDistM > 20 && elapsedSec > 0 ? Math.round((elapsedSec / totalDistM) * 1000) : 0;

    const sessionData: CompletedRunSession = {
      id: `run-${Date.now()}`,
      workoutId: workout.id,
      workoutTitle: workout.title,
      date: new Date().toLocaleDateString('vi-VN'),
      timestamp: Date.now(),
      totalDistanceMeters: totalDistM,
      elapsedSeconds: elapsedSec,
      averagePaceSecPerKm: avgPace,
      averageHrBpm: heartRateRef.current,
      maxHrBpm: heartRateRef.current,
      timeInZonesSeconds: zoneTimeRef.current,
      splits: splitsHistoryRef.current.map((s) => ({
        km: s.km,
        paceSecPerKm: s.paceSecPerKm,
        avgHrBpm: s.avgHrBpm || null,
        elapsedSeconds: s.elapsedSeconds,
      })),
      averageCadenceSpm: avgCadence,
      alertsFiredCount: alertsCountRef.current,
      rpeRating: 7, // Mặc định 7, có thể cập nhật trong màn hình tổng kết
      userNote: '',
      goalIdAtRun: currentGoalId,
    };

    await storageService.saveRunSession(sessionData);
  }, [currentGoalId, handleLocationsUpdate, workout.id, workout.title]);

  const toggleMetronome = useCallback(async () => {
    if (isMetronomeOn) {
      await audioCoach.stopMetronome();
      setIsMetronomeOn(false);
    } else {
      await audioCoach.startMetronome(metronomeBpm);
      setIsMetronomeOn(true);
    }
  }, [isMetronomeOn, metronomeBpm]);

  const changeMetronomeBpm = useCallback(async (bpm: number) => {
    setMetronomeBpm(bpm);
    await audioCoach.updateMetronomeBpm(bpm);
  }, []);

  return {
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
    totalSegments: workout.segments.length,
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
  };
}

import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { audioCoach } from '../services/audioCoach';

/**
 * Module 2 (Đồng bộ ngưỡng Lactate 175 bpm @ 7'41" & Format PT Zone-Pace-Tim-Action):
 * - Tính thời gian theo Date.now() chuẩn xác ngay cả khi khóa màn hình.
 * - Truyền đầy đủ Pace và Heart Rate hiện tại vào từng câu nhắc để đọc đúng cấu trúc:
 *   "Quá nhanh / Quá chậm / Quá ngưỡng, Zone X, Pace..., Tim..., [Action]!"
 */

export const BACKGROUND_LOCATION_TASK = 'SUB60_BACKGROUND_LOCATION_TASK';

export interface WorkoutSegment {
  id: string;
  name: string;
  type: 'warmup' | 'main' | 'interval_work' | 'interval_rest' | 'stride' | 'cooldown' | 'race_split';
  distanceMeters?: number;
  durationSeconds?: number;
  targetPaceMinSec: number;
  targetPaceMaxSec: number;
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
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
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

export function formatPaceDisplay(paceSecPerKm: number | null): string {
  if (!paceSecPerKm || !Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0 || paceSecPerKm > 1200) {
    return "--'--\"";
  }
  const mins = Math.floor(paceSecPerKm / 60);
  const secs = Math.round(paceSecPerKm % 60);
  const paddedSecs = secs < 10 ? `0${secs}` : `${secs}`;
  return `${mins}'${paddedSecs}"`;
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
  currentHeartRate: number | null,
  hardLimitHrBpm = 178
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
  const [splitIntervalMeters, setSplitIntervalMeters] = useState<SplitAnnouncementInterval>(500);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(172);
  const [isFallbackSub65Active, setIsFallbackSub65Active] = useState(false);
  const [isHrDangerActive, setIsHrDangerActive] = useState(false);
  const [paceZoneStatus, setPaceZoneStatus] = useState<'IN_ZONE' | 'TOO_FAST' | 'TOO_SLOW'>('IN_ZONE');
  const [gpsSimulatedPaceSec, setGpsSimulatedPaceSec] = useState<number | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const gpsHistoryRef = useRef<GpsSample[]>([]);
  const hrHistoryRef = useRef<HrSample[]>([]);
  const paceTrendSamplesRef = useRef<number[]>([]);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);

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

  const highHrStartMsRef = useRef<number | null>(null);
  const sprintSpikeStartMsRef = useRef<number | null>(null);
  const paceDeviationStartMsRef = useRef<number | null>(null);
  const lastDeviationDirectionRef = useRef<'TOO_FAST' | 'TOO_SLOW' | null>(null);
  const wasOutOfZoneRef = useRef<boolean>(false);
  const inZoneRecoveryStartMsRef = useRef<number | null>(null);
  const lastPaceDriftCheckSecRef = useRef<number>(0);

  const isPausedRef = useRef(false);
  const isRunningRef = useRef(false);
  const heartRateRef = useRef<number | null>(null);
  const rollingPaceRef = useRef<number | null>(null);
  const shortPace6sRef = useRef<number | null>(null);
  const isFallbackSub65Ref = useRef(false);
  const gpsSimPaceRef = useRef<number | null>(null);

  useEffect(() => {
    heartRateRef.current = currentHeartRate;
  }, [currentHeartRate]);

  useEffect(() => {
    isFallbackSub65Ref.current = isFallbackSub65Active;
  }, [isFallbackSub65Active]);

  useEffect(() => {
    gpsSimPaceRef.current = gpsSimulatedPaceSec;
  }, [gpsSimulatedPaceSec]);

  const currentSegment: WorkoutSegment =
    workout.segments[currentSegmentIndex] || workout.segments[workout.segments.length - 1];

  const getActiveTargetPaceRange = useCallback((seg: WorkoutSegment): { minSec: number; maxSec: number } => {
    if (isFallbackSub65Ref.current && (seg.type === 'main' || seg.type === 'race_split')) {
      return { minSec: 385, maxSec: 390 }; // Phương án dự phòng Sub 65 (6'25"-6'30")
    }
    return { minSec: seg.targetPaceMinSec, maxSec: seg.targetPaceMaxSec };
  }, []);

  const getActualElapsedSeconds = useCallback((nowMs: number): number => {
    if (!runStartTimeMsRef.current) return 0;
    const pausedMs =
      totalPausedMsRef.current +
      (pauseStartedMsRef.current ? nowMs - pauseStartedMsRef.current : 0);
    return Math.max(0, Math.floor((nowMs - runStartTimeMsRef.current - pausedMs) / 1000));
  }, []);

  const computeWindowPace = useCallback((samples: GpsSample[], windowSec: number, minMeters: number): number | null => {
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
  }, []);

  const evaluateSegmentProgression = useCallback(
    (currentTotalMeters: number, currentElapsedSec: number) => {
      const idx = segmentIndexRef.current;
      const seg = workout.segments[idx];
      if (!seg) return;

      const distInSeg = currentTotalMeters - segmentStartDistanceRef.current;
      const timeInSeg = currentElapsedSec - segmentStartTimeSecRef.current;

      setSegmentProgressMeters(Math.max(0, distInSeg));
      setSegmentElapsedSeconds(Math.max(0, timeInSeg));

      const isDistComplete =
        typeof seg.distanceMeters === 'number' && seg.distanceMeters > 0 && distInSeg >= seg.distanceMeters;
      const isTimeComplete =
        typeof seg.durationSeconds === 'number' && seg.durationSeconds > 0 && timeInSeg >= seg.durationSeconds;

      if (isDistComplete || isTimeComplete) {
        const nextIdx = idx + 1;
        if (nextIdx < workout.segments.length) {
          segmentIndexRef.current = nextIdx;
          segmentStartDistanceRef.current = currentTotalMeters;
          segmentStartTimeSecRef.current = currentElapsedSec;
          wasOutOfZoneRef.current = false;
          inZoneRecoveryStartMsRef.current = null;
          setCurrentSegmentIndex(nextIdx);
          setSegmentProgressMeters(0);
          setSegmentElapsedSeconds(0);

          const nextSeg = workout.segments[nextIdx];
          audioCoach.announceSegmentTransition(nextSeg.voiceIntro);
        } else {
          audioCoach.announceSegmentTransition(
            `Hoàn thành bài tập ${workout.title}. Đi bộ thả lỏng nhé.`
          );
        }
      }
    },
    [workout]
  );

  const evaluatePtCoaching = useCallback(
    (nowMs: number, currentElapsedSec: number) => {
      const activeSeg = workout.segments[segmentIndexRef.current];
      const hr = heartRateRef.current;
      const currentPaceForCue = rollingPaceRef.current || shortPace6sRef.current;

      // 1. GIÁM SÁT TIM MẠCH (Ngưỡng Lactate 175 bpm / Giới hạn đỏ 178 bpm)
      if (hr !== null) {
        const lastHr = hrHistoryRef.current[hrHistoryRef.current.length - 1];
        if (!lastHr || nowMs - lastHr.timestamp >= 900) {
          hrHistoryRef.current.push({ bpm: hr, timestamp: nowMs });
          if (hrHistoryRef.current.length > 14) {
            hrHistoryRef.current.shift();
          }
        }

        const dynamicHardLimit = audioCoach.getHardLimitHr();
        const dynamicEarlyWarn = audioCoach.getEarlyWarningHr();

        if (hr >= dynamicHardLimit) {
          if (!highHrStartMsRef.current) {
            highHrStartMsRef.current = nowMs;
          }
          if (nowMs - highHrStartMsRef.current >= 8000) {
            setIsHrDangerActive(true);
            wasOutOfZoneRef.current = true;
            inZoneRecoveryStartMsRef.current = null;
            audioCoach.announceCriticalHeartRate(hr, currentPaceForCue);
          }
        } else {
          highHrStartMsRef.current = null;
          setIsHrDangerActive(false);

          const hrSamples = hrHistoryRef.current;
          if (hrSamples.length >= 6 && activeSeg) {
            const oldest = hrSamples[0];
            const deltaHr = hr - oldest.bpm;
            // Linh hoạt theo ngưỡng Lactate đang cài (mặc định 175 => cảnh báo sớm từ 170)
            const isNearLactateLimit = hr >= dynamicEarlyWarn && deltaHr >= 4;
            const isApproachingSegCeiling = hr >= activeSeg.maxHrBpm - 5 && deltaHr >= 5;

            if (isNearLactateLimit || isApproachingSegCeiling) {
              wasOutOfZoneRef.current = true;
              inZoneRecoveryStartMsRef.current = null;
              audioCoach.announceHrRisingTrend(hr, currentPaceForCue, isNearLactateLimit);
            }
          }
        }
      }

      // 2. GIÁM SÁT XU HƯỚNG PACE & XÁC NHẬN SỬA ĐÚNG
      if (activeSeg && activeSeg.type !== 'interval_rest') {
        const { minSec, maxSec } = getActiveTargetPaceRange(activeSeg);
        const fast6s = shortPace6sRef.current;
        const rolling = rollingPaceRef.current;

        if (fast6s && fast6s < minSec - 15) {
          if (!sprintSpikeStartMsRef.current) {
            sprintSpikeStartMsRef.current = nowMs;
          }
          if (nowMs - sprintSpikeStartMsRef.current >= 5000) {
            wasOutOfZoneRef.current = true;
            inZoneRecoveryStartMsRef.current = null;
            audioCoach.announcePaceTrend('SPIKE_FAST', fast6s, hr);
            sprintSpikeStartMsRef.current = null;
          }
        } else {
          sprintSpikeStartMsRef.current = null;
        }

        if (rolling && currentElapsedSec - lastPaceDriftCheckSecRef.current >= 3) {
          lastPaceDriftCheckSecRef.current = currentElapsedSec;
          paceTrendSamplesRef.current.push(rolling);
          if (paceTrendSamplesRef.current.length > 4) {
            paceTrendSamplesRef.current.shift();
          }
          const pts = paceTrendSamplesRef.current;
          if (pts.length === 4) {
            const isDriftingSlower =
              pts[1] > pts[0] + 3 && pts[2] > pts[1] + 3 && pts[3] > maxSec - 4;
            if (isDriftingSlower) {
              wasOutOfZoneRef.current = true;
              inZoneRecoveryStartMsRef.current = null;
              audioCoach.announcePaceTrend('DRIFT_SLOW', rolling, hr);
              paceTrendSamplesRef.current = [];
            }
          }
        }

        if (rolling) {
          if (rolling < minSec - 10) {
            setPaceZoneStatus('TOO_FAST');
            inZoneRecoveryStartMsRef.current = null;
            if (lastDeviationDirectionRef.current !== 'TOO_FAST') {
              lastDeviationDirectionRef.current = 'TOO_FAST';
              paceDeviationStartMsRef.current = nowMs;
            }
            if (paceDeviationStartMsRef.current && nowMs - paceDeviationStartMsRef.current >= 10000) {
              wasOutOfZoneRef.current = true;
              audioCoach.announcePaceDeviation('TOO_FAST', rolling, hr, minSec, maxSec);
              paceDeviationStartMsRef.current = nowMs;
            }
          } else if (rolling > maxSec + 10) {
            setPaceZoneStatus('TOO_SLOW');
            inZoneRecoveryStartMsRef.current = null;
            if (lastDeviationDirectionRef.current !== 'TOO_SLOW') {
              lastDeviationDirectionRef.current = 'TOO_SLOW';
              paceDeviationStartMsRef.current = nowMs;
            }
            if (paceDeviationStartMsRef.current && nowMs - paceDeviationStartMsRef.current >= 10000) {
              wasOutOfZoneRef.current = true;
              audioCoach.announcePaceDeviation('TOO_SLOW', rolling, hr, minSec, maxSec);
              paceDeviationStartMsRef.current = nowMs;
            }
          } else {
            setPaceZoneStatus('IN_ZONE');
            lastDeviationDirectionRef.current = null;
            paceDeviationStartMsRef.current = null;

            if (wasOutOfZoneRef.current && (!hr || hr < activeSeg.maxHrBpm)) {
              if (!inZoneRecoveryStartMsRef.current) {
                inZoneRecoveryStartMsRef.current = nowMs;
              } else if (nowMs - inZoneRecoveryStartMsRef.current >= 5000) {
                wasOutOfZoneRef.current = false;
                inZoneRecoveryStartMsRef.current = null;
                audioCoach.announceBackInZone(rolling, hr);
              }
            }
          }
        }
      }
    },
    [getActiveTargetPaceRange, hardLimitHrBpm, workout]
  );

  const handleLocationsUpdate = useCallback(
    (locations: Location.LocationObject[]) => {
      if (!isRunningRef.current || isPausedRef.current) return;

      const nowMs = Date.now();
      const actualElapsed = getActualElapsedSeconds(nowMs);
      elapsedSecondsRef.current = actualElapsed;
      setElapsedSeconds(actualElapsed);

      for (const loc of locations) {
        const { latitude, longitude, accuracy } = loc.coords;
        const timestamp = loc.timestamp || nowMs;

        if (accuracy !== null && accuracy > 50) {
          continue;
        }

        const history = gpsHistoryRef.current;
        if (history.length === 0) {
          history.push({
            latitude,
            longitude,
            timestamp,
            cumulativeDistanceM: totalDistanceRef.current,
          });
          continue;
        }

        const prev = history[history.length - 1];
        if (timestamp <= prev.timestamp) {
          continue;
        }

        const dtSec = (timestamp - prev.timestamp) / 1000;
        if (dtSec <= 0.4) continue;

        const stepMeters = calculateHaversineMeters(
          prev.latitude,
          prev.longitude,
          latitude,
          longitude
        );

        const instantSpeedMps = stepMeters / dtSec;
        if (stepMeters < 1.2 || instantSpeedMps > 7.5) {
          continue;
        }

        const newTotalMeters = totalDistanceRef.current + stepMeters;
        totalDistanceRef.current = newTotalMeters;
        setTotalDistanceMeters(newTotalMeters);

        history.push({
          latitude,
          longitude,
          timestamp,
          cumulativeDistanceM: newTotalMeters,
        });

        if (history.length > 40) {
          history.shift();
        }

        const short6s = computeWindowPace(history, 6, 25);
        if (short6s) shortPace6sRef.current = short6s;

        const rolling = computeWindowPace(history, 16, 80);
        if (rolling) {
          rollingPaceRef.current = rolling;
          setRollingPaceSecPerKm(rolling);
        }

        if (actualElapsed > 8 && newTotalMeters > 20) {
          setAveragePaceSecPerKm(Math.round((actualElapsed / newTotalMeters) * 1000));
        }

        const currentSplitIndex = Math.floor(newTotalMeters / splitIntervalMeters);
        if (currentSplitIndex > lastAnnouncedSplitIndexRef.current && currentSplitIndex > 0) {
          lastAnnouncedSplitIndexRef.current = currentSplitIndex;
          const milestoneKm = (currentSplitIndex * splitIntervalMeters) / 1000;
          const currentAvgPace =
            actualElapsed > 0
              ? Math.round((actualElapsed / newTotalMeters) * 1000)
              : rolling || 461;
          audioCoach.announceDistanceMilestone(milestoneKm, currentAvgPace, heartRateRef.current);
        }

        evaluateSegmentProgression(newTotalMeters, actualElapsed);
      }

      evaluatePtCoaching(nowMs, actualElapsed);
    },
    [
      computeWindowPace,
      evaluatePtCoaching,
      evaluateSegmentProgression,
      getActualElapsedSeconds,
      splitIntervalMeters,
    ]
  );

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
        const newTotal = totalDistanceRef.current + metersPerSec * dtSimSec;
        totalDistanceRef.current = newTotal;
        setTotalDistanceMeters(newTotal);
        rollingPaceRef.current = gpsSimPaceRef.current;
        shortPace6sRef.current = gpsSimPaceRef.current;
        setRollingPaceSecPerKm(gpsSimPaceRef.current);

        const avg = Math.round((actualElapsed / newTotal) * 1000);
        setAveragePaceSecPerKm(avg);

        const currentSplitIndex = Math.floor(newTotal / splitIntervalMeters);
        if (currentSplitIndex > lastAnnouncedSplitIndexRef.current && currentSplitIndex > 0) {
          lastAnnouncedSplitIndexRef.current = currentSplitIndex;
          const milestoneKm = (currentSplitIndex * splitIntervalMeters) / 1000;
          audioCoach.announceDistanceMilestone(milestoneKm, avg, heartRateRef.current);
        }
      } else {
        lastSimTickMsRef.current = nowMs;
      }

      evaluateSegmentProgression(totalDistanceRef.current, actualElapsed);
      evaluatePtCoaching(nowMs, actualElapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [
    isRunning,
    splitIntervalMeters,
    getActualElapsedSeconds,
    evaluateSegmentProgression,
    evaluatePtCoaching,
  ]);

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
    hrHistoryRef.current = [];
    paceTrendSamplesRef.current = [];
    totalDistanceRef.current = 0;
    elapsedSecondsRef.current = 0;
    segmentIndexRef.current = 0;
    segmentStartDistanceRef.current = 0;
    segmentStartTimeSecRef.current = 0;
    lastAnnouncedSplitIndexRef.current = 0;
    highHrStartMsRef.current = null;
    sprintSpikeStartMsRef.current = null;
    paceDeviationStartMsRef.current = null;
    lastDeviationDirectionRef.current = null;
    wasOutOfZoneRef.current = false;
    inZoneRecoveryStartMsRef.current = null;
    lastPaceDriftCheckSecRef.current = 0;

    setTotalDistanceMeters(0);
    setElapsedSeconds(0);
    setRollingPaceSecPerKm(null);
    setAveragePaceSecPerKm(null);
    setCurrentSegmentIndex(0);
    setSegmentProgressMeters(0);
    setSegmentElapsedSeconds(0);
    setIsPaused(false);
    isPausedRef.current = false;
    setIsRunning(true);
    isRunningRef.current = true;

    backgroundListeners.add(handleLocationsUpdate);

    try {
      if (watchSubRef.current) {
        watchSubRef.current.remove();
      }
      watchSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1500,
          distanceInterval: 2,
        },
        (location) => {
          handleLocationsUpdate([location]);
        }
      );
    } catch (fgErr: any) {
      setPermissionError(`Lỗi GPS: ${fgErr?.message || 'Chưa cấp quyền vị trí'}`);
    }

    if (bgPerm.status === 'granted') {
      try {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        if (hasStarted) {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }

        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 3,
          showsBackgroundLocationIndicator: true,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.Fitness,
        });
      } catch {
        // Vẫn chạy mượt với watchPositionAsync khi mở app
      }
    }

    if (workout.segments.length > 0) {
      audioCoach.announceSegmentTransition(workout.segments[0].voiceIntro);
    }
  }, [handleLocationsUpdate, workout]);

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

  const stopRun = useCallback(async () => {
    isRunningRef.current = false;
    isPausedRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setGpsSimulatedPaceSec(null);

    backgroundListeners.delete(handleLocationsUpdate);
    if (watchSubRef.current) {
      watchSubRef.current.remove();
      watchSubRef.current = null;
    }

    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {
      // Bỏ qua
    }

    await audioCoach.stopMetronome();
    setIsMetronomeOn(false);
    audioCoach.speak('Kết thúc buổi chạy. Dữ liệu chính thức sẽ đồng bộ từ đồng hồ.', 'INFO', 'good');
  }, [handleLocationsUpdate]);

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

  const toggleFallbackSub65 = useCallback(() => {
    setIsFallbackSub65Active((prev) => {
      const next = !prev;
      audioCoach.speak(
        next ? 'Chuyển sang mục tiêu an toàn Sub 65.' : 'Quay lại mục tiêu chính Sub 60.',
        'MILESTONE',
        'good'
      );
      return next;
    });
  }, []);

  return {
    isRunning,
    isPaused,
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
  };
}
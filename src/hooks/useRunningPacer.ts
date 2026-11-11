import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { audioCoach } from '../services/audioCoach';

/**
 * Module 2: Background GPS, Rolling Pace & Workout Segment State Machine
 * - Xin quyền GPS chạy nền (Always) để không bị ngắt khi khóa màn hình iPhone bỏ vào túi chạy.
 * - Tính toán Rolling Pace (Trung bình trượt trên cửa sổ 20 giây hoặc 90m gần nhất) để loại bỏ nhiễu GPS.
 * - Tự động chuyển chặng bài tập (Warm-up -> Main Set / Interval / Tempo -> Cool-down).
 * - Giám sát liên tục 2 điều kiện an toàn:
 *   1) HR >= 178 bpm kéo dài quá 30 giây => Cảnh báo đỏ ưu tiên cao nhất.
 *   2) Rolling Pace lệch khỏi mục tiêu chặng > ±10 giây/km liên tục 20 giây => Nhắc điều chỉnh tốc độ (Cooldown 45s).
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

type LocationListener = (locations: Location.LocationObject[]) => void;
const backgroundListeners = new Set<LocationListener>();

/**
 * Định nghĩa TaskManager ở top-level scope theo yêu cầu bắt buộc của Expo Location trên iOS
 */
if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
    if (error) {
      return;
    }
    const payload = data as { locations?: Location.LocationObject[] } | undefined;
    if (payload?.locations && payload.locations.length > 0) {
      backgroundListeners.forEach((listener) => listener(payload.locations!));
    }
  });
}

/**
 * Công thức Haversine tính khoảng cách (mét) giữa 2 tọa độ GPS
 */
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
  const [splitIntervalMeters, setSplitIntervalMeters] = useState<SplitAnnouncementInterval>(1000);
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(172);
  const [isFallbackSub65Active, setIsFallbackSub65Active] = useState(false);
  const [isHrDangerActive, setIsHrDangerActive] = useState(false);
  const [paceZoneStatus, setPaceZoneStatus] = useState<'IN_ZONE' | 'TOO_FAST' | 'TOO_SLOW'>('IN_ZONE');
  const [gpsSimulatedPaceSec, setGpsSimulatedPaceSec] = useState<number | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Refs dùng trong vòng lặp 1 giây và callback GPS chạy nền
  const gpsHistoryRef = useRef<GpsSample[]>([]);
  const totalDistanceRef = useRef(0);
  const elapsedSecondsRef = useRef(0);
  const segmentIndexRef = useRef(0);
  const segmentStartDistanceRef = useRef(0);
  const segmentStartTimeRef = useRef(0);
  const lastAnnouncedSplitIndexRef = useRef(0);
  const highHrDurationSecRef = useRef(0);
  const paceDeviationDurationSecRef = useRef(0);
  const lastDeviationDirectionRef = useRef<'TOO_FAST' | 'TOO_SLOW' | null>(null);
  const isPausedRef = useRef(false);
  const isRunningRef = useRef(false);
  const heartRateRef = useRef<number | null>(null);
  const rollingPaceRef = useRef<number | null>(null);
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

  /**
   * Lấy khoảng Pace mục tiêu của chặng hiện tại (hỗ trợ nút chuyển nhanh sang Phương án dự phòng Sub 65: 6'25"-6'30"/km)
   */
  const getActiveTargetPaceRange = useCallback((seg: WorkoutSegment): { minSec: number; maxSec: number } => {
    if (isFallbackSub65Ref.current && (seg.type === 'main' || seg.type === 'race_split')) {
      return { minSec: 385, maxSec: 390 }; // 6'25" - 6'30"/km
    }
    return { minSec: seg.targetPaceMinSec, maxSec: seg.targetPaceMaxSec };
  }, []);

  /**
   * Thuật toán tính Rolling Pace (Trung bình trượt cửa sổ 20 giây hoặc 90 mét gần nhất)
   * Loại bỏ hoàn toàn hiện tượng GPS tức thời nhảy giật cục.
   */
  const computeRollingPace = useCallback((samples: GpsSample[]): number | null => {
    if (samples.length < 2) return null;
    const latest = samples[samples.length - 1];

    // Tìm điểm neo cách hiện tại khoảng 18-20 giây hoặc tối소 80-90 mét
    let anchor = samples[0];
    for (let i = samples.length - 2; i >= 0; i--) {
      const candidate = samples[i];
      const dtSec = (latest.timestamp - candidate.timestamp) / 1000;
      const dMeters = latest.cumulativeDistanceM - candidate.cumulativeDistanceM;
      anchor = candidate;
      if (dtSec >= 18 || dMeters >= 90) {
        break;
      }
    }

    const deltaMeters = latest.cumulativeDistanceM - anchor.cumulativeDistanceM;
    const deltaSeconds = (latest.timestamp - anchor.timestamp) / 1000;

    if (deltaMeters < 12 || deltaSeconds < 4) {
      return null;
    }

    const paceSecPerKm = (deltaSeconds / deltaMeters) * 1000;
    return Math.round(paceSecPerKm);
  }, []);

  /**
   * Kiểm tra và chuyển chặng tự động (Warm-up -> Main Set / Interval -> Cool-down)
   */
  const evaluateSegmentProgression = useCallback(
    (currentTotalMeters: number, currentElapsedSec: number) => {
      const idx = segmentIndexRef.current;
      const seg = workout.segments[idx];
      if (!seg) return;

      const distInSeg = currentTotalMeters - segmentStartDistanceRef.current;
      const timeInSeg = currentElapsedSec - segmentStartTimeRef.current;

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
          segmentStartTimeRef.current = currentElapsedSec;
          setCurrentSegmentIndex(nextIdx);
          setSegmentProgressMeters(0);
          setSegmentElapsedSeconds(0);

          const nextSeg = workout.segments[nextIdx];
          audioCoach.announceSegmentTransition(nextSeg.voiceIntro);
        } else {
          // Hoàn thành toàn bộ các chặng trong giáo án buổi chạy
          audioCoach.announceSegmentTransition(
            `Chúc mừng bạn đã hoàn thành trọn vẹn bài tập ${workout.title}. Hãy đi bộ thả lỏng và giãn cơ.`
          );
        }
      }
    },
    [workout]
  );

  /**
   * Xử lý tọa độ GPS mới nhận từ Background Location Task
   */
  const handleLocationsUpdate = useCallback(
    (locations: Location.LocationObject[]) => {
      if (!isRunningRef.current || isPausedRef.current) return;

      for (const loc of locations) {
        const { latitude, longitude, accuracy } = loc.coords;
        const timestamp = loc.timestamp || Date.now();

        // Lọc bỏ các điểm GPS nhiễu có sai số ngang > 25m
        if (accuracy !== null && accuracy > 25) {
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
        const dtSec = (timestamp - prev.timestamp) / 1000;
        if (dtSec <= 0.4) continue;

        const stepMeters = calculateHaversineMeters(
          prev.latitude,
          prev.longitude,
          latitude,
          longitude
        );

        // Chống nhảy tọa độ ảo khi đứng yên (< 1.2m) hoặc nhảy vọt bất khả thi (> 7.5 m/s ~ pace 2'13"/km)
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

        // Giữ tối đa 40 mẫu gần nhất trong bộ đệm
        if (history.length > 40) {
          history.shift();
        }

        const rolling = computeRollingPace(history);
        if (rolling) {
          rollingPaceRef.current = rolling;
          setRollingPaceSecPerKm(rolling);
        }

        if (elapsedSecondsRef.current > 10 && newTotalMeters > 30) {
          const avg = Math.round((elapsedSecondsRef.current / newTotalMeters) * 1000);
          setAveragePaceSecPerKm(avg);
        }

        // Kiểm tra cột mốc đọc định kỳ mỗi 500m hoặc 1000m
        const currentSplitIndex = Math.floor(newTotalMeters / splitIntervalMeters);
        if (currentSplitIndex > lastAnnouncedSplitIndexRef.current && currentSplitIndex > 0) {
          lastAnnouncedSplitIndexRef.current = currentSplitIndex;
          const milestoneKm = (currentSplitIndex * splitIntervalMeters) / 1000;
          const currentAvgPace =
            elapsedSecondsRef.current > 0
              ? Math.round((elapsedSecondsRef.current / newTotalMeters) * 1000)
              : rolling || 360;
          audioCoach.announceDistanceMilestone(milestoneKm, currentAvgPace, heartRateRef.current);
        }

        evaluateSegmentProgression(newTotalMeters, elapsedSecondsRef.current);
      }
    },
    [computeRollingPace, evaluateSegmentProgression, splitIntervalMeters]
  );

  /**
   * Vòng lặp đồng hồ 1 giây:
   * - Cập nhật thời gian chạy & mô phỏng GPS (nếu bật chế độ Test trong nhà)
   * - Kiểm tra Ngưỡng an toàn tim mạch (HR >= 178 bpm liên tục 30 giây)
   * - Kiểm tra Độ lệch Rolling Pace (±10s/km liên tục 20 giây)
   */
  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      if (isPausedRef.current) return;

      const nextElapsed = elapsedSecondsRef.current + 1;
      elapsedSecondsRef.current = nextElapsed;
      setElapsedSeconds(nextElapsed);

      // Nếu đang bật chế độ giả lập Pace (để test tai nghe trong nhà trên Windows/iPhone)
      if (gpsSimPaceRef.current && gpsSimPaceRef.current > 0) {
        const metersPerSec = 1000 / gpsSimPaceRef.current;
        const newTotal = totalDistanceRef.current + metersPerSec;
        totalDistanceRef.current = newTotal;
        setTotalDistanceMeters(newTotal);
        rollingPaceRef.current = gpsSimPaceRef.current;
        setRollingPaceSecPerKm(gpsSimPaceRef.current);

        const avg = Math.round((nextElapsed / newTotal) * 1000);
        setAveragePaceSecPerKm(avg);

        const currentSplitIndex = Math.floor(newTotal / splitIntervalMeters);
        if (currentSplitIndex > lastAnnouncedSplitIndexRef.current && currentSplitIndex > 0) {
          lastAnnouncedSplitIndexRef.current = currentSplitIndex;
          const milestoneKm = (currentSplitIndex * splitIntervalMeters) / 1000;
          audioCoach.announceDistanceMilestone(milestoneKm, avg, heartRateRef.current);
        }
      }

      evaluateSegmentProgression(totalDistanceRef.current, nextElapsed);

      // 1. KIỂM TRA CẢNH BÁO ĐỎ TIM MẠCH (Hard Limit: HR >= 178 bpm kéo dài >= 30 giây)
      const hr = heartRateRef.current;
      if (hr !== null && hr >= hardLimitHrBpm) {
        highHrDurationSecRef.current += 1;
        if (highHrDurationSecRef.current >= 30) {
          setIsHrDangerActive(true);
          audioCoach.announceCriticalHeartRate(hr);
        }
      } else {
        highHrDurationSecRef.current = 0;
        setIsHrDangerActive(false);
      }

      // 2. KIỂM TRA CẢNH BÁO LỆCH PACE (> ±10 giây/km liên tục trong 20 giây)
      const activeSeg = workout.segments[segmentIndexRef.current];
      const rolling = rollingPaceRef.current;

      if (activeSeg && rolling && activeSeg.type !== 'interval_rest') {
        const { minSec, maxSec } = getActiveTargetPaceRange(activeSeg);
        const fastThreshold = minSec - 10; // Nhanh hơn mục tiêu quá 10 giây/km
        const slowThreshold = maxSec + 10; // Chậm hơn mục tiêu quá 10 giây/km

        if (rolling < fastThreshold) {
          setPaceZoneStatus('TOO_FAST');
          if (lastDeviationDirectionRef.current === 'TOO_FAST') {
            paceDeviationDurationSecRef.current += 1;
          } else {
            lastDeviationDirectionRef.current = 'TOO_FAST';
            paceDeviationDurationSecRef.current = 1;
          }

          if (paceDeviationDurationSecRef.current >= 20) {
            audioCoach.announcePaceDeviation('TOO_FAST', rolling, minSec, maxSec);
            paceDeviationDurationSecRef.current = 0;
          }
        } else if (rolling > slowThreshold) {
          setPaceZoneStatus('TOO_SLOW');
          if (lastDeviationDirectionRef.current === 'TOO_SLOW') {
            paceDeviationDurationSecRef.current += 1;
          } else {
            lastDeviationDirectionRef.current = 'TOO_SLOW';
            paceDeviationDurationSecRef.current = 1;
          }

          if (paceDeviationDurationSecRef.current >= 20) {
            audioCoach.announcePaceDeviation('TOO_SLOW', rolling, minSec, maxSec);
            paceDeviationDurationSecRef.current = 0;
          }
        } else {
          setPaceZoneStatus('IN_ZONE');
          lastDeviationDirectionRef.current = null;
          paceDeviationDurationSecRef.current = 0;
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [
    isRunning,
    hardLimitHrBpm,
    workout,
    splitIntervalMeters,
    evaluateSegmentProgression,
    getActiveTargetPaceRange,
  ]);

  /**
   * Bắt đầu buổi chạy: Xin quyền Location Always & khởi chạy Background Location Updates
   */
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
        'Hãy chọn "Luôn luôn (Always)" trong Cài đặt Vị trí iOS để GPS không bị ngắt khi khóa màn hình.'
      );
    }

    // Reset các bộ đếm cho buổi chạy mới
    gpsHistoryRef.current = [];
    totalDistanceRef.current = 0;
    elapsedSecondsRef.current = 0;
    segmentIndexRef.current = 0;
    segmentStartDistanceRef.current = 0;
    segmentStartTimeRef.current = 0;
    lastAnnouncedSplitIndexRef.current = 0;
    highHrDurationSecRef.current = 0;
    paceDeviationDurationSecRef.current = 0;

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
      // Nếu chạy trong môi trường mô phỏng hoặc chưa build native, vẫn cho phép test qua GPS Simulator
    }

    if (workout.segments.length > 0) {
      audioCoach.announceSegmentTransition(workout.segments[0].voiceIntro);
    }
  }, [handleLocationsUpdate, workout]);

  const togglePause = useCallback(() => {
    const nextPaused = !isPausedRef.current;
    isPausedRef.current = nextPaused;
    setIsPaused(nextPaused);
    audioCoach.speak(
      nextPaused ? 'Đã tạm dừng bài chạy.' : 'Tiếp tục bài chạy.',
      'INFO'
    );
  }, []);

  const stopRun = useCallback(async () => {
    isRunningRef.current = false;
    isPausedRef.current = false;
    setIsRunning(false);
    setIsPaused(false);
    setGpsSimulatedPaceSec(null);

    backgroundListeners.delete(handleLocationsUpdate);

    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch {
      // Bỏ qua lỗi khi dừng task
    }

    await audioCoach.stopMetronome();
    setIsMetronomeOn(false);
    audioCoach.speak('Kết thúc buổi chạy. Dữ liệu chính thức sẽ được đồng bộ từ đồng hồ Huawei của bạn.', 'INFO');
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
        next
          ? 'Đã chuyển sang phương án an toàn Sub sáu mươi lăm phút, pace mục tiêu sáu phút hai mươi lăm đến sáu phút ba mươi giây.'
          : 'Đã quay lại mục tiêu chính Sub sáu mươi phút.',
        'MILESTONE'
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

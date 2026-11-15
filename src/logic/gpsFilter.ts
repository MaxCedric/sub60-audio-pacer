/**
 * Logic thuần: Lọc GPS, Thời gian ân hạn, Tự động Tạm dừng & Đánh giá dung sai Pace
 * Hoàn toàn không phụ thuộc React / Expo.
 */

import { COACH_CONFIG } from '../config/coachConfig';

export interface GpsAccuracySample {
  accuracyMeters: number;
  timestamp: number;
}

/**
 * Kiểm tra xem tín hiệu GPS có đủ tin cậy (trung bình 10s gần nhất <= 20m) không
 */
export function isGpsAccuracyReliable(
  samples: GpsAccuracySample[],
  nowMs: number,
  maxAccuracyMeters: number = COACH_CONFIG.pacer.maxGpsAccuracyMeters
): { isReliable: boolean; averageAccuracyMeters: number } {
  if (samples.length === 0) {
    return { isReliable: false, averageAccuracyMeters: 999 };
  }

  // Lọc các mẫu trong 10 giây gần nhất
  const recentSamples = samples.filter((s) => nowMs - s.timestamp <= 10000);
  if (recentSamples.length === 0) {
    const latest = samples[samples.length - 1];
    return {
      isReliable: latest.accuracyMeters <= maxAccuracyMeters,
      averageAccuracyMeters: latest.accuracyMeters,
    };
  }

  const sum = recentSamples.reduce((acc, s) => acc + s.accuracyMeters, 0);
  const avg = sum / recentSamples.length;

  return {
    isReliable: avg <= maxAccuracyMeters,
    averageAccuracyMeters: Math.round(avg * 10) / 10,
  };
}

/**
 * Kiểm tra thời gian ân hạn đầu đoạn (20 giây hoặc 100 mét đầu)
 * Trong thời gian này tuyệt đối không phát cảnh báo pace.
 */
export function isInSegmentGracePeriod(
  segmentElapsedSeconds: number,
  segmentProgressMeters: number,
  graceSeconds: number = COACH_CONFIG.pacer.gracePeriodSeconds,
  graceMeters: number = COACH_CONFIG.pacer.gracePeriodMeters
): boolean {
  return segmentElapsedSeconds < graceSeconds || segmentProgressMeters < graceMeters;
}

export type AutoPauseState = 'RUNNING' | 'PAUSED';

/**
 * Đánh giá trạng thái tự động tạm dừng (Auto-pause) / tiếp tục (Auto-resume):
 * - Tốc độ < 1.0 m/s liên tục 6 giây => Tạm dừng
 * - Tốc độ > 1.8 m/s liên tục 3 giây => Tiếp tục
 * - Không áp dụng khi đang nghỉ interval (interval_rest)
 */
export function evaluateAutoPause(
  currentSpeedMps: number,
  currentState: AutoPauseState,
  lowSpeedDurationSec: number,
  highSpeedDurationSec: number,
  isIntervalRest: boolean = false
): {
  nextState: AutoPauseState;
  shouldTriggerPause: boolean;
  shouldTriggerResume: boolean;
} {
  if (isIntervalRest) {
    return { nextState: currentState, shouldTriggerPause: false, shouldTriggerResume: false };
  }

  if (currentState === 'RUNNING') {
    if (currentSpeedMps < COACH_CONFIG.pacer.autoPauseMinSpeedMps) {
      if (lowSpeedDurationSec >= COACH_CONFIG.pacer.autoPauseSustainedSeconds) {
        return { nextState: 'PAUSED', shouldTriggerPause: true, shouldTriggerResume: false };
      }
    }
  } else if (currentState === 'PAUSED') {
    if (currentSpeedMps > COACH_CONFIG.pacer.autoResumeMinSpeedMps) {
      if (highSpeedDurationSec >= COACH_CONFIG.pacer.autoResumeSustainedSeconds) {
        return { nextState: 'RUNNING', shouldTriggerPause: false, shouldTriggerResume: true };
      }
    }
  }

  return { nextState: currentState, shouldTriggerPause: false, shouldTriggerResume: false };
}

export type PaceDeviationStatus = 'IN_ZONE' | 'TOO_FAST' | 'TOO_SLOW';

/**
 * Đánh giá sai lệch Pace áp dụng dung sai:
 * - Chạy đều: dung sai +-12 s/km ngoài dải mục tiêu
 * - Interval: đánh giá theo pace trung bình tổ hiện tại
 */
export function evaluatePaceDeviationWithTolerance(
  currentPaceSec: number | null,
  targetMinSec: number,
  targetMaxSec: number,
  toleranceSec: number = COACH_CONFIG.pacer.steadyPaceToleranceSec
): PaceDeviationStatus {
  if (!currentPaceSec || currentPaceSec <= 0) {
    return 'IN_ZONE';
  }

  // Quá nhanh: vượt quá targetMinSec trừ dung sai 12s
  if (currentPaceSec < targetMinSec - toleranceSec) {
    return 'TOO_FAST';
  }

  // Quá chậm: vượt quá targetMaxSec cộng dung sai 12s
  if (currentPaceSec > targetMaxSec + toleranceSec) {
    return 'TOO_SLOW';
  }

  return 'IN_ZONE';
}

/**
 * Điều kiện kích hoạt Check-in "bạn ổn không":
 * - GPS tin cậy (<= 20m)
 * - Chậm hơn dải >= 30 s/km liên tục trong 30s
 * - Không kích hoạt trong 2 phút đầu buổi chạy
 */
export function shouldTriggerPtCheckIn(
  isGpsReliable: boolean,
  totalElapsedSeconds: number,
  currentPaceSec: number | null,
  targetMaxSec: number,
  slowDriftSustainedSeconds: number
): boolean {
  if (!isGpsReliable) return false;
  if (totalElapsedSeconds < COACH_CONFIG.pacer.checkInMinRunElapsedSeconds) return false;
  if (!currentPaceSec) return false;

  const isSignificantlySlow = currentPaceSec >= targetMaxSec + COACH_CONFIG.pacer.checkInPaceDriftToleranceSec;
  return isSignificantlySlow && slowDriftSustainedSeconds >= COACH_CONFIG.pacer.checkInPaceDriftSustainedSec;
}

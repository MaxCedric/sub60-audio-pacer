/**
 * Logic thuần: Hồ sơ VĐV, Các bậc mục tiêu (Goals) & Đánh giá Checkpoint
 * Hoàn toàn không phụ thuộc React / Expo.
 */

export type GoalId = 'sub60' | 'sub65' | 'under70';

export interface GoalTier {
  id: GoalId;
  name: string;
  targetTimeStr: string;
  targetPaceMinSec: number;
  targetPaceMaxSec: number;
  description: string;
}

export const GOAL_TIERS: Record<GoalId, GoalTier> = {
  sub60: {
    id: 'sub60',
    name: 'Sub 60',
    targetTimeStr: '59:59',
    targetPaceMinSec: 355,
    targetPaceMaxSec: 360,
    description: 'Pace 5\'55"–6\'00"/km (Mục tiêu chính)',
  },
  sub65: {
    id: 'sub65',
    name: 'Sub 65',
    targetTimeStr: '1:04:59',
    targetPaceMinSec: 385,
    targetPaceMaxSec: 390,
    description: 'Pace 6\'25"–6\'30"/km (Phương án an toàn 1)',
  },
  under70: {
    id: 'under70',
    name: 'Dưới 70 phút',
    targetTimeStr: '1:09:59',
    targetPaceMinSec: 415,
    targetPaceMaxSec: 420,
    description: 'Pace 6\'55"–7\'00"/km (Phương án an toàn 2)',
  },
};

export interface AthleteProfile {
  name: string;
  baselineDate: string;
  raceDate: string;
  raceDistanceKm: number;
  weightKg: number;
  vo2Max: number;
  runningAbilityIndex: number; // RAI: 26.3
  lactateThresholdHrBpm: number; // 176 bpm
  lactateThresholdPaceSecPerKm: number; // 451 s/km (7'31"/km)
  maxHrBpm: number; // 195 bpm
  dangerHrBpm: number; // 190 bpm
  dangerSustainedSeconds: number; // 30s
  bloodPressureBaseline: string; // 128/88 mmHg
  fastest3kSec: number; // 1268 s (21:08)
  pr5kTime: string; // 35:44
  fastestKmPaceSec: number; // 377 s (6'17")
  longestRunKm: number; // 9.15 km
  recentWeeklyVolumeKm: number; // 3.5 km
  weeklySchedule: {
    tuesday: string; // Cầu lông (Cross-training)
    thursday: string; // Chạy
    saturday: string; // Chạy dài
    sunday: string; // Easy tùy chọn
  };
  selectedGoalId: GoalId;
}

export const DEFAULT_ATHLETE_PROFILE: AthleteProfile = {
  name: 'Runner Sub60',
  baselineDate: '2026-11-15',
  raceDate: '2027-01-16',
  raceDistanceKm: 10,
  weightKg: 73.7,
  vo2Max: 35,
  runningAbilityIndex: 26.3,
  lactateThresholdHrBpm: 176,
  lactateThresholdPaceSecPerKm: 451,
  maxHrBpm: 195,
  dangerHrBpm: 190,
  dangerSustainedSeconds: 30,
  bloodPressureBaseline: '128/88 mmHg',
  fastest3kSec: 1268, // 21:08
  pr5kTime: '35:44',
  fastestKmPaceSec: 377,
  longestRunKm: 9.15,
  recentWeeklyVolumeKm: 3.5,
  weeklySchedule: {
    tuesday: 'Cầu lông (Cross-training — không chạy)',
    thursday: 'Chạy chất lượng / Tempo / Interval',
    saturday: 'Chạy dài (Long Run)',
    sunday: 'Easy 20–25 phút (tùy chọn)',
  },
  selectedGoalId: 'sub60',
};

/**
 * Công thức Riegel ước tính thời gian cự ly T2 từ T1:
 * T2 = T1 * (D2 / D1)^1.06
 */
export function calculateRiegelTime(timeSec1: number, distKm1: number, distKm2: number): number {
  if (distKm1 <= 0 || timeSec1 <= 0) return 0;
  return Math.round(timeSec1 * Math.pow(distKm2 / distKm1, 1.06));
}

/**
 * Ghi chú Riegel hiển thị trên giao diện mục tiêu
 */
export const RIEGEL_NOTE_TEXT =
  'Quy đổi theo công thức Riegel, Sub 60 tương đương 3 km khoảng 16:45 và 5 km khoảng 28:50. Thành tích hiện tại: 3 km 21:08.';

export interface CheckpointSuggestion {
  isCheckpoint: boolean;
  checkpointName: string;
  suggestedGoalId: GoalId;
  message: string;
  canKeepCurrent: boolean;
  reason: string;
}

/**
 * Đánh giá checkpoint tuần 4: Bài test 3 km hết sức
 */
export function evaluateWeek4Test3k(test3kSec: number): CheckpointSuggestion {
  // 18:30 = 1110 giây
  // 19:30 = 1170 giây
  if (test3kSec <= 1110) {
    return {
      isCheckpoint: true,
      checkpointName: 'Test 3 km Tuần 4',
      suggestedGoalId: 'sub60',
      message: 'Đang đúng hướng Sub 60! Tiếp tục giữ phong độ này nhé.',
      canKeepCurrent: true,
      reason: `Thành tích 3 km đạt ${formatDurationMinutes(test3kSec)} (≤ 18:30).`,
    };
  }

  if (test3kSec <= 1170) {
    return {
      isCheckpoint: true,
      checkpointName: 'Test 3 km Tuần 4',
      suggestedGoalId: 'sub65',
      message: 'Nên chuyển sang Sub 65 để thi đấu an toàn và tự tin hơn.',
      canKeepCurrent: true,
      reason: `Thành tích 3 km là ${formatDurationMinutes(test3kSec)} (18:31–19:30).`,
    };
  }

  return {
    isCheckpoint: true,
    checkpointName: 'Test 3 km Tuần 4',
    suggestedGoalId: 'under70',
    message: 'Nên chuyển sang Dưới 70 phút để bảo vệ thể lực và hoàn thành cuộc đua.',
    canKeepCurrent: true,
    reason: `Thành tích 3 km là ${formatDurationMinutes(test3kSec)} (> 19:30).`,
  };
}

/**
 * Đánh giá checkpoint tuần 7: Bài test 2 km race pace trong Long Run
 */
export function evaluateWeek7RacePaceTest(
  avgPaceSecPerKm: number,
  avgHrBpm: number,
  targetRacePaceMinSec: number
): CheckpointSuggestion | null {
  // nếu pace TB chậm hơn race pace > 15 s/km hoặc HR TB ≥ 186 => gợi ý hạ một bậc
  const isPaceDropped = avgPaceSecPerKm > targetRacePaceMinSec + 15;
  const isHrTooHigh = avgHrBpm >= 186;

  if (isPaceDropped || isHrTooHigh) {
    const reasons: string[] = [];
    if (isPaceDropped) reasons.push('pace chậm hơn race pace > 15s/km');
    if (isHrTooHigh) reasons.push(`tim TB cao (${avgHrBpm} ≥ 186 bpm)`);

    return {
      isCheckpoint: true,
      checkpointName: 'Test 2 km Race Pace Tuần 7',
      suggestedGoalId: 'sub65',
      message: 'Gợi ý hạ một bậc mục tiêu để duy trì sức bền trong ngày đua.',
      canKeepCurrent: true,
      reason: `Trong 2 km race pace: ${reasons.join(' và ')}.`,
    };
  }

  return null;
}

/**
 * Chuyển đổi giây sang chuỗi định dạng mm:ss
 */
function formatDurationMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Lấy bậc mục tiêu tiếp theo khi hạ (Sub 60 -> Sub 65 -> Dưới 70)
 */
export function getNextDowngradeGoal(currentGoalId: GoalId): GoalId {
  if (currentGoalId === 'sub60') return 'sub65';
  if (currentGoalId === 'sub65') return 'under70';
  return 'under70';
}

/**
 * Lấy bậc mục tiêu cao hơn khi nâng (Dưới 70 -> Sub 65 -> Sub 60)
 */
export function getNextUpgradeGoal(currentGoalId: GoalId): GoalId {
  if (currentGoalId === 'under70') return 'sub65';
  if (currentGoalId === 'sub65') return 'sub60';
  return 'sub60';
}

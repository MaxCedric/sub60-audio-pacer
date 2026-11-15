/**
 * Logic thuần: Công thức tính Pace tập luyện & Giải mã dải Pace động
 * Hoàn toàn không phụ thuộc React / Expo.
 */

import { AthleteProfile, GoalTier, GOAL_TIERS } from './athlete';

export type PaceType =
  | 'easy'
  | 'progression'
  | 'tempo'
  | 'interval'
  | 'stride'
  | 'rest'
  | 'race'
  | 'racedrill';

export interface PaceSegmentLike {
  paceType?: PaceType;
  targetPaceMinSec?: number;
  targetPaceMaxSec?: number;
  type?: string;
}

export interface ResolvedPaceRange {
  minSec: number;
  maxSec: number;
  hasPaceAlert: boolean;
  paceType: PaceType;
  displayText: string;
  voiceText: string;
}

/**
 * Tính pace trung bình 3K (giây/km) từ kết quả test 3K
 */
export function calculatePace3k(test3kSec: number): number {
  if (test3kSec <= 0) return 423;
  return Math.round(test3kSec / 3);
}

/**
 * Giải mã dải pace động cho từng chặng tập theo Section 3:
 * - easy: LT + 45 -> LT + 90
 * - progression: LT + 10 -> LT + 20
 * - tempo: LT - 5 -> LT + 5
 * - interval: pace3k - 10 -> pace3k
 * - stride: theo cảm giác (không nhắc pace)
 * - race: theo goal đang chọn (Sub 60: 355-360)
 * - racedrill: race pace goal +- 5
 * - rest: nghỉ phục hồi (không nhắc pace)
 */
export function resolvePaceRange(
  segment: PaceSegmentLike,
  profile: Pick<AthleteProfile, 'lactateThresholdPaceSecPerKm' | 'fastest3kSec'>,
  goal?: GoalTier
): ResolvedPaceRange {
  const ltPace = profile.lactateThresholdPaceSecPerKm || 451;
  const p3k = calculatePace3k(profile.fastest3kSec || 1268);
  const activeGoal = goal || GOAL_TIERS.sub60;

  // Xác định paceType nếu segment chưa gán
  let paceType: PaceType = segment.paceType || 'easy';
  if (!segment.paceType) {
    if (segment.type === 'interval_rest') paceType = 'rest';
    else if (segment.type === 'interval_work') paceType = 'interval';
    else if (segment.type === 'stride') paceType = 'stride';
    else if (segment.type === 'tempo') paceType = 'tempo';
    else if (segment.type === 'race_split') paceType = 'race';
    else paceType = 'easy';
  }

  let minSec = 0;
  let maxSec = 0;
  let hasPaceAlert = true;

  switch (paceType) {
    case 'easy':
      minSec = ltPace + 45;
      maxSec = ltPace + 90;
      break;

    case 'progression':
      minSec = ltPace + 10;
      maxSec = ltPace + 20;
      break;

    case 'tempo':
      minSec = ltPace - 5;
      maxSec = ltPace + 5;
      break;

    case 'interval':
      minSec = p3k - 10;
      maxSec = p3k;
      break;

    case 'stride':
      minSec = 0;
      maxSec = 9999;
      hasPaceAlert = false;
      break;

    case 'race':
      minSec = activeGoal.targetPaceMinSec;
      maxSec = activeGoal.targetPaceMaxSec;
      break;

    case 'racedrill':
      minSec = activeGoal.targetPaceMinSec - 5;
      maxSec = activeGoal.targetPaceMaxSec + 5;
      break;

    case 'rest':
    default:
      minSec = 0;
      maxSec = 9999;
      hasPaceAlert = false;
      break;
  }

  const displayText = hasPaceAlert
    ? `${formatPaceMinutesSeconds(minSec)}–${formatPaceMinutesSeconds(maxSec)}`
    : 'Tự do / Thả lỏng';

  const voiceText = hasPaceAlert
    ? `Pace ${formatPaceVoiceWords(minSec)} đến ${formatPaceVoiceWords(maxSec)}`
    : 'Chạy tự do theo cảm giác';

  return {
    minSec,
    maxSec,
    hasPaceAlert,
    paceType,
    displayText,
    voiceText,
  };
}

/**
 * Định dạng pace mm'ss"
 */
export function formatPaceMinutesSeconds(paceSecPerKm: number | null | undefined): string {
  if (!paceSecPerKm || !Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0 || paceSecPerKm > 1800) {
    return "--'--\"";
  }
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);
  return `${m}'${s < 10 ? '0' : ''}${s}"`;
}

/**
 * Định dạng đọc pace bằng chữ tiếng Việt (ví dụ: "tám phút mười lăm giây")
 */
export function formatPaceVoiceWords(paceSecPerKm: number): string {
  const m = Math.floor(paceSecPerKm / 60);
  const s = Math.round(paceSecPerKm % 60);

  const mWords: Record<number, string> = {
    3: 'ba',
    4: 'bốn',
    5: 'năm',
    6: 'sáu',
    7: 'bảy',
    8: 'tám',
    9: 'chín',
    10: 'mười',
  };

  const minWord = mWords[m] || `${m}`;
  if (s === 0) return `${minWord} phút tròn`;
  return `${minWord} phút ${s}`;
}

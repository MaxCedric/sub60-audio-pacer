/**
 * Logic thuần: Vùng nhịp tim theo Joe Friel (LTHR) & Quy tắc cảnh báo tim mạch
 * Hoàn toàn không phụ thuộc React / Expo.
 */

import { AthleteProfile } from './athlete';

export interface HeartRateZoneInfo {
  zone: 1 | 2 | 3 | 4 | 5;
  name: string;
  minHr: number;
  maxHr: number;
  color: string;
  description: string;
}

/**
 * Tính toán 5 Zone nhịp tim theo Joe Friel dựa trên LTHR
 * Z1 Hồi phục: < 150
 * Z2 Easy: 150–157
 * Z3 Aerobic cao: 158–165
 * Z4 Ngưỡng: 166–175
 * Z5 Trên ngưỡng: >= 176
 */
export function calculateHeartRateZones(ltHr: number): HeartRateZoneInfo[] {
  // Tỷ lệ chuẩn Joe Friel theo LTHR
  const z1Max = Math.round(ltHr * 0.85) - 1; // 149
  const z2Min = Math.round(ltHr * 0.85); // 150
  const z2Max = Math.round(ltHr * 0.89); // 157
  const z3Min = z2Max + 1; // 158
  const z3Max = Math.round(ltHr * 0.94); // 165
  const z4Min = z3Max + 1; // 166
  const z4Max = ltHr - 1; // 175
  const z5Min = ltHr; // 176

  return [
    {
      zone: 1,
      name: 'Khởi động / Hồi phục (Z1)',
      minHr: 0,
      maxHr: z1Max,
      color: '#64748B',
      description: 'Hồi phục, thả lỏng cơ khớp',
    },
    {
      zone: 2,
      name: 'Nền tảng Hiếu khí Easy (Z2)',
      minHr: z2Min,
      maxHr: z2Max,
      color: '#00F0FF',
      description: 'Đốt mỡ tối ưu, xây nền tảng sức bền',
    },
    {
      zone: 3,
      name: 'Aerobic cao / Marathon (Z3)',
      minHr: z3Min,
      maxHr: z3Max,
      color: '#D2FF00',
      description: 'Tốc độ marathon, nhịp thở sâu',
    },
    {
      zone: 4,
      name: 'Ngưỡng Lactate Threshold (Z4)',
      minHr: z4Min,
      maxHr: z4Max,
      color: '#FFB020',
      description: 'Ngưỡng tích tụ axit lactic',
    },
    {
      zone: 5,
      name: 'Trên ngưỡng / VO2max (Z5)',
      minHr: z5Min,
      maxHr: 220,
      color: '#FF3B5C',
      description: 'Tốc độ tối đa, yếm khí',
    },
  ];
}

/**
 * Xác định Zone hiện tại của nhịp tim
 */
export function getZoneForHeartRate(hr: number | null, ltHr: number): 1 | 2 | 3 | 4 | 5 | null {
  if (!hr || hr <= 0) return null;
  const zones = calculateHeartRateZones(ltHr);
  for (const z of zones) {
    if (hr >= z.minHr && hr <= z.maxHr) {
      return z.zone;
    }
  }
  return hr >= ltHr ? 5 : 1;
}

export type HeartRateAlertAction =
  | 'NONE'
  | 'CRITICAL_DANGER_WALK' // Báo đỏ nguy hiểm, bắt buộc đi bộ
  | 'SLOW_DOWN_SEGMENT_CEILING' // Vượt trần đoạn quá lâu, cần chạy chậm lại
  | 'REST_READY_NOTIFICATION'; // Nghỉ interval: tim đã xuống dưới 150, sẵn sàng cho tổ mới

export interface HeartRateAlertEvaluationInput {
  currentHr: number | null;
  segmentType:
    | 'warmup'
    | 'main'
    | 'tempo'
    | 'interval_work'
    | 'interval_rest'
    | 'stride'
    | 'cooldown'
    | 'race_split';
  segmentDurationSeconds?: number;
  segmentElapsedSeconds: number;
  highDangerHrSustainedSeconds: number; // Thời gian liên tục HR >= dangerHrBpm (190)
  maxHrSustainedSeconds: number; // Thời gian liên tục HR >= maxHrBpm (195)
  segmentCeilingExceededSeconds: number; // Thời gian liên tục HR vượt trần đoạn
  profile: Pick<AthleteProfile, 'lactateThresholdHrBpm' | 'dangerHrBpm' | 'maxHrBpm' | 'dangerSustainedSeconds'>;
  isFinalRaceSplit?: boolean;
}

/**
 * Đánh giá cảnh báo nhịp tim theo đúng quy tắc Section 2:
 * 1. Nguy hiểm:
 *    - HR >= 190 liên tục 30s => Cảnh báo đỏ, đi bộ ngay.
 *    - HR >= 195 liên tục 5s => Cảnh báo đỏ ngay.
 * 2. Theo từng loại đoạn:
 *    - warmup, main (easy), cooldown: vượt trần đoạn (157 bpm) liên tục 60s => nhắc chạy chậm lại.
 *    - tempo: vượt 176 bpm liên tục 60s => nhắc chạy chậm lại.
 *    - interval_work, stride, race_split chặng cuối: KHÔNG nhắc theo HR (chỉ áp dụng cảnh báo nguy hiểm).
 *    - interval_rest: không nhắc pace; báo "sẵn sàng" khi HR xuống < 150 bpm.
 * 3. Không dùng HR chỉnh pace trong đoạn ngắn hơn 3 phút (180s) do độ trễ sinh học 30–90s.
 */
export function evaluateHeartRateAlert(input: HeartRateAlertEvaluationInput): HeartRateAlertAction {
  const {
    currentHr,
    segmentType,
    segmentDurationSeconds,
    segmentElapsedSeconds,
    highDangerHrSustainedSeconds,
    maxHrSustainedSeconds,
    segmentCeilingExceededSeconds,
    profile,
    isFinalRaceSplit,
  } = input;

  if (!currentHr || currentHr <= 0) {
    return 'NONE';
  }

  // 1. QUY TẮC NGUY HIỂM TỐI CAO (Áp dụng cho mọi loại bài)
  if (currentHr >= profile.maxHrBpm && maxHrSustainedSeconds >= 5) {
    return 'CRITICAL_DANGER_WALK';
  }
  if (currentHr >= profile.dangerHrBpm && highDangerHrSustainedSeconds >= profile.dangerSustainedSeconds) {
    return 'CRITICAL_DANGER_WALK';
  }

  // 2. NGHỈ PHỤC HỒI INTERVAL_REST
  if (segmentType === 'interval_rest') {
    // Không nhắc pace; chỉ báo "sẵn sàng" khi HR đã xuống dưới 150
    if (currentHr < 150 && segmentElapsedSeconds >= 10) {
      return 'REST_READY_NOTIFICATION';
    }
    return 'NONE';
  }

  // 3. ĐOẠN KHÔNG ÁP DỤNG CẢNH BÁO TIM MẠCH THÔNG THƯỜNG
  // interval_work, stride, race_split chặng cuối: KHÔNG nhắc theo HR, chỉ áp dụng nguy hiểm
  if (segmentType === 'interval_work' || segmentType === 'stride' || isFinalRaceSplit) {
    return 'NONE';
  }

  // 4. QUY TẮC ĐỘ TRỄ TIM MẠCH: Không dùng HR chỉnh pace trong đoạn ngắn hơn 3 phút (180s)
  if (typeof segmentDurationSeconds === 'number' && segmentDurationSeconds > 0 && segmentDurationSeconds < 180) {
    return 'NONE';
  }

  // 5. CẢNH BÁO THEO TỪNG LOẠI ĐOẠN
  if (segmentType === 'tempo') {
    // tempo: vượt 176 liên tục 60 giây => nhắc chạy chậm lại
    if (currentHr > profile.lactateThresholdHrBpm && segmentCeilingExceededSeconds >= 60) {
      return 'SLOW_DOWN_SEGMENT_CEILING';
    }
  } else if (
    segmentType === 'warmup' ||
    segmentType === 'main' ||
    segmentType === 'cooldown' ||
    segmentType === 'race_split'
  ) {
    // warmup, main easy, cooldown: vượt trần đoạn (mặc định Z2 max = 157) liên tục 60s => nhắc chạy chậm lại
    const z2Ceiling = Math.round(profile.lactateThresholdHrBpm * 0.89); // 157 bpm
    if (currentHr > z2Ceiling && segmentCeilingExceededSeconds >= 60) {
      return 'SLOW_DOWN_SEGMENT_CEILING';
    }
  }

  return 'NONE';
}

/**
 * Logic thuần: Tính toán Thời gian về đích dự kiến (ETA) & Định dạng âm thanh
 * Hoàn toàn không phụ thuộc React / Expo.
 */

export interface SplitRecord {
  km: number;
  paceSecPerKm: number;
  avgHrBpm?: number;
  elapsedSeconds: number;
}

/**
 * Tính thời gian về đích dự kiến:
 * ETA = Thời gian hiện tại + Quãng còn lại (km) * Pace trung bình 2 km gần nhất
 */
export function calculateEstimatedFinishTime(
  currentElapsedSeconds: number,
  totalDistanceMeters: number,
  targetTotalDistanceMeters: number,
  splitsHistory: SplitRecord[]
): { estimatedTotalSeconds: number; remainingDistanceMeters: number } | null {
  if (targetTotalDistanceMeters <= 0 || totalDistanceMeters >= targetTotalDistanceMeters) {
    return null;
  }

  const remainingMeters = targetTotalDistanceMeters - totalDistanceMeters;
  const remainingKm = remainingMeters / 1000;

  // Lấy tối đa 2 split gần nhất để tính pace gần đây
  let recentPace = 0;
  if (splitsHistory.length >= 2) {
    const last2 = splitsHistory.slice(-2);
    recentPace = (last2[0].paceSecPerKm + last2[1].paceSecPerKm) / 2;
  } else if (splitsHistory.length === 1) {
    recentPace = splitsHistory[0].paceSecPerKm;
  } else {
    // Nếu chưa có split hoàn chỉnh, dùng pace trung bình tổng
    if (totalDistanceMeters > 0) {
      recentPace = currentElapsedSeconds / (totalDistanceMeters / 1000);
    } else {
      return null;
    }
  }

  const estimatedRemainingSec = Math.round(remainingKm * recentPace);
  const estimatedTotalSeconds = currentElapsedSeconds + estimatedRemainingSec;

  return {
    estimatedTotalSeconds,
    remainingDistanceMeters: remainingMeters,
  };
}

/**
 * Định dạng thời gian dự kiến sang câu nói tiếng Việt:
 * Ví dụ: 4210s => "một giờ mười phút mười giây"
 */
export function formatEtaVoiceWords(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);

  const numToWords: Record<number, string> = {
    1: 'một',
    2: 'hai',
    3: 'ba',
    4: 'bốn',
    5: 'năm',
    6: 'sáu',
    7: 'bảy',
    8: 'tám',
    9: 'chín',
    10: 'mười',
  };

  const parts: string[] = [];
  if (hours > 0) {
    parts.push(`${numToWords[hours] || hours} giờ`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} phút`);
  }
  if (seconds > 0) {
    parts.push(`${seconds} giây`);
  }

  return parts.length > 0 ? parts.join(' ') : 'về đích ngay';
}

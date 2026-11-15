/**
 * Cấu hình tập trung cho toàn bộ Audio Coach & Pacer Engine
 * Tất cả các ngưỡng thời gian, nhịp tim, cooldown được quản lý tại đây.
 */

export const COACH_CONFIG = {
  // Âm thanh & Giọng nói
  speech: {
    defaultRate: 0.82,
    clausePauseMs: 750, // Ngừng 0.75s giữa các dấu chấm, phẩy
    queueMaxItems: 2,
    queueTtlMs: 15000, // Bỏ câu cũ hơn 15 giây
  },

  // Cooldown giữa các loại cảnh báo (ms)
  cooldowns: {
    paceAlertMs: 50000,
    paceTrendMs: 45000,
    hrTrendMs: 40000,
    hrDangerAlertMs: 25000,
    hrSegmentCeilingAlertMs: 45000,
    positiveEncouragementMs: 60000,
    checkInCooldownMs: 90000,
  },

  // Quy tắc giám sát GPS & Pace
  pacer: {
    gracePeriodSeconds: 20, // 20 giây đầu segment không cảnh báo
    gracePeriodMeters: 100, // hoặc 100 mét đầu segment
    steadyPaceToleranceSec: 12, // Dung sai ±12 s/km cho bài chạy đều
    maxGpsAccuracyMeters: 20, // GPS accuracy > 20m coi là yếu, tạm tắt cảnh báo
    autoPauseMinSpeedMps: 1.0, // < 1.0 m/s trong 6s => auto-pause
    autoPauseSustainedSeconds: 6,
    autoResumeMinSpeedMps: 1.8, // > 1.8 m/s trong 3s => auto-resume
    autoResumeSustainedSeconds: 3,
    checkInMinRunElapsedSeconds: 120, // 2 phút đầu buổi không check-in
    checkInPaceDriftToleranceSec: 30, // Chậm hơn dải ≥ 30 s/km trong 30s mới hỏi
    checkInPaceDriftSustainedSec: 30,
  },

  // Quy tắc giám sát nhịp tim (mặc định nếu không có profile)
  heartRate: {
    dangerHrBpm: 190,
    dangerSustainedSeconds: 30,
    maxHrBpm: 195,
    maxHrSustainedSeconds: 5,
    segmentCeilingSustainedSeconds: 60,
    tempoCeilingSustainedSeconds: 60,
    minSegmentDurationForHrCorrectionSec: 180, // Đoạn ngắn hơn 3 phút không dùng HR chỉnh pace
    intervalRestReadyHrBpm: 150, // Nghỉ interval: sẵn sàng khi HR < 150
  },

  // Metronome & Cadence
  cadence: {
    defaultBpm: 172,
    minBpm: 160,
    maxBpm: 180,
    offsetFromAvgCadence: 5, // Cadence TB + 5
  },
};

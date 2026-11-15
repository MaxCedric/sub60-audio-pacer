/**
 * Logic thuần: AI Adaptive Coach & Huấn Luyện Viên Thích Ứng Đột Xuất
 * Hoàn toàn không phụ thuộc React / Expo.
 */

import { AthleteProfile, GoalTier, GOAL_TIERS } from './athlete';
import { WorkoutPlan, WorkoutSegment } from '../hooks/useRunningPacer';
import { CompletedRunSession } from '../services/storage';

export type RunnerFeeling =
  | 'FRESH_READY' // Rất sung sức, chân nhẹ
  | 'NORMAL' // Bình thường, theo gợi ý PT
  | 'FATIGUED_SORE' // Chân hơi mỏi, muốn chạy nhẹ hồi phục
  | 'LIMITED_TIME'; // Bận rộn, chỉ có 20-25 phút rảnh

export type AdaptiveWorkoutType =
  | 'EASY_RECOVERY'
  | 'EASY_STRIDES'
  | 'TEMPO_MAINTENANCE'
  | 'INTERVAL_SHARP'
  | 'QUICK_SHAKEOUT';

export interface AiWorkoutRecommendation {
  workout: WorkoutPlan;
  reasoning: string;
  focusTitle: string;
  recommendedType: AdaptiveWorkoutType;
  weeklyContextSummary: string;
  aiSuggestedQuote: string;
}

/**
 * Tính tổng quãng đường và số buổi đã chạy trong tuần hiện tại (tính từ Thứ 2)
 */
export function getThisWeekStats(
  currentDate: Date,
  recentSessions: CompletedRunSession[]
): { weeklyDistanceKm: number; sessionsCount: number; lastRunHoursAgo: number | null } {
  const nowMs = currentDate.getTime();
  const day = currentDate.getDay(); // 0 is Sunday
  const diffToMonday = (day + 6) % 7; // Days since this Monday
  const mondayMidnight = new Date(currentDate);
  mondayMidnight.setDate(currentDate.getDate() - diffToMonday);
  mondayMidnight.setHours(0, 0, 0, 0);

  const thisWeekRuns = recentSessions.filter(
    (s) => s.timestamp >= mondayMidnight.getTime()
  );

  const weeklyDistanceKm = parseFloat(
    (thisWeekRuns.reduce((sum, s) => sum + s.totalDistanceMeters, 0) / 1000).toFixed(2)
  );

  let lastRunHoursAgo: number | null = null;
  if (recentSessions.length > 0) {
    const latestTimestamp = recentSessions[0].timestamp;
    lastRunHoursAgo = Math.max(0, Math.round((nowMs - latestTimestamp) / (1000 * 3600)));
  }

  return {
    weeklyDistanceKm,
    sessionsCount: thisWeekRuns.length,
    lastRunHoursAgo,
  };
}

/**
 * Sinh bài tập ngẫu hứng thông minh thích ứng theo thể trạng & lịch tuần của runner
 */
export function generateAdaptiveWorkout(
  feeling: RunnerFeeling,
  currentDate: Date,
  profile: AthleteProfile,
  recentSessions: CompletedRunSession[],
  currentGoalTier: GoalTier = GOAL_TIERS.sub60
): AiWorkoutRecommendation {
  const dayOfWeek = currentDate.getDay(); // 0: CN, 1: T2, 2: T3, 3: T4, 4: T5, 5: T6, 6: T7
  const dayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const todayName = dayNames[dayOfWeek];

  const { weeklyDistanceKm, sessionsCount, lastRunHoursAgo } = getThisWeekStats(
    currentDate,
    recentSessions
  );

  const ranRecently = lastRunHoursAgo !== null && lastRunHoursAgo < 24;

  let recommendedType: AdaptiveWorkoutType = 'EASY_RECOVERY';
  let focusTitle = '';
  let reasoning = '';
  let aiSuggestedQuote = '';

  // 1. Phân tích ngữ cảnh ngày và trạng thái thể lực
  if (feeling === 'FATIGUED_SORE') {
    recommendedType = 'EASY_RECOVERY';
    focusTitle = 'Chạy Phục Hồi Thả Lỏng Cơ Khớp';
    reasoning =
      'Bạn đang thấy chân mỏi hoặc đuối sức. PT chỉ định bài chạy chậm ở Vùng Z1/Z2 (dưới 157 bpm), giúp bơm máu xả axit lactic mà không làm tổn thương gân cơ gối.';
    aiSuggestedQuote = 'Hôm nay cứ thả lỏng tối đa, không cần quan tâm tốc độ nhé!';
  } else if (feeling === 'LIMITED_TIME') {
    recommendedType = 'QUICK_SHAKEOUT';
    focusTitle = 'Kích Hoạt Nhanh 20 Phút';
    reasoning =
      'Thời gian có hạn nên PT thiết kế buổi chạy gọn gàng 2,8 km trong 20 phút: 1 km làm nóng nhẹ nhàng, 1,5 km tăng tốc đều ở nhịp thở sâu, và 300m thả lỏng hạ nhiệt.';
    aiSuggestedQuote = 'Ngắn gọn nhưng chất lượng, giúp duy trì guồng chân chuẩn.';
  } else if (dayOfWeek === 2) {
    // Thứ 3: Lịch đánh cầu lông
    recommendedType = 'QUICK_SHAKEOUT';
    focusTitle = 'Khởi Động Nhẹ Ngày Cầu Lông';
    reasoning =
      'Hôm nay là Thứ Ba - ngày bạn có lịch đánh cầu lông cường độ cao. PT chỉ cho bạn chạy nhẹ 2,0 km Z1 để kích hoạt khớp hông và cổ chân, giữ sức cho buổi cầu lông.';
    aiSuggestedQuote = 'Chạy nhẹ nhàng thôi nhé, chiều nay còn bung sức đập cầu!';
  } else if (dayOfWeek === 3) {
    // Thứ 4: Sau ngày cầu lông
    recommendedType = 'EASY_RECOVERY';
    focusTitle = 'Xả Cơ Sau Cầu Lông (Z2)';
    reasoning =
      'Hôm qua bạn vừa đánh cầu lông nhiều pha nhảy và đổi hướng đột ngột. Hôm nay là Thứ Tư, ngày mai Thứ Năm lại có bài chạy chính. Hãy chạy Easy 3,0 km chậm rãi để xả cơ.';
    aiSuggestedQuote = 'Giữ tim dưới 157 bpm, bước chân thật êm và ngắn.';
  } else if (dayOfWeek === 5) {
    // Thứ 6: Trước ngày chạy dài Thứ 7
    recommendedType = feeling === 'FRESH_READY' ? 'EASY_STRIDES' : 'EASY_RECOVERY';
    focusTitle = 'Giữ Nhịp Chân Trước Long Run';
    reasoning =
      'Ngày mai Thứ Bảy là bài chạy dài quan trọng nhất tuần. Hôm nay chạy nhẹ 3,0 km kèm vài tổ strides ngắn để chân không bị ì mà vẫn giữ nguyên 100% pin cho ngày mai.';
    aiSuggestedQuote = 'Chân nhanh nhưng người thả lỏng, tích năng lượng cho ngày mai.';
  } else if (dayOfWeek === 0) {
    // Chủ Nhật: Sau ngày chạy dài Thứ 7
    recommendedType = 'EASY_RECOVERY';
    focusTitle = 'Thả Lỏng Hồi Phục Cuối Tuần';
    reasoning =
      'Sau bài chạy dài Thứ Bảy, cơ thể cần được tái tạo. Buổi chạy 2,5 km hôm nay hoàn toàn phục vụ xả cơ bắp chân và đùi, đi bộ kết hợp nếu thấy cần thiết.';
    aiSuggestedQuote = 'Cứ chạy theo cảm giác thoải mái nhất của bạn!';
  } else {
    // Các ngày khác (Thứ 2, Thứ 4, Thứ 5 rảnh hoặc sung sức)
    if (feeling === 'FRESH_READY' && !ranRecently) {
      // Runner rất sung sức và 24h qua chưa chạy
      recommendedType = 'TEMPO_MAINTENANCE';
      focusTitle = 'Tempo Thử Thách Cảm Giác Đua';
      reasoning =
        'Thể lực bạn đang ở mức sung sức và chưa vận động nặng trong 24h qua! PT đề xuất bài Tempo 3,5 km để kích hoạt ngưỡng lactate và làm quen tốc độ race pace.';
      aiSuggestedQuote = 'Cảm giác chân rất tốt, hãy giữ nhịp thở 2-2 thật đều đặn!';
    } else {
      recommendedType = 'EASY_STRIDES';
      focusTitle = 'Easy 3,5 km + 4 Tổ Strides 15s';
      reasoning =
        'Bài tập hiếu khí tiêu chuẩn: 3,0 km chạy đàm thoại thoải mái ở Z2, kết thúc bằng 4 tổ bứt tốc sải chân 15 giây để luyện guồng chân cao 172+ SPM.';
      aiSuggestedQuote = 'Xây nền bền bỉ, mỗi km đều đưa bạn gần hơn tới mốc Sub 60.';
    }
  }

  // 2. Tạo chi tiết giáo án (Segments) dựa trên recommendedType
  const dateStr = currentDate.toLocaleDateString('vi-VN');
  const workoutId = `adaptive-${Date.now()}`;
  let segments: WorkoutSegment[] = [];
  let totalDistanceKm = 3.0;

  switch (recommendedType) {
    case 'EASY_RECOVERY': {
      totalDistanceKm = 2.5;
      segments = [
        {
          id: `${workoutId}-1`,
          name: 'Đi bộ làm nóng & Chạy Z1 (500m)',
          type: 'warmup',
          paceType: 'easy',
          distanceMeters: 500,
          maxHrBpm: 150,
          voiceIntro: 'Bắt đầu khởi động nhẹ nhàng, đi bộ và chạy bước nhỏ.',
        },
        {
          id: `${workoutId}-2`,
          name: 'Easy Z2 Hồi phục (1.5 km)',
          type: 'main',
          paceType: 'easy',
          distanceMeters: 1500,
          maxHrBpm: 157,
          voiceIntro: 'Chạy chậm rãi, hít thở sâu, giữ tim dưới 157 bpm.',
        },
        {
          id: `${workoutId}-3`,
          name: 'Đi bộ thả lỏng kết thúc (500m)',
          type: 'cooldown',
          paceType: 'rest',
          distanceMeters: 500,
          maxHrBpm: 145,
          voiceIntro: 'Rất tốt, chuyển sang đi bộ thả lỏng cơ đùi và bắp chân.',
        },
      ];
      break;
    }

    case 'QUICK_SHAKEOUT': {
      totalDistanceKm = 2.2;
      segments = [
        {
          id: `${workoutId}-1`,
          name: 'Khởi động nhẹ 400m',
          type: 'warmup',
          paceType: 'easy',
          distanceMeters: 400,
          maxHrBpm: 150,
          voiceIntro: 'Khởi động 400 mét đầu tiên thật êm ái.',
        },
        {
          id: `${workoutId}-2`,
          name: 'Chạy đều nhịp 1.5 km',
          type: 'main',
          paceType: 'easy',
          distanceMeters: 1500,
          maxHrBpm: 160,
          voiceIntro: 'Duy trì guồng chân đều đặn, nhịp thở nhịp nhàng.',
        },
        {
          id: `${workoutId}-3`,
          name: 'Hạ nhiệt 300m',
          type: 'cooldown',
          paceType: 'easy',
          distanceMeters: 300,
          maxHrBpm: 145,
          voiceIntro: 'Chạy chậm lại và đi bộ hạ nhiệt kết thúc bài chạy nhanh.',
        },
      ];
      break;
    }

    case 'TEMPO_MAINTENANCE': {
      totalDistanceKm = 4.0;
      segments = [
        {
          id: `${workoutId}-1`,
          name: 'Khởi động Easy (1.0 km)',
          type: 'warmup',
          paceType: 'easy',
          distanceMeters: 1000,
          maxHrBpm: 157,
          voiceIntro: 'Khởi động một km đầu ở tốc độ dễ chịu.',
        },
        {
          id: `${workoutId}-2`,
          name: 'Đoạn Tempo ngưỡng (2.0 km)',
          type: 'tempo',
          paceType: 'tempo',
          distanceMeters: 2000,
          maxHrBpm: 176,
          voiceIntro: 'Tăng tốc vào đoạn tempo! Đẩy guồng chân và giữ vững nhịp tim.',
        },
        {
          id: `${workoutId}-3`,
          name: 'Thả lỏng hồi phục (1.0 km)',
          type: 'cooldown',
          paceType: 'easy',
          distanceMeters: 1000,
          maxHrBpm: 150,
          voiceIntro: 'Hoàn thành xuất sắc đoạn tempo. Thả lỏng một km cuối.',
        },
      ];
      break;
    }

    case 'EASY_STRIDES':
    default: {
      totalDistanceKm = 3.4;
      segments = [
        {
          id: `${workoutId}-1`,
          name: 'Easy Z2 nền tảng (2.5 km)',
          type: 'main',
          paceType: 'easy',
          distanceMeters: 2500,
          maxHrBpm: 157,
          voiceIntro: 'Bắt đầu bài chạy easy. Giữ nhịp thở đều và tim dưới 157.',
        },
        {
          id: `${workoutId}-2`,
          name: 'Tổ 1: Strides bứt tốc 15s',
          type: 'stride',
          paceType: 'stride',
          durationSeconds: 15,
          maxHrBpm: 185,
          voiceIntro: 'Bứt tốc tổ một! Đánh tay nhanh, guồng chân cao.',
        },
        {
          id: `${workoutId}-3`,
          name: 'Nghỉ đi bộ 60s',
          type: 'interval_rest',
          paceType: 'rest',
          durationSeconds: 60,
          maxHrBpm: 150,
          voiceIntro: 'Đi bộ thả lỏng 60 giây.',
        },
        {
          id: `${workoutId}-4`,
          name: 'Tổ 2: Strides bứt tốc 15s',
          type: 'stride',
          paceType: 'stride',
          durationSeconds: 15,
          maxHrBpm: 185,
          voiceIntro: 'Tổ hai bứt tốc! Giữ lưng thẳng, sải chân gọn.',
        },
        {
          id: `${workoutId}-5`,
          name: 'Nghỉ đi bộ 60s',
          type: 'interval_rest',
          paceType: 'rest',
          durationSeconds: 60,
          maxHrBpm: 150,
          voiceIntro: 'Hạ nhịp tim xuống.',
        },
        {
          id: `${workoutId}-6`,
          name: 'Thả lỏng về đích (500m)',
          type: 'cooldown',
          paceType: 'easy',
          distanceMeters: 500,
          maxHrBpm: 145,
          voiceIntro: 'Chạy chậm rãi 500 mét cuối để kết thúc bài tập.',
        },
      ];
      break;
    }
  }

  const workout: WorkoutPlan = {
    id: workoutId,
    dayOfWeek: todayName,
    date: dateStr,
    title: `AI PT: ${focusTitle}`,
    type: recommendedType,
    totalDistanceKm,
    description: reasoning,
    segments,
    isOptional: true,
  };

  const weeklyContextSummary = `Tuần này đã tích lũy ${weeklyDistanceKm} km (${sessionsCount} buổi)${
    lastRunHoursAgo !== null ? ` • Chạy gần nhất: ${lastRunHoursAgo} giờ trước` : ''
  }`;

  return {
    workout,
    reasoning,
    focusTitle,
    recommendedType,
    weeklyContextSummary,
    aiSuggestedQuote,
  };
}

/**
 * Gọi Gemini AI trực tuyến nếu có API Key (Tùy chọn, không bắt buộc)
 */
export async function queryGeminiCoachingTip(
  apiKey: string,
  userPrompt: string,
  profile: AthleteProfile
): Promise<string | null> {
  if (!apiKey || apiKey.trim() === '') return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;
    const systemPrompt = `Bạn là huấn luyện viên chạy bộ chuyên sâu cá nhân cho runner mục tiêu 10 km Sub 60 (LTHR: ${profile.lactateThresholdHrBpm} bpm, HRmax: ${profile.maxHrBpm} bpm, VO2max: ${profile.vo2Max}, cân nặng: ${profile.weightKg} kg, thứ 3 đánh cầu lông). Hãy trả lời ngắn gọn dưới 3 câu, phong cách PT thân thiện, nói tiếng Việt.`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nCâu hỏi vận động viên: ${userPrompt}` }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidateText ? candidateText.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Dynamic Training Schedule Builder
 * 100% matched with Sub60AudioPacer HTML Web Handoff (buildSchedule)
 */

import { GoalId, GOAL_TIERS } from './athlete';
import { WorkoutPlan, WorkoutSegment } from '../hooks/useRunningPacer';

export interface ScheduleSegment extends WorkoutSegment {
  distKm: number;
  paceMin: number;
  paceMax: number;
  zone: number;
  cue: string;
}

export interface ScheduleWorkout extends WorkoutPlan {
  day: string;
  totalKm: number;
  desc: string;
  segments: ScheduleSegment[];
}

export interface ScheduleWeek {
  week: number;
  dateRange: string;
  focus: string;
  workouts: ScheduleWorkout[];
}

interface RawSegment {
  name: string;
  distKm: number;
  paceMin: number;
  paceMax: number;
  zone: number;
  cue: string;
}

interface RawWorkout {
  id: string;
  day: string;
  title: string;
  type: string;
  totalKm: number;
  desc: string;
  segments: RawSegment[];
}

interface RawWeek {
  week: number;
  dateRange: string;
  focus: string;
  workouts: RawWorkout[];
}

export function buildSchedule(goalId: GoalId): ScheduleWeek[] {
  const g = GOAL_TIERS[goalId] || GOAL_TIERS.sub60;
  const rp = g.targetPaceMinSec; // Sub60: 355-358, Sub65: 385-390, Under70: 415-418
  const easyMin = 496; // 8'16"
  const easyMax = 541; // 9'01"
  const tempoMin = rp + 75;
  const tempoMax = rp + 90;
  const intervalMin = rp + 45;
  const intervalMax = rp + 60;
  const progMin = rp + 90;
  const progMax = rp + 110;

  const raw: RawWeek[] = [
    {
      week: 1,
      dateRange: '16/11/2026 - 22/11/2026',
      focus: 'Xây nền tảng hiếu khí Z2, cho phép chạy xen kẽ đi bộ.',
      workouts: [
        {
          id: '1-thu-e',
          day: 'Thứ 5',
          title: "Easy 3,0 km (Chạy 4' / Đi 1')",
          type: 'Easy',
          totalKm: 3.0,
          desc: '3,0 km easy pace 8\'16"–9\'01", giữ tim dưới ngưỡng Z2.',
          segments: [
            { name: 'Khởi động 400m', distKm: 0.4, paceMin: 530, paceMax: 580, zone: 1, cue: 'Bắt đầu khởi động nhẹ nhàng.' },
            { name: 'Easy Z2 (2,1 km)', distKm: 2.1, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Vào nhịp easy, giữ tim vùng hai.' },
            { name: 'Thả lỏng 500m', distKm: 0.5, paceMin: 540, paceMax: 600, zone: 1, cue: 'Năm trăm mét thả lỏng về đích.' },
          ],
        },
        {
          id: '1-sat-e',
          day: 'Thứ 7',
          title: 'Easy 4,0 km Tích Lũy',
          type: 'Easy',
          totalKm: 4.0,
          desc: 'Chạy bền nhẹ nhàng, guồng chân 172 SPM.',
          segments: [
            { name: 'Khởi động 500m', distKm: 0.5, paceMin: 530, paceMax: 580, zone: 1, cue: 'Bắt đầu khởi động.' },
            { name: 'Easy Z2 (3,0 km)', distKm: 3.0, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Giữ nhịp bước đều.' },
            { name: 'Thả lỏng 500m', distKm: 0.5, paceMin: 540, paceMax: 600, zone: 1, cue: 'Thả lỏng năm trăm mét cuối.' },
          ],
        },
        {
          id: '1-sun-op',
          day: 'Chủ Nhật',
          title: 'Easy 20–25 phút (Tùy chọn)',
          type: 'Recovery',
          totalKm: 2.5,
          desc: 'Thả lỏng tùy chọn 2,5 km.',
          segments: [
            { name: 'Thả lỏng (2,5 km)', distKm: 2.5, paceMin: 530, paceMax: 590, zone: 1, cue: 'Thả lỏng tối đa.' },
          ],
        },
      ],
    },
    {
      week: 2,
      dateRange: '23/11/2026 - 29/11/2026',
      focus: 'Kích hoạt guồng chân với Strides 15s & tăng cự ly lên 5 km.',
      workouts: [
        {
          id: '2-thu-s',
          day: 'Thứ 5',
          title: 'Easy 3,0 km + 4×15s Strides',
          type: 'Strides',
          totalKm: 3.5,
          desc: '3,0 km Z2 + 4 tổ bứt tốc 15 giây.',
          segments: [
            { name: 'Easy Z2 (2,8 km)', distKm: 2.8, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Chạy nhẹ nhàng ba cây số.' },
            { name: '4×15s Strides', distKm: 0.4, paceMin: rp, paceMax: rp + 30, zone: 4, cue: 'Bứt tốc mười lăm giây.' },
            { name: 'Thả lỏng 300m', distKm: 0.3, paceMin: 560, paceMax: 650, zone: 1, cue: 'Đi bộ thở sâu.' },
          ],
        },
        {
          id: '2-sat-e',
          day: 'Thứ 7',
          title: 'Easy 5,0 km Hiếu Khí',
          type: 'Easy',
          totalKm: 5.0,
          desc: 'Chạy bền hiếu khí Zone 2.',
          segments: [
            { name: 'Khởi động 1,0 km', distKm: 1.0, paceMin: 520, paceMax: 570, zone: 1, cue: 'Khởi động một cây số.' },
            { name: 'Easy Z2 (3,5 km)', distKm: 3.5, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Giữ đều chân vùng hai.' },
            { name: 'Thả lỏng 500m', distKm: 0.5, paceMin: 540, paceMax: 600, zone: 1, cue: 'Thả lỏng về đích.' },
          ],
        },
      ],
    },
    {
      week: 3,
      dateRange: '30/11/2026 - 06/12/2026',
      focus: 'Làm quen Tempo ngưỡng lactate & Long Run 6,0 km.',
      workouts: [
        {
          id: '3-thu-t',
          day: 'Thứ 5',
          title: '2×1,5 km Tempo (5,5 km)',
          type: 'Tempo',
          totalKm: 5.5,
          desc: "1 km nóng + 2×1,5 km tempo (nghỉ 2') + 0,5 km thả lỏng.",
          segments: [
            { name: 'Khởi động 1,0 km', distKm: 1.0, paceMin: 520, paceMax: 560, zone: 1, cue: 'Khởi động một cây số.' },
            { name: 'Tổ 1: 1,5 km Tempo', distKm: 1.5, paceMin: tempoMin, paceMax: tempoMax, zone: 4, cue: 'Tổ một tempo.' },
            { name: 'Đi bộ 0,5 km', distKm: 0.5, paceMin: 580, paceMax: 680, zone: 1, cue: 'Đi bộ hai phút.' },
            { name: 'Tổ 2: 1,5 km Tempo', distKm: 1.5, paceMin: tempoMin, paceMax: tempoMax, zone: 4, cue: 'Tổ hai tempo.' },
            { name: 'Thả lỏng 1,0 km', distKm: 1.0, paceMin: 540, paceMax: 600, zone: 1, cue: 'Thả lỏng một km cuối.' },
          ],
        },
        {
          id: '3-sat-l',
          day: 'Thứ 7',
          title: 'Long Easy 6,0 km',
          type: 'Long',
          totalKm: 6.0,
          desc: 'Sáu cây số chạy dài hiếu khí.',
          segments: [
            { name: 'Long Easy (5,5 km)', distKm: 5.5, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Bắt đầu sáu cây số chạy dài.' },
            { name: 'Thả lỏng 500m', distKm: 0.5, paceMin: 540, paceMax: 600, zone: 1, cue: 'Thả lỏng kết thúc.' },
          ],
        },
      ],
    },
    {
      week: 4,
      dateRange: '07/12/2026 - 13/12/2026',
      focus: 'Tuần giảm tải & BÀI TEST 3 KM HẾT SỨC.',
      workouts: [
        {
          id: '4-thu-e',
          day: 'Thứ 5',
          title: 'Easy 3,5 km + Strides',
          type: 'Strides',
          totalKm: 3.5,
          desc: 'Giữ sức cho bài test cuối tuần.',
          segments: [
            { name: 'Easy 3,1 km', distKm: 3.1, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Chạy nhẹ nhàng.' },
            { name: '4×15s Strides', distKm: 0.4, paceMin: rp, paceMax: rp + 30, zone: 4, cue: 'Bứt tốc ngắn.' },
          ],
        },
        {
          id: '4-sat-test',
          day: 'Thứ 7',
          title: 'CHECKPOINT: TEST 3,0 KM',
          type: 'Checkpoint',
          totalKm: 5.5,
          desc: '1,5 km nóng + 3,0 km test hết sức + 1 km thả lỏng.',
          segments: [
            { name: 'Khởi động 1,5 km', distKm: 1.5, paceMin: 520, paceMax: 560, zone: 2, cue: 'Khởi động kỹ chuẩn bị test.' },
            { name: 'TEST 3,0 KM HẾT SỨC', distKm: 3.0, paceMin: rp - 15, paceMax: rp + 10, zone: 5, cue: 'Bắt đầu ba cây số kiểm tra thể lực.' },
            { name: 'Thả lỏng 1,0 km', distKm: 1.0, paceMin: 550, paceMax: 620, zone: 1, cue: 'Hoàn thành bài test.' },
          ],
        },
      ],
    },
    {
      week: 5,
      dateRange: '14/12/2026 - 20/12/2026',
      focus: 'Kích hoạt tốc độ VO2max với Interval 5×400m & Long 7 km.',
      workouts: [
        {
          id: '5-thu-int',
          day: 'Thứ 5',
          title: 'Interval 5×400m (4,5 km)',
          type: 'Interval',
          totalKm: 4.5,
          desc: '1 km nóng + 5×400m nhanh + 1 km thả lỏng.',
          segments: [
            { name: 'Khởi động 1,0 km', distKm: 1.0, paceMin: 520, paceMax: 560, zone: 1, cue: 'Khởi động một cây số.' },
            { name: '5×400m Interval', distKm: 2.5, paceMin: intervalMin, paceMax: intervalMax, zone: 5, cue: 'Đẩy nhanh guồng chân.' },
            { name: 'Thả lỏng 1,0 km', distKm: 1.0, paceMin: 540, paceMax: 600, zone: 1, cue: 'Thả lỏng một cây số.' },
          ],
        },
        {
          id: '5-sat-l',
          day: 'Thứ 7',
          title: 'Long 7,0 km (Prog 1 km)',
          type: 'Long',
          totalKm: 7.0,
          desc: '6 km Easy + 1 km cuối tăng tốc nhẹ.',
          segments: [
            { name: 'Easy Z2 (6,0 km)', distKm: 6.0, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Sáu cây số nhẹ nhàng.' },
            { name: 'Progression 1,0 km', distKm: 1.0, paceMin: progMin, paceMax: progMax, zone: 3, cue: 'Một cây số cuối tăng tốc.' },
          ],
        },
      ],
    },
    {
      week: 6,
      dateRange: '21/12/2026 - 27/12/2026',
      focus: 'Ngưỡng lactate 2×2 km Tempo & Long Run 8 km.',
      workouts: [
        {
          id: '6-thu-t',
          day: 'Thứ 5',
          title: '2×2,0 km Tempo (5,5 km)',
          type: 'Tempo',
          totalKm: 5.5,
          desc: '1 km nóng + 2×2 km tempo + 0,5 km thả lỏng.',
          segments: [
            { name: 'Khởi động 1,0 km', distKm: 1.0, paceMin: 520, paceMax: 560, zone: 1, cue: 'Khởi động một cây số.' },
            { name: '2×2,0 km Tempo', distKm: 4.0, paceMin: tempoMin, paceMax: tempoMax, zone: 4, cue: 'Tăng tốc vào đoạn tempo!' },
            { name: 'Thả lỏng 500m', distKm: 0.5, paceMin: 550, paceMax: 610, zone: 1, cue: 'Thả lỏng về đích.' },
          ],
        },
        {
          id: '6-sat-l',
          day: 'Thứ 7',
          title: 'Long 8,0 km (Prog 1,5 km)',
          type: 'Long',
          totalKm: 8.0,
          desc: '6,5 km Z2 + 1,5 km cuối tăng tốc nhẹ.',
          segments: [
            { name: 'Easy Z2 (6,5 km)', distKm: 6.5, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Giữ nhịp đều.' },
            { name: 'Progression 1,5 km', distKm: 1.5, paceMin: progMin, paceMax: progMax, zone: 3, cue: 'Tăng tốc nhẹ nhàng về đích.' },
          ],
        },
      ],
    },
    {
      week: 7,
      dateRange: '28/12/2026 - 03/01/2027',
      focus: 'ĐỈNH KHỐI LƯỢNG: Interval 4×800m & Long 9 km (2 km Race Pace).',
      workouts: [
        {
          id: '7-thu-int',
          day: 'Thứ 5',
          title: 'Interval 4×800m (6,2 km)',
          type: 'Interval',
          totalKm: 6.2,
          desc: '1 km nóng + 4×800m + 1 km thả lỏng.',
          segments: [
            { name: 'Khởi động 1,0 km', distKm: 1.0, paceMin: 520, paceMax: 560, zone: 1, cue: 'Khởi động một cây số.' },
            { name: '4×800m Biến tốc', distKm: 4.2, paceMin: intervalMin, paceMax: intervalMax, zone: 5, cue: 'Tám trăm mét biến tốc.' },
            { name: 'Thả lỏng 1,0 km', distKm: 1.0, paceMin: 540, paceMax: 600, zone: 1, cue: 'Chạy nhẹ một cây số.' },
          ],
        },
        {
          id: '7-sat-cp',
          day: 'Thứ 7',
          title: 'Long 9,0 km (2 km Race Pace)',
          type: 'Checkpoint',
          totalKm: 9.0,
          desc: '7 km easy + 2 km cuối Race Pace.',
          segments: [
            { name: 'Easy 7,0 km', distKm: 7.0, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Bảy cây số tiết kiệm năng lượng.' },
            { name: 'TEST 2,0 KM RACE PACE', distKm: 2.0, paceMin: rp - 5, paceMax: rp + 8, zone: 4, cue: 'Đẩy lên đúng tốc độ thi đấu.' },
          ],
        },
      ],
    },
    {
      week: 8,
      dateRange: '04/01/2027 - 10/01/2027',
      focus: 'Giai đoạn Taper giảm tải, giữ cảm giác tốc độ.',
      workouts: [
        {
          id: '8-thu-rp',
          day: 'Thứ 5',
          title: '2 km Race Pace + Strides',
          type: 'Tempo',
          totalKm: 4.0,
          desc: '1 km nóng + 2 km tốc độ đua + 1 km thả lỏng.',
          segments: [
            { name: 'Khởi động 1,0 km', distKm: 1.0, paceMin: 520, paceMax: 560, zone: 1, cue: 'Khởi động.' },
            { name: '2,0 km Race Pace', distKm: 2.0, paceMin: rp - 5, paceMax: rp + 8, zone: 4, cue: 'Hai cây số tốc độ đua.' },
            { name: 'Thả lỏng + Strides', distKm: 1.0, paceMin: 520, paceMax: 580, zone: 2, cue: 'Thả lỏng nhẹ nhàng.' },
          ],
        },
        {
          id: '8-sat-e',
          day: 'Thứ 7',
          title: 'Easy 6,0 km (1 km Race Pace)',
          type: 'Easy',
          totalKm: 6.0,
          desc: 'Giảm tải cuối tuần, 1 km giữa ở pace mục tiêu.',
          segments: [
            { name: 'Easy 2,5 km', distKm: 2.5, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Hai cây rưỡi nhẹ nhàng.' },
            { name: '1,0 km Race Pace', distKm: 1.0, paceMin: rp - 5, paceMax: rp + 8, zone: 4, cue: 'Một cây số tốc độ thi đấu.' },
            { name: 'Easy 2,5 km', distKm: 2.5, paceMin: easyMin, paceMax: easyMax, zone: 2, cue: 'Hai cây rưỡi thả lỏng.' },
          ],
        },
      ],
    },
    {
      week: 9,
      dateRange: '11/01/2027 - 17/01/2027',
      focus: 'TUẦN RACE DAY: Shakeout & NGÀY ĐUA 10 KM (16/01/2027).',
      workouts: [
        {
          id: '9-thu-shk',
          day: 'Thứ 5',
          title: 'Shakeout 3,0 km + Strides',
          type: 'Recovery',
          totalKm: 3.3,
          desc: 'Rũ chân nhẹ nhàng hai ngày trước đua.',
          segments: [
            { name: 'Shakeout 3,0 km', distKm: 3.0, paceMin: easyMin, paceMax: easyMax, zone: 1, cue: 'Chạy rũ chân thư giãn.' },
            { name: '3×80m Strides', distKm: 0.3, paceMin: rp, paceMax: rp + 20, zone: 3, cue: 'Bứt tốc nhẹ đánh thức cơ.' },
          ],
        },
        {
          id: '9-sat-race',
          day: 'Thứ 7 · 16/01',
          title: 'RACE DAY 10,0 KM',
          type: 'Race',
          totalKm: 10.0,
          desc: 'Chiến thuật 3 chặng: Km 1–2 kìm chân, Km 3–8 Race Pace, Km 9–10 rút đích.',
          segments: [
            { name: 'Chặng 1 (Km 1–2): Kìm chân', distKm: 2.0, paceMin: rp + 8, paceMax: rp + 18, zone: 3, cue: 'Xuất phát kìm chân.' },
            { name: 'Chặng 2 (Km 3–8): Race Pace', distKm: 6.0, paceMin: rp - 3, paceMax: rp + 5, zone: 4, cue: 'Duy trì đúng tốc độ mục tiêu.' },
            { name: 'Chặng 3 (Km 9–10): Rút đích', distKm: 2.0, paceMin: rp - 15, paceMax: rp, zone: 5, cue: 'Dốc hết sức về đích!' },
          ],
        },
      ],
    },
  ];

  // Enrich for compatibility with existing WorkoutPlan hooks
  return raw.map((week) => ({
    ...week,
    workouts: week.workouts.map((w) => ({
      ...w,
      description: w.desc,
      totalDistanceKm: w.totalKm,
      dayOfWeek: w.day,
      date: week.dateRange.split(' - ')[0],
      segments: w.segments.map((s, idx) => ({
        ...s,
        id: `${w.id}-seg-${idx}`,
        distanceMeters: Math.round(s.distKm * 1000),
        targetPaceMinSec: s.paceMin,
        targetPaceMaxSec: s.paceMax,
        voiceIntro: s.cue,
        maxHrBpm: s.zone === 1 ? 145 : s.zone === 2 ? 158 : s.zone === 3 ? 171 : s.zone === 4 ? 180 : 190,
        type: s.zone === 1 ? 'warmup' : s.zone === 5 ? 'interval_work' : 'main',
        paceType: s.zone === 1 ? 'easy' : s.zone === 4 ? 'tempo' : s.zone === 5 ? 'interval' : 'easy',
      })),
    })),
  }));
}

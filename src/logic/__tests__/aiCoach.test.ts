import {
  generateAdaptiveWorkout,
  getThisWeekStats,
  analyzeInRunPerformance,
  RunnerFeeling,
} from '../aiCoach';
import { DEFAULT_ATHLETE_PROFILE } from '../athlete';
import { CompletedRunSession } from '../../services/storage';

describe('aiCoach Logic Tests', () => {
  const mockProfile = DEFAULT_ATHLETE_PROFILE;

  test('FATIGUED_SORE always generates EASY_RECOVERY workout regardless of day', () => {
    const monday = new Date('2026-11-16T10:00:00Z');
    const res = generateAdaptiveWorkout('FATIGUED_SORE', monday, mockProfile, []);

    expect(res.recommendedType).toBe('EASY_RECOVERY');
    expect(res.workout.totalDistanceKm).toBeLessThanOrEqual(3.0);
    expect(res.reasoning).toContain('chân mỏi hoặc đuối sức');
  });

  test('LIMITED_TIME generates QUICK_SHAKEOUT workout within 20 mins', () => {
    const thursday = new Date('2026-11-19T10:00:00Z');
    const res = generateAdaptiveWorkout('LIMITED_TIME', thursday, mockProfile, []);

    expect(res.recommendedType).toBe('QUICK_SHAKEOUT');
    expect(res.workout.totalDistanceKm).toBeLessThanOrEqual(2.5);
  });

  test('Wednesday (day 3) post-badminton suggests recovery run', () => {
    const wednesday = new Date('2026-11-18T10:00:00Z');
    const res = generateAdaptiveWorkout('NORMAL', wednesday, mockProfile, []);

    expect(res.recommendedType).toBe('EASY_RECOVERY');
    expect(res.reasoning).toContain('cầu lông');
  });

  test('Tuesday (day 2) badminton day warns not to over-run', () => {
    const tuesday = new Date('2026-11-17T08:00:00Z');
    const res = generateAdaptiveWorkout('NORMAL', tuesday, mockProfile, []);

    expect(res.recommendedType).toBe('QUICK_SHAKEOUT');
    expect(res.reasoning).toContain('cầu lông');
  });

  test('FRESH_READY on free day with no recent runs generates Tempo or Strides', () => {
    const monday = new Date('2026-11-16T10:00:00Z');
    const res = generateAdaptiveWorkout('FRESH_READY', monday, mockProfile, []);

    expect(['TEMPO_MAINTENANCE', 'EASY_STRIDES']).toContain(res.recommendedType);
    expect(res.workout.segments.length).toBeGreaterThan(0);
  });

  test('getThisWeekStats correctly aggregates runs from this week Monday', () => {
    const wednesday = new Date('2026-11-18T12:00:00Z');
    const mockSessions: CompletedRunSession[] = [
      {
        id: '1',
        workoutId: 'w1',
        workoutTitle: 'Monday Run',
        date: '16/11/2026',
        timestamp: new Date('2026-11-16T07:00:00Z').getTime(),
        totalDistanceMeters: 4000,
        elapsedSeconds: 1800,
        averagePaceSecPerKm: 450,
        averageHrBpm: 155,
        maxHrBpm: 165,
        timeInZonesSeconds: { 1: 0, 2: 1800, 3: 0, 4: 0, 5: 0 },
        splits: [],
        averageCadenceSpm: 172,
        alertsFiredCount: 0,
        rpeRating: 6,
        userNote: '',
        goalIdAtRun: 'sub60',
      },
      {
        id: 'old',
        workoutId: 'w0',
        workoutTitle: 'Last Week Sunday Run',
        date: '15/11/2026',
        timestamp: new Date('2026-11-15T07:00:00Z').getTime(),
        totalDistanceMeters: 5000,
        elapsedSeconds: 2200,
        averagePaceSecPerKm: 440,
        averageHrBpm: 158,
        maxHrBpm: 168,
        timeInZonesSeconds: { 1: 0, 2: 2200, 3: 0, 4: 0, 5: 0 },
        splits: [],
        averageCadenceSpm: 170,
        alertsFiredCount: 0,
        rpeRating: 7,
        userNote: '',
        goalIdAtRun: 'sub60',
      },
    ];

    const stats = getThisWeekStats(wednesday, mockSessions);
    expect(stats.weeklyDistanceKm).toBe(4.0);
    expect(stats.sessionsCount).toBe(1);
    expect(stats.lastRunHoursAgo).toBeGreaterThan(0);
  });

  test('analyzeInRunPerformance triggers high heart rate warning when HR >= 185', () => {
    const input = {
      elapsedSeconds: 1200,
      totalDistanceMeters: 2500,
      targetTotalDistanceMeters: 5000,
      rollingPaceSecPerKm: 380,
      averagePaceSecPerKm: 390,
      heartRate: 188,
      cadenceSpm: 172,
      currentSegmentName: 'Tempo 3 km',
      currentSegmentType: 'tempo',
      targetPaceMinSec: 360,
      targetPaceMaxSec: 390,
      lthrBpm: 176,
      goalName: 'Sub 60',
    };

    const insight = analyzeInRunPerformance(input);
    expect(insight.urgency).toBe('WARNING');
    expect(insight.headline).toContain('Tim đang vọt cao');
    expect(insight.voiceAudioText).toContain('chậm lại');
  });

  test('analyzeInRunPerformance prompts cadence fix if SPM < 165', () => {
    const input = {
      elapsedSeconds: 800,
      totalDistanceMeters: 1500,
      targetTotalDistanceMeters: 4000,
      rollingPaceSecPerKm: 490,
      averagePaceSecPerKm: 485,
      heartRate: 152,
      cadenceSpm: 158,
      currentSegmentName: 'Easy 4 km',
      currentSegmentType: 'main',
      targetPaceMinSec: 480,
      targetPaceMaxSec: 540,
      lthrBpm: 176,
      goalName: 'Sub 60',
    };

    const insight = analyzeInRunPerformance(input);
    expect(insight.urgency).toBe('ADJUST_PACE');
    expect(insight.headline).toContain('Guồng chân đang chậm');
    expect(insight.voiceAudioText).toContain('metronome');
  });

  test('analyzeInRunPerformance motivates during final kilometer', () => {
    const input = {
      elapsedSeconds: 2700,
      totalDistanceMeters: 4500,
      targetTotalDistanceMeters: 5000,
      rollingPaceSecPerKm: 358,
      averagePaceSecPerKm: 360,
      heartRate: 172,
      cadenceSpm: 174,
      currentSegmentName: 'Đoạn về đích',
      currentSegmentType: 'main',
      targetPaceMinSec: 355,
      targetPaceMaxSec: 365,
      lthrBpm: 176,
      goalName: 'Sub 60',
    };

    const insight = analyzeInRunPerformance(input);
    expect(insight.urgency).toBe('MOTIVATION');
    expect(insight.headline).toContain('Còn dưới 1 km cuối');
  });
});

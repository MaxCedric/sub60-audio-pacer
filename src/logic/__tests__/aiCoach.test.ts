import {
  generateAdaptiveWorkout,
  getThisWeekStats,
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
});

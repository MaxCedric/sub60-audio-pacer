import {
  isGpsAccuracyReliable,
  isInSegmentGracePeriod,
  evaluateAutoPause,
  evaluatePaceDeviationWithTolerance,
  shouldTriggerPtCheckIn,
} from '../gpsFilter';

describe('GPS Filter & Grace Period Logic (Section 5)', () => {
  test('isGpsAccuracyReliable returns false when accuracy > 20m in last 10s', () => {
    const now = 50000;
    const samples = [
      { accuracyMeters: 25, timestamp: now - 3000 },
      { accuracyMeters: 30, timestamp: now - 1000 },
    ];
    const res = isGpsAccuracyReliable(samples, now, 20);
    expect(res.isReliable).toBe(false);
    expect(res.averageAccuracyMeters).toBe(27.5);
  });

  test('isGpsAccuracyReliable returns true when accuracy <= 20m in last 10s', () => {
    const now = 50000;
    const samples = [
      { accuracyMeters: 12, timestamp: now - 3000 },
      { accuracyMeters: 14, timestamp: now - 1000 },
    ];
    const res = isGpsAccuracyReliable(samples, now, 20);
    expect(res.isReliable).toBe(true);
    expect(res.averageAccuracyMeters).toBe(13);
  });

  test('isInSegmentGracePeriod returns true during first 20s or 100m', () => {
    expect(isInSegmentGracePeriod(10, 50)).toBe(true); // <20s and <100m
    expect(isInSegmentGracePeriod(15, 120)).toBe(true); // <20s
    expect(isInSegmentGracePeriod(25, 80)).toBe(true); // <100m
    expect(isInSegmentGracePeriod(25, 120)).toBe(false); // past grace period
  });

  test('evaluateAutoPause triggers pause when speed < 1.0 m/s for >= 6s', () => {
    // Current state RUNNING, speed 0.6 m/s, sustained 6s
    const res = evaluateAutoPause(0.6, 'RUNNING', 6, 0, false);
    expect(res.shouldTriggerPause).toBe(true);
    expect(res.nextState).toBe('PAUSED');
  });

  test('evaluateAutoPause triggers resume when speed > 1.8 m/s for >= 3s', () => {
    // Current state PAUSED, speed 2.2 m/s, sustained 3s
    const res = evaluateAutoPause(2.2, 'PAUSED', 0, 3, false);
    expect(res.shouldTriggerResume).toBe(true);
    expect(res.nextState).toBe('RUNNING');
  });

  test('evaluateAutoPause does not pause during interval_rest', () => {
    const res = evaluateAutoPause(0.2, 'RUNNING', 10, 0, true);
    expect(res.shouldTriggerPause).toBe(false);
    expect(res.nextState).toBe('RUNNING');
  });

  test('evaluatePaceDeviationWithTolerance applies +-12s tolerance', () => {
    // target range: 450 - 470
    // min tolerance: 450 - 12 = 438
    // max tolerance: 470 + 12 = 482
    expect(evaluatePaceDeviationWithTolerance(440, 450, 470, 12)).toBe('IN_ZONE');
    expect(evaluatePaceDeviationWithTolerance(480, 450, 470, 12)).toBe('IN_ZONE');
    expect(evaluatePaceDeviationWithTolerance(430, 450, 470, 12)).toBe('TOO_FAST');
    expect(evaluatePaceDeviationWithTolerance(490, 450, 470, 12)).toBe('TOO_SLOW');
  });

  test('shouldTriggerPtCheckIn checks all 3 conditions', () => {
    // GPS good, elapsed 150s (>120s), targetMax 470, current 505 (drift +35s >= +30s), sustained 32s (>=30s)
    expect(shouldTriggerPtCheckIn(true, 150, 505, 470, 32)).toBe(true);

    // If first 2 minutes (elapsed 90s) -> false
    expect(shouldTriggerPtCheckIn(true, 90, 505, 470, 32)).toBe(false);

    // If GPS unreliable -> false
    expect(shouldTriggerPtCheckIn(false, 150, 505, 470, 32)).toBe(false);

    // If drift is only +15s (not >= +30s) -> false
    expect(shouldTriggerPtCheckIn(true, 150, 485, 470, 32)).toBe(false);
  });
});

import {
  calculateHeartRateZones,
  getZoneForHeartRate,
  evaluateHeartRateAlert,
} from '../zones';
import { DEFAULT_ATHLETE_PROFILE } from '../athlete';

describe('Heart Rate Zones & Alerts Logic (Section 2)', () => {
  const profile = DEFAULT_ATHLETE_PROFILE; // LTHR = 176, danger = 190, max = 195

  test('calculateHeartRateZones generates 5 Joe Friel zones from LTHR 176', () => {
    const zones = calculateHeartRateZones(176);
    expect(zones).toHaveLength(5);

    // Z1: < 150
    expect(zones[0].maxHr).toBe(149);
    // Z2: 150 - 157
    expect(zones[1].minHr).toBe(150);
    expect(zones[1].maxHr).toBe(157);
    // Z3: 158 - 165
    expect(zones[2].minHr).toBe(158);
    expect(zones[2].maxHr).toBe(165);
    // Z4: 166 - 175
    expect(zones[3].minHr).toBe(166);
    expect(zones[3].maxHr).toBe(175);
    // Z5: >= 176
    expect(zones[4].minHr).toBe(176);
  });

  test('getZoneForHeartRate correctly identifies zones', () => {
    expect(getZoneForHeartRate(145, 176)).toBe(1);
    expect(getZoneForHeartRate(155, 176)).toBe(2);
    expect(getZoneForHeartRate(162, 176)).toBe(3);
    expect(getZoneForHeartRate(170, 176)).toBe(4);
    expect(getZoneForHeartRate(180, 176)).toBe(5);
  });

  test('Danger rule: HR >= 195 for 5 seconds triggers CRITICAL_DANGER_WALK immediately', () => {
    const res = evaluateHeartRateAlert({
      currentHr: 196,
      segmentType: 'main',
      segmentElapsedSeconds: 300,
      highDangerHrSustainedSeconds: 5,
      maxHrSustainedSeconds: 5,
      segmentCeilingExceededSeconds: 5,
      profile,
    });
    expect(res).toBe('CRITICAL_DANGER_WALK');
  });

  test('Danger rule: HR >= 190 for 30 seconds triggers CRITICAL_DANGER_WALK', () => {
    const res = evaluateHeartRateAlert({
      currentHr: 191,
      segmentType: 'tempo',
      segmentElapsedSeconds: 400,
      highDangerHrSustainedSeconds: 30,
      maxHrSustainedSeconds: 0,
      segmentCeilingExceededSeconds: 40,
      profile,
    });
    expect(res).toBe('CRITICAL_DANGER_WALK');
  });

  test('Segment ceiling: easy run exceeding 157 bpm for 60s triggers SLOW_DOWN_SEGMENT_CEILING', () => {
    const res = evaluateHeartRateAlert({
      currentHr: 162,
      segmentType: 'main',
      segmentElapsedSeconds: 300,
      highDangerHrSustainedSeconds: 0,
      maxHrSustainedSeconds: 0,
      segmentCeilingExceededSeconds: 60,
      profile,
    });
    expect(res).toBe('SLOW_DOWN_SEGMENT_CEILING');
  });

  test('Segment ceiling: tempo exceeding 176 bpm for 60s triggers SLOW_DOWN_SEGMENT_CEILING', () => {
    const res = evaluateHeartRateAlert({
      currentHr: 178,
      segmentType: 'tempo',
      segmentElapsedSeconds: 300,
      highDangerHrSustainedSeconds: 0,
      maxHrSustainedSeconds: 0,
      segmentCeilingExceededSeconds: 60,
      profile,
    });
    expect(res).toBe('SLOW_DOWN_SEGMENT_CEILING');
  });

  test('Interval work & stride do NOT trigger standard HR alerts', () => {
    const res = evaluateHeartRateAlert({
      currentHr: 182,
      segmentType: 'interval_work',
      segmentElapsedSeconds: 60,
      highDangerHrSustainedSeconds: 0,
      maxHrSustainedSeconds: 0,
      segmentCeilingExceededSeconds: 50,
      profile,
    });
    expect(res).toBe('NONE');
  });

  test('Interval rest announces ready when HR drops below 150', () => {
    const res = evaluateHeartRateAlert({
      currentHr: 146,
      segmentType: 'interval_rest',
      segmentElapsedSeconds: 25,
      highDangerHrSustainedSeconds: 0,
      maxHrSustainedSeconds: 0,
      segmentCeilingExceededSeconds: 0,
      profile,
    });
    expect(res).toBe('REST_READY_NOTIFICATION');
  });

  test('Segments shorter than 3 minutes (180s) do not trigger HR ceiling alert due to cardiac lag', () => {
    const res = evaluateHeartRateAlert({
      currentHr: 165,
      segmentType: 'warmup',
      segmentDurationSeconds: 120, // 2 minutes
      segmentElapsedSeconds: 70,
      highDangerHrSustainedSeconds: 0,
      maxHrSustainedSeconds: 0,
      segmentCeilingExceededSeconds: 65,
      profile,
    });
    expect(res).toBe('NONE');
  });
});

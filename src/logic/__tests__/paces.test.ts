import {
  resolvePaceRange,
  calculatePace3k,
  formatPaceMinutesSeconds,
  formatPaceVoiceWords,
} from '../paces';
import { DEFAULT_ATHLETE_PROFILE, GOAL_TIERS } from '../athlete';

describe('Pace Calculation Logic (Section 3)', () => {
  const profile = {
    lactateThresholdPaceSecPerKm: 451, // 7'31"
    fastest3kSec: 1268, // 21:08 => pace3k = 423 (7'03")
  };

  test('calculatePace3k calculates average pace per km from 3K test time', () => {
    expect(calculatePace3k(1268)).toBe(423);
  });

  test('resolvePaceRange for easy run: LT + 45 -> LT + 90 (496 - 541)', () => {
    const res = resolvePaceRange({ paceType: 'easy' }, profile);
    expect(res.minSec).toBe(496);
    expect(res.maxSec).toBe(541);
    expect(res.hasPaceAlert).toBe(true);
    expect(res.displayText).toBe("8'16\"–9'01\"");
  });

  test('resolvePaceRange for progression: LT + 10 -> LT + 20 (461 - 471)', () => {
    const res = resolvePaceRange({ paceType: 'progression' }, profile);
    expect(res.minSec).toBe(461);
    expect(res.maxSec).toBe(471);
    expect(res.displayText).toBe("7'41\"–7'51\"");
  });

  test('resolvePaceRange for tempo: LT - 5 -> LT + 5 (446 - 456)', () => {
    const res = resolvePaceRange({ paceType: 'tempo' }, profile);
    expect(res.minSec).toBe(446);
    expect(res.maxSec).toBe(456);
    expect(res.displayText).toBe("7'26\"–7'36\"");
  });

  test('resolvePaceRange for interval: pace3k - 10 -> pace3k (413 - 423)', () => {
    const res = resolvePaceRange({ paceType: 'interval' }, profile);
    expect(res.minSec).toBe(413);
    expect(res.maxSec).toBe(423);
    expect(res.displayText).toBe("6'53\"–7'03\"");
  });

  test('resolvePaceRange for race pace: matches selected goal tier', () => {
    const sub60Res = resolvePaceRange({ paceType: 'race' }, profile, GOAL_TIERS.sub60);
    expect(sub60Res.minSec).toBe(355);
    expect(sub60Res.maxSec).toBe(360);

    const sub65Res = resolvePaceRange({ paceType: 'race' }, profile, GOAL_TIERS.sub65);
    expect(sub65Res.minSec).toBe(385);
    expect(sub65Res.maxSec).toBe(390);

    const under70Res = resolvePaceRange({ paceType: 'race' }, profile, GOAL_TIERS.under70);
    expect(under70Res.minSec).toBe(415);
    expect(under70Res.maxSec).toBe(420);
  });

  test('resolvePaceRange for stride / rest has no pace alert', () => {
    const strideRes = resolvePaceRange({ paceType: 'stride' }, profile);
    expect(strideRes.hasPaceAlert).toBe(false);

    const restRes = resolvePaceRange({ paceType: 'rest' }, profile);
    expect(restRes.hasPaceAlert).toBe(false);
  });

  test('formatPaceVoiceWords converts pace to Vietnamese words', () => {
    expect(formatPaceVoiceWords(495)).toBe('tám phút 15');
    expect(formatPaceVoiceWords(360)).toBe('sáu phút tròn');
  });
});

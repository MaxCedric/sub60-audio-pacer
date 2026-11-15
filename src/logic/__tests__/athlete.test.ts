import {
  calculateRiegelTime,
  evaluateWeek4Test3k,
  evaluateWeek7RacePaceTest,
  getNextDowngradeGoal,
  getNextUpgradeGoal,
} from '../athlete';

describe('Athlete Profile & Checkpoints Logic (Section 1)', () => {
  test('calculateRiegelTime calculates realistic equivalent times', () => {
    // 3 km in 21:08 (1268s) -> 10 km
    const time10k = calculateRiegelTime(1268, 3, 10);
    // (10/3)^1.06 ~= 3.57 => 1268 * 3.57 ~= 4530s (1h15m)
    expect(time10k).toBeGreaterThan(4400);
    expect(time10k).toBeLessThan(4700);
  });

  test('Week 4 test <= 18:30 (1110s) stays on Sub 60', () => {
    const res = evaluateWeek4Test3k(1100);
    expect(res.suggestedGoalId).toBe('sub60');
    expect(res.message).toContain('đúng hướng Sub 60');
  });

  test('Week 4 test between 18:31 and 19:30 suggests Sub 65', () => {
    const res = evaluateWeek4Test3k(1150); // 19:10
    expect(res.suggestedGoalId).toBe('sub65');
    expect(res.message).toContain('Sub 65');
  });

  test('Week 4 test > 19:30 suggests Under 70', () => {
    const res = evaluateWeek4Test3k(1200); // 20:00
    expect(res.suggestedGoalId).toBe('under70');
    expect(res.message).toContain('Dưới 70 phút');
  });

  test('Week 7 race pace test: pace dropped > 15s/km suggests downgrade', () => {
    // target 355, actual 372 (+17s)
    const res = evaluateWeek7RacePaceTest(372, 175, 355);
    expect(res).not.toBeNull();
    expect(res?.suggestedGoalId).toBe('sub65');
  });

  test('Week 7 race pace test: avg HR >= 186 suggests downgrade', () => {
    // target 355, actual 360, HR 187
    const res = evaluateWeek7RacePaceTest(360, 187, 355);
    expect(res).not.toBeNull();
    expect(res?.suggestedGoalId).toBe('sub65');
  });

  test('Goal progression downgrade and upgrade cycle', () => {
    expect(getNextDowngradeGoal('sub60')).toBe('sub65');
    expect(getNextDowngradeGoal('sub65')).toBe('under70');
    expect(getNextDowngradeGoal('under70')).toBe('under70');

    expect(getNextUpgradeGoal('under70')).toBe('sub65');
    expect(getNextUpgradeGoal('sub65')).toBe('sub60');
    expect(getNextUpgradeGoal('sub60')).toBe('sub60');
  });
});

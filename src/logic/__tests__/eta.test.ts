import {
  calculateEstimatedFinishTime,
  formatEtaVoiceWords,
} from '../eta';

describe('ETA Finish Time Logic (Section 6)', () => {
  test('calculateEstimatedFinishTime calculates ETA from recent 2 splits', () => {
    // Runner is at km 5 (5000m) with 2250s elapsed (pace 7'30" = 450s)
    // Target total: 10,000m (5000m left)
    // Splits: km 4 was 440s, km 5 was 430s => recent pace = 435s
    const splits = [
      { km: 1, paceSecPerKm: 460, elapsedSeconds: 460 },
      { km: 2, paceSecPerKm: 455, elapsedSeconds: 915 },
      { km: 3, paceSecPerKm: 450, elapsedSeconds: 1365 },
      { km: 4, paceSecPerKm: 440, elapsedSeconds: 1805 },
      { km: 5, paceSecPerKm: 430, elapsedSeconds: 2235 },
    ];

    const eta = calculateEstimatedFinishTime(2235, 5000, 10000, splits);
    expect(eta).not.toBeNull();
    // 5 km left * 435s = 2175s. Total: 2235 + 2175 = 4410s
    expect(eta?.estimatedTotalSeconds).toBe(4410);
    expect(eta?.remainingDistanceMeters).toBe(5000);
  });

  test('formatEtaVoiceWords formats ETA into spoken Vietnamese words', () => {
    // 4210 seconds = 1 hour 10 minutes 10 seconds
    const str = formatEtaVoiceWords(4210);
    expect(str).toBe('một giờ 10 phút 10 giây');

    // 2730 seconds = 45 minutes 30 seconds
    const str2 = formatEtaVoiceWords(2730);
    expect(str2).toBe('45 phút 30 giây');
  });
});

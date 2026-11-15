import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Speech from 'expo-speech';
import trainingPlanData from '../data/trainingPlan.json';

/**
 * Module 3: Audio Coach (Chuẩn PT Chạy Bộ Thấu Cảm: Bình tĩnh, chậm rãi, ngắn gọn & cổ vũ)
 * - Tốc độ đọc 0.90 chậm rãi, nhịp nhàng theo nhịp thở 2:2 của runner.
 * - Ưu tiên Tim mạch hơn Pace: Nếu runner mệt (tim cao), KHÔNG bắt tăng tốc, chỉ nhắc thở sâu.
 * - Cooldown kéo dài (40-60s) để runner không bị "điếc tai" hay ồn ào khi đang chạy mệt.
 * - Tích hợp câu cổ vũ tâm lý thực chiến: "Sắp được rồi, ráng lên", "Còn 1 km", "500m cuối".
 */

export type SpeechPriority =
  | 'CRITICAL_HR'
  | 'TREND_WARNING'
  | 'MILESTONE'
  | 'PACE_WARNING'
  | 'POSITIVE'
  | 'INFO';

type EarconType = 'good' | 'warn' | 'danger';

// Kéo dài Cooldown để tránh nói dồn dập, nhức đầu khi chạy
const PACE_ALERT_COOLDOWN_MS = 50000;
const PACE_TREND_COOLDOWN_MS = 45000;
const HR_TREND_COOLDOWN_MS = 40000;
const HR_ALERT_COOLDOWN_MS = 25000;
const POSITIVE_COOLDOWN_MS = 60000;

/**
 * BẢNG NỘI DUNG TẤT CẢ ÂM THANH VOICE CỦA APP (Ngắn gọn, dứt khoát, dễ nghe khi thở dốc)
 */
export const AUDIO_SCRIPTS = {
  // 1. Kiểm tra thể trạng (Check-in tương tác)
  CHECK_IN: 'Bạn ổn không? Đau chân hay mệt quá?',
  CHECK_IN_PAIN: 'Dừng chạy ngay. Đi bộ thả lỏng kẻo chấn thương!',
  CHECK_IN_FATIGUE: 'Chậm lại một nhịp. Thả lỏng vai, thở sâu nào.',
  CHECK_IN_OK: 'Tốt lắm. Cứ đều chân, giữ nhịp thở nhé!',

  // 2. Cảnh báo nhịp tim & Pace (ngắn gọn dưới 6 từ)
  CRITICAL_HR: 'Nguy hiểm! Tim quá cao, đi bộ ngay!',
  HR_RED_ZONE: 'Tim chạm ngưỡng đỏ. Thả lỏng vai, thở sâu!',
  HR_RISING: (hr: number) => `Tim lên ${hr}. Hạ nhẹ nhịp độ nhé.`,
  PACE_TOO_FAST: 'Hơi nhanh. Kìm chân lại một chút.',
  PACE_TOO_SLOW_FATIGUED: 'Tim đang cao. Thả lỏng vai, thở sâu nhé.',
  PACE_TOO_SLOW_NORMAL: 'Hơi chậm rồi. Nâng nhẹ nhịp bước lên.',
  PACE_SPIKE_FAST: 'Đang vọt tốc. Kìm nhẹ bước lại.',
  PACE_DRIFT_SLOW: 'Đang chùng chân. Nâng nhẹ bước lên.',
  IN_ZONE_CONFIRM: 'Nhịp rất đẹp. Cứ giữ đều!',

  // 3. Mốc cự ly & Cổ vũ tinh thần
  DISTANCE_SPLIT: (km: string, pace: string) => `${km}. Pace ${pace}. Rất tốt!`,
  MOTIVATION_HALFWAY: 'Qua nửa bài rồi. Rất tốt, giữ đều nhé!',
  MOTIVATION_1KM: 'Còn một cây số nữa. Ráng lên, sắp xong rồi!',
  MOTIVATION_500M: 'Năm trăm mét cuối. Thả lỏng vai, cố lên!',

  // 4. Trạng thái bài tập
  WORKOUT_COMPLETED: 'Tuyệt vời! Xong bài tập rồi. Cứ chạy tiếp nếu còn sức nhé!',
  WORKOUT_STOPPED: 'Đã dừng bài tập. Bạn đi bộ thả lỏng nhé.',
  SUB65_ON: 'Chuyển sang mục tiêu an toàn Sub 65.',
  SUB65_OFF: 'Quay lại mục tiêu Sub 60.',
  WALK_RECOVERY_ON: 'Chuyển sang đi bộ hồi phục.',
  RESUME_RUNNING: 'Bắt đầu chạy lại. Tăng tốc từ từ nhé.',
};

function encodeWavBase64(samples: Int16Array, sampleRate = 22050): string {
  const dataSize = samples.length * 2;
  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  for (let i = 0; i < buffer.length; i += 3) {
    const b1 = buffer[i];
    const b2 = i + 1 < buffer.length ? buffer[i + 1] : 0;
    const b3 = i + 2 < buffer.length ? buffer[i + 2] : 0;
    const triplet = (b1 << 16) | (b2 << 8) | b3;

    base64 += chars[(triplet >> 18) & 0x3f];
    base64 += chars[(triplet >> 12) & 0x3f];
    base64 += i + 1 < buffer.length ? chars[(triplet >> 6) & 0x3f] : '=';
    base64 += i + 2 < buffer.length ? chars[triplet & 0x3f] : '=';
  }
  return `data:audio/wav;base64,${base64}`;
}

function createMetronomeTickDataUri(frequencyHz = 980, durationMs = 18): string {
  const sampleRate = 22050;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 180);
    const val = Math.sin(2 * Math.PI * frequencyHz * t) * envelope;
    samples[i] = Math.round(Math.max(-1, Math.min(1, val)) * 0x7fff * 0.45);
  }
  return encodeWavBase64(samples, sampleRate);
}

function createEarconDataUri(type: EarconType): string {
  const sampleRate = 22050;
  if (type === 'good') {
    const numSamples = Math.floor(sampleRate * 0.11);
    const samples = new Int16Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 28);
      const val = Math.sin(2 * Math.PI * 880 * t) * env;
      samples[i] = Math.round(val * 0x7fff * 0.4);
    }
    return encodeWavBase64(samples, sampleRate);
  }

  const freq = type === 'danger' ? 1180 : 620;
  const numSamples = Math.floor((sampleRate * 160) / 1000);
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const ms = t * 1000;
    const inPulse1 = ms >= 0 && ms <= 55;
    const inPulse2 = ms >= 95 && ms <= 155;
    if (inPulse1 || inPulse2) {
      const localT = inPulse1 ? t : (ms - 95) / 1000;
      const env = Math.exp(-localT * 35);
      const val = Math.sin(2 * Math.PI * freq * t) * env;
      samples[i] = Math.round(val * 0x7fff * 0.5);
    } else {
      samples[i] = 0;
    }
  }
  return encodeWavBase64(samples, sampleRate);
}

class AudioCoachService {
  private isSpeaking = false;
  private lastPaceAlertTime = 0;
  private lastPaceTrendTime = 0;
  private lastHrTrendTime = 0;
  private lastHrAlertTime = 0;
  private lastPositiveTime = 0;
  private speechRate = 0.82; // Tốc độ 0.82: Đọc chậm rãi, phát âm từng chữ rõ ràng theo guồng chân

  private lactateThresholdHrBpm: number =
    trainingPlanData?.athleteProfile?.lactateThresholdHrBpm || 175;

  private metronomeTimer: ReturnType<typeof setInterval> | null = null;
  private metronomeSound: Audio.Sound | null = null;
  private earconSounds: Partial<Record<EarconType, Audio.Sound>> = {};
  private metronomeBpm = 172;
  private isMetronomeActive = false;

  setSpeechRate(newRate: number): void {
    this.speechRate = Math.max(0.65, Math.min(1.0, newRate));
  }

  getSpeechRate(): number {
    return this.speechRate;
  }

  setLactateThresholdHr(newLtHrBpm: number): void {
    this.lactateThresholdHrBpm = Math.max(150, Math.min(195, Math.round(newLtHrBpm)));
  }

  getLactateThresholdHr(): number {
    return this.lactateThresholdHrBpm;
  }

  getEarlyWarningHr(): number {
    return this.lactateThresholdHrBpm - 5; // Mặc định 175 - 5 = 170 bpm
  }

  getHardLimitHr(): number {
    return this.lactateThresholdHrBpm + 3; // Mặc định 175 + 3 = 178 bpm
  }

  async initAudioSession(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        playThroughEarpieceAndroid: false,
      });
    } catch {
      // Bỏ qua
    }
  }

  private async setDuckingMode(enableDucking: boolean): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: enableDucking,
        interruptionModeIOS: enableDucking
          ? InterruptionModeIOS.DuckOthers
          : InterruptionModeIOS.MixWithOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        playThroughEarpieceAndroid: false,
      });
    } catch {
      // Bỏ qua
    }
  }

  private async playEarcon(type: EarconType): Promise<void> {
    try {
      if (!this.earconSounds[type]) {
        const uri = createEarconDataUri(type);
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { volume: 0.5, shouldPlay: false }
        );
        this.earconSounds[type] = sound;
      }
      await this.earconSounds[type]?.replayAsync();
    } catch {
      // Bỏ qua
    }
  }

  /**
   * Dừng toàn bộ âm thanh ngay lập tức (khi dừng bài hoặc reset)
   */
  async stopAll(): Promise<void> {
    this.isSpeaking = false;
    try {
      await Speech.stop();
      await this.setDuckingMode(false);
    } catch {
      // Bỏ qua
    }
  }

  async speak(
    text: string,
    priority: SpeechPriority = 'INFO',
    earcon?: EarconType
  ): Promise<void> {
    const now = Date.now();

    if (priority === 'PACE_WARNING') {
      if (now - this.lastPaceAlertTime < PACE_ALERT_COOLDOWN_MS || this.isSpeaking) return;
      this.lastPaceAlertTime = now;
    }

    if (priority === 'POSITIVE') {
      if (now - this.lastPositiveTime < POSITIVE_COOLDOWN_MS || this.isSpeaking) return;
      this.lastPositiveTime = now;
    }

    if (priority === 'TREND_WARNING') {
      if (now - this.lastPaceTrendTime < PACE_TREND_COOLDOWN_MS || this.isSpeaking) return;
      this.lastPaceTrendTime = now;
    }

    if (priority === 'CRITICAL_HR') {
      if (now - this.lastHrAlertTime < HR_ALERT_COOLDOWN_MS) return;
      this.lastHrAlertTime = now;
      try {
        await Speech.stop();
      } catch {}
    } else if (this.isSpeaking && priority !== 'MILESTONE') {
      return;
    }

    try {
      this.isSpeaking = true;
      await this.setDuckingMode(true);

      if (earcon) {
        await this.playEarcon(earcon);
        await new Promise((r) => setTimeout(r, 160));
      }

      // Tốc độ speechRate (mặc định 0.82): Chậm rãi, ngắt nghỉ từng chữ theo nhịp thở runner
      Speech.speak(text, {
        language: 'vi-VN',
        pitch: 1.0,
        rate: this.speechRate,
        onDone: async () => {
          this.isSpeaking = false;
          await this.setDuckingMode(false);
        },
        onStopped: async () => {
          this.isSpeaking = false;
          await this.setDuckingMode(false);
        },
        onError: async () => {
          this.isSpeaking = false;
          await this.setDuckingMode(false);
        },
      });
    } catch {
      this.isSpeaking = false;
      await this.setDuckingMode(false);
    }
  }

  getHeartRateZone(hr: number | null): number | null {
    if (!hr || hr <= 0) return null;
    const lt = this.lactateThresholdHrBpm;
    if (hr < Math.round(lt * 0.79)) return 1;
    if (hr <= Math.round(lt * 0.89)) return 2;
    if (hr <= Math.round(lt * 0.96)) return 3;
    if (hr <= lt) return 4;
    return 5;
  }

  formatPaceShort(paceSecPerKm: number | null): string {
    if (!paceSecPerKm || !Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0 || paceSecPerKm > 1200) {
      return 'chưa rõ';
    }
    const mins = Math.floor(paceSecPerKm / 60);
    const secs = Math.round(paceSecPerKm % 60);
    if (secs === 0) return `${mins} phút`;
    return `${mins} ${secs < 10 ? 'lẻ ' + secs : secs}`;
  }

  // --- CÁC CÂU LỆNH CHUẨN PT CHẠY BỘ: NGẮN GỌN, CHẬM RÃI, CỔ VŨ ---

  announceCheckIn(): void {
    this.speak(AUDIO_SCRIPTS.CHECK_IN, 'MILESTONE', 'warn');
  }

  respondToCheckIn(option: 'PAIN' | 'FATIGUED' | 'STILL_OK'): void {
    if (option === 'PAIN') {
      this.speak(AUDIO_SCRIPTS.CHECK_IN_PAIN, 'CRITICAL_HR', 'danger');
    } else if (option === 'FATIGUED') {
      this.speak(AUDIO_SCRIPTS.CHECK_IN_FATIGUE, 'PACE_WARNING', 'warn');
    } else {
      this.speak(AUDIO_SCRIPTS.CHECK_IN_OK, 'POSITIVE', 'good');
    }
  }

  announceDistanceMilestone(
    distanceKm: number,
    avgPaceSecPerKm: number,
    _currentHr: number | null
  ): void {
    const kmLabel = Number.isInteger(distanceKm)
      ? `Km ${distanceKm}`
      : `${distanceKm.toFixed(1).replace('.', ' phẩy ')} km`;
    const paceStr = this.formatPaceShort(avgPaceSecPerKm);

    this.speak(AUDIO_SCRIPTS.DISTANCE_SPLIT(kmLabel, paceStr), 'MILESTONE', 'good');
  }

  announceMotivationalCue(type: 'halfway' | '1km_left' | '500m_left'): void {
    let msg = '';
    if (type === 'halfway') {
      msg = AUDIO_SCRIPTS.MOTIVATION_HALFWAY;
    } else if (type === '1km_left') {
      msg = AUDIO_SCRIPTS.MOTIVATION_1KM;
    } else if (type === '500m_left') {
      msg = AUDIO_SCRIPTS.MOTIVATION_500M;
    }
    if (msg) {
      this.speak(msg, 'MILESTONE', 'good');
    }
  }

  announcePaceDeviation(
    direction: 'TOO_FAST' | 'TOO_SLOW',
    _rollingPaceSec: number,
    currentHr: number | null,
    _targetMinSec: number,
    _targetMaxSec: number
  ): void {
    if (direction === 'TOO_FAST') {
      this.speak(AUDIO_SCRIPTS.PACE_TOO_FAST, 'PACE_WARNING', 'warn');
      return;
    }

    // Khi quá chậm: Đánh giá thể trạng dựa trên nhịp tim!
    const isFatigued = currentHr !== null && currentHr >= this.lactateThresholdHrBpm - 8;
    if (isFatigued) {
      this.speak(AUDIO_SCRIPTS.PACE_TOO_SLOW_FATIGUED, 'PACE_WARNING', 'warn');
    } else {
      this.speak(AUDIO_SCRIPTS.PACE_TOO_SLOW_NORMAL, 'PACE_WARNING', 'warn');
    }
  }

  announceHrRisingTrend(
    currentHr: number,
    _currentPaceSec: number | null,
    isNearLactateOrHardLimit: boolean
  ): void {
    const now = Date.now();
    if (now - this.lastHrTrendTime < HR_TREND_COOLDOWN_MS) return;
    this.lastHrTrendTime = now;

    if (isNearLactateOrHardLimit) {
      this.speak(AUDIO_SCRIPTS.HR_RED_ZONE, 'TREND_WARNING', 'danger');
    } else {
      this.speak(AUDIO_SCRIPTS.HR_RISING(currentHr), 'TREND_WARNING', 'warn');
    }
  }

  announcePaceTrend(
    trend: 'SPIKE_FAST' | 'DRIFT_SLOW',
    _currentPaceSec: number,
    currentHr: number | null
  ): void {
    const now = Date.now();
    if (now - this.lastPaceTrendTime < PACE_TREND_COOLDOWN_MS) return;
    this.lastPaceTrendTime = now;

    if (trend === 'SPIKE_FAST') {
      this.speak(AUDIO_SCRIPTS.PACE_SPIKE_FAST, 'TREND_WARNING', 'warn');
    } else {
      const isFatigued = currentHr !== null && currentHr >= this.lactateThresholdHrBpm - 8;
      if (!isFatigued) {
        this.speak(AUDIO_SCRIPTS.PACE_DRIFT_SLOW, 'TREND_WARNING', 'warn');
      }
    }
  }

  announceBackInZone(_rollingPaceSec: number, _currentHr: number | null): void {
    this.speak(AUDIO_SCRIPTS.IN_ZONE_CONFIRM, 'POSITIVE', 'good');
  }

  announceCriticalHeartRate(_currentHr: number, _currentPaceSec: number | null): void {
    this.speak(AUDIO_SCRIPTS.CRITICAL_HR, 'CRITICAL_HR', 'danger');
  }

  announceSegmentTransition(voiceIntro: string): void {
    this.speak(voiceIntro, 'MILESTONE', 'good');
  }

  announceWorkoutCompleted(_workoutTitle: string): void {
    this.speak(AUDIO_SCRIPTS.WORKOUT_COMPLETED, 'MILESTONE', 'good');
  }
  }

  async startMetronome(bpm = 172): Promise<void> {
    this.metronomeBpm = Math.max(155, Math.min(190, bpm));
    await this.stopMetronome();

    try {
      await this.initAudioSession();
      if (!this.metronomeSound) {
        const uri = createMetronomeTickDataUri(980, 18);
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { volume: 0.35, shouldPlay: false }
        );
        this.metronomeSound = sound;
      }

      this.isMetronomeActive = true;
      const intervalMs = Math.round(60000 / this.metronomeBpm);

      this.metronomeTimer = setInterval(async () => {
        if (!this.isMetronomeActive || this.isSpeaking || !this.metronomeSound) {
          return;
        }
        try {
          await this.metronomeSound.replayAsync();
        } catch {
          // Bỏ qua
        }
      }, intervalMs);
    } catch {
      this.isMetronomeActive = false;
    }
  }

  async stopMetronome(): Promise<void> {
    this.isMetronomeActive = false;
    if (this.metronomeTimer) {
      clearInterval(this.metronomeTimer);
      this.metronomeTimer = null;
    }
  }

  async updateMetronomeBpm(newBpm: number): Promise<void> {
    this.metronomeBpm = Math.max(155, Math.min(185, newBpm));
    if (this.isMetronomeActive) {
      await this.startMetronome(this.metronomeBpm);
    }
  }

  async cleanup(): Promise<void> {
    await this.stopAll();
    await this.stopMetronome();
    if (this.metronomeSound) {
      try {
        await this.metronomeSound.unloadAsync();
      } catch {
        // Bỏ qua
      }
      this.metronomeSound = null;
    }
    for (const key of Object.keys(this.earconSounds) as EarconType[]) {
      try {
        await this.earconSounds[key]?.unloadAsync();
      } catch {
        // Bỏ qua
      }
    }
    this.earconSounds = {};
  }
}

export const audioCoach = new AudioCoachService();

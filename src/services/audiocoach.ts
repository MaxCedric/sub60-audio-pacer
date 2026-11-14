import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Speech from 'expo-speech';
import trainingPlanData from '../data/trainingPlan.json';

/**
 * Module 3: Audio Coach (Chuẩn cấu trúc: Trạng thái -> Zone -> Pace -> Tim -> Action)
 * - Ngưỡng Lactate (LTHR) mặc định lấy từ trainingPlan.json (175 bpm @ 7'41"),
 *   nhưng có thể chỉnh linh hoạt trực tiếp trên màn hình HomeScreen.
 * - Các vùng Zone 1–5, ngưỡng cảnh báo sớm (LTHR - 5) và trần đỏ (LTHR + 3)
 *   tự động co giãn theo số LTHR bạn nhập.
 */

export type SpeechPriority =
  | 'CRITICAL_HR'
  | 'TREND_WARNING'
  | 'MILESTONE'
  | 'PACE_WARNING'
  | 'POSITIVE'
  | 'INFO';

type EarconType = 'good' | 'warn' | 'danger';

const PACE_ALERT_COOLDOWN_MS = 28000;
const PACE_TREND_COOLDOWN_MS = 22000;
const HR_TREND_COOLDOWN_MS = 18000;
const HR_ALERT_COOLDOWN_MS = 15000;
const POSITIVE_COOLDOWN_MS = 20000;

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

  // Mặc định 175 bpm từ trainingPlan.json, tự cập nhật khi người dùng chỉnh trên app
  private lactateThresholdHrBpm: number =
    trainingPlanData?.athleteProfile?.lactateThresholdHrBpm || 175;

  private metronomeTimer: ReturnType<typeof setInterval> | null = null;
  private metronomeSound: Audio.Sound | null = null;
  private earconSounds: Partial<Record<EarconType, Audio.Sound>> = {};
  private metronomeBpm = 172;
  private isMetronomeActive = false;

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
          { volume: 0.6, shouldPlay: false }
        );
        this.earconSounds[type] = sound;
      }
      await this.earconSounds[type]?.replayAsync();
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

    if (priority === 'TREND_WARNING' && this.isSpeaking) {
      return;
    }

    if (priority === 'CRITICAL_HR') {
      if (now - this.lastHrAlertTime < HR_ALERT_COOLDOWN_MS) return;
      this.lastHrAlertTime = now;
      if (this.isSpeaking) {
        await Speech.stop();
      }
    } else if (this.isSpeaking && priority !== 'MILESTONE') {
      return;
    }

    try {
      this.isSpeaking = true;
      await this.setDuckingMode(true);

      if (earcon) {
        await this.playEarcon(earcon);
        await new Promise((r) => setTimeout(r, 180));
      }

      Speech.speak(text, {
        language: 'vi-VN',
        pitch: 1.0,
        rate: 1.06,
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

  /**
   * Tính Zone 1-5 tự động theo ngưỡng Lactate (LTHR) hiện tại
   * Với LTHR = 175: Z1 < 138 | Z2 138-156 | Z3 157-168 | Z4 169-175 | Z5 > 175
   */
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

  private buildCue(
    status: string,
    paceSec: number | null,
    hr: number | null,
    action: string
  ): string {
    const zone = this.getHeartRateZone(hr);
    const zonePart = zone ? `Zone ${zone}, ` : '';
    const pacePart = paceSec ? `Pace ${this.formatPaceShort(paceSec)}, ` : '';
    const hrPart = hr ? `Tim ${hr}, ` : '';
    return `${status}, ${zonePart}${pacePart}${hrPart}${action}`;
  }

  announceDistanceMilestone(
    distanceKm: number,
    avgPaceSecPerKm: number,
    currentHr: number | null
  ): void {
    const kmLabel = Number.isInteger(distanceKm)
      ? `Km ${distanceKm}`
      : `${distanceKm.toFixed(1).replace('.', ' phẩy ')} km`;

    const msg = this.buildCue(kmLabel, avgPaceSecPerKm, currentHr, 'giữ đều!');
    this.speak(msg, 'MILESTONE', 'good');
  }

  announceHrRisingTrend(
    currentHr: number,
    currentPaceSec: number | null,
    isNearLactateOrHardLimit: boolean
  ): void {
    const now = Date.now();
    if (now - this.lastHrTrendTime < HR_TREND_COOLDOWN_MS) return;
    this.lastHrTrendTime = now;

    if (isNearLactateOrHardLimit) {
      const msg = this.buildCue('Quá ngưỡng', currentPaceSec, currentHr, 'hãm chân ngay!');
      this.speak(msg, 'TREND_WARNING', 'danger');
    } else {
      const msg = this.buildCue('Tim đang lên', currentPaceSec, currentHr, 'nới nhẹ bước!');
      this.speak(msg, 'TREND_WARNING', 'warn');
    }
  }

  announcePaceTrend(
    trend: 'SPIKE_FAST' | 'DRIFT_SLOW',
    currentPaceSec: number,
    currentHr: number | null
  ): void {
    const now = Date.now();
    if (now - this.lastPaceTrendTime < PACE_TREND_COOLDOWN_MS) return;
    this.lastPaceTrendTime = now;

    if (trend === 'SPIKE_FAST') {
      const msg = this.buildCue('Quá nhanh', currentPaceSec, currentHr, 'kìm chân lại!');
      this.speak(msg, 'TREND_WARNING', 'warn');
    } else {
      const msg = this.buildCue('Đang chậm dần', currentPaceSec, currentHr, 'thả vai, bước ngắn!');
      this.speak(msg, 'TREND_WARNING', 'warn');
    }
  }

  announcePaceDeviation(
    direction: 'TOO_FAST' | 'TOO_SLOW',
    rollingPaceSec: number,
    currentHr: number | null,
    targetMinSec: number,
    targetMaxSec: number
  ): void {
    const targetMid = this.formatPaceShort(Math.round((targetMinSec + targetMaxSec) / 2));

    if (direction === 'TOO_FAST') {
      const msg = this.buildCue('Quá nhanh', rollingPaceSec, currentHr, `hạ về ${targetMid}!`);
      this.speak(msg, 'PACE_WARNING', 'warn');
    } else {
      const msg = this.buildCue('Quá chậm', rollingPaceSec, currentHr, `đẩy lên ${targetMid}!`);
      this.speak(msg, 'PACE_WARNING', 'warn');
    }
  }

  announceBackInZone(rollingPaceSec: number, currentHr: number | null): void {
    const msg = this.buildCue('Đúng nhịp', rollingPaceSec, currentHr, 'giữ đều!');
    this.speak(msg, 'POSITIVE', 'good');
  }

  announceCriticalHeartRate(currentHr: number, currentPaceSec: number | null): void {
    const msg = this.buildCue('Quá giới hạn', currentPaceSec, currentHr, 'đi bộ ngay!');
    this.speak(msg, 'CRITICAL_HR', 'danger');
  }

  announceSegmentTransition(voiceIntro: string): void {
    this.speak(voiceIntro, 'MILESTONE', 'good');
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
    await this.stopMetronome();
    await Speech.stop();
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
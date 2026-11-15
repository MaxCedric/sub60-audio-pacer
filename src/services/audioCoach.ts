import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Speech from 'expo-speech';
import trainingPlanData from '../data/trainingPlan.json';
import { COACH_CONFIG } from '../config/coachConfig';
import { formatEtaVoiceWords } from '../logic/eta';

export type SpeechPriority =
  | 'CRITICAL_HR'
  | 'TREND_WARNING'
  | 'MILESTONE'
  | 'PACE_WARNING'
  | 'POSITIVE'
  | 'INFO';

type EarconType = 'good' | 'warn' | 'danger';

/**
 * BẢNG NỘI DUNG TẤT CẢ ÂM THANH VOICE CỦA APP
 * Chuẩn não mệt khi chạy đường dài:
 * - Mỗi vế tối đa 2 đến 3 từ.
 * - Ngăn cách bằng dấu chấm/phẩy để hệ thống tự động ngừng 0.75s giữa các vế.
 */
export const AUDIO_SCRIPTS = {
  // 1. Kiểm tra thể trạng (Check-in tương tác)
  CHECK_IN: 'Bạn ổn không? Đau chân không?',
  CHECK_IN_PAIN: 'Đi bộ ngay. Thả lỏng chân.',
  CHECK_IN_FATIGUE: 'Chậm lại nào. Thở sâu nhé.',
  CHECK_IN_OK: 'Rất tốt. Giữ nhịp nhé.',

  // 2. Cảnh báo nhịp tim & Pace (mỗi vế tối đa 2 - 3 từ)
  CRITICAL_HR: 'Tim quá cao. Đi bộ ngay!',
  HR_RED_ZONE: 'Chạm ngưỡng đỏ. Thở sâu nào!',
  HR_RISING: (hr: number) => `Tim ${hr}. Chậm lại chút.`,
  PACE_TOO_FAST: 'Hơi nhanh rồi. Kìm chân lại.',
  PACE_TOO_SLOW_FATIGUED: 'Tim đang cao. Thở sâu nhé.',
  PACE_TOO_SLOW_NORMAL: 'Hơi chậm rồi. Nâng nhịp lên.',
  PACE_SPIKE_FAST: 'Đang vọt tốc. Kìm lại chút.',
  PACE_DRIFT_SLOW: 'Đang chùng chân. Tăng nhịp bước.',
  IN_ZONE_CONFIRM: 'Rất đều. Giữ nhịp này!',

  // 3. Mốc cự ly & Cổ vũ tinh thần
  DISTANCE_SPLIT: (km: string, pace: string, etaWords?: string) =>
    etaWords ? `${km}. Pace ${pace}. Dự kiến ${etaWords}.` : `${km}. Pace ${pace}. Tốt lắm!`,
  MOTIVATION_HALFWAY: 'Qua một nửa. Giữ đều nhé!',
  MOTIVATION_1KM: 'Còn một cây. Ráng lên nào!',
  MOTIVATION_500M: 'Năm trăm mét. Cố lên đích!',

  // 4. Trạng thái bài tập
  WORKOUT_COMPLETED: 'Xong bài rồi. Chạy thêm nhé!',
  WORKOUT_STOPPED: 'Đã dừng bài. Đi bộ nhé.',
  SUB65_ON: 'Bật Sub 65.',
  SUB65_OFF: 'Về Sub 60.',
  UNDER70_ON: 'Bật Dưới 70.',
  WALK_RECOVERY_ON: 'Đi bộ nào.',
  RESUME_RUNNING: 'Chạy lại nào. Tăng từ từ.',
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

/**
 * Tạo file WAV lặp hoàn hảo cho Metronome:
 * Chiều dài đúng 60 / BPM giây (tiếng tick ở đầu, phần còn lại là im lặng).
 * Không dùng setInterval, phát bằng expo-av với isLooping: true.
 */
function createMetronomeLoopDataUri(bpm: number, frequencyHz = 980, tickDurationMs = 18, sampleRate = 22050): string {
  const periodSec = 60 / bpm;
  const totalSamples = Math.floor(sampleRate * periodSec);
  const tickSamples = Math.min(totalSamples, Math.floor((sampleRate * tickDurationMs) / 1000));
  const samples = new Int16Array(totalSamples);

  for (let i = 0; i < tickSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 180);
    const val = Math.sin(2 * Math.PI * frequencyHz * t) * envelope;
    samples[i] = Math.round(Math.max(-1, Math.min(1, val)) * 0x7fff * 0.45);
  }
  // Phần còn lại của mảng tự động là 0 (im lặng)
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

interface QueuedSpeechItem {
  id: number;
  text: string;
  priority: SpeechPriority;
  earcon?: EarconType;
  timestamp: number;
}

class AudioCoachService {
  private isSpeaking = false;
  private currentSpeechSessionId = 0;
  private speechQueue: QueuedSpeechItem[] = [];
  private queueCounter = 0;

  private lastPaceAlertTime = 0;
  private lastPaceTrendTime = 0;
  private lastHrTrendTime = 0;
  private lastHrAlertTime = 0;
  private lastPositiveTime = 0;
  private speechRate = COACH_CONFIG.speech.defaultRate;

  private lactateThresholdHrBpm: number =
    trainingPlanData?.athleteProfile?.lactateThresholdHrBpm || 176;

  private metronomeSound: Audio.Sound | null = null;
  private earconSounds: Partial<Record<EarconType, Audio.Sound>> = {};
  private metronomeBpm = COACH_CONFIG.cadence.defaultBpm;
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
    return this.lactateThresholdHrBpm - 5;
  }

  getHardLimitHr(): number {
    return this.lactateThresholdHrBpm + 3;
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
    this.currentSpeechSessionId++;
    this.speechQueue = [];
    this.isSpeaking = false;
    try {
      await Speech.stop();
      await this.setDuckingMode(false);
    } catch {
      // Bỏ qua
    }
  }

  private speakSingleChunk(chunk: string, sessionId: number): Promise<boolean> {
    return new Promise((resolve) => {
      Speech.speak(chunk, {
        language: 'vi-VN',
        pitch: 1.0,
        rate: this.speechRate,
        onDone: () => {
          resolve(this.currentSpeechSessionId === sessionId);
        },
        onStopped: () => {
          resolve(false);
        },
        onError: () => {
          resolve(false);
        },
      });
    });
  }

  /**
   * Phát âm thanh giọng nói với cơ chế Hàng đợi ưu tiên (Audio Queue Priority):
   * - Cảnh báo nguy hiểm (CRITICAL_HR) ngắt ngay mọi câu đang nói và dọn sạch hàng đợi.
   * - Các câu khác được xếp hàng (tối đa 2 câu) thay vì bị bỏ qua khi đang nói.
   * - Câu trong hàng đợi cũ hơn 15 giây tự động bị hủy.
   */
  async speak(
    text: string,
    priority: SpeechPriority = 'INFO',
    earcon?: EarconType
  ): Promise<void> {
    const now = Date.now();

    // 1. Kiểm tra Cooldown theo loại thông báo
    if (priority === 'PACE_WARNING') {
      if (now - this.lastPaceAlertTime < COACH_CONFIG.cooldowns.paceAlertMs) return;
      this.lastPaceAlertTime = now;
    }

    if (priority === 'POSITIVE') {
      if (now - this.lastPositiveTime < COACH_CONFIG.cooldowns.positiveEncouragementMs) return;
      this.lastPositiveTime = now;
    }

    if (priority === 'TREND_WARNING') {
      if (now - this.lastPaceTrendTime < COACH_CONFIG.cooldowns.paceTrendMs) return;
      this.lastPaceTrendTime = now;
    }

    // 2. CẢNH BÁO NGUY HIỂM: Ngắt ngay mọi câu đang nói
    if (priority === 'CRITICAL_HR') {
      if (now - this.lastHrAlertTime < COACH_CONFIG.cooldowns.hrDangerAlertMs) return;
      this.lastHrAlertTime = now;
      this.currentSpeechSessionId++;
      this.speechQueue = [];
      try {
        await Speech.stop();
      } catch {}
    } else if (this.isSpeaking) {
      // Đang có câu nói khác: Xếp hàng thay vì bỏ rơi
      // Xóa câu cũ hơn 15s
      this.speechQueue = this.speechQueue.filter((q) => now - q.timestamp <= COACH_CONFIG.speech.queueTtlMs);
      if (this.speechQueue.length < COACH_CONFIG.speech.queueMaxItems) {
        this.speechQueue.push({
          id: ++this.queueCounter,
          text,
          priority,
          earcon,
          timestamp: now,
        });
      }
      return;
    }

    await this.processSpeechText(text, priority, earcon);
  }

  private async processSpeechText(
    text: string,
    _priority: SpeechPriority,
    earcon?: EarconType
  ): Promise<void> {
    // Tách câu theo dấu chấm, phẩy, chấm hỏi, chấm than để runner tiếp nhận từng vế ngắn (2-3 từ)
    const chunks = text
      .split(/[,.!?;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (chunks.length === 0) return;

    this.currentSpeechSessionId++;
    const sessionId = this.currentSpeechSessionId;

    try {
      this.isSpeaking = true;
      await this.setDuckingMode(true);

      if (earcon) {
        await this.playEarcon(earcon);
        await new Promise((r) => setTimeout(r, 160));
      }

      for (let i = 0; i < chunks.length; i++) {
        if (this.currentSpeechSessionId !== sessionId) return;

        const success = await this.speakSingleChunk(chunks[i], sessionId);
        if (!success || this.currentSpeechSessionId !== sessionId) return;

        // Dừng 0.75 giây giữa các dấu chấm, phẩy theo nhịp thở runner
        if (i < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, COACH_CONFIG.speech.clausePauseMs));
        }
      }
    } catch {
      // Bỏ qua
    } finally {
      if (this.currentSpeechSessionId === sessionId) {
        this.isSpeaking = false;
        await this.setDuckingMode(false);

        // Xử lý câu tiếp theo trong hàng đợi nếu còn
        this.processNextInQueue();
      }
    }
  }

  private processNextInQueue(): void {
    const now = Date.now();
    this.speechQueue = this.speechQueue.filter((q) => now - q.timestamp <= COACH_CONFIG.speech.queueTtlMs);
    if (this.speechQueue.length > 0) {
      const next = this.speechQueue.shift();
      if (next) {
        this.speak(next.text, next.priority, next.earcon);
      }
    }
  }

  getHeartRateZone(hr: number | null): number | null {
    if (!hr || hr <= 0) return null;
    const lt = this.lactateThresholdHrBpm;
    if (hr < Math.round(lt * 0.85)) return 1;
    if (hr <= Math.round(lt * 0.89)) return 2;
    if (hr <= Math.round(lt * 0.94)) return 3;
    if (hr < lt) return 4;
    return 5;
  }

  formatPaceShort(paceSecPerKm: number | null): string {
    if (!paceSecPerKm || !Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0 || paceSecPerKm > 1800) {
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

  /**
   * Báo split mỗi km đọc: pace km vừa xong, pace trung bình, và ETA dự kiến nếu có
   */
  announceDistanceMilestone(
    distanceKm: number,
    splitPaceSecPerKm: number,
    estimatedFinishTimeSec?: number | null
  ): void {
    const kmLabel = Number.isInteger(distanceKm)
      ? `Km ${distanceKm}`
      : `${distanceKm.toFixed(1).replace('.', ' phẩy ')} km`;
    const paceStr = this.formatPaceShort(splitPaceSecPerKm);
    const etaStr = estimatedFinishTimeSec ? formatEtaVoiceWords(estimatedFinishTimeSec) : undefined;

    this.speak(AUDIO_SCRIPTS.DISTANCE_SPLIT(kmLabel, paceStr, etaStr), 'MILESTONE', 'good');
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

    // Khi quá chậm: Đánh giá thể trạng dựa trên nhịp tim
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
    if (now - this.lastHrTrendTime < COACH_CONFIG.cooldowns.hrTrendMs) return;
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
    if (now - this.lastPaceTrendTime < COACH_CONFIG.cooldowns.paceTrendMs) return;
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

  /**
   * Metronome lặp không dùng setInterval:
   * Tạo buffer WAV dài đúng 60/BPM giây và phát lặp bằng expo-av.
   * Chạy ổn định tuyệt đối khi khóa màn hình iPhone.
   */
  async startMetronome(bpm = 172): Promise<void> {
    this.metronomeBpm = Math.max(COACH_CONFIG.cadence.minBpm, Math.min(COACH_CONFIG.cadence.maxBpm, bpm));
    await this.stopMetronome();

    try {
      await this.initAudioSession();
      const uri = createMetronomeLoopDataUri(this.metronomeBpm);
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { volume: 0.35, isLooping: true, shouldPlay: true }
      );
      this.metronomeSound = sound;
      this.isMetronomeActive = true;
    } catch {
      this.isMetronomeActive = false;
    }
  }

  async stopMetronome(): Promise<void> {
    this.isMetronomeActive = false;
    if (this.metronomeSound) {
      try {
        await this.metronomeSound.stopAsync();
        await this.metronomeSound.unloadAsync();
      } catch {
        // Bỏ qua
      }
      this.metronomeSound = null;
    }
  }

  async updateMetronomeBpm(newBpm: number): Promise<void> {
    this.metronomeBpm = Math.max(COACH_CONFIG.cadence.minBpm, Math.min(COACH_CONFIG.cadence.maxBpm, newBpm));
    if (this.isMetronomeActive) {
      await this.startMetronome(this.metronomeBpm);
    }
  }

  async cleanup(): Promise<void> {
    await this.stopAll();
    await this.stopMetronome();
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

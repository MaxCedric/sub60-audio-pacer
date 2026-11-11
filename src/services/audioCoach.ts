import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Speech from 'expo-speech';

/**
 * Module 3: Audio Coach & Audio Ducking (expo-speech / expo-av)
 * - Cấu hình AVAudioSession iOS ở chế độ DuckOthers khi đọc TTS Tiếng Việt
 *   để nhạc từ Spotify / Apple Music tự động nhỏ xuống êm ái rồi tự to lại sau khi đọc xong.
 * - Quản lý hàng đợi ưu tiên (Priority Queue) và Cooldown chống spam:
 *   + Cảnh báo đỏ tim mạch (HR >= 178 bpm kéo dài >= 30s): Ưu tiên cao nhất, ngắt câu thông thường.
 *   + Thông báo chuyển chặng & cột mốc 500m / 1km: Ưu tiên cao.
 *   + Cảnh báo lệch Pace (±10s/km liên tục 20s): Cooldown 45 giây giữa các lần nhắc.
 * - Bộ gõ nhịp Metronome (170-175 bpm, mặc định 172 bpm) tự tổng hợp sóng âm WAV trong bộ nhớ
 *   (không cần file .mp3 bên ngoài), giúp giữ sải chân ngắn, bảo vệ khớp gối.
 */

export type SpeechPriority = 'CRITICAL_HR' | 'MILESTONE' | 'PACE_WARNING' | 'INFO';

const PACE_ALERT_COOLDOWN_MS = 45000; // Cooldown 45 giây cho cảnh báo lệch Pace
const HR_ALERT_COOLDOWN_MS = 25000;   // Cooldown 25 giây giữa 2 lần cảnh báo đỏ nhịp tim

/**
 * Tạo chuỗi Base64 WAV (PCM 16-bit, 22050Hz, Mono) cho tiếng gõ nhịp Metronome (Woodblock click 18ms)
 * Giúp app hoạt động độc lập 100% không cần tải file âm thanh ngoài.
 */
function createMetronomeTickDataUri(frequencyHz = 980, durationMs = 18): string {
  const sampleRate = 22050;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);
  const dataSize = numSamples * 2;
  const buffer = new Uint8Array(44 + dataSize);
  const view = new DataView(buffer.buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // WAV Header
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, 1, true);  // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Sóng âm Sine tắt dần nhanh (Exponential decay) tạo tiếng "Tách" rõ và êm tai
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.exp(-t * 180);
    const sample = Math.sin(2 * Math.PI * frequencyHz * t) * envelope;
    const pcmValue = Math.max(-1, Math.min(1, sample)) * 0x7fff * 0.45;
    view.setInt16(44 + i * 2, pcmValue, true);
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

class AudioCoachService {
  private isSpeaking = false;
  private lastPaceAlertTime = 0;
  private lastHrAlertTime = 0;
  private metronomeTimer: ReturnType<typeof setInterval> | null = null;
  private metronomeSound: Audio.Sound | null = null;
  private metronomeBpm = 172;
  private isMetronomeActive = false;

  /**
   * Khởi tạo phiên âm thanh chạy nền trộn cùng nhạc Spotify / Apple Music
   */
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
      // Bỏ qua nếu thiết bị chưa sẵn sàng âm thanh
    }
  }

  /**
   * Bật chế độ Audio Ducking (làm nhỏ nhạc Spotify/Apple Music) ngay trước khi phát giọng nói,
   * và trả lại âm lượng nhạc bình thường (MixWithOthers) ngay khi câu nói kết thúc.
   */
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
      // An toàn khi chuyển trạng thái AudioSession
    }
  }

  /**
   * Phát giọng nói Tiếng Việt qua tai nghe với cơ chế ưu tiên & Audio Ducking
   */
  async speak(text: string, priority: SpeechPriority = 'INFO'): Promise<void> {
    const now = Date.now();

    // Kiểm tra Cooldown chống spam đối với cảnh báo lệch Pace (45 giây)
    if (priority === 'PACE_WARNING') {
      if (now - this.lastPaceAlertTime < PACE_ALERT_COOLDOWN_MS) {
        return;
      }
      if (this.isSpeaking) {
        return; // Không chồng lấn nếu đang đọc thông báo cột mốc
      }
      this.lastPaceAlertTime = now;
    }

    // Kiểm tra Cooldown đối với Cảnh báo đỏ tim mạch (ưu tiên cao nhất)
    if (priority === 'CRITICAL_HR') {
      if (now - this.lastHrAlertTime < HR_ALERT_COOLDOWN_MS) {
        return;
      }
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

      Speech.speak(text, {
        language: 'vi-VN',
        pitch: 1.0,
        rate: 1.02, // Tốc độ đọc rõ ràng, dứt khoát khi đang chạy
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
   * Định dạng Pace (giây/km) sang văn bản đọc tự nhiên bằng Tiếng Việt
   */
  formatPaceForSpeech(paceSecPerKm: number): string {
    if (!Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0 || paceSecPerKm > 1200) {
      return 'chưa xác định';
    }
    const mins = Math.floor(paceSecPerKm / 60);
    const secs = Math.round(paceSecPerKm % 60);
    if (secs === 0) {
      return `${mins} phút chẵn`;
    }
    return `${mins} phút ${secs} giây`;
  }

  /**
   * 1. Kịch bản đọc định kỳ mỗi 500m hoặc 1 km:
   * "Km thứ X. Pace trung bình [phút] [giây]. Nhịp tim [HR]."
   */
  announceDistanceMilestone(distanceKm: number, avgPaceSecPerKm: number, currentHr: number | null): void {
    const paceSpeech = this.formatPaceForSpeech(avgPaceSecPerKm);
    const hrSpeech = currentHr ? `Nhịp tim ${currentHr}.` : 'Chưa có tín hiệu nhịp tim.';
    const kmLabel = Number.isInteger(distanceKm)
      ? `Ki lô mét thứ ${distanceKm}`
      : `Mốc ${distanceKm.toFixed(1).replace('.', ' phẩy ')} ki lô mét`;

    const message = `${kmLabel}. Pace trung bình ${paceSpeech}. ${hrSpeech}`;
    this.speak(message, 'MILESTONE');
  }

  /**
   * 2. Kịch bản cảnh báo lệch Pace (±10s/km liên tục trong 20 giây, kèm Cooldown 45s)
   */
  announcePaceDeviation(
    direction: 'TOO_FAST' | 'TOO_SLOW',
    rollingPaceSec: number,
    targetMinSec: number,
    targetMaxSec: number
  ): void {
    const currentSpeech = this.formatPaceForSpeech(rollingPaceSec);
    const targetMidSec = Math.round((targetMinSec + targetMaxSec) / 2);
    const targetSpeech = this.formatPaceForSpeech(targetMidSec);

    if (direction === 'TOO_FAST') {
      this.speak(
        `Bạn đang chạy quá nhanh ở pace ${currentSpeech}. Hãy điều chỉnh giảm tốc độ về mức ${targetSpeech}.`,
        'PACE_WARNING'
      );
    } else {
      this.speak(
        `Bạn đang chạy quá chậm ở pace ${currentSpeech}. Hãy đẩy nhẹ guồng chân lên mức ${targetSpeech}.`,
        'PACE_WARNING'
      );
    }
  }

  /**
   * 3. Kịch bản Cảnh báo đỏ tim mạch (Ưu tiên cao nhất: HR >= 178 bpm liên tục trong 30 giây)
   */
  announceCriticalHeartRate(currentHr: number): void {
    this.speak(
      `Cảnh báo nhịp tim đạt ${currentHr}. Hãy chạy chậm lại hoặc đi bộ 30 giây.`,
      'CRITICAL_HR'
    );
  }

  /**
   * 4. Thông báo chuyển chặng tự động (Warm-up -> Main Set / Interval / Tempo -> Cool-down)
   */
  announceSegmentTransition(voiceIntro: string): void {
    this.speak(voiceIntro, 'MILESTONE');
  }

  /**
   * Bật/tắt tiếng gõ nhịp Metronome (170-175 bpm, mặc định 172 bpm)
   */
  async startMetronome(bpm = 172): Promise<void> {
    this.metronomeBpm = Math.max(160, Math.min(190, bpm));
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
          // Bỏ qua nếu trùng chu kỳ phát
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
    this.metronomeBpm = Math.max(165, Math.min(185, newBpm));
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
        // Bỏ qua lỗi khi giải phóng tài nguyên
      }
      this.metronomeSound = null;
    }
  }
}

export const audioCoach = new AudioCoachService();

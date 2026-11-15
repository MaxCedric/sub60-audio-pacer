/**
 * Dịch vụ lưu trữ dữ liệu bền vững (AsyncStorage)
 * Quản lý lịch sử chạy bộ, RPE 1-10, Note PT, Hồ sơ VĐV & Lịch sử Checkpoint
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AthleteProfile, DEFAULT_ATHLETE_PROFILE, GoalId } from '../logic/athlete';

export interface RunSplitLog {
  km: number;
  paceSecPerKm: number;
  avgHrBpm: number | null;
  elapsedSeconds: number;
}

export interface CompletedRunSession {
  id: string;
  workoutId: string;
  workoutTitle: string;
  date: string; // ISO string or dd/mm/yyyy
  timestamp: number;
  totalDistanceMeters: number;
  elapsedSeconds: number;
  averagePaceSecPerKm: number;
  averageHrBpm: number | null;
  maxHrBpm: number | null;
  timeInZonesSeconds: Record<1 | 2 | 3 | 4 | 5, number>;
  splits: RunSplitLog[];
  averageCadenceSpm: number | null;
  alertsFiredCount: number;
  rpeRating: number; // 1 - 10 (Rate of Perceived Exertion)
  userNote: string;
  goodPoint?: string;
  badPoint?: string;
  fixAction?: string;
  goalIdAtRun: GoalId;
}

export interface CheckpointHistoryItem {
  id: string;
  date: string;
  checkpointName: string;
  suggestedGoalId: GoalId;
  chosenGoalId: GoalId;
  reason: string;
}

const STORAGE_KEYS = {
  RUN_SESSIONS: '@sub60_run_sessions',
  ATHLETE_PROFILE: '@sub60_athlete_profile',
  CHECKPOINTS: '@sub60_checkpoint_history',
  SELECTED_GOAL: '@sub60_selected_goal',
  AUTO_PAUSE_ENABLED: '@sub60_auto_pause_enabled',
  GEMINI_API_KEY: '@sub60_gemini_api_key',
};

class StorageService {
  /**
   * Lưu một buổi chạy vừa hoàn thành
   */
  async saveRunSession(session: CompletedRunSession): Promise<void> {
    try {
      const existing = await this.getRunSessions();
      const updated = [session, ...existing];
      await AsyncStorage.setItem(STORAGE_KEYS.RUN_SESSIONS, JSON.stringify(updated));
    } catch {
      // Bỏ qua lỗi lưu trữ
    }
  }

  /**
   * Lấy toàn bộ danh sách buổi chạy đã lưu
   */
  async getRunSessions(): Promise<CompletedRunSession[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.RUN_SESSIONS);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Cập nhật ghi chú và RPE cho buổi chạy
   */
  async updateRunSessionNote(
    sessionId: string,
    rpeRating: number,
    userNote: string,
    goodPoint?: string,
    badPoint?: string,
    fixAction?: string
  ): Promise<void> {
    try {
      const existing = await this.getRunSessions();
      const updated = existing.map((s) => {
        if (s.id === sessionId) {
          return {
            ...s,
            rpeRating,
            userNote,
            goodPoint: goodPoint || s.goodPoint,
            badPoint: badPoint || s.badPoint,
            fixAction: fixAction || s.fixAction,
          };
        }
        return s;
      });
      await AsyncStorage.setItem(STORAGE_KEYS.RUN_SESSIONS, JSON.stringify(updated));
    } catch {
      // Bỏ qua
    }
  }

  /**
   * Lưu hồ sơ VĐV (chỉnh sửa từ Cập nhật chỉ số)
   */
  async saveAthleteProfile(profile: AthleteProfile): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.ATHLETE_PROFILE, JSON.stringify(profile));
    } catch {
      // Bỏ qua
    }
  }

  /**
   * Lấy hồ sơ VĐV (nếu chưa có thì trả về mặc định từ DEFAULT_ATHLETE_PROFILE)
   */
  async getAthleteProfile(): Promise<AthleteProfile> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.ATHLETE_PROFILE);
      if (!data) return DEFAULT_ATHLETE_PROFILE;
      return { ...DEFAULT_ATHLETE_PROFILE, ...JSON.parse(data) };
    } catch {
      return DEFAULT_ATHLETE_PROFILE;
    }
  }

  /**
   * Lưu mục tiêu đang chọn (Sub 60 / Sub 65 / Dưới 70)
   */
  async saveSelectedGoal(goalId: GoalId): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_GOAL, goalId);
    } catch {
      // Bỏ qua
    }
  }

  /**
   * Lấy mục tiêu đang chọn
   */
  async getSelectedGoal(): Promise<GoalId> {
    try {
      const goal = (await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_GOAL)) as GoalId | null;
      return goal || 'sub60';
    } catch {
      return 'sub60';
    }
  }

  /**
   * Lưu lịch sử checkpoint
   */
  async saveCheckpointHistory(item: CheckpointHistoryItem): Promise<void> {
    try {
      const existing = await this.getCheckpointHistory();
      const updated = [item, ...existing];
      await AsyncStorage.setItem(STORAGE_KEYS.CHECKPOINTS, JSON.stringify(updated));
    } catch {
      // Bỏ qua
    }
  }

  /**
   * Lấy lịch sử checkpoint
   */
  async getCheckpointHistory(): Promise<CheckpointHistoryItem[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.CHECKPOINTS);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Trạng thái bật/tắt Tự động tạm dừng (Auto-pause)
   */
  async setAutoPauseEnabled(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.AUTO_PAUSE_ENABLED, enabled ? 'true' : 'false');
    } catch {
      // Bỏ qua
    }
  }

  async getAutoPauseEnabled(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem(STORAGE_KEYS.AUTO_PAUSE_ENABLED);
      return val !== 'false'; // Mặc định bật
    } catch {
      return true;
    }
  }

  async getGeminiApiKey(): Promise<string> {
    try {
      const key = await AsyncStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY);
      return key || '';
    } catch {
      return '';
    }
  }

  async saveGeminiApiKey(key: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, key.trim());
    } catch {
      // Bỏ qua
    }
  }
}

export const storageService = new StorageService();

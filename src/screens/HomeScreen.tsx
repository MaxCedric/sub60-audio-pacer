import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import trainingPlanData from '../data/trainingPlan.json';
import { BleConnectionStatus } from '../hooks/useBleHeartRate';
import { WorkoutPlan } from '../hooks/useRunningPacer';
import { audioCoach } from '../services/audioCoach';
import {
  AthleteProfile,
  DEFAULT_ATHLETE_PROFILE,
  GoalId,
  GOAL_TIERS,
  RIEGEL_NOTE_TEXT,
} from '../logic/athlete';
import {
  resolvePaceRange,
  formatPaceMinutesSeconds,
  PaceSegmentLike,
} from '../logic/paces';
import {
  generateAdaptiveWorkout,
  RunnerFeeling,
  AiWorkoutRecommendation,
  queryGeminiCoachingTip,
} from '../logic/aiCoach';
import { storageService, CompletedRunSession } from '../services/storage';

interface HomeScreenProps {
  bleStatus: BleConnectionStatus;
  heartRate: number | null;
  deviceName: string | null;
  bleError: string | null;
  isSimulatedBle: boolean;
  onScanBle: () => void;
  onDisconnectBle: () => void;
  onToggleSimBle: (highHr?: boolean) => void;
  onSelectWorkout: (workout: WorkoutPlan) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  bleStatus,
  heartRate,
  deviceName,
  bleError,
  isSimulatedBle,
  onScanBle,
  onDisconnectBle,
  onToggleSimBle,
  onSelectWorkout,
}) => {
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(0);
  const [profile, setProfile] = useState<AthleteProfile>(DEFAULT_ATHLETE_PROFILE);
  const [selectedGoalId, setSelectedGoalId] = useState<GoalId>('sub60');
  const [includeSunday, setIncludeSunday] = useState<boolean>(true);
  const [isEditProfileVisible, setIsEditProfileVisible] = useState<boolean>(false);

  // Form edit profile state
  const [editLtPaceStr, setEditLtPaceStr] = useState('7:31');
  const [editLtHrStr, setEditLtHrStr] = useState('176');
  const [editMaxHrStr, setEditMaxHrStr] = useState('195');
  const [editTest3kStr, setEditTest3kStr] = useState('21:08');
  const [editVo2MaxStr, setEditVo2MaxStr] = useState('35');
  const [editWeightStr, setEditWeightStr] = useState('73.7');
  const [editGeminiKeyStr, setEditGeminiKeyStr] = useState('');

  // AI Adaptive Coach State
  const [selectedFeeling, setSelectedFeeling] = useState<RunnerFeeling>('NORMAL');
  const [adaptiveRec, setAdaptiveRec] = useState<AiWorkoutRecommendation | null>(null);
  const [recentSessions, setRecentSessions] = useState<CompletedRunSession[]>([]);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');

  // AI Interactive QA State
  const [aiQuestion, setAiQuestion] = useState<string>('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);

  const { weeks } = trainingPlanData;
  const activeWeek = weeks[selectedWeekIndex] || weeks[0];

  const updateAdaptiveRecommendation = useCallback(
    (feeling: RunnerFeeling, p: AthleteProfile, sessions: CompletedRunSession[], goalId: GoalId) => {
      const rec = generateAdaptiveWorkout(
        feeling,
        new Date(),
        p,
        sessions,
        GOAL_TIERS[goalId]
      );
      setAdaptiveRec(rec);
    },
    []
  );

  useEffect(() => {
    Promise.all([
      storageService.getAthleteProfile(),
      storageService.getSelectedGoal(),
      storageService.getRunSessions(),
      storageService.getGeminiApiKey(),
    ]).then(([p, g, sessions, apiKey]) => {
      setProfile(p);
      audioCoach.setLactateThresholdHr(p.lactateThresholdHrBpm);
      setSelectedGoalId(g);
      setRecentSessions(sessions);
      setGeminiApiKey(apiKey);

      setEditLtPaceStr(formatSecondsToMmSs(p.lactateThresholdPaceSecPerKm));
      setEditLtHrStr(p.lactateThresholdHrBpm.toString());
      setEditMaxHrStr(p.maxHrBpm.toString());
      setEditTest3kStr(formatSecondsToMmSs(p.fastest3kSec));
      setEditVo2MaxStr(p.vo2Max.toString());
      setEditWeightStr(p.weightKg.toString());
      setEditGeminiKeyStr(apiKey);

      updateAdaptiveRecommendation(selectedFeeling, p, sessions, g);
    });
  }, [selectedFeeling, updateAdaptiveRecommendation]);

  const handleSelectFeeling = (feeling: RunnerFeeling) => {
    Haptics.selectionAsync();
    setSelectedFeeling(feeling);
    updateAdaptiveRecommendation(feeling, profile, recentSessions, selectedGoalId);
  };

  const handleSelectGoal = (goalId: GoalId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedGoalId(goalId);
    storageService.saveSelectedGoal(goalId);
    updateAdaptiveRecommendation(selectedFeeling, profile, recentSessions, goalId);
  };

  const handleAdjustLtHr = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextLtHr = Math.max(150, Math.min(195, profile.lactateThresholdHrBpm + delta));
    const nextProfile: AthleteProfile = {
      ...profile,
      lactateThresholdHrBpm: nextLtHr,
    };
    setProfile(nextProfile);
    audioCoach.setLactateThresholdHr(nextLtHr);
    storageService.saveAthleteProfile(nextProfile);
    updateAdaptiveRecommendation(selectedFeeling, nextProfile, recentSessions, selectedGoalId);
  };

  const handleSaveProfileModal = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const nextLtPace = parseMmSsToSeconds(editLtPaceStr, profile.lactateThresholdPaceSecPerKm);
    const nextLtHr = parseInt(editLtHrStr, 10) || profile.lactateThresholdHrBpm;
    const nextMaxHr = parseInt(editMaxHrStr, 10) || profile.maxHrBpm;
    const next3k = parseMmSsToSeconds(editTest3kStr, profile.fastest3kSec);
    const nextVo2 = parseFloat(editVo2MaxStr) || profile.vo2Max;
    const nextWeight = parseFloat(editWeightStr) || profile.weightKg;

    const updated: AthleteProfile = {
      ...profile,
      lactateThresholdPaceSecPerKm: nextLtPace,
      lactateThresholdHrBpm: nextLtHr,
      maxHrBpm: nextMaxHr,
      fastest3kSec: next3k,
      vo2Max: nextVo2,
      weightKg: nextWeight,
    };

    setProfile(updated);
    audioCoach.setLactateThresholdHr(updated.lactateThresholdHrBpm);
    await storageService.saveAthleteProfile(updated);
    await storageService.saveGeminiApiKey(editGeminiKeyStr);
    setGeminiApiKey(editGeminiKeyStr);

    setIsEditProfileVisible(false);
    updateAdaptiveRecommendation(selectedFeeling, updated, recentSessions, selectedGoalId);
  };

  const handleAskAiCoach = async () => {
    if (!aiQuestion.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsAiThinking(true);
    setAiAnswer(null);

    // Thử gọi Gemini AI nếu có key
    if (geminiApiKey.trim()) {
      const tip = await queryGeminiCoachingTip(geminiApiKey, aiQuestion, profile);
      if (tip) {
        setAiAnswer(tip);
        setIsAiThinking(false);
        return;
      }
    }

    // Fallback: Smart Local Engine trả lời tức thì
    setTimeout(() => {
      const q = aiQuestion.toLowerCase();
      let ans = '';
      if (q.includes('mỏi') || q.includes('đau') || q.includes('ê')) {
        ans = `PT khuyên: Nếu mỏi cơ nhẹ, hãy khởi động kỹ và chỉ chạy phục hồi Vùng 1/Vùng 2 dưới 150 bpm trong 20 phút. Nếu đau nhói khớp gối hoặc cổ chân, hãy nghỉ ngơi và chườm lạnh.`;
      } else if (q.includes('nước') || q.includes('ăn')) {
        ans = `Uống 150–200ml nước ấm trước chạy 15 phút. Nếu chạy cự ly trên 6 km, cứ mỗi 2,5 km nhấp một ngụm nhỏ để tránh tim đập nhanh do thiếu nước.`;
      } else if (q.includes('cầu lông') || q.includes('thứ 3') || q.includes('t3')) {
        ans = `Thứ Ba bạn đã có lịch cầu lông cường độ cao. Không nên chạy nặng vào thứ 3 và thứ 4 để bảo vệ dây chằng và tránh quá tải trước bài chạy chất lượng thứ Năm.`;
      } else if (q.includes('sub 60') || q.includes('pace') || q.includes('tốc độ')) {
        ans = `Để đạt 10 km Sub 60 (pace 5'58"/km), 80% thời lượng tuần hãy chạy chậm ở Zone 2 (8'16"–9'01"/km) để xây mao mạch. Đừng nóng vội chạy nhanh mỗi ngày!`;
      } else {
        ans = `PT ghi nhận câu hỏi của bạn. Hôm nay cơ thể bạn đang thích hợp cho bài tập ${adaptiveRec?.workout.title || 'Easy Z2'}. Hãy giữ sải chân ngắn, guồng chân 172 SPM và hít thở đều đặn!`;
      }
      setAiAnswer(ans);
      setIsAiThinking(false);
    }, 400);
  };

  const isBleConnected = bleStatus === 'CONNECTED' || bleStatus === 'SIMULATED';
  const isScanning = bleStatus === 'SCANNING' || bleStatus === 'CONNECTING' || bleStatus === 'RECONNECTING';

  const currentGoal = GOAL_TIERS[selectedGoalId];

  // Lọc bài tập chủ nhật theo toggle
  const visibleWorkouts = activeWeek.workouts.filter((w: any) => {
    const isSunday = Boolean(w.isOptional || w.dayOfWeek?.toLowerCase().includes('nhật'));
    if (isSunday && !includeSunday) return false;
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header Brand */}
        <View style={styles.brandRow}>
          <View>
            <View style={styles.brandTitleRow}>
              <Text style={styles.brandSub60}>SUB60</Text>
              <View style={styles.voltPill}>
                <Text style={styles.voltPillText}>AUDIO PACER</Text>
              </View>
            </View>
            <Text style={styles.brandSubtitle}>
              10 KM RACE • {profile.raceDate} • VO2MAX {profile.vo2Max} • {profile.weightKg} KG
            </Text>
          </View>
          <TouchableOpacity
            style={styles.editProfileBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsEditProfileVisible(true);
            }}
          >
            <Text style={styles.editProfileBtnText}>⚙️ CHỈ SỐ & AI</Text>
          </TouchableOpacity>
        </View>

        {/* Bento Grid 2 Cột: Watch Fit 4 + Ngưỡng Lactate */}
        <View style={styles.bentoRow}>
          {/* Tile Trái: Kết nối BLE Watch Fit 4 */}
          <View style={[styles.bentoTile, isBleConnected && styles.bentoTileActiveVolt]}>
            <View style={styles.tileHeader}>
              <View
                style={[
                  styles.statusDot,
                  isBleConnected
                    ? styles.dotVolt
                    : isScanning
                    ? styles.dotAmber
                    : styles.dotMuted,
                ]}
              />
              <Text style={styles.tileLabel}>WATCH FIT 4</Text>
            </View>

            <View style={styles.hrReadoutRow}>
              <Text style={styles.hrBigValue}>{heartRate ?? '--'}</Text>
              <Text style={styles.hrUnit}>BPM</Text>
            </View>

            <Text style={styles.tileSubText} numberOfLines={1}>
              {isBleConnected ? deviceName || 'Đã kết nối BLE' : isScanning ? 'Đang quét...' : 'Chưa kết nối'}
            </Text>

            <TouchableOpacity
              style={[styles.tileBtn, isBleConnected ? styles.tileBtnGhost : styles.tileBtnVolt]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                isBleConnected ? onDisconnectBle() : onScanBle();
              }}
            >
              <Text style={[styles.tileBtnText, !isBleConnected && styles.tileBtnTextDark]}>
                {isBleConnected ? 'Ngắt kết nối' : 'Kết nối BLE'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tile Phải: Ngưỡng Lactate linh hoạt */}
          <View style={styles.bentoTile}>
            <View style={styles.tileHeader}>
              <View style={[styles.statusDot, styles.dotCoral]} />
              <Text style={styles.tileLabel}>NGƯỠNG LACTATE</Text>
            </View>

            <View style={styles.lthrStepperRow}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjustLtHr(-1)}>
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.lthrBigValue}>{profile.lactateThresholdHrBpm}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjustLtHr(1)}>
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.tileSubText}>
              Pace LT: {formatPaceMinutesSeconds(profile.lactateThresholdPaceSecPerKm)} • Max: {profile.maxHrBpm} bpm
            </Text>

            <View style={styles.simMiniRow}>
              <TouchableOpacity
                style={[styles.simMiniBtn, isSimulatedBle && styles.simMiniBtnActive]}
                onPress={() => onToggleSimBle(false)}
              >
                <Text style={styles.simMiniText}>{isSimulatedBle ? 'Tắt Sim' : 'Sim HR'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.simMiniDangerBtn}
                onPress={() => onToggleSimBle(true)}
              >
                <Text style={styles.simMiniDangerText}>Test 180</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {bleError ? (
          <View style={styles.errorPill}>
            <Text style={styles.errorPillText}>{bleError}</Text>
          </View>
        ) : null}

        {/* Khối Lựa chọn 3 Bậc Mục tiêu (Goal Tiers) */}
        <View style={styles.goalSelectionCard}>
          <View style={styles.goalCardHeader}>
            <Text style={styles.goalCardTitle}>MỤC TIÊU RACE 10 KM</Text>
            <View style={styles.activeGoalBadge}>
              <Text style={styles.activeGoalBadgeText}>{currentGoal.name.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.goalTiersRow}>
            {(['sub60', 'sub65', 'under70'] as GoalId[]).map((gId) => {
              const tier = GOAL_TIERS[gId];
              const isSelected = gId === selectedGoalId;
              return (
                <TouchableOpacity
                  key={gId}
                  style={[styles.tierBtn, isSelected && styles.tierBtnSelected]}
                  onPress={() => handleSelectGoal(gId)}
                >
                  <Text style={[styles.tierBtnTitle, isSelected && styles.tierBtnTitleSelected]}>
                    {tier.name}
                  </Text>
                  <Text style={[styles.tierBtnPace, isSelected && styles.tierBtnPaceSelected]}>
                    {formatPaceMinutesSeconds(tier.targetPaceMinSec)}–{formatPaceMinutesSeconds(tier.targetPaceMaxSec)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Riegel Note */}
          <View style={styles.riegelNoteBox}>
            <Text style={styles.riegelNoteIcon}>ℹ️</Text>
            <Text style={styles.riegelNoteText}>{RIEGEL_NOTE_TEXT}</Text>
          </View>
        </View>

        {/* ======================================================== */}
        {/* SECTION MỚI: CHẠY NGẪU HỨNG (AI PT TỰ ĐỘNG SINH BÀI TẬP) */}
        {/* ======================================================== */}
        <View style={styles.adaptiveSection}>
          <View style={styles.adaptiveHeader}>
            <View style={styles.adaptiveTitleRow}>
              <Text style={styles.adaptiveSectionTitle}>⚡ HỨNG LÊN LÀ CHẠY — AI PT ĐỀ XUẤT</Text>
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>AI ADAPTIVE</Text>
              </View>
            </View>
            <Text style={styles.adaptiveSectionSub}>
              Tự động phân tích lịch tuần (T3 Cầu lông, T5 Chất lượng, T7 Chạy dài) và thể lực tuần này để suy nghĩ bài chạy thích hợp nhất cho bạn.
            </Text>
          </View>

          {/* Context Tích Lũy Tuần Này */}
          {adaptiveRec?.weeklyContextSummary ? (
            <View style={styles.contextSummaryChip}>
              <Text style={styles.contextSummaryText}>📊 {adaptiveRec.weeklyContextSummary}</Text>
            </View>
          ) : null}

          {/* Selector Cảm Giác Thể Trạng Hôm Nay */}
          <Text style={styles.feelingPromptText}>Hôm nay bạn cảm thấy thế nào?</Text>
          <View style={styles.feelingPillsRow}>
            {[
              { id: 'FRESH_READY', label: '⚡ Sung sức' },
              { id: 'NORMAL', label: '😊 Bình thường' },
              { id: 'FATIGUED_SORE', label: '😮‍💨 Chân mỏi' },
              { id: 'LIMITED_TIME', label: '⏱️ Gấp 20p' },
            ].map((f) => {
              const isSelected = selectedFeeling === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.feelingPill, isSelected && styles.feelingPillActive]}
                  onPress={() => handleSelectFeeling(f.id as RunnerFeeling)}
                >
                  <Text style={[styles.feelingPillText, isSelected && styles.textDark]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Thẻ Bài Tập AI Đề Xuất */}
          {adaptiveRec ? (
            <View style={styles.adaptiveCard}>
              <View style={styles.adaptiveCardTop}>
                <View style={styles.recTypeBadge}>
                  <Text style={styles.recTypeBadgeText}>{adaptiveRec.recommendedType}</Text>
                </View>
                <Text style={styles.adaptiveDistText}>{adaptiveRec.workout.totalDistanceKm} KM</Text>
              </View>

              <Text style={styles.adaptiveWorkoutTitle}>{adaptiveRec.workout.title}</Text>
              <Text style={styles.adaptiveReasonText}>{adaptiveRec.reasoning}</Text>

              <View style={styles.aiQuoteBox}>
                <Text style={styles.aiQuoteIcon}>💡</Text>
                <Text style={styles.aiQuoteText}>{adaptiveRec.aiSuggestedQuote}</Text>
              </View>

              {/* Các chặng tự động của bài tập */}
              <View style={styles.segmentsBox}>
                {adaptiveRec.workout.segments.map((seg) => {
                  const resolved = resolvePaceRange(seg as PaceSegmentLike, profile, currentGoal);
                  return (
                    <View key={seg.id} style={styles.segRow}>
                      <Text style={styles.segName} numberOfLines={1}>
                        {seg.name}
                      </Text>
                      <Text style={styles.segTarget}>{resolved.displayText}</Text>
                    </View>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.ctaAdaptiveBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  onSelectWorkout(adaptiveRec.workout);
                }}
              >
                <Text style={styles.ctaAdaptiveBtnText}>CHẠY BÀI NÀY NGAY VỚI AUDIO COACH</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Khối Hỏi Đáp Trực Tuyến Với AI Huấn Luyện Viên */}
          <View style={styles.aiQaCard}>
            <View style={styles.aiQaHeader}>
              <Text style={styles.aiQaTitle}>✨ HỎI Ý KIẾN AI HUẤN LUYỆN VIÊN</Text>
              <Text style={styles.aiQaProviderTag}>
                {geminiApiKey.trim() ? 'GEMINI 1.5 FLASH LIVE' : 'SMART OFFLINE AI'}
              </Text>
            </View>
            <Text style={styles.aiQaSub}>
              Hỏi nhanh thể trạng, dinh dưỡng hay cách chạy trước khi xỏ giày ra đường:
            </Text>

            <View style={styles.aiInputRow}>
              <TextInput
                style={styles.aiTextInput}
                value={aiQuestion}
                onChangeText={setAiQuestion}
                placeholder="VD: Chân hơi mỏi cơ bắp chuối thì chạy thế nào?"
                placeholderTextColor="#64748B"
              />
              <TouchableOpacity
                style={styles.aiSendBtn}
                onPress={handleAskAiCoach}
                disabled={isAiThinking}
              >
                {isAiThinking ? (
                  <ActivityIndicator size="small" color="#07090D" />
                ) : (
                  <Text style={styles.aiSendBtnText}>HỎI</Text>
                )}
              </TouchableOpacity>
            </View>

            {aiAnswer ? (
              <View style={styles.aiAnswerBox}>
                <Text style={styles.aiAnswerTitle}>🤖 LỜI KHUYÊN TỪ AI PT:</Text>
                <Text style={styles.aiAnswerText}>{aiAnswer}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Thanh chọn Tuần (Pill Carousel) */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>GIÁO ÁN 9 TUẦN CHINH PHỤC</Text>
            <Text style={styles.sectionHint}>T3 Cầu lông • T5/T7 Chạy chính</Text>
          </View>

          {/* Toggle bài tập chủ nhật tùy chọn */}
          <View style={styles.sundayToggleRow}>
            <Text style={styles.sundayToggleLabel}>CN tùy chọn</Text>
            <Switch
              value={includeSunday}
              onValueChange={(val) => {
                Haptics.selectionAsync();
                setIncludeSunday(val);
              }}
              trackColor={{ false: '#1E2534', true: '#00F0FF' }}
              thumbColor={includeSunday ? '#07090D' : '#64748B'}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekPillsRow}
        >
          {weeks.map((week, idx) => {
            const isSelected = idx === selectedWeekIndex;
            return (
              <TouchableOpacity
                key={week.weekNumber}
                style={[styles.weekPill, isSelected && styles.weekPillActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedWeekIndex(idx);
                }}
              >
                <Text style={[styles.weekPillNum, isSelected && styles.weekPillTextDark]}>
                  T{week.weekNumber}
                </Text>
                <Text style={[styles.weekPillDate, isSelected && styles.weekPillDateDark]}>
                  {week.dateRange.split(' - ')[0].slice(0, 5)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Banner trọng tâm tuần */}
        <View style={styles.focusCard}>
          <Text style={styles.focusDate}>{activeWeek.dateRange}</Text>
          <Text style={styles.focusText}>{activeWeek.focus}</Text>
        </View>

        {/* Danh sách buổi chạy trong tuần */}
        {visibleWorkouts.map((workout: any) => {
          const isSunday = Boolean(workout.isOptional || workout.dayOfWeek?.toLowerCase().includes('nhật'));

          return (
            <View key={workout.id} style={styles.workoutCard}>
              <View style={styles.workoutMetaRow}>
                <View style={styles.workoutBadgesLeft}>
                  <View
                    style={[
                      styles.dayChip,
                      isSunday && styles.dayChipOptional,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayChipText,
                        isSunday && styles.dayChipTextOptional,
                      ]}
                    >
                      {isSunday
                        ? 'CN (TÙY CHỌN)'
                        : workout.dayOfWeek?.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.workoutDate}>{workout.date}</Text>
                </View>
                <View style={styles.kmBadge}>
                  <Text style={styles.kmBadgeText}>{workout.totalDistanceKm} KM</Text>
                </View>
              </View>

              <Text style={styles.workoutTitle}>{workout.title}</Text>
              <Text style={styles.workoutDesc}>{workout.description}</Text>

              {/* Chặng tự động tính pace từ chỉ số VĐV */}
              <View style={styles.segmentsBox}>
                {workout.segments.slice(0, 4).map((seg: any) => {
                  const resolved = resolvePaceRange(seg as PaceSegmentLike, profile, currentGoal);
                  const paceDisplay = resolved.displayText;

                  return (
                    <View key={seg.id} style={styles.segRow}>
                      <Text style={styles.segName} numberOfLines={1}>
                        {seg.name}
                      </Text>
                      <Text style={styles.segTarget}>{paceDisplay}</Text>
                    </View>
                  );
                })}
                {workout.segments.length > 4 ? (
                  <Text style={styles.moreSegText}>
                    + {workout.segments.length - 4} chặng tự động tiếp theo
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.ctaVoltBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  onSelectWorkout(workout as unknown as WorkoutPlan);
                }}
              >
                <Text style={styles.ctaVoltBtnText}>CHẠY NGAY VỚI AUDIO COACH</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      {/* Modal Cập Nhật Chỉ Số VĐV & Cấu hình AI Key */}
      <Modal
        visible={isEditProfileVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsEditProfileVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>CẬP NHẬT CHỈ SỐ & CẤU HÌNH AI</Text>
              <TouchableOpacity
                onPress={() => setIsEditProfileVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDesc}>
              Khi lưu, toàn bộ giáo án sẽ tự động tính lại vùng nhịp tim và pace tập luyện tương ứng.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Pace Ngưỡng Lactate (phút:giây/km):</Text>
                <TextInput
                  style={styles.formInput}
                  value={editLtPaceStr}
                  onChangeText={setEditLtPaceStr}
                  placeholder="7:31"
                  placeholderTextColor="#64748B"
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Nhịp tim Ngưỡng (LTHR bpm):</Text>
                <TextInput
                  style={styles.formInput}
                  value={editLtHrStr}
                  onChangeText={setEditLtHrStr}
                  placeholder="176"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Nhịp tim Tối đa (HRmax bpm):</Text>
                <TextInput
                  style={styles.formInput}
                  value={editMaxHrStr}
                  onChangeText={setEditMaxHrStr}
                  placeholder="195"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Kết quả Test 3 km (phút:giây):</Text>
                <TextInput
                  style={styles.formInput}
                  value={editTest3kStr}
                  onChangeText={setEditTest3kStr}
                  placeholder="21:08"
                  placeholderTextColor="#64748B"
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              <View style={styles.formRow}>
                <Text style={styles.formLabel}>VO2max:</Text>
                <TextInput
                  style={styles.formInput}
                  value={editVo2MaxStr}
                  onChangeText={setEditVo2MaxStr}
                  placeholder="35"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Cân nặng (kg):</Text>
                <TextInput
                  style={styles.formInput}
                  value={editWeightStr}
                  onChangeText={setEditWeightStr}
                  placeholder="73.7"
                  placeholderTextColor="#64748B"
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Google Gemini API Key (Tùy chọn, miễn phí tại aistudio.google.com):</Text>
                <TextInput
                  style={styles.formInput}
                  value={editGeminiKeyStr}
                  onChangeText={setEditGeminiKeyStr}
                  placeholder="Dán Gemini API Key nếu muốn hỏi đáp LLM"
                  placeholderTextColor="#64748B"
                  autoCapitalize="none"
                  secureTextEntry={false}
                />
                <Text style={styles.formSubHint}>
                  Nếu để trống, app sẽ dùng Trợ lý AI Offline thông minh tích hợp sẵn, không tốn phí và không cần mạng.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.saveProfileBtn}
                onPress={handleSaveProfileModal}
              >
                <Text style={styles.saveProfileBtnText}>LƯU VÀ TÍNH LẠI GIÁO ÁN</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

function formatSecondsToMmSs(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function parseMmSsToSeconds(str: string, fallback: number): number {
  const cleaned = str.trim();
  if (!cleaned) return fallback;
  if (cleaned.includes(':') || cleaned.includes("'")) {
    const parts = cleaned.replace("'", ':').replace('"', '').split(':');
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return m * 60 + s;
  }
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? fallback : parsed;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07090D',
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  brandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandSub60: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  voltPill: {
    backgroundColor: '#00F0FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  voltPillText: {
    color: '#07090D',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  brandSubtitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  editProfileBtn: {
    backgroundColor: '#10141D',
    borderWidth: 1,
    borderColor: '#1E2534',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  editProfileBtnText: {
    color: '#00F0FF',
    fontSize: 11,
    fontWeight: '800',
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  bentoTile: {
    flex: 1,
    backgroundColor: '#10141D',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E2534',
    justifyContent: 'space-between',
  },
  bentoTileActiveVolt: {
    borderColor: '#00F0FF33',
    backgroundColor: '#0c1520',
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotVolt: {
    backgroundColor: '#00F0FF',
  },
  dotCoral: {
    backgroundColor: '#FF3B5C',
  },
  dotAmber: {
    backgroundColor: '#FFB020',
  },
  dotMuted: {
    backgroundColor: '#475569',
  },
  tileLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  hrReadoutRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginVertical: 4,
  },
  hrBigValue: {
    color: '#F8FAFC',
    fontSize: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  hrUnit: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  lthrStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E2534',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  lthrBigValue: {
    color: '#D2FF00',
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  tileSubText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 6,
  },
  tileBtn: {
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  tileBtnVolt: {
    backgroundColor: '#00F0FF',
  },
  tileBtnGhost: {
    backgroundColor: '#1E2534',
  },
  tileBtnText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
  },
  tileBtnTextDark: {
    color: '#07090D',
  },
  simMiniRow: {
    flexDirection: 'row',
    gap: 6,
  },
  simMiniBtn: {
    flex: 1,
    backgroundColor: '#1E2534',
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  simMiniBtnActive: {
    backgroundColor: '#00F0FF33',
    borderWidth: 1,
    borderColor: '#00F0FF',
  },
  simMiniText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },
  simMiniDangerBtn: {
    backgroundColor: '#FF3B5C22',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF3B5C66',
    alignItems: 'center',
  },
  simMiniDangerText: {
    color: '#FF3B5C',
    fontSize: 10,
    fontWeight: '700',
  },
  errorPill: {
    backgroundColor: '#FF3B5C22',
    borderColor: '#FF3B5C55',
    borderWidth: 1,
    padding: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorPillText: {
    color: '#FF6B8B',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  goalSelectionCard: {
    backgroundColor: '#10141D',
    borderWidth: 1,
    borderColor: '#1E2534',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  goalCardTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  activeGoalBadge: {
    backgroundColor: '#D2FF0022',
    borderColor: '#D2FF00',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeGoalBadgeText: {
    color: '#D2FF00',
    fontSize: 10,
    fontWeight: '900',
  },
  goalTiersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  tierBtn: {
    flex: 1,
    backgroundColor: '#0A0D14',
    borderWidth: 1,
    borderColor: '#1E2534',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  tierBtnSelected: {
    borderColor: '#D2FF00',
    backgroundColor: '#1b260d',
  },
  tierBtnTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  tierBtnTitleSelected: {
    color: '#D2FF00',
  },
  tierBtnPace: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  tierBtnPaceSelected: {
    color: '#F8FAFC',
  },
  riegelNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0c1520',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: '#00F0FF22',
  },
  riegelNoteIcon: {
    fontSize: 14,
  },
  riegelNoteText: {
    flex: 1,
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  adaptiveSection: {
    backgroundColor: '#10141D',
    borderWidth: 1.5,
    borderColor: '#00F0FF55',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  adaptiveHeader: {
    marginBottom: 10,
  },
  adaptiveTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  adaptiveSectionTitle: {
    color: '#00F0FF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  aiBadge: {
    backgroundColor: '#00F0FF22',
    borderWidth: 1,
    borderColor: '#00F0FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiBadgeText: {
    color: '#00F0FF',
    fontSize: 9,
    fontWeight: '900',
  },
  adaptiveSectionSub: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
  },
  contextSummaryChip: {
    backgroundColor: '#07090D',
    borderWidth: 1,
    borderColor: '#1E2534',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  contextSummaryText: {
    color: '#D2FF00',
    fontSize: 11,
    fontWeight: '700',
  },
  feelingPromptText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 8,
  },
  feelingPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  feelingPill: {
    flex: 1,
    backgroundColor: '#07090D',
    borderWidth: 1,
    borderColor: '#1E2534',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  feelingPillActive: {
    backgroundColor: '#00F0FF',
    borderColor: '#00F0FF',
  },
  feelingPillText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
  },
  textDark: {
    color: '#07090D',
  },
  adaptiveCard: {
    backgroundColor: '#0A0D14',
    borderWidth: 1,
    borderColor: '#1E2534',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  adaptiveCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recTypeBadge: {
    backgroundColor: '#D2FF0022',
    borderWidth: 1,
    borderColor: '#D2FF00',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recTypeBadgeText: {
    color: '#D2FF00',
    fontSize: 10,
    fontWeight: '900',
  },
  adaptiveDistText: {
    color: '#00F0FF',
    fontSize: 16,
    fontWeight: '900',
  },
  adaptiveWorkoutTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 6,
  },
  adaptiveReasonText: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  aiQuoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10141D',
    borderRadius: 8,
    padding: 8,
    gap: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#00F0FF',
  },
  aiQuoteIcon: {
    fontSize: 14,
  },
  aiQuoteText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontStyle: 'italic',
    flex: 1,
  },
  ctaAdaptiveBtn: {
    backgroundColor: '#00F0FF',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaAdaptiveBtnText: {
    color: '#07090D',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  aiQaCard: {
    backgroundColor: '#0A0D14',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E2534',
  },
  aiQaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  aiQaTitle: {
    color: '#D2FF00',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  aiQaProviderTag: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
  },
  aiQaSub: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  aiInputRow: {
    flexDirection: 'row',
    gap: 6,
  },
  aiTextInput: {
    flex: 1,
    backgroundColor: '#07090D',
    borderWidth: 1,
    borderColor: '#1E2534',
    borderRadius: 10,
    color: '#F8FAFC',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  aiSendBtn: {
    backgroundColor: '#D2FF00',
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  aiSendBtnText: {
    color: '#07090D',
    fontSize: 12,
    fontWeight: '900',
  },
  aiAnswerBox: {
    backgroundColor: '#10141D',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#D2FF00',
  },
  aiAnswerTitle: {
    color: '#D2FF00',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 2,
  },
  aiAnswerText: {
    color: '#F8FAFC',
    fontSize: 12,
    lineHeight: 17,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  sectionHint: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  sundayToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sundayToggleLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  weekPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  weekPill: {
    backgroundColor: '#10141D',
    borderWidth: 1,
    borderColor: '#1E2534',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
  },
  weekPillActive: {
    backgroundColor: '#D2FF00',
    borderColor: '#D2FF00',
  },
  weekPillNum: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  weekPillTextDark: {
    color: '#07090D',
  },
  weekPillDate: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  weekPillDateDark: {
    color: '#07090D',
  },
  focusCard: {
    backgroundColor: '#10141D',
    borderWidth: 1,
    borderColor: '#1E2534',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  focusDate: {
    color: '#00F0FF',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 4,
  },
  focusText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  workoutCard: {
    backgroundColor: '#10141D',
    borderWidth: 1,
    borderColor: '#1E2534',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  workoutMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  workoutBadgesLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayChip: {
    backgroundColor: '#1E2534',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dayChipOptional: {
    backgroundColor: '#332711',
    borderWidth: 1,
    borderColor: '#FFB02066',
  },
  dayChipText: {
    color: '#00F0FF',
    fontSize: 10,
    fontWeight: '900',
  },
  dayChipTextOptional: {
    color: '#FFB020',
  },
  workoutDate: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  kmBadge: {
    backgroundColor: '#D2FF0022',
    borderWidth: 1,
    borderColor: '#D2FF0055',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  kmBadgeText: {
    color: '#D2FF00',
    fontSize: 12,
    fontWeight: '900',
  },
  workoutTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  workoutDesc: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    marginBottom: 12,
  },
  segmentsBox: {
    backgroundColor: '#0A0D14',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
    gap: 6,
  },
  segRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  segName: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  segTarget: {
    color: '#D2FF00',
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  moreSegText: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    fontStyle: 'italic',
    marginTop: 2,
  },
  ctaVoltBtn: {
    backgroundColor: '#D2FF00',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaVoltBtnText: {
    color: '#07090D',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 9, 13, 0.92)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#10141D',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E2534',
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '900',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    color: '#64748B',
    fontSize: 18,
    fontWeight: '800',
  },
  modalDesc: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 16,
  },
  formRow: {
    marginBottom: 12,
  },
  formLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  formSubHint: {
    color: '#64748B',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 4,
  },
  formInput: {
    backgroundColor: '#07090D',
    borderWidth: 1,
    borderColor: '#1E2534',
    borderRadius: 10,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveProfileBtn: {
    backgroundColor: '#00F0FF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  saveProfileBtnText: {
    color: '#07090D',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});

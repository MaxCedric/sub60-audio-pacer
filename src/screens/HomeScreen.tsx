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

        {/* ── CONTEST POSTER BENTO: Golden Ratio 1.618:1 ── */}
        <View style={styles.posterBento}>
          {/* Left Poster Card (61.8%) */}
          <View style={styles.posterCard}>
            <View style={styles.posterRibbonLime}>
              <Text style={styles.posterRibbonText}>CHALLENGE</Text>
              <Text style={styles.posterRibbonText}>CHALLENGE</Text>
            </View>
            <View style={styles.posterRibbonPurple}>
              <Text style={styles.posterRibbonPurpleText}>VER 1.0 // 10K</Text>
            </View>
            <View style={styles.posterCardMain}>
              <View style={styles.posterCardTop}>
                <View style={styles.posterGoalBadge}>
                  <Text style={styles.posterGoalBadgeText}>{currentGoal.name.toUpperCase()}</Text>
                </View>
                <Text style={styles.posterChevs}>❯❯❯</Text>
              </View>
              <View style={styles.posterTitleLayer}>
                <Text style={styles.posterBigTitle}>STARTING</Text>
                <View style={styles.posterSubRow}>
                  <Text style={styles.posterDist}>10 KM</Text>
                  <Text style={styles.posterPace}>{formatPaceMinutesSeconds(currentGoal.targetPaceMinSec)}/km</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Right Lime Card (38.2%) */}
          <View style={styles.posterLimeCard}>
            <View style={styles.posterLimeTop}>
              <Text style={styles.posterLimeTopLabel}>FINALS</Text>
              <View style={styles.liveChip}><Text style={styles.liveChipText}>LIVE</Text></View>
            </View>
            <View style={styles.posterDaysCircle}>
              <Text style={styles.posterDaysNum}>59</Text>
              <Text style={styles.posterDaysLabel}>DAYS</Text>
            </View>
            <View style={styles.posterLimeDate}>
              <Text style={styles.posterLimeDateText}>16.01.2027</Text>
            </View>
          </View>
        </View>

        {/* ── GOAL TIER SELECTOR ── */}
        <View style={styles.goalTierGrid}>
          {(['sub60', 'sub65', 'under70'] as GoalId[]).map((gId) => {
            const tier = GOAL_TIERS[gId];
            const isSelected = gId === selectedGoalId;
            return (
              <TouchableOpacity
                key={gId}
                style={[styles.tierPill, isSelected && styles.tierPillSelected]}
                onPress={() => handleSelectGoal(gId)}
              >
                <Text style={[styles.tierPillTitle, isSelected && styles.tierPillTitleSelected]}>{tier.name}</Text>
                <Text style={[styles.tierPillPace, isSelected && styles.tierPillPaceSelected]}>
                  {formatPaceMinutesSeconds(tier.targetPaceMinSec)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── BLE + LTHR BENTO ── */}
        <View style={styles.bentoRow}>
          <View style={[styles.bentoTile, isBleConnected && styles.bentoTileActiveLime]}>
            <View style={styles.tileHeader}>
              <View style={[styles.statusDot, isBleConnected ? styles.dotLime : isScanning ? styles.dotAmber : styles.dotMuted]} />
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
              style={[styles.tileBtn, isBleConnected ? styles.tileBtnGhost : styles.tileBtnLime]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); isBleConnected ? onDisconnectBle() : onScanBle(); }}
            >
              <Text style={[styles.tileBtnText, !isBleConnected && styles.tileBtnTextDark]}>
                {isBleConnected ? 'Ngắt kết nối' : 'Kết nối BLE'}
              </Text>
            </TouchableOpacity>
          </View>

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
              <TouchableOpacity style={styles.simMiniDangerBtn} onPress={() => onToggleSimBle(true)}>
                <Text style={styles.simMiniDangerText}>Test 180</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {bleError ? (
          <View style={styles.errorPill}><Text style={styles.errorPillText}>{bleError}</Text></View>
        ) : null}

        {/* ── ADAPTIVE AI SECTION ── */}
        <View style={styles.adaptiveSection}>
          <View style={styles.adaptiveTitleRow}>
            <Text style={styles.adaptiveSectionTitle}>⚡ HỨNG LÊN LÀ CHẠY — AI PT ĐỀ XUẤT</Text>
            <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI ADAPTIVE</Text></View>
          </View>
          <Text style={styles.adaptiveSectionSub}>
            Tự động phân tích lịch tuần và thể lực để đề xuất bài chạy phù hợp nhất.
          </Text>

          {adaptiveRec?.weeklyContextSummary ? (
            <View style={styles.contextSummaryChip}>
              <Text style={styles.contextSummaryText}>📊 {adaptiveRec.weeklyContextSummary}</Text>
            </View>
          ) : null}

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
                  <Text style={[styles.feelingPillText, isSelected && styles.textDark]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

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
              <View style={styles.segmentsBox}>
                {adaptiveRec.workout.segments.map((seg) => {
                  const resolved = resolvePaceRange(seg as PaceSegmentLike, profile, currentGoal);
                  return (
                    <View key={seg.id} style={styles.segRow}>
                      <Text style={styles.segName} numberOfLines={1}>{seg.name}</Text>
                      <Text style={styles.segTarget}>{resolved.displayText}</Text>
                    </View>
                  );
                })}
              </View>
              <TouchableOpacity
                style={styles.ctaLimeBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); onSelectWorkout(adaptiveRec.workout); }}
              >
                <Text style={styles.ctaLimeBtnText}>CHẠY BÀI NÀY NGAY VỚI AUDIO COACH</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.aiQaCard}>
            <View style={styles.aiQaHeader}>
              <Text style={styles.aiQaTitle}>💬 HỎI AI HUẤN LUYỆN VIÊN</Text>
              <Text style={styles.aiQaProviderTag}>{geminiApiKey.trim() ? 'GEMINI LIVE' : 'OFFLINE AI PT'}</Text>
            </View>
            <View style={styles.aiQuickQRow}>
              {['Mỏi bắp chuối?', 'Sau T3 cầu lông?', 'Uống nước nhịp thở?'].map(q => (
                <TouchableOpacity key={q} style={styles.quickQChip} onPress={() => setAiQuestion(q)}>
                  <Text style={styles.quickQText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.aiInputRow}>
              <TextInput
                style={styles.aiTextInput}
                value={aiQuestion}
                onChangeText={setAiQuestion}
                placeholder="Hỏi PT..."
                placeholderTextColor="#64748B"
              />
              <TouchableOpacity style={styles.aiSendBtn} onPress={handleAskAiCoach} disabled={isAiThinking}>
                {isAiThinking ? (
                  <ActivityIndicator size="small" color="#08090C" />
                ) : (
                  <Text style={styles.aiSendBtnText}>Hỏi</Text>
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

        {/* ── WEEK SELECTOR ── */}
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>📅 LỊCH TẬP 9 TUẦN CHINH PHỤC</Text>
            <Text style={styles.sectionHint}>T3 Cầu lông • T5/T7 Chạy chính</Text>
          </View>
          <View style={styles.sundayToggleRow}>
            <Text style={styles.sundayToggleLabel}>CN tùy chọn</Text>
            <Switch
              value={includeSunday}
              onValueChange={(val) => { Haptics.selectionAsync(); setIncludeSunday(val); }}
              trackColor={{ false: '#252838', true: '#C8FF00' }}
              thumbColor={includeSunday ? '#08090C' : '#64748B'}
              style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekPillsRow}>
          {weeks.map((week, idx) => {
            const isSelected = idx === selectedWeekIndex;
            return (
              <TouchableOpacity
                key={week.weekNumber}
                style={[styles.weekPill, isSelected && styles.weekPillActive]}
                onPress={() => { Haptics.selectionAsync(); setSelectedWeekIndex(idx); }}
              >
                <Text style={[styles.weekPillNum, isSelected && styles.weekPillTextDark]}>T{week.weekNumber}</Text>
                <Text style={[styles.weekPillDate, isSelected && styles.weekPillDateDark]}>
                  {week.dateRange.split(' - ')[0].slice(0, 5)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.focusCard}>
          <Text style={styles.focusDate}>{activeWeek.dateRange}</Text>
          <Text style={styles.focusText}>{activeWeek.focus}</Text>
        </View>

        {/* ── WORKOUT CARDS ── */}
        {visibleWorkouts.map((workout: any) => {
          const isSunday = Boolean(workout.isOptional || workout.dayOfWeek?.toLowerCase().includes('nhật'));
          const isCheckpoint = workout.type === 'Checkpoint';
          return (
            <View key={workout.id} style={[styles.workoutCard, isCheckpoint && styles.workoutCardCheckpoint]}>
              <View style={styles.workoutMetaRow}>
                <View style={styles.workoutBadgesLeft}>
                  <View style={[styles.dayChip, isSunday && styles.dayChipOptional, isCheckpoint && styles.dayChipCheckpoint]}>
                    <Text style={[styles.dayChipText, isSunday && styles.dayChipTextOptional, isCheckpoint && styles.dayChipTextCheckpoint]}>
                      {isSunday ? 'CN (TÙY CHỌN)' : workout.dayOfWeek?.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={[styles.kmBadge, isCheckpoint && styles.kmBadgePurple]}>
                  <Text style={[styles.kmBadgeText, isCheckpoint && styles.kmBadgeTextPurple]}>{workout.totalDistanceKm} KM</Text>
                </View>
              </View>

              <Text style={[styles.workoutTitle, isCheckpoint && styles.workoutTitleCheckpoint]}>{workout.title}</Text>
              <Text style={styles.workoutDesc}>{workout.description}</Text>

              <View style={styles.segmentsBox}>
                {workout.segments.slice(0, 4).map((seg: any) => {
                  const resolved = resolvePaceRange(seg as PaceSegmentLike, profile, currentGoal);
                  return (
                    <View key={seg.id} style={styles.segRow}>
                      <Text style={styles.segName} numberOfLines={1}>{seg.name}</Text>
                      <Text style={styles.segTarget}>{resolved.displayText}</Text>
                    </View>
                  );
                })}
                {workout.segments.length > 4 ? (
                  <Text style={styles.moreSegText}>+ {workout.segments.length - 4} chặng tiếp theo</Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.ctaLimeBtn, isCheckpoint && styles.ctaPurpleBtn]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); onSelectWorkout(workout as unknown as WorkoutPlan); }}
              >
                <Text style={[styles.ctaLimeBtnText, isCheckpoint && styles.ctaPurpleBtnText]}>
                  {isCheckpoint ? '🏆 CHẠY BÀI TEST CHECKPOINT' : 'CHẠY NGAY VỚI AUDIO COACH'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.editProfileBtnFull}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setIsEditProfileVisible(true); }}
        >
          <Text style={styles.editProfileBtnFullText}>⚙️ CHỈNH SỬA CHỈ SỐ VẬN ĐỘNG VIÊN</Text>
        </TouchableOpacity>

      </ScrollView>

      <Modal visible={isEditProfileVisible} animationType="slide" transparent={true} onRequestClose={() => setIsEditProfileVisible(false)}>
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>CẬP NHẬT CHỈ SỐ & CẤU HÌNH AI</Text>
              <TouchableOpacity onPress={() => setIsEditProfileVisible(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDesc}>Khi lưu, toàn bộ giáo án sẽ tự động tính lại vùng nhịp tim và pace tập luyện.</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { label: 'Pace Ngưỡng Lactate (phút:giây/km):', value: editLtPaceStr, setter: setEditLtPaceStr, placeholder: '7:31', kbType: 'numbers-and-punctuation' as const },
                { label: 'Nhịp tim Ngưỡng (LTHR bpm):', value: editLtHrStr, setter: setEditLtHrStr, placeholder: '176', kbType: 'numeric' as const },
                { label: 'Nhịp tim Tối đa (HRmax bpm):', value: editMaxHrStr, setter: setEditMaxHrStr, placeholder: '195', kbType: 'numeric' as const },
                { label: 'Kết quả Test 3 km (phút:giây):', value: editTest3kStr, setter: setEditTest3kStr, placeholder: '21:08', kbType: 'numbers-and-punctuation' as const },
                { label: 'VO2max:', value: editVo2MaxStr, setter: setEditVo2MaxStr, placeholder: '35', kbType: 'numeric' as const },
                { label: 'Cân nặng (kg):', value: editWeightStr, setter: setEditWeightStr, placeholder: '73.7', kbType: 'numbers-and-punctuation' as const },
              ].map(field => (
                <View key={field.label} style={styles.formRow}>
                  <Text style={styles.formLabel}>{field.label}</Text>
                  <TextInput
                    style={styles.formInput}
                    value={field.value}
                    onChangeText={field.setter}
                    placeholder={field.placeholder}
                    placeholderTextColor="#64748B"
                    keyboardType={field.kbType}
                  />
                </View>
              ))}
              <View style={styles.formRow}>
                <Text style={styles.formLabel}>Google Gemini API Key (Tùy chọn):</Text>
                <TextInput
                  style={styles.formInput}
                  value={editGeminiKeyStr}
                  onChangeText={setEditGeminiKeyStr}
                  placeholder="Dán Gemini API Key nếu muốn hỏi đáp LLM"
                  placeholderTextColor="#64748B"
                  autoCapitalize="none"
                />
                <Text style={styles.formSubHint}>Nếu để trống, app dùng Trợ lý AI Offline tích hợp sẵn.</Text>
              </View>
              <TouchableOpacity style={styles.saveProfileBtn} onPress={handleSaveProfileModal}>
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
  safeArea: { flex: 1, backgroundColor: '#08090C' },
  container: { padding: 16, paddingBottom: 40 },
  posterBento: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  posterCard: { flex: 1.618, flexDirection: 'row', backgroundColor: '#111218', borderWidth: 1, borderColor: 'rgba(75,46,255,0.6)', borderRadius: 2, minHeight: 180, overflow: 'hidden' },
  posterRibbonLime: { width: 28, backgroundColor: '#C8FF00', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, gap: 16 },
  posterRibbonText: { color: '#08090C', fontSize: 9, fontWeight: '900', letterSpacing: 2, transform: [{ rotate: '90deg' }] },
  posterRibbonPurple: { width: 18, backgroundColor: '#4B2EFF', alignItems: 'center', justifyContent: 'center' },
  posterRibbonPurpleText: { color: '#FFFFFF', fontSize: 7, fontWeight: '900', letterSpacing: 1.5, transform: [{ rotate: '90deg' }] },
  posterCardMain: { flex: 1, padding: 12, justifyContent: 'space-between' },
  posterCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  posterGoalBadge: { backgroundColor: '#4B2EFF', paddingHorizontal: 8, paddingVertical: 3 },
  posterGoalBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  posterChevs: { color: '#C8FF00', fontSize: 14, fontWeight: '900' },
  posterTitleLayer: { marginTop: 8 },
  posterBigTitle: { color: '#C8FF00', fontSize: 36, fontWeight: '900', letterSpacing: -1, lineHeight: 36, textTransform: 'uppercase', fontStyle: 'italic' },
  posterSubRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  posterDist: { color: '#F8FAFC', fontSize: 20, fontWeight: '900', fontStyle: 'italic' },
  posterPace: { color: '#9D85FF', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  posterLimeCard: { flex: 1, backgroundColor: '#C8FF00', borderRadius: 2, padding: 12, justifyContent: 'space-between', alignItems: 'center', minHeight: 180 },
  posterLimeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  posterLimeTopLabel: { color: '#08090C', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  liveChip: { backgroundColor: '#08090C', paddingHorizontal: 6, paddingVertical: 2 },
  liveChipText: { color: '#C8FF00', fontSize: 9, fontWeight: '900' },
  posterDaysCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: '#08090C', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  posterDaysNum: { color: '#08090C', fontSize: 32, fontWeight: '900', fontVariant: ['tabular-nums'], lineHeight: 34 },
  posterDaysLabel: { color: '#08090C', fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  posterLimeDate: { backgroundColor: '#4B2EFF', paddingVertical: 4, paddingHorizontal: 8, alignSelf: 'stretch', alignItems: 'center' },
  posterLimeDateText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  goalTierGrid: { flexDirection: 'row', gap: 8, backgroundColor: '#111218', padding: 8, borderRadius: 14, marginBottom: 14 },
  tierPill: { flex: 1, backgroundColor: '#08090C', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', borderWidth: 1, borderColor: '#252838' },
  tierPillSelected: { backgroundColor: '#C8FF00', borderColor: '#C8FF00' },
  tierPillTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '800', marginBottom: 2 },
  tierPillTitleSelected: { color: '#08090C' },
  tierPillPace: { color: '#64748B', fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tierPillPaceSelected: { color: '#08090C' },
  bentoRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  bentoTile: { flex: 1, backgroundColor: '#111218', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#252838', justifyContent: 'space-between' },
  bentoTileActiveLime: { borderColor: 'rgba(200,255,0,0.4)', backgroundColor: '#0e1109' },
  bentoTileActiveVolt: { borderColor: 'rgba(200,255,0,0.4)', backgroundColor: '#0e1109' },
  tileHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotLime: { backgroundColor: '#C8FF00' },
  dotVolt: { backgroundColor: '#C8FF00' },
  dotCoral: { backgroundColor: '#FF3B5C' },
  dotAmber: { backgroundColor: '#FFB020' },
  dotMuted: { backgroundColor: '#475569' },
  tileLabel: { color: '#94A3B8', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  hrReadoutRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginVertical: 4 },
  hrBigValue: { color: '#F8FAFC', fontSize: 32, fontWeight: '900', fontVariant: ['tabular-nums'] },
  hrUnit: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  lthrStepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 4 },
  stepBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#252838', justifyContent: 'center', alignItems: 'center' },
  stepBtnText: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
  lthrBigValue: { color: '#C8FF00', fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  tileSubText: { color: '#64748B', fontSize: 10, fontWeight: '600', marginBottom: 6 },
  tileBtn: { paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tileBtnLime: { backgroundColor: '#C8FF00' },
  tileBtnVolt: { backgroundColor: '#C8FF00' },
  tileBtnGhost: { backgroundColor: '#252838' },
  tileBtnText: { color: '#F8FAFC', fontSize: 12, fontWeight: '800' },
  tileBtnTextDark: { color: '#08090C' },
  simMiniRow: { flexDirection: 'row', gap: 6 },
  simMiniBtn: { flex: 1, backgroundColor: '#252838', paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  simMiniBtnActive: { backgroundColor: 'rgba(200,255,0,0.2)', borderWidth: 1, borderColor: '#C8FF00' },
  simMiniText: { color: '#94A3B8', fontSize: 10, fontWeight: '700' },
  simMiniDangerBtn: { backgroundColor: '#FF3B5C22', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FF3B5C66', alignItems: 'center' },
  simMiniDangerText: { color: '#FF3B5C', fontSize: 10, fontWeight: '700' },
  errorPill: { backgroundColor: '#FF3B5C22', borderColor: '#FF3B5C55', borderWidth: 1, padding: 10, borderRadius: 12, marginBottom: 14 },
  errorPillText: { color: '#FF6B8B', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  adaptiveSection: { backgroundColor: '#111218', borderWidth: 1.5, borderColor: 'rgba(75,46,255,0.4)', borderRadius: 20, padding: 16, marginBottom: 20 },
  adaptiveTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  adaptiveSectionTitle: { color: '#C8FF00', fontSize: 13, fontWeight: '900', letterSpacing: 0.5, flex: 1, marginRight: 8 },
  aiBadge: { backgroundColor: 'rgba(75,46,255,0.3)', borderWidth: 1, borderColor: '#4B2EFF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  aiBadgeText: { color: '#9D85FF', fontSize: 9, fontWeight: '900' },
  adaptiveSectionSub: { color: '#94A3B8', fontSize: 11, lineHeight: 16, marginBottom: 12 },
  contextSummaryChip: { backgroundColor: '#08090C', borderWidth: 1, borderColor: '#252838', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginBottom: 12 },
  contextSummaryText: { color: '#C8FF00', fontSize: 11, fontWeight: '700' },
  feelingPromptText: { color: '#F8FAFC', fontSize: 12, fontWeight: '800', marginBottom: 8 },
  feelingPillsRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  feelingPill: { flex: 1, backgroundColor: '#08090C', borderWidth: 1, borderColor: '#252838', paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  feelingPillActive: { backgroundColor: '#C8FF00', borderColor: '#C8FF00' },
  feelingPillText: { color: '#94A3B8', fontSize: 10, fontWeight: '800' },
  textDark: { color: '#08090C' },
  adaptiveCard: { backgroundColor: '#08090C', borderWidth: 1, borderColor: '#252838', borderRadius: 16, padding: 14, marginBottom: 14 },
  adaptiveCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recTypeBadge: { backgroundColor: 'rgba(200,255,0,0.13)', borderWidth: 1, borderColor: '#C8FF00', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  recTypeBadgeText: { color: '#C8FF00', fontSize: 10, fontWeight: '900' },
  adaptiveDistText: { color: '#9D85FF', fontSize: 16, fontWeight: '900' },
  adaptiveWorkoutTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900', marginBottom: 6 },
  adaptiveReasonText: { color: '#94A3B8', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  aiQuoteBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111218', borderRadius: 8, padding: 8, gap: 8, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#4B2EFF' },
  aiQuoteIcon: { fontSize: 14 },
  aiQuoteText: { color: '#F8FAFC', fontSize: 11, fontStyle: 'italic', flex: 1 },
  ctaLimeBtn: { backgroundColor: '#C8FF00', paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  ctaLimeBtnText: { color: '#08090C', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  ctaPurpleBtn: { backgroundColor: '#4B2EFF' },
  ctaPurpleBtnText: { color: '#FFFFFF' },
  ctaAdaptiveBtn: { backgroundColor: '#C8FF00', paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  ctaAdaptiveBtnText: { color: '#08090C', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  ctaVoltBtn: { backgroundColor: '#C8FF00', paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  ctaVoltBtnText: { color: '#08090C', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  aiQaCard: { backgroundColor: '#08090C', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#252838' },
  aiQaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  aiQaTitle: { color: '#C8FF00', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  aiQaProviderTag: { color: '#64748B', fontSize: 9, fontWeight: '800' },
  aiQaSub: { color: '#94A3B8', fontSize: 11, lineHeight: 15, marginBottom: 8 },
  aiQuickQRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  quickQChip: { backgroundColor: '#181A24', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  quickQText: { color: '#CBD5E1', fontSize: 11 },
  aiInputRow: { flexDirection: 'row', gap: 6 },
  aiTextInput: { flex: 1, backgroundColor: '#111218', borderWidth: 1, borderColor: '#252838', borderRadius: 10, color: '#F8FAFC', fontSize: 12, paddingHorizontal: 10, paddingVertical: 7 },
  aiSendBtn: { backgroundColor: '#C8FF00', paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  aiSendBtnText: { color: '#08090C', fontSize: 12, fontWeight: '900' },
  aiAnswerBox: { backgroundColor: '#111218', borderRadius: 10, padding: 10, marginTop: 8, borderLeftWidth: 3, borderLeftColor: '#C8FF00' },
  aiAnswerTitle: { color: '#C8FF00', fontSize: 10, fontWeight: '900', marginBottom: 2 },
  aiAnswerText: { color: '#F8FAFC', fontSize: 12, lineHeight: 17 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  sectionHint: { color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 2 },
  sundayToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sundayToggleLabel: { color: '#94A3B8', fontSize: 11, fontWeight: '600' },
  weekPillsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  weekPill: { backgroundColor: '#111218', borderWidth: 1, borderColor: '#252838', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, alignItems: 'center' },
  weekPillActive: { backgroundColor: '#C8FF00', borderColor: '#C8FF00' },
  weekPillNum: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  weekPillTextDark: { color: '#08090C' },
  weekPillDate: { color: '#64748B', fontSize: 9, fontWeight: '700', marginTop: 2 },
  weekPillDateDark: { color: '#08090C' },
  focusCard: { backgroundColor: '#111218', borderWidth: 1, borderColor: '#252838', borderRadius: 14, padding: 12, marginBottom: 14 },
  focusDate: { color: '#9D85FF', fontSize: 11, fontWeight: '800', marginBottom: 4 },
  focusText: { color: '#F8FAFC', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  workoutCard: { backgroundColor: '#111218', borderWidth: 1, borderColor: '#252838', borderRadius: 18, padding: 16, marginBottom: 14 },
  workoutCardCheckpoint: { borderColor: 'rgba(75,46,255,0.6)', backgroundColor: '#0e0d1a' },
  workoutMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  workoutBadgesLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayChip: { backgroundColor: '#252838', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dayChipOptional: { backgroundColor: '#332711', borderWidth: 1, borderColor: '#FFB02066' },
  dayChipCheckpoint: { backgroundColor: 'rgba(75,46,255,0.3)', borderWidth: 1, borderColor: '#4B2EFF' },
  dayChipText: { color: '#C8FF00', fontSize: 10, fontWeight: '900' },
  dayChipTextOptional: { color: '#FFB020' },
  dayChipTextCheckpoint: { color: '#9D85FF' },
  workoutDate: { color: '#64748B', fontSize: 11, fontWeight: '600' },
  kmBadge: { backgroundColor: 'rgba(200,255,0,0.13)', borderWidth: 1, borderColor: 'rgba(200,255,0,0.33)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  kmBadgePurple: { backgroundColor: 'rgba(75,46,255,0.2)', borderColor: '#4B2EFF' },
  kmBadgeText: { color: '#C8FF00', fontSize: 12, fontWeight: '900' },
  kmBadgeTextPurple: { color: '#9D85FF' },
  workoutTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '800', marginBottom: 4 },
  workoutTitleCheckpoint: { color: '#9D85FF' },
  workoutDesc: { color: '#94A3B8', fontSize: 12, fontWeight: '500', lineHeight: 16, marginBottom: 12 },
  segmentsBox: { backgroundColor: '#08090C', borderRadius: 12, padding: 10, marginBottom: 14, gap: 6 },
  segRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  segName: { color: '#94A3B8', fontSize: 12, fontWeight: '600', flex: 1, marginRight: 8 },
  segTarget: { color: '#C8FF00', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  moreSegText: { color: '#64748B', fontSize: 10, fontWeight: '600', fontStyle: 'italic', marginTop: 2 },
  editProfileBtnFull: { backgroundColor: '#14151D', borderWidth: 1, borderColor: '#252838', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  editProfileBtnFullText: { color: '#9D85FF', fontSize: 12, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(8,9,12,0.92)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#111218', borderRadius: 20, borderWidth: 1, borderColor: '#252838', padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' },
  modalCloseBtn: { padding: 4 },
  modalCloseText: { color: '#64748B', fontSize: 18, fontWeight: '800' },
  modalDesc: { color: '#94A3B8', fontSize: 12, lineHeight: 16, marginBottom: 16 },
  formRow: { marginBottom: 12 },
  formLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  formSubHint: { color: '#64748B', fontSize: 10, lineHeight: 14, marginTop: 4 },
  formInput: { backgroundColor: '#08090C', borderWidth: 1, borderColor: '#252838', borderRadius: 10, color: '#F8FAFC', fontSize: 14, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 8 },
  saveProfileBtn: { backgroundColor: '#C8FF00', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 10, marginBottom: 20 },
  saveProfileBtnText: { color: '#08090C', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  brandTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandSub60: { color: '#F8FAFC', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  voltPill: { backgroundColor: '#C8FF00', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  voltPillText: { color: '#08090C', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  brandSubtitle: { color: '#64748B', fontSize: 11, fontWeight: '600', marginTop: 2 },
  editProfileBtn: { backgroundColor: '#111218', borderWidth: 1, borderColor: '#252838', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  editProfileBtnText: { color: '#9D85FF', fontSize: 11, fontWeight: '800' },
  goalSelectionCard: { backgroundColor: '#111218', borderWidth: 1, borderColor: '#252838', borderRadius: 16, padding: 14, marginBottom: 16 },
  goalCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  goalCardTitle: { color: '#94A3B8', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  activeGoalBadge: { backgroundColor: 'rgba(200,255,0,0.13)', borderColor: '#C8FF00', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  activeGoalBadgeText: { color: '#C8FF00', fontSize: 10, fontWeight: '900' },
  goalTiersRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tierBtn: { flex: 1, backgroundColor: '#08090C', borderWidth: 1, borderColor: '#252838', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center' },
  tierBtnSelected: { borderColor: '#C8FF00', backgroundColor: 'rgba(75,46,255,0.15)' },
  tierBtnTitle: { color: '#94A3B8', fontSize: 12, fontWeight: '800', marginBottom: 3 },
  tierBtnTitleSelected: { color: '#C8FF00' },
  tierBtnPace: { color: '#64748B', fontSize: 10, fontWeight: '700' },
  tierBtnPaceSelected: { color: '#F8FAFC' },
  riegelNoteBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#08090C', borderRadius: 10, padding: 10, gap: 8, borderWidth: 1, borderColor: 'rgba(200,255,0,0.13)' },
  riegelNoteIcon: { fontSize: 14 },
  riegelNoteText: { flex: 1, color: '#94A3B8', fontSize: 11, lineHeight: 16, fontWeight: '500' },
  adaptiveHeader: { marginBottom: 10 },
});

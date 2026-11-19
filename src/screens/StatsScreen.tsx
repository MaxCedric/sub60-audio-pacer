import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Line, Rect, G, Text as SvgText } from 'react-native-svg';
import trainingPlanData from '../data/trainingPlan.json';
import { audioCoach } from '../services/audioCoach';
import {
  AthleteProfile,
  DEFAULT_ATHLETE_PROFILE,
  GoalId,
  GOAL_TIERS,
  evaluateWeek4Test3k,
  evaluateWeek7RacePaceTest,
  CheckpointSuggestion,
} from '../logic/athlete';
import { formatPaceMinutesSeconds } from '../logic/paces';
import { queryGeminiCoachingTip } from '../logic/aiCoach';
import { storageService, CompletedRunSession, CheckpointHistoryItem } from '../services/storage';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Zone colors
const ZONE_COLORS: Record<number, string> = {
  1: '#94A3B8',
  2: '#9D85FF',
  3: '#C8FF00',
  4: '#FFB020',
  5: '#FF3B5C',
};

export const StatsScreen: React.FC = () => {
  const [profile, setProfile] = useState<AthleteProfile>(DEFAULT_ATHLETE_PROFILE);
  const [lthr, setLthr] = useState<number>(176);
  const [hrmax, setHrmax] = useState<number>(186);
  const [weightKg, setWeightKg] = useState<number>(73.7);
  const [cadenceTarget, setCadenceTarget] = useState<number>(172);
  const [test3kSec, setTest3kSec] = useState<number>(1268);
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [selectedGoalId, setSelectedGoalId] = useState<GoalId>('sub60');

  // AI Q&A State
  const [aiQuestion, setAiQuestion] = useState<string>('');
  const [aiAnswer, setAiAnswer] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Run History & Checkpoints
  const [runSessions, setRunSessions] = useState<CompletedRunSession[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointHistoryItem[]>([]);

  // Checkpoint Modal State
  const [isCheckpointModalVisible, setIsCheckpointModalVisible] = useState(false);
  const [checkpointWeek, setCheckpointWeek] = useState<4 | 7>(4);
  const [cpTimeInput, setCpTimeInput] = useState('21:08');
  const [cpHrInput, setCpHrInput] = useState('175');
  const [checkpointResult, setCheckpointResult] = useState<CheckpointSuggestion | null>(null);

  // Add Note Modal State
  const [isAddNoteModalVisible, setIsAddNoteModalVisible] = useState(false);
  const [noteTitle, setNoteTitle] = useState('Bài chạy');
  const [noteDist, setNoteDist] = useState('6.0');
  const [notePace, setNotePace] = useState("6'30\"");
  const [noteHr, setNoteHr] = useState('155');
  const [noteRpe, setNoteRpe] = useState('6');
  const [noteGood, setNoteGood] = useState('');
  const [noteBad, setNoteBad] = useState('');
  const [noteFix, setNoteFix] = useState('');

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [p, g, sessions, cp, key] = await Promise.all([
      storageService.getAthleteProfile(),
      storageService.getSelectedGoal(),
      storageService.getRunSessions(),
      storageService.getCheckpointHistory(),
      storageService.getGeminiApiKey(),
    ]);

    setProfile(p);
    setLthr(p.lactateThresholdHrBpm || 176);
    setHrmax(p.maxHrBpm || 186);
    setWeightKg(p.weightKg || 73.7);
    setCadenceTarget(172);
    setTest3kSec(p.fastest3kSec || 1268);
    setSelectedGoalId(g || 'sub60');
    setRunSessions(sessions);
    setCheckpoints(cp);
    setGeminiKey(key);
  };

  // Stepper adjustments
  const handleStep = (field: 'weightKg' | 'lthr' | 'hrmax' | 'cadenceTarget' | 'test3kSec', delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switch (field) {
      case 'weightKg':
        setWeightKg((prev) => Math.max(30, Math.min(150, +(prev + delta).toFixed(1))));
        break;
      case 'lthr': {
        setLthr((prev) => {
          const val = Math.max(120, Math.min(210, prev + delta));
          audioCoach.setLactateThresholdHr(val);
          return val;
        });
        break;
      }
      case 'hrmax':
        setHrmax((prev) => Math.max(140, Math.min(225, prev + delta)));
        break;
      case 'cadenceTarget':
        setCadenceTarget((prev) => Math.max(130, Math.min(220, prev + delta)));
        break;
      case 'test3kSec':
        setTest3kSec((prev) => Math.max(600, Math.min(2400, prev + delta)));
        break;
    }
  };

  // Save profile
  const handleSaveProfile = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const updatedProfile: AthleteProfile = {
      ...profile,
      weightKg,
      lactateThresholdHrBpm: lthr,
      maxHrBpm: hrmax,
      fastest3kSec: test3kSec,
    };
    setProfile(updatedProfile);
    await Promise.all([
      storageService.saveAthleteProfile(updatedProfile),
      storageService.saveGeminiApiKey(geminiKey),
    ]);
    Alert.alert('Đã lưu', 'Thông số Vận động viên đã được cập nhật thành công!');
  };

  // VO2max estimation from 3K time
  const vo2Est = useMemo(() => {
    const v = 3000 / (test3kSec / 60); // m/min
    const vo2 = (-4.60 + 0.182258 * v + 0.000104 * v * v) / 0.92;
    return Math.max(25, Math.min(75, vo2)).toFixed(1);
  }, [test3kSec]);

  // 5 HR Zones calculation based on LTHR
  const zonesData = useMemo(() => {
    const z1Max = Math.round(lthr * 0.77);
    const z2Min = z1Max + 1;
    const z2Max = Math.round(lthr * 0.89);
    const z3Min = z2Max + 1;
    const z3Max = Math.round(lthr * 0.97);
    const z4Min = z3Max + 1;
    const z4Max = Math.round(lthr * 1.02);
    const z5Min = z4Max + 1;

    const ltPace = profile.lactateThresholdPaceSecPerKm || 451;

    return [
      {
        z: 1,
        name: 'Phục hồi',
        color: ZONE_COLORS[1],
        range: `< ${z1Max} bpm`,
        pace: `> ${formatPaceMinutesSeconds(ltPace + 90)}`,
      },
      {
        z: 2,
        name: 'Sức bền hiếu khí',
        color: ZONE_COLORS[2],
        range: `${z2Min}–${z2Max} bpm`,
        pace: `${formatPaceMinutesSeconds(ltPace + 45)}–${formatPaceMinutesSeconds(ltPace + 90)}`,
      },
      {
        z: 3,
        name: 'Tempo',
        color: ZONE_COLORS[3],
        range: `${z3Min}–${z3Max} bpm`,
        pace: `${formatPaceMinutesSeconds(ltPace + 10)}–${formatPaceMinutesSeconds(ltPace + 40)}`,
      },
      {
        z: 4,
        name: 'Ngưỡng LTHR',
        color: ZONE_COLORS[4],
        range: `${z4Min}–${z4Max} bpm`,
        pace: `${formatPaceMinutesSeconds(ltPace - 10)}–${formatPaceMinutesSeconds(ltPace + 10)}`,
      },
      {
        z: 5,
        name: 'Vô khí',
        color: ZONE_COLORS[5],
        range: `>= ${z5Min} bpm`,
        pace: `< ${formatPaceMinutesSeconds(ltPace - 10)}`,
      },
    ];
  }, [lthr, profile.lactateThresholdPaceSecPerKm]);

  // Weekly Volume 9 weeks
  const weeklyVolume = useMemo(() => {
    if (trainingPlanData?.weeks && Array.isArray(trainingPlanData.weeks)) {
      return trainingPlanData.weeks.map((w: any) => {
        const totalKm = (w.workouts || []).reduce(
          (acc: number, cur: any) => acc + (cur.totalDistanceKm || 0),
          0
        );
        return {
          week: w.weekNumber,
          km: +totalKm.toFixed(1),
        };
      });
    }
    return [
      { week: 1, km: 18.0 },
      { week: 2, km: 21.5 },
      { week: 3, km: 24.0 },
      { week: 4, km: 20.0 },
      { week: 5, km: 26.5 },
      { week: 6, km: 28.0 },
      { week: 7, km: 25.0 },
      { week: 8, km: 30.5 },
      { week: 9, km: 16.0 },
    ];
  }, []);

  const maxVolumeKm = useMemo(() => {
    return Math.max(...weeklyVolume.map((v) => v.km), 35);
  }, [weeklyVolume]);

  // AI PT Q&A logic
  const handleAskAi = async (questionText?: string) => {
    const q = (questionText || aiQuestion).trim();
    if (!q) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsAiLoading(true);
    setAiAnswer('');

    try {
      if (geminiKey) {
        const geminiResponse = await queryGeminiCoachingTip(
          geminiKey,
          `Câu hỏi của vận động viên: "${q}". Hãy trả lời ngắn gọn trong 2-3 câu bằng tiếng Việt theo phong cách huấn luyện viên chạy bộ chuyên nghiệp, an toàn tim mạch.`,
          profile
        );
        if (geminiResponse) {
          setAiAnswer(geminiResponse);
          setIsAiLoading(false);
          return;
        }
      }

      // Offline AI PT smart answer
      const qLower = q.toLowerCase();
      let answer = '';
      if (qLower.includes('mỏi') || qLower.includes('bắp chuối') || qLower.includes('đau')) {
        answer =
          'PT khuyên: Khi mỏi bắp chuối, hãy khởi động kỹ cổ chân và bắp chân trước chạy. Chạy nhẹ Vùng 1–2 dưới 150 bpm trong 20 phút để phục hồi. Sau chạy nhớ giãn cơ bắp chuối và foam roll 10 phút, không chạy biến tốc khi cơ chưa hồi phục.';
      } else if (qLower.includes('cầu lông') || qLower.includes('t3')) {
        answer =
          'PT khuyên: Buổi thứ 3 đánh cầu lông cường độ cao là cross-training tuyệt vời nhưng gây căng tải khớp gối. Sáng thứ 4 hoặc thứ 5 chỉ nên chạy Easy nhẹ nhàng 25–30 phút, nhịp tim duy trì dưới ngưỡng LTHR 176 để tránh quá tải.';
      } else if (qLower.includes('nước') || qLower.includes('thở')) {
        answer =
          'PT khuyên: Hãy uống từng ngụm nhỏ 100–150ml nước hoặc điện giải mỗi 2–2.5 km. Về nhịp thở: duy trì nhịp 2–2 (2 bước hít vào, 2 bước thở ra) ở Zone 2. Khi lên dốc hoặc tăng tốc, chuyển nhịp 2–1 để nạp đủ oxy cho cơ.';
      } else {
        answer = `PT khuyên: Đối với mục tiêu ${GOAL_TIERS[selectedGoalId].name}, chìa khóa là kiên trì tích lũy cự ly ở Vùng 2 (hiếu khí), giữ guồng chân ${cadenceTarget} spm và tuyệt đối không để nhịp tim vượt quá ngưỡng nguy hiểm 190 bpm.`;
      }

      setTimeout(() => {
        setAiAnswer(answer);
        setIsAiLoading(false);
      }, 350);
    } catch {
      setAiAnswer('PT khuyên: Hãy lắng nghe cơ thể, duy trì chạy chậm ở Zone 2 và nghỉ ngơi đủ giấc.');
      setIsAiLoading(false);
    }
  };

  // Evaluate Checkpoint
  const handleEvaluateCheckpoint = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (checkpointWeek === 4) {
      const parts = cpTimeInput.replace("'", ':').split(':');
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      const totalSec = m * 60 + s;
      const res = evaluateWeek4Test3k(totalSec);
      setCheckpointResult(res);
    } else {
      const parts = cpTimeInput.replace("'", ':').split(':');
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      const avgPace = m * 60 + s;
      const avgHr = parseInt(cpHrInput, 10) || 175;
      const targetRacePace = GOAL_TIERS[selectedGoalId].targetPaceMinSec;
      const res = evaluateWeek7RacePaceTest(avgPace, avgHr, targetRacePace);
      if (res) {
        setCheckpointResult(res);
      } else {
        setCheckpointResult({
          isCheckpoint: true,
          checkpointName: 'Test 2 km Race Pace Tuần 7',
          suggestedGoalId: selectedGoalId,
          message: 'Pace và nhịp tim ổn định! Tiếp tục duy trì mục tiêu hiện tại.',
          canKeepCurrent: true,
          reason: 'Pace và HR đều nằm trong vùng kiểm soát tốt.',
        });
      }
    }
  };

  const handleApplyCheckpointDecision = async (accept: boolean) => {
    if (!checkpointResult) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const chosenGoal =
      accept && checkpointResult.suggestedGoalId
        ? checkpointResult.suggestedGoalId
        : selectedGoalId;

    const record: CheckpointHistoryItem = {
      id: `cp-${Date.now()}`,
      checkpointName: checkpointResult.checkpointName,
      date: new Date().toLocaleDateString('vi-VN'),
      suggestedGoalId: checkpointResult.suggestedGoalId,
      chosenGoalId: chosenGoal,
      reason: accept
        ? checkpointResult.reason
        : `Người dùng giữ nguyên mục tiêu ${GOAL_TIERS[selectedGoalId].name}`,
    };

    setSelectedGoalId(chosenGoal);
    await storageService.saveSelectedGoal(chosenGoal);
    await storageService.saveCheckpointHistory(record);
    setCheckpoints([record, ...checkpoints]);
    setIsCheckpointModalVisible(false);
    setCheckpointResult(null);
    Alert.alert('Thành công', `Đã cập nhật mục tiêu: ${GOAL_TIERS[chosenGoal].name}`);
  };

  // Add Manual Note
  const handleSaveManualNote = async () => {
    if (!noteTitle.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const distNum = parseFloat(noteDist) || 0;
    const hrNum = parseInt(noteHr, 10) || null;
    const rpeNum = Math.min(10, Math.max(1, parseInt(noteRpe, 10) || 6));

    const newSession: CompletedRunSession = {
      id: `manual-${Date.now()}`,
      workoutId: 'manual',
      workoutTitle: noteTitle.trim(),
      date: new Date().toLocaleDateString('vi-VN'),
      timestamp: Date.now(),
      totalDistanceMeters: Math.round(distNum * 1000),
      elapsedSeconds: 0,
      averagePaceSecPerKm: 390,
      averageHrBpm: hrNum,
      maxHrBpm: hrNum,
      timeInZonesSeconds: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      splits: [],
      averageCadenceSpm: cadenceTarget,
      alertsFiredCount: 0,
      rpeRating: rpeNum,
      userNote: noteGood || noteBad ? `${noteGood} | ${noteBad}` : '',
      goodPoint: noteGood.trim(),
      badPoint: noteBad.trim(),
      fixAction: noteFix.trim(),
      goalIdAtRun: selectedGoalId,
    };

    await storageService.saveRunSession(newSession);
    setRunSessions([newSession, ...runSessions]);
    setIsAddNoteModalVisible(false);
    setNoteGood('');
    setNoteBad('');
    setNoteFix('');
  };

  // Format seconds as mm:ss
  const formatMmSs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* ================================================================ */}
        {/* SECTION 1: AI PT Q&A                                             */}
        {/* ================================================================ */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth={2.3}>
                <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </Svg>
              <Text style={styles.cardTitle}>Hỏi AI Huấn Luyện Viên</Text>
            </View>
            <Text style={styles.aiBadge}>{geminiKey ? 'GEMINI AI PT' : 'OFFLINE AI PT'}</Text>
          </View>

          {/* Quick-Q Chips */}
          <View style={styles.quickQRow}>
            <TouchableOpacity
              style={styles.quickQBtn}
              onPress={() => {
                setAiQuestion('Mỏi bắp chuối?');
                handleAskAi('Mỏi bắp chuối?');
              }}
            >
              <Text style={styles.quickQText}>Mỏi bắp chuối?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickQBtn}
              onPress={() => {
                setAiQuestion('Sau T3 cầu lông chạy gì?');
                handleAskAi('Sau T3 cầu lông chạy gì?');
              }}
            >
              <Text style={styles.quickQText}>Sau T3 cầu lông chạy gì?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickQBtn}
              onPress={() => {
                setAiQuestion('Uống nước & nhịp thở?');
                handleAskAi('Uống nước & nhịp thở?');
              }}
            >
              <Text style={styles.quickQText}>Uống nước &amp; nhịp thở?</Text>
            </TouchableOpacity>
          </View>

          {/* Input & Ask Button */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              placeholder="Hỏi PT..."
              placeholderTextColor="#64748B"
              value={aiQuestion}
              onChangeText={setAiQuestion}
              onSubmitEditing={() => handleAskAi()}
            />
            <TouchableOpacity style={styles.btnAskAi} onPress={() => handleAskAi()} disabled={isAiLoading}>
              {isAiLoading ? (
                <ActivityIndicator size="small" color="#08090C" />
              ) : (
                <Text style={styles.btnAskAiText}>Hỏi</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* AI Answer Box */}
          {aiAnswer ? (
            <View style={styles.answerBox}>
              <Text style={styles.answerText}>{aiAnswer}</Text>
            </View>
          ) : null}
        </View>

        {/* ================================================================ */}
        {/* SECTION 2: ATHLETE PROFILE (Thông số Vận động viên)               */}
        {/* ================================================================ */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9D85FF" strokeWidth={2.3}>
                <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <Path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              </Svg>
              <Text style={styles.cardTitle}>Thông số Vận động viên</Text>
            </View>
            <TouchableOpacity style={styles.btnSaveProfile} onPress={handleSaveProfile}>
              <Text style={styles.btnSaveProfileText}>Lưu</Text>
            </TouchableOpacity>
          </View>

          {/* Steppers Grid */}
          <View style={styles.steppersGrid}>
            {/* Weight */}
            <View style={styles.stepperItem}>
              <Text style={styles.stepperLabel}>Cân nặng (kg)</Text>
              <View style={styles.stepperControl}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStep('weightKg', -0.5)}>
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{weightKg.toFixed(1)}</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStep('weightKg', 0.5)}>
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* LTHR */}
            <View style={styles.stepperItem}>
              <Text style={styles.stepperLabel}>LTHR (bpm)</Text>
              <View style={styles.stepperControl}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStep('lthr', -1)}>
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.stepperValue, { color: '#C8FF00' }]}>{lthr}</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStep('lthr', 1)}>
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* HRmax */}
            <View style={styles.stepperItem}>
              <Text style={styles.stepperLabel}>HRmax (bpm)</Text>
              <View style={styles.stepperControl}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStep('hrmax', -1)}>
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{hrmax}</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStep('hrmax', 1)}>
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Cadence SPM */}
            <View style={styles.stepperItem}>
              <Text style={styles.stepperLabel}>SPM (Nhịp bước)</Text>
              <View style={styles.stepperControl}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStep('cadenceTarget', -2)}>
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{cadenceTarget}</Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStep('cadenceTarget', 2)}>
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Test 3K */}
            <View style={[styles.stepperItem, { flexBasis: '100%' }]}>
              <Text style={styles.stepperLabel}>Thành tích Test 3K</Text>
              <View style={styles.stepperControl}>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStep('test3kSec', -5)}>
                  <Text style={styles.stepperBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={[styles.stepperValue, { color: '#9D85FF' }]}>
                  {formatMmSs(test3kSec)} ({test3kSec}s)
                </Text>
                <TouchableOpacity style={styles.stepperBtn} onPress={() => handleStep('test3kSec', 5)}>
                  <Text style={styles.stepperBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Gemini API Key */}
          <TextInput
            style={styles.keyInput}
            secureTextEntry
            placeholder="Gemini API Key (tùy chọn để kích hoạt AI Pro)"
            placeholderTextColor="#64748B"
            value={geminiKey}
            onChangeText={setGeminiKey}
          />
        </View>

        {/* ================================================================ */}
        {/* SECTION 3: 5 HR ZONES (5 Vùng Tim)                               */}
        {/* ================================================================ */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              5 Vùng Tim (LTHR <Text style={{ color: '#C8FF00' }}>{lthr}</Text>)
            </Text>
            <Text style={styles.vo2Badge}>
              VO2max ~<Text style={{ color: '#9D85FF' }}>{vo2Est}</Text>
            </Text>
          </View>

          <View style={styles.zonesTable}>
            {zonesData.map((item) => (
              <View key={item.z} style={styles.zoneRow}>
                <View style={styles.zoneLeft}>
                  <View style={[styles.zonePill, { backgroundColor: item.color }]}>
                    <Text style={styles.zonePillText}>Z{item.z}</Text>
                  </View>
                  <Text style={styles.zoneName}>{item.name}</Text>
                </View>
                <View style={styles.zoneRight}>
                  <Text style={styles.zoneRange}>{item.range}</Text>
                  <Text style={styles.zonePace}>{item.pace}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ================================================================ */}
        {/* SECTION 4: WEEKLY VOLUME CHART (Khối lượng 9 tuần)               */}
        {/* ================================================================ */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth={2.3}>
                <Line x1="18" y1="20" x2="18" y2="10" />
                <Line x1="12" y1="20" x2="12" y2="4" />
                <Line x1="6" y1="20" x2="6" y2="14" />
              </Svg>
              <Text style={styles.cardTitle}>Khối lượng 9 tuần (km)</Text>
            </View>
            <TouchableOpacity onPress={() => setIsCheckpointModalVisible(true)}>
              <Text style={styles.checkpointLink}>Đánh giá Checkpoint ▾</Text>
            </TouchableOpacity>
          </View>

          {/* SVG Bar Chart */}
          <View style={styles.chartContainer}>
            <Svg width={SCREEN_WIDTH - 64} height={170}>
              {/* Horizontal reference grid lines */}
              <Line x1={0} y1={25} x2={SCREEN_WIDTH - 64} y2={25} stroke="#1E202B" strokeWidth={1} />
              <Line x1={0} y1={75} x2={SCREEN_WIDTH - 64} y2={75} stroke="#1E202B" strokeWidth={1} />
              <Line x1={0} y1={125} x2={SCREEN_WIDTH - 64} y2={125} stroke="#1E202B" strokeWidth={1} />

              {weeklyVolume.map((item, idx) => {
                const totalBars = weeklyVolume.length;
                const chartWidth = SCREEN_WIDTH - 64;
                const slotWidth = chartWidth / totalBars;
                const barWidth = Math.min(22, slotWidth - 8);
                const x = idx * slotWidth + (slotWidth - barWidth) / 2;

                const maxBarHeight = 100;
                const barHeight = Math.max(10, (item.km / maxVolumeKm) * maxBarHeight);
                const y = 135 - barHeight;

                const barColor =
                  item.week === 7 ? '#4B2EFF' : item.week === 9 ? '#FF3B5C' : '#C8FF00';

                return (
                  <G key={item.week}>
                    {/* Km value text above bar */}
                    <SvgText
                      x={x + barWidth / 2}
                      y={y - 5}
                      fill="#94A3B8"
                      fontSize={10}
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {item.km}
                    </SvgText>

                    {/* Bar */}
                    <Rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      fill={barColor}
                      rx={3}
                      ry={3}
                    />

                    {/* Week label below bar */}
                    <SvgText
                      x={x + barWidth / 2}
                      y={155}
                      fill="#94A3B8"
                      fontSize={11}
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      T{item.week}
                    </SvgText>
                  </G>
                );
              })}
            </Svg>
          </View>
        </View>

        {/* ================================================================ */}
        {/* SECTION 5: RUN HISTORY (Nhật ký buổi chạy)                       */}
        {/* ================================================================ */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9D85FF" strokeWidth={2.3}>
                <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <Path d="M14 2v6h6" />
                <Line x1="16" y1="13" x2="8" y2="13" />
                <Line x1="16" y1="17" x2="8" y2="17" />
              </Svg>
              <Text style={styles.cardTitle}>Nhật ký buổi chạy</Text>
            </View>
            <TouchableOpacity onPress={() => setIsAddNoteModalVisible(true)}>
              <Text style={styles.btnAddNote}>+ Ghi Note</Text>
            </TouchableOpacity>
          </View>

          {runSessions.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>Chưa có dữ liệu buổi chạy.</Text>
            </View>
          ) : (
            <View style={styles.historyList}>
              {runSessions.map((session) => {
                const distKm = (session.totalDistanceMeters / 1000).toFixed(2);
                const paceStr = formatPaceMinutesSeconds(session.averagePaceSecPerKm);
                return (
                  <View key={session.id} style={styles.historyItem}>
                    <View style={styles.historyItemTop}>
                      <Text style={styles.historyItemTitle} numberOfLines={1}>
                        {session.workoutTitle || 'Buổi chạy'}
                      </Text>
                      <Text style={styles.historyItemMetrics}>
                        {distKm} km · {paceStr} · RPE {session.rpeRating}
                      </Text>
                    </View>
                    <Text style={styles.historyNotesText}>
                      <Text style={{ color: '#C8FF00', fontWeight: 'bold' }}>Tốt: </Text>
                      {session.goodPoint || '--'} ·{' '}
                      <Text style={{ color: '#FFB020', fontWeight: 'bold' }}>Chưa được: </Text>
                      {session.badPoint || '--'} ·{' '}
                      <Text style={{ color: '#9D85FF', fontWeight: 'bold' }}>Sửa: </Text>
                      {session.fixAction || '--'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ================================================================ */}
      {/* MODAL: ADD MANUAL NOTE                                           */}
      {/* ================================================================ */}
      <Modal
        visible={isAddNoteModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAddNoteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ghi chú buổi chạy</Text>
              <TouchableOpacity onPress={() => setIsAddNoteModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Tên buổi chạy</Text>
              <TextInput
                style={styles.modalInput}
                value={noteTitle}
                onChangeText={setNoteTitle}
                placeholder="VD: Long Run 8 km"
                placeholderTextColor="#64748B"
              />

              <View style={styles.twoColRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Cự ly (km)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={noteDist}
                    onChangeText={setNoteDist}
                    keyboardType="numeric"
                    placeholder="6.0"
                    placeholderTextColor="#64748B"
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>RPE (1-10)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={noteRpe}
                    onChangeText={setNoteRpe}
                    keyboardType="numeric"
                    placeholder="6"
                    placeholderTextColor="#64748B"
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Điểm tốt (Tốt)</Text>
              <TextInput
                style={styles.modalInput}
                value={noteGood}
                onChangeText={setNoteGood}
                placeholder="VD: Nhịp tim Vùng 2 ổn định, không mệt..."
                placeholderTextColor="#64748B"
              />

              <Text style={styles.fieldLabel}>Điểm chưa được (Chưa được)</Text>
              <TextInput
                style={styles.modalInput}
                value={noteBad}
                onChangeText={setNoteBad}
                placeholder="VD: Km cuối hơi đuối, sải chân hơi dài..."
                placeholderTextColor="#64748B"
              />

              <Text style={styles.fieldLabel}>Khắc phục (Sửa)</Text>
              <TextInput
                style={styles.modalInput}
                value={noteFix}
                onChangeText={setNoteFix}
                placeholder="VD: Giữ guồng chân 172 spm đều hơn..."
                placeholderTextColor="#64748B"
              />

              <TouchableOpacity style={styles.btnSaveNote} onPress={handleSaveManualNote}>
                <Text style={styles.btnSaveNoteText}>LƯU NHẬT KÝ</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ================================================================ */}
      {/* MODAL: CHECKPOINT EVALUATION                                     */}
      {/* ================================================================ */}
      <Modal
        visible={isCheckpointModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsCheckpointModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Đánh giá Checkpoint</Text>
              <TouchableOpacity onPress={() => setIsCheckpointModalVisible(false)}>
                <Text style={styles.modalCloseBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Checkpoint Tabs */}
            <View style={styles.cpTabsRow}>
              <TouchableOpacity
                style={[styles.cpTabBtn, checkpointWeek === 4 && styles.cpTabBtnActive]}
                onPress={() => {
                  setCheckpointWeek(4);
                  setCpTimeInput('21:08');
                  setCheckpointResult(null);
                }}
              >
                <Text
                  style={[styles.cpTabText, checkpointWeek === 4 && styles.cpTabTextActive]}
                >
                  Tuần 4 (Test 3K)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cpTabBtn, checkpointWeek === 7 && styles.cpTabBtnActive]}
                onPress={() => {
                  setCheckpointWeek(7);
                  setCpTimeInput('5:58');
                  setCheckpointResult(null);
                }}
              >
                <Text
                  style={[styles.cpTabText, checkpointWeek === 7 && styles.cpTabTextActive]}
                >
                  Tuần 7 (2K Race Pace)
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>
                {checkpointWeek === 4
                  ? 'Thành tích Test 3 km (mm:ss)'
                  : 'Pace TB 2 km Race Pace (mm:ss)'}
              </Text>
              <TextInput
                style={styles.modalInput}
                value={cpTimeInput}
                onChangeText={setCpTimeInput}
                placeholder="21:08"
                placeholderTextColor="#64748B"
              />

              {checkpointWeek === 7 && (
                <>
                  <Text style={styles.fieldLabel}>Nhịp tim trung bình (bpm)</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={cpHrInput}
                    onChangeText={setCpHrInput}
                    keyboardType="numeric"
                    placeholder="175"
                    placeholderTextColor="#64748B"
                  />
                </>
              )}

              <TouchableOpacity
                style={styles.btnEvalCheckpoint}
                onPress={handleEvaluateCheckpoint}
              >
                <Text style={styles.btnEvalCheckpointText}>KIỂM TRA CHECKPOINT</Text>
              </TouchableOpacity>

              {checkpointResult && (
                <View style={styles.cpResultBox}>
                  <Text style={styles.cpResultTitle}>{checkpointResult.checkpointName}</Text>
                  <Text style={styles.cpResultMessage}>{checkpointResult.message}</Text>
                  <Text style={styles.cpResultReason}>{checkpointResult.reason}</Text>

                  <View style={styles.cpActionRow}>
                    <TouchableOpacity
                      style={styles.cpBtnApply}
                      onPress={() => handleApplyCheckpointDecision(true)}
                    >
                      <Text style={styles.cpBtnApplyText}>ÁP DỤNG ĐỀ XUẤT</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cpBtnKeep}
                      onPress={() => handleApplyCheckpointDecision(false)}
                    >
                      <Text style={styles.cpBtnKeepText}>GIỮ NGUYÊN</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08090C',
  },
  container: {
    padding: 16,
    gap: 16,
  },
  card: {
    backgroundColor: '#111218',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  aiBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9D85FF',
  },
  quickQRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickQBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#181A24',
  },
  quickQText: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#08090C',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#FFFFFF',
  },
  btnAskAi: {
    backgroundColor: '#C8FF00',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnAskAiText: {
    color: '#08090C',
    fontSize: 13,
    fontWeight: '900',
  },
  answerBox: {
    backgroundColor: '#08090C',
    borderRadius: 12,
    padding: 14,
  },
  answerText: {
    fontSize: 13,
    color: '#E2E8F0',
    lineHeight: 20,
  },
  btnSaveProfile: {
    backgroundColor: '#C8FF00',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  btnSaveProfileText: {
    color: '#08090C',
    fontSize: 12,
    fontWeight: '900',
  },
  steppersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stepperItem: {
    flexBasis: '48%',
    backgroundColor: '#08090C',
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  stepperLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  stepperControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#181A24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  stepperValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  keyInput: {
    backgroundColor: '#08090C',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 12,
    color: '#FFFFFF',
  },
  vo2Badge: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  zonesTable: {
    gap: 8,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#08090C',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  zoneLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zonePill: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zonePillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#08090C',
  },
  zoneName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  zoneRight: {
    alignItems: 'flex-end',
  },
  zoneRange: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  zonePace: {
    fontSize: 11,
    color: '#94A3B8',
  },
  checkpointLink: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9D85FF',
  },
  chartContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  btnAddNote: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C8FF00',
  },
  emptyHistory: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyHistoryText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  historyList: {
    gap: 8,
  },
  historyItem: {
    backgroundColor: '#08090C',
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  historyItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },
  historyItemMetrics: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C8FF00',
  },
  historyNotesText: {
    fontSize: 11,
    color: '#CBD5E1',
    lineHeight: 16,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#111218',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  modalCloseBtn: {
    fontSize: 18,
    fontWeight: '900',
    color: '#94A3B8',
    padding: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    backgroundColor: '#08090C',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#FFFFFF',
  },
  twoColRow: {
    flexDirection: 'row',
  },
  btnSaveNote: {
    backgroundColor: '#C8FF00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  btnSaveNoteText: {
    color: '#08090C',
    fontSize: 14,
    fontWeight: '900',
  },
  cpTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  cpTabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#181A24',
    alignItems: 'center',
  },
  cpTabBtnActive: {
    backgroundColor: '#C8FF00',
  },
  cpTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  cpTabTextActive: {
    color: '#08090C',
    fontWeight: '900',
  },
  btnEvalCheckpoint: {
    backgroundColor: '#4B2EFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  btnEvalCheckpointText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  cpResultBox: {
    marginTop: 16,
    backgroundColor: '#08090C',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cpResultTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#C8FF00',
  },
  cpResultMessage: {
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 18,
  },
  cpResultReason: {
    fontSize: 11,
    color: '#94A3B8',
  },
  cpActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  cpBtnApply: {
    flex: 1,
    backgroundColor: '#C8FF00',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  cpBtnApplyText: {
    color: '#08090C',
    fontSize: 11,
    fontWeight: '900',
  },
  cpBtnKeep: {
    flex: 1,
    backgroundColor: '#181A24',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  cpBtnKeepText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
});

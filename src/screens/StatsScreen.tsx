import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Modal,
} from 'react-native';
import * as Haptics from 'expo-haptics';
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
import { calculateHeartRateZones } from '../logic/zones';
import { formatPaceMinutesSeconds } from '../logic/paces';
import { storageService, CompletedRunSession, CheckpointHistoryItem } from '../services/storage';

export const StatsScreen: React.FC = () => {
  const [profile, setProfile] = useState<AthleteProfile>(DEFAULT_ATHLETE_PROFILE);
  const [ltHrBpm, setLtHrBpm] = useState<number>(() => audioCoach.getLactateThresholdHr());
  const [selectedGoalId, setSelectedGoalId] = useState<GoalId>('sub60');
  const [runSessions, setRunSessions] = useState<CompletedRunSession[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointHistoryItem[]>([]);

  // Checkpoint Modal State
  const [isCheckpointModalVisible, setIsCheckpointModalVisible] = useState(false);
  const [checkpointWeek, setCheckpointWeek] = useState<4 | 7>(4);
  const [test3kTimeInput, setTest3kTimeInput] = useState('21:08');
  const [testAvgPaceInput, setTestAvgPaceInput] = useState('6:15');
  const [testAvgHrInput, setTestAvgHrInput] = useState('175');
  const [checkpointResult, setCheckpointResult] = useState<CheckpointSuggestion | null>(null);

  // Manual note addition state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newDate, setNewDate] = useState('Hôm nay');
  const [newDist, setNewDist] = useState('6.0');
  const [newPace, setNewPace] = useState("7'40\"");
  const [newHr, setNewHr] = useState('156');
  const [newGood, setNewGood] = useState('');
  const [newBad, setNewBad] = useState('');
  const [newFix, setNewFix] = useState('');

  // Load storage data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [p, g, sessions, cp] = await Promise.all([
      storageService.getAthleteProfile(),
      storageService.getSelectedGoal(),
      storageService.getRunSessions(),
      storageService.getCheckpointHistory(),
    ]);

    setProfile(p);
    setLtHrBpm(p.lactateThresholdHrBpm);
    setSelectedGoalId(g);
    setRunSessions(sessions);
    setCheckpoints(cp);
  };

  const handleAdjustLtHr = async (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextLtHr = Math.max(150, Math.min(195, ltHrBpm + delta));
    setLtHrBpm(nextLtHr);
    audioCoach.setLactateThresholdHr(nextLtHr);
    const updated = { ...profile, lactateThresholdHrBpm: nextLtHr };
    setProfile(updated);
    await storageService.saveAthleteProfile(updated);
  };

  // Tính 5 Zone theo chuẩn Joe Friel dựa vào LTHR
  const zonesInfo = calculateHeartRateZones(ltHrBpm);

  // Tính tổng quãng đường tích lũy từ các buổi chạy thực tế
  const totalCompletedDistanceMeters = runSessions.reduce(
    (sum, s) => sum + (s.totalDistanceMeters || 0),
    0
  );
  const totalCompletedKm = (totalCompletedDistanceMeters / 1000).toFixed(2);

  // Tổng quãng đường giáo án
  const totalPlanKm = trainingPlanData.weeks.reduce(
    (sum, w) => sum + w.workouts.reduce((wSum, wo) => wSum + wo.totalDistanceKm, 0),
    0
  );

  const handleEvaluateCheckpoint = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (checkpointWeek === 4) {
      const parts = test3kTimeInput.replace("'", ':').split(':');
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      const totalSec = m * 60 + s;
      const res = evaluateWeek4Test3k(totalSec);
      setCheckpointResult(res);
    } else {
      const parts = testAvgPaceInput.replace("'", ':').split(':');
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      const avgPace = m * 60 + s;
      const avgHr = parseInt(testAvgHrInput, 10) || 175;
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

  const handleApplyCheckpointDecision = async (acceptSuggestion: boolean) => {
    if (!checkpointResult) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const chosenGoal: GoalId =
      acceptSuggestion && checkpointResult.suggestedGoalId
        ? checkpointResult.suggestedGoalId
        : selectedGoalId;

    const record: CheckpointHistoryItem = {
      id: `cp-${Date.now()}`,
      checkpointName: checkpointResult.checkpointName,
      date: new Date().toLocaleDateString('vi-VN'),
      suggestedGoalId: checkpointResult.suggestedGoalId,
      chosenGoalId: chosenGoal,
      reason: acceptSuggestion
        ? checkpointResult.reason
        : `Người dùng quyết định giữ nguyên ${GOAL_TIERS[selectedGoalId].name}`,
    };

    if (acceptSuggestion && checkpointResult.suggestedGoalId) {
      setSelectedGoalId(checkpointResult.suggestedGoalId);
      await storageService.saveSelectedGoal(checkpointResult.suggestedGoalId);
    }

    await storageService.saveCheckpointHistory(record);
    const updatedHistory = await storageService.getCheckpointHistory();
    setCheckpoints(updatedHistory);
    setIsCheckpointModalVisible(false);
    setCheckpointResult(null);
  };

  const handleSaveManualNote = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const distMeters = (parseFloat(newDist) || 0) * 1000;
    const parts = newPace.replace("'", ':').replace('"', '').split(':');
    const paceSec = (parseInt(parts[0], 10) || 7) * 60 + (parseInt(parts[1], 10) || 30);
    const hr = parseInt(newHr, 10) || 155;

    const combinedNote = [
      newGood ? `Làm tốt: ${newGood}` : '',
      newBad ? `Chưa được: ${newBad}` : '',
      newFix ? `Cách sửa: ${newFix}` : '',
    ]
      .filter(Boolean)
      .join(' • ');

    const newSession: CompletedRunSession = {
      id: `run-${Date.now()}`,
      workoutId: 'manual-entry',
      workoutTitle: `Buổi chạy ${newDist} km`,
      date: newDate,
      timestamp: Date.now(),
      totalDistanceMeters: distMeters,
      elapsedSeconds: Math.round((distMeters / 1000) * paceSec),
      averagePaceSecPerKm: paceSec,
      averageHrBpm: hr,
      maxHrBpm: hr + 12,
      timeInZonesSeconds: { 1: 300, 2: 1200, 3: 600, 4: 0, 5: 0 },
      splits: [],
      averageCadenceSpm: null,
      alertsFiredCount: 0,
      rpeRating: 7,
      userNote: combinedNote || 'Ghi nhận chạy ngoài giáo án',
      goalIdAtRun: selectedGoalId,
    };

    await storageService.saveRunSession(newSession);
    const updated = await storageService.getRunSessions();
    setRunSessions(updated);
    setNewGood('');
    setNewBad('');
    setNewFix('');
    setShowAddForm(false);
  };

  const ltPace = profile.lactateThresholdPaceSecPerKm;
  const paceGuides: Record<number, string> = {
    1: `> ${formatPaceMinutesSeconds(ltPace + 90)}`,
    2: `${formatPaceMinutesSeconds(ltPace + 45)}–${formatPaceMinutesSeconds(ltPace + 90)}`,
    3: `${formatPaceMinutesSeconds(ltPace + 10)}–${formatPaceMinutesSeconds(ltPace + 20)}`,
    4: `${formatPaceMinutesSeconds(ltPace - 5)}–${formatPaceMinutesSeconds(ltPace + 5)}`,
    5: `< ${formatPaceMinutesSeconds(ltPace - 5)}`,
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.screenTitle}>TIẾN ĐỘ & PHÂN TÍCH PT</Text>
            <Text style={styles.screenSub}>
              Mục tiêu: {GOAL_TIERS[selectedGoalId].name} • Race Day {profile.raceDate}
            </Text>
          </View>
          <View style={styles.vo2Badge}>
            <Text style={styles.vo2Label}>VO2MAX</Text>
            <Text style={styles.vo2Value}>{profile.vo2Max}</Text>
          </View>
        </View>

        {/* Bento KPI Row */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TÍCH LŨY 9 TUẦN</Text>
            <View style={styles.kpiValRow}>
              <Text style={[styles.kpiBig, { color: '#C8FF00' }]}>{totalCompletedKm}</Text>
              <Text style={styles.kpiUnit}>/ {totalPlanKm} KM</Text>
            </View>
            <Text style={styles.kpiFoot}>Đã hoàn thành {runSessions.length} buổi chạy</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>NGƯỠNG LTHR</Text>
            <View style={styles.lthrControlRow}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjustLtHr(-1)}>
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.kpiBig, { color: '#C8FF00' }]}>{ltHrBpm}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjustLtHr(1)}>
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.kpiFoot}>
              Pace LT: {formatPaceMinutesSeconds(profile.lactateThresholdPaceSecPerKm)} • Max: {profile.maxHrBpm}
            </Text>
          </View>
        </View>

        {/* Checkpoint Banner / Nút Test Mốc */}
        <View style={styles.checkpointCard}>
          <View style={styles.checkpointHeader}>
            <View>
              <Text style={styles.checkpointTitle}>KIỂM TRA MỐC TIẾN ĐỘ (CHECKPOINTS)</Text>
              <Text style={styles.checkpointSub}>Đánh giá sau Test 3K tuần 4 và Test Race Pace tuần 7</Text>
            </View>
            <TouchableOpacity
              style={styles.openCpBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsCheckpointModalVisible(true);
              }}
            >
              <Text style={styles.openCpBtnText}>ĐÁNH GIÁ</Text>
            </TouchableOpacity>
          </View>

          {checkpoints.length > 0 ? (
            <View style={styles.latestCpBox}>
              <Text style={styles.latestCpTitle}>
                Mốc gần nhất ({checkpoints[0].checkpointName} - {checkpoints[0].date}):
              </Text>
              <Text style={styles.latestCpText}>{checkpoints[0].reason}</Text>
              <Text style={styles.latestCpDecision}>Lựa chọn: {GOAL_TIERS[checkpoints[0].chosenGoalId].name}</Text>
            </View>
          ) : (
            <Text style={styles.noCpText}>Chưa có bài test checkpoint nào được ghi nhận.</Text>
          )}
        </View>

        {/* Section 1: Bảng 5 Zone Joe Friel */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>5 VÙNG TIM THEO JOE FRIEL (LTHR {ltHrBpm} BPM)</Text>
            <Text style={styles.sectionTag}>TỰ ĐỘNG CẬP NHẬT</Text>
          </View>

          {zonesInfo.map((z) => (
            <View key={z.zone} style={styles.zoneRow}>
              <View style={[styles.zoneBadge, { backgroundColor: z.color }]}>
                <Text style={styles.zoneBadgeText}>Z{z.zone}</Text>
              </View>
              <View style={styles.zoneInfoMid}>
                <Text style={styles.zoneName}>{z.name}</Text>
                <Text style={styles.zonePace}>Pace tập: {paceGuides[z.zone]}</Text>
              </View>
              <Text style={[styles.zoneHrText, { color: z.color }]}>
                {z.zone === 1 ? `< ${z.maxHr + 1} bpm` : z.zone === 5 ? `≥ ${z.minHr} bpm` : `${z.minHr}–${z.maxHr} bpm`}
              </Text>
            </View>
          ))}
        </View>

        {/* Section 2: Post-Run Note & Lịch sử buổi chạy */}
        <View style={styles.noteSectionHeader}>
          <Text style={styles.sectionTitle}>LỊCH SỬ & NHẬT KÝ BUỔI CHẠY</Text>
          <TouchableOpacity
            style={styles.addNoteBtn}
            onPress={() => {
              Haptics.selectionAsync();
              setShowAddForm(!showAddForm);
            }}
          >
            <Text style={styles.addNoteBtnText}>{showAddForm ? 'ĐÓNG' : '+ GHI NOTE MỚI'}</Text>
          </TouchableOpacity>
        </View>

        {showAddForm ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Ghi nhanh kết quả & bài học buổi chạy</Text>
            <View style={styles.formRow3}>
              <View style={styles.formCol}>
                <Text style={styles.inputLabel}>Ngày</Text>
                <TextInput
                  style={styles.input}
                  value={newDate}
                  onChangeText={setNewDate}
                  placeholder="14/11"
                  placeholderTextColor="#475569"
                />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.inputLabel}>Cự ly (km)</Text>
                <TextInput
                  style={styles.input}
                  value={newDist}
                  onChangeText={setNewDist}
                  placeholder="6.0"
                  placeholderTextColor="#475569"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.inputLabel}>Pace TB</Text>
                <TextInput
                  style={styles.input}
                  value={newPace}
                  onChangeText={setNewPace}
                  placeholder="7'40"
                  placeholderTextColor="#475569"
                />
              </View>
              <View style={styles.formCol}>
                <Text style={styles.inputLabel}>Tim TB</Text>
                <TextInput
                  style={styles.input}
                  value={newHr}
                  onChangeText={setNewHr}
                  placeholder="156"
                  placeholderTextColor="#475569"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Đã làm tốt (Điểm cộng)</Text>
            <TextInput
              style={styles.input}
              value={newGood}
              onChangeText={setNewGood}
              placeholder="VD: Giữ nhịp tim dưới 157 bpm suốt 4 km đầu"
              placeholderTextColor="#475569"
            />

            <Text style={styles.inputLabel}>Chưa được (Điểm nghẽn)</Text>
            <TextInput
              style={styles.input}
              value={newBad}
              onChangeText={setNewBad}
              placeholder="VD: Km cuối hụt hơi, sải chân quá dài"
              placeholderTextColor="#475569"
            />

            <Text style={styles.inputLabel}>Cách sửa buổi tới (Action)</Text>
            <TextInput
              style={styles.input}
              value={newFix}
              onChangeText={setNewFix}
              placeholder="VD: Bật Metronome 172 bpm để bước chân ngắn lại"
              placeholderTextColor="#475569"
            />

            <TouchableOpacity style={styles.saveNoteBtn} onPress={handleSaveManualNote}>
              <Text style={styles.saveNoteBtnText}>LƯU VÀO NHẬT KÝ PT</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {runSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyCardText}>
              Chưa có dữ liệu buổi chạy nào. Hãy chọn bài tập tại màn hình Giáo Án và bấm "CHẠY NGAY VỚI AUDIO COACH"!
            </Text>
          </View>
        ) : (
          runSessions.map((session) => {
            const distKm = (session.totalDistanceMeters / 1000).toFixed(2);
            const paceStr = formatPaceMinutesSeconds(session.averagePaceSecPerKm);

            return (
              <View key={session.id} style={styles.noteCard}>
                <View style={styles.noteTopRow}>
                  <View style={styles.noteDatePill}>
                    <Text style={styles.noteDateText}>{session.date}</Text>
                  </View>
                  <Text style={styles.noteMetrics}>
                    {distKm} KM • Pace {paceStr} • HR {session.averageHrBpm ?? '--'} bpm
                  </Text>
                </View>

                <Text style={styles.sessionTitle}>{session.workoutTitle}</Text>

                {session.rpeRating ? (
                  <View style={styles.rpeBadgeRow}>
                    <Text style={styles.rpeBadgeLabel}>ĐỘ GẮNG SỨC (RPE):</Text>
                    <Text style={styles.rpeBadgeVal}>{session.rpeRating}/10</Text>
                  </View>
                ) : null}

                {session.userNote ? (
                  <View style={styles.noteGridRow}>
                    <Text style={styles.noteBodyText}>{session.userNote}</Text>
                  </View>
                ) : null}

                {/* Splits nếu có */}
                {session.splits && session.splits.length > 0 ? (
                  <View style={styles.splitsMiniRow}>
                    {session.splits.map((sp) => (
                      <View key={sp.km} style={styles.splitMiniItem}>
                        <Text style={styles.splitMiniKm}>KM {sp.km}</Text>
                        <Text style={styles.splitMiniPace}>{formatPaceMinutesSeconds(sp.paceSecPerKm)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal Kiểm Tra Checkpoint */}
      <Modal
        visible={isCheckpointModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsCheckpointModalVisible(false)}
      >
        <SafeAreaView style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ĐÁNH GIÁ MỐC CHECKPOINT</Text>
              <TouchableOpacity
                onPress={() => setIsCheckpointModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.cpWeekTabsRow}>
                <TouchableOpacity
                  style={[styles.cpWeekTab, checkpointWeek === 4 && styles.cpWeekTabActive]}
                  onPress={() => {
                    setCheckpointWeek(4);
                    setCheckpointResult(null);
                  }}
                >
                  <Text style={[styles.cpWeekTabText, checkpointWeek === 4 && styles.textDark]}>
                    TUẦN 4: TEST 3 KM
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cpWeekTab, checkpointWeek === 7 && styles.cpWeekTabActive]}
                  onPress={() => {
                    setCheckpointWeek(7);
                    setCheckpointResult(null);
                  }}
                >
                  <Text style={[styles.cpWeekTabText, checkpointWeek === 7 && styles.textDark]}>
                    TUẦN 7: TEST RACE PACE
                  </Text>
                </TouchableOpacity>
              </View>

              {checkpointWeek === 4 ? (
                <View style={styles.cpFormBox}>
                  <Text style={styles.formLabel}>Thời gian hoàn thành Test 3 km (phút:giây):</Text>
                  <TextInput
                    style={styles.formInput}
                    value={test3kTimeInput}
                    onChangeText={setTest3kTimeInput}
                    placeholder="21:08"
                    placeholderTextColor="#64748B"
                  />
                  <Text style={styles.formHint}>
                    Mốc đánh giá: ≤18:30 (Đúng hướng Sub 60), 18:31–19:30 (Gợi ý Sub 65), &gt;19:30 (Gợi ý Dưới 70).
                  </Text>
                </View>
              ) : (
                <View style={styles.cpFormBox}>
                  <Text style={styles.formLabel}>Pace TB đoạn 2 km race pace (phút:giây):</Text>
                  <TextInput
                    style={styles.formInput}
                    value={testAvgPaceInput}
                    onChangeText={setTestAvgPaceInput}
                    placeholder="6:15"
                    placeholderTextColor="#64748B"
                  />
                  <Text style={styles.formLabel}>Nhịp tim TB đoạn test (bpm):</Text>
                  <TextInput
                    style={styles.formInput}
                    value={testAvgHrInput}
                    onChangeText={setTestAvgHrInput}
                    placeholder="175"
                    placeholderTextColor="#64748B"
                    keyboardType="numeric"
                  />
                  <Text style={styles.formHint}>
                    Nếu chậm hơn race pace &gt;15 s/km hoặc HR TB ≥186 bpm → gợi ý hạ một bậc an toàn.
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.evalBtn} onPress={handleEvaluateCheckpoint}>
                <Text style={styles.evalBtnText}>KIỂM TRA VÀ ĐƯA RA GỢI Ý</Text>
              </TouchableOpacity>

              {checkpointResult ? (
                <View style={styles.resultBox}>
                  <Text style={styles.resultTitle}>KẾT QUẢ PHÂN TÍCH PT:</Text>
                  <Text style={styles.resultText}>{checkpointResult.message}</Text>
                  <Text style={styles.resultReason}>{checkpointResult.reason}</Text>

                  {checkpointResult.suggestedGoalId ? (
                    <View style={styles.decisionActionsRow}>
                      <TouchableOpacity
                        style={styles.acceptBtn}
                        onPress={() => handleApplyCheckpointDecision(true)}
                      >
                        <Text style={styles.acceptBtnText}>
                          ĐỒNG Ý CHUYỂN SANG {GOAL_TIERS[checkpointResult.suggestedGoalId].name.toUpperCase()}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.keepBtn}
                        onPress={() => handleApplyCheckpointDecision(false)}
                      >
                        <Text style={styles.keepBtnText}>
                          GIỮ NGUYÊN {GOAL_TIERS[selectedGoalId].name.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleApplyCheckpointDecision(false)}
                    >
                      <Text style={styles.acceptBtnText}>LƯU VÀ TIẾP TỤC</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </SafeAreaView>
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
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  screenTitle: {
    color: '#F8FAFC',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  screenSub: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  vo2Badge: {
    backgroundColor: '#111218',
    borderWidth: 1,
    borderColor: '#C8FF00',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  vo2Label: {
    color: '#C8FF00',
    fontSize: 9,
    fontWeight: '800',
  },
  vo2Value: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#111218',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#252838',
  },
  kpiLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  kpiValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginVertical: 2,
  },
  kpiBig: {
    fontSize: 26,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    color: '#F8FAFC',
  },
  kpiUnit: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  kpiFoot: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  lthrControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#252838',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBtnText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  checkpointCard: {
    backgroundColor: '#111218',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(200,255,0,0.2)',
    padding: 14,
    marginBottom: 14,
  },
  checkpointHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  checkpointTitle: {
    color: '#C8FF00',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  checkpointSub: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  openCpBtn: {
    backgroundColor: '#C8FF00',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  openCpBtnText: {
    color: '#08090C',
    fontSize: 11,
    fontWeight: '900',
  },
  latestCpBox: {
    marginTop: 10,
    backgroundColor: '#08090C',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#252838',
  },
  latestCpTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
  },
  latestCpText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  latestCpDecision: {
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  noCpText: {
    color: '#64748B',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 8,
  },
  sectionCard: {
    backgroundColor: '#111218',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#252838',
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTag: {
    color: '#C8FF00',
    fontSize: 9,
    fontWeight: '800',
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#25283833',
  },
  zoneBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    width: 38,
    alignItems: 'center',
  },
  zoneBadgeText: {
    color: '#08090C',
    fontSize: 11,
    fontWeight: '900',
  },
  zoneInfoMid: {
    flex: 1,
    marginLeft: 10,
  },
  zoneName: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  zonePace: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  zoneHrText: {
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  noteSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  addNoteBtn: {
    backgroundColor: '#252838',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addNoteBtnText: {
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: '#111218',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#252838',
    marginBottom: 14,
  },
  formTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
  },
  formRow3: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  formCol: {
    flex: 1,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#08090C',
    borderWidth: 1,
    borderColor: '#252838',
    borderRadius: 8,
    color: '#F8FAFC',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  saveNoteBtn: {
    backgroundColor: '#C8FF00',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  saveNoteBtnText: {
    color: '#08090C',
    fontSize: 12,
    fontWeight: '900',
  },
  emptyCard: {
    backgroundColor: '#111218',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252838',
  },
  emptyCardText: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  noteCard: {
    backgroundColor: '#111218',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252838',
    padding: 14,
    marginBottom: 12,
  },
  noteTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  noteDatePill: {
    backgroundColor: '#252838',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  noteDateText: {
    color: '#C8FF00',
    fontSize: 10,
    fontWeight: '800',
  },
  noteMetrics: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sessionTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 6,
  },
  rpeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  rpeBadgeLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
  },
  rpeBadgeVal: {
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: '900',
  },
  noteGridRow: {
    backgroundColor: '#08090C',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  noteBodyText: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
  },
  splitsMiniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  splitMiniItem: {
    backgroundColor: '#08090C',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#252838',
    alignItems: 'center',
  },
  splitMiniKm: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
  },
  splitMiniPace: {
    color: '#F8FAFC',
    fontSize: 10,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 9, 13, 0.94)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#111218',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#252838',
    padding: 18,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 15,
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
  cpWeekTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  cpWeekTab: {
    flex: 1,
    backgroundColor: '#08090C',
    borderWidth: 1,
    borderColor: '#252838',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  cpWeekTabActive: {
    backgroundColor: '#C8FF00',
    borderColor: '#C8FF00',
  },
  cpWeekTabText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
  },
  textDark: {
    color: '#08090C',
  },
  cpFormBox: {
    marginBottom: 12,
  },
  formLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: '#08090C',
    borderWidth: 1,
    borderColor: '#252838',
    borderRadius: 10,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  formHint: {
    color: '#64748B',
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 8,
  },
  evalBtn: {
    backgroundColor: '#C8FF00',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  evalBtnText: {
    color: '#08090C',
    fontSize: 12,
    fontWeight: '900',
  },
  resultBox: {
    backgroundColor: '#08090C',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(200,255,0,0.33)',
    marginBottom: 14,
  },
  resultTitle: {
    color: '#C8FF00',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
  },
  resultText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 4,
  },
  resultReason: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 12,
  },
  decisionActionsRow: {
    gap: 8,
  },
  acceptBtn: {
    backgroundColor: '#C8FF00',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#08090C',
    fontSize: 11,
    fontWeight: '900',
  },
  keepBtn: {
    backgroundColor: '#252838',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  keepBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '800',
  },
});

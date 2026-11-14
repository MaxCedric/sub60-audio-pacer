import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import trainingPlanData from '../data/trainingPlan.json';
import { audioCoach } from '../services/audioCoach';

export interface PostRunNoteItem {
  id: string;
  date: string;
  title: string;
  distanceKm: string;
  avgPace: string;
  avgHr: string;
  goodPoint: string;
  badPoint: string;
  fixAction: string;
}

const INITIAL_NOTES: PostRunNoteItem[] = [
  {
    id: 'run-2026-11-12',
    date: '12/11/2026',
    title: 'Tuần 1 - T5: Test Thực Tế',
    distanceKm: '1.79',
    avgPace: "8'18\"",
    avgHr: '160 (Max 180)',
    goodPoint: 'VO2max tăng 35 → 36 • Cân bằng chân 49,7% / 50,3%',
    badPoint: 'Bứt tốc 5\'33"/km làm tim vọt 180 bpm • Guồng chân chậm 155 spm',
    fixAction: 'Kìm 2 km đầu > 7\'30" • Bước ngắn theo Metronome 172 bpm',
  },
];

export const StatsScreen: React.FC = () => {
  const { athleteProfile } = trainingPlanData;
  const [ltHrBpm, setLtHrBpm] = useState<number>(() => audioCoach.getLactateThresholdHr());
  const [notes, setNotes] = useState<PostRunNoteItem[]>(INITIAL_NOTES);
  const [showAddForm, setShowAddForm] = useState(false);

  // State cho form thêm Note nhanh
  const [newDate, setNewDate] = useState('14/11/2026');
  const [newDist, setNewDist] = useState('6.0');
  const [newPace, setNewPace] = useState("7'40\"");
  const [newHr, setNewHr] = useState('156');
  const [newGood, setNewGood] = useState('');
  const [newBad, setNewBad] = useState('');
  const [newFix, setNewFix] = useState('');

  const handleAdjustLtHr = (delta: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = Math.max(150, Math.min(195, ltHrBpm + delta));
    setLtHrBpm(next);
    audioCoach.setLactateThresholdHr(next);
  };

  // Tính 5 Zone tự động theo LTHR
  const z1Max = Math.round(ltHrBpm * 0.79) - 1;
  const z2Min = Math.round(ltHrBpm * 0.79);
  const z2Max = Math.round(ltHrBpm * 0.89);
  const z3Min = z2Max + 1;
  const z3Max = Math.round(ltHrBpm * 0.96);
  const z4Min = z3Max + 1;
  const z4Max = ltHrBpm;
  const z5Min = ltHrBpm + 1;

  const zones = [
    { zone: 'Z1', name: 'Khởi động / Hồi phục', range: `< ${z1Max + 1} bpm`, color: '#64748B', pace: "8'00\"–8'30\"" },
    { zone: 'Z2', name: 'Nền tảng Hiếu khí (Easy)', range: `${z2Min}–${z2Max} bpm`, color: '#00F0FF', pace: "7'30\"–7'55\"" },
    { zone: 'Z3', name: 'Nhịp độ Tempo / Marathon', range: `${z3Min}–${z3Max} bpm`, color: '#D2FF00', pace: "6'30\"–7'15\"" },
    { zone: 'Z4', name: 'Ngưỡng Lactate (Threshold)', range: `${z4Min}–${z4Max} bpm`, color: '#FFB020', pace: "5'58\"–6'25\"" },
    { zone: 'Z5', name: 'Đỏ / VO2max (Giới hạn)', range: `>= ${z5Min} bpm`, color: '#FF3B5C', pace: "< 5'55\"" },
  ];

  const handleSaveNote = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const item: PostRunNoteItem = {
      id: `run-${Date.now()}`,
      date: newDate || 'Hôm nay',
      title: `Buổi chạy ${newDist} km`,
      distanceKm: newDist || '0.0',
      avgPace: newPace || "--'--\"",
      avgHr: newHr || '--',
      goodPoint: newGood || 'Hoàn thành đúng cự ly mục tiêu',
      badPoint: newBad || 'Không có lỗi lớn',
      fixAction: newFix || 'Duy trì nhịp chân 172 spm buổi tới',
    };
    setNotes([item, ...notes]);
    setNewGood('');
    setNewBad('');
    setNewFix('');
    setShowAddForm(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.screenTitle}>TIẾN ĐỘ & PHÂN TÍCH PT</Text>
            <Text style={styles.screenSub}>Mục tiêu 10 KM Sub 60 • Race Day {athleteProfile.raceDate}</Text>
          </View>
          <View style={styles.vo2Badge}>
            <Text style={styles.vo2Label}>VO2MAX</Text>
            <Text style={styles.vo2Value}>{athleteProfile.vo2Max}</Text>
          </View>
        </View>

        {/* Bento KPI Row */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>TÍCH LŨY 10 TUẦN</Text>
            <View style={styles.kpiValRow}>
              <Text style={[styles.kpiBig, { color: '#00F0FF' }]}>1.79</Text>
              <Text style={styles.kpiUnit}>/ 116 KM</Text>
            </View>
            <Text style={styles.kpiFoot}>Đã hoàn thành 1 buổi</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>NGƯỠNG LACTATE</Text>
            <View style={styles.lthrControlRow}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjustLtHr(-1)}>
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={[styles.kpiBig, { color: '#D2FF00' }]}>{ltHrBpm}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => handleAdjustLtHr(1)}>
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.kpiFoot}>Pace LT: 7'41"/km • Đỏ: {ltHrBpm + 3}</Text>
          </View>
        </View>

        {/* Section 1: Bảng 5 Zone Nhịp Tim Động */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>5 VÙNG NHỊP TIM (THEO LTHR {ltHrBpm} BPM)</Text>
            <Text style={styles.sectionTag}>TỰ ĐỘNG CẬP NHẬT</Text>
          </View>

          {zones.map((z) => (
            <View key={z.zone} style={styles.zoneRow}>
              <View style={[styles.zoneBadge, { backgroundColor: z.color }]}>
                <Text style={styles.zoneBadgeText}>{z.zone}</Text>
              </View>
              <View style={styles.zoneInfoMid}>
                <Text style={styles.zoneName}>{z.name}</Text>
                <Text style={styles.zonePace}>Pace gợi ý: {z.pace}</Text>
              </View>
              <Text style={[styles.zoneHrText, { color: z.color }]}>{z.range}</Text>
            </View>
          ))}
        </View>

        {/* Section 2: Post-Run Note (Nhật ký đánh giá sau buổi chạy) */}
        <View style={styles.noteSectionHeader}>
          <Text style={styles.sectionTitle}>NHẬT KÝ ĐÁNH GIÁ SAU BUỔI CHẠY</Text>
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
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Đã làm tốt (Điểm cộng)</Text>
            <TextInput
              style={styles.input}
              value={newGood}
              onChangeText={setNewGood}
              placeholder="VD: Giữ nhịp tim dưới 158 bpm suốt 4 km đầu"
              placeholderTextColor="#475569"
            />

            <Text style={styles.inputLabel}>Chưa được (Điểm nghẽn)</Text>
            <TextInput
              style={styles.input}
              value={newBad}
              onChangeText={setNewBad}
              placeholder="VD: Km cuối hơi gồng vai, sải chân dài"
              placeholderTextColor="#475569"
            />

            <Text style={styles.inputLabel}>Cách sửa buổi tới (Action)</Text>
            <TextInput
              style={styles.input}
              value={newFix}
              onChangeText={setNewFix}
              placeholder="VD: Bật Metronome 172 bpm ở 2 km cuối"
              placeholderTextColor="#475569"
            />

            <TouchableOpacity style={styles.saveNoteBtn} onPress={handleSaveNote}>
              <Text style={styles.saveNoteBtnText}>LƯU VÀO NHẬT KÝ PT</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {notes.map((n) => (
          <View key={n.id} style={styles.noteCard}>
            <View style={styles.noteTopRow}>
              <View style={styles.noteDatePill}>
                <Text style={styles.noteDateText}>{n.date}</Text>
              </View>
              <Text style={styles.noteMetrics}>
                {n.distanceKm} KM • Pace {n.avgPace} • HR {n.avgHr}
              </Text>
            </View>

            <View style={styles.noteGridRow}>
              <View style={[styles.tagPill, { backgroundColor: '#132A1C' }]}>
                <Text style={[styles.tagPillText, { color: '#D2FF00' }]}>LÀM TỐT</Text>
              </View>
              <Text style={styles.noteBodyText}>{n.goodPoint}</Text>
            </View>

            <View style={styles.noteGridRow}>
              <View style={[styles.tagPill, { backgroundColor: '#2A1219' }]}>
                <Text style={[styles.tagPillText, { color: '#FF3B5C' }]}>CHƯA ĐƯỢC</Text>
              </View>
              <Text style={styles.noteBodyText}>{n.badPoint}</Text>
            </View>

            <View style={styles.noteGridRow}>
              <View style={[styles.tagPill, { backgroundColor: '#0C2530' }]}>
                <Text style={[styles.tagPillText, { color: '#00F0FF' }]}>CÁCH SỬA</Text>
              </View>
              <Text style={[styles.noteBodyText, { color: '#00F0FF', fontWeight: '700' }]}>
                {n.fixAction}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#07090D',
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
    backgroundColor: '#10141D',
    borderWidth: 1,
    borderColor: '#00F0FF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  vo2Label: {
    color: '#00F0FF',
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
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#10141D',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E2534',
  },
  kpiLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  kpiValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  kpiBig: {
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  kpiUnit: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  kpiFoot: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 6,
  },
  lthrControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#1A2130',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: '#00F0FF',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionCard: {
    backgroundColor: '#10141D',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E2534',
    marginBottom: 18,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sectionTag: {
    color: '#00F0FF',
    fontSize: 10,
    fontWeight: '800',
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0D14',
    padding: 10,
    borderRadius: 12,
    gap: 10,
  },
  zoneBadge: {
    width: 34,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneBadgeText: {
    color: '#07090D',
    fontSize: 12,
    fontWeight: '900',
  },
  zoneInfoMid: {
    flex: 1,
  },
  zoneName: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  zonePace: {
    color: '#64748B',
    fontSize: 11,
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
    marginBottom: 12,
  },
  addNoteBtn: {
    backgroundColor: '#00F0FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addNoteBtnText: {
    color: '#07090D',
    fontSize: 11,
    fontWeight: '900',
  },
  formCard: {
    backgroundColor: '#10141D',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#00F0FF',
    marginBottom: 16,
    gap: 8,
  },
  formTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  formRow3: {
    flexDirection: 'row',
    gap: 8,
  },
  formCol: {
    flex: 1,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#0A0D14',
    borderWidth: 1,
    borderColor: '#1E2534',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#F8FAFC',
    fontSize: 12,
    marginTop: 4,
  },
  saveNoteBtn: {
    backgroundColor: '#D2FF00',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveNoteBtnText: {
    color: '#07090D',
    fontSize: 13,
    fontWeight: '900',
  },
  noteCard: {
    backgroundColor: '#10141D',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E2534',
    marginBottom: 12,
    gap: 10,
  },
  noteTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2534',
  },
  noteDatePill: {
    backgroundColor: '#1A2130',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  noteDateText: {
    color: '#D2FF00',
    fontSize: 11,
    fontWeight: '800',
  },
  noteMetrics: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  noteGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tagPill: {
    width: 78,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: '900',
  },
  noteBodyText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 12,
    lineHeight: 17,
  },
});
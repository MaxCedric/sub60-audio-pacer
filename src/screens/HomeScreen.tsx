import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Rect, Polygon, Path, Line, G } from 'react-native-svg';
import { BleConnectionStatus } from '../hooks/useBleHeartRate';
import { WorkoutPlan } from '../hooks/useRunningPacer';
import {
  AthleteProfile,
  DEFAULT_ATHLETE_PROFILE,
  GoalId,
  GOAL_TIERS,
} from '../logic/athlete';
import {
  formatPaceMinutesSeconds,
} from '../logic/paces';
import { buildSchedule, ScheduleWorkout } from '../logic/schedule';
import { storageService } from '../services/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

const ZONE_COLORS: Record<number, string> = {
  1: '#64748B',
  2: '#4B2EFF',
  3: '#9D85FF',
  4: '#C8FF00',
  5: '#FF3B5C',
};

// ─── Stage Icons matching HTML 100% ──────────────────────────────────────────
function StageIcon({ type, isHighlight }: { type: string; isHighlight: boolean }) {
  const iconColor = isHighlight ? '#08090C' : '#4B2EFF';

  if (type === 'Race' || type === 'Checkpoint') {
    // Checkered Finish Grid
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill={iconColor}>
        <Rect x={3} y={3} width={4.5} height={4.5} />
        <Rect x={12} y={3} width={4.5} height={4.5} />
        <Rect x={7.5} y={7.5} width={4.5} height={4.5} />
        <Rect x={16.5} y={7.5} width={4.5} height={4.5} />
        <Rect x={3} y={12} width={4.5} height={4.5} />
        <Rect x={12} y={12} width={4.5} height={4.5} />
        <Rect x={7.5} y={16.5} width={4.5} height={4.5} />
        <Rect x={16.5} y={16.5} width={4.5} height={4.5} />
      </Svg>
    );
  }

  if (type === 'Tempo' || type === 'Interval' || type === 'Strides') {
    // Kinetic Swirl / Vortex
    return (
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2.2} strokeLinecap="round">
        <Path d="M12 12c0-3 2.5-5 5-5 3 0 5 2.5 5 5 0 4.5-4 8-9 8-5.5 0-10-4-10-9.5C3 5.5 7.5 2 13 2" />
      </Svg>
    );
  }

  // Oval 400m Running Track (Easy / Long / Recovery)
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={2}>
      <Rect x={2} y={6} width={20} height={12} rx={6} />
      <Rect x={5} y={9} width={14} height={6} rx={3} />
    </Svg>
  );
}

// ─── Tactical Grid Background Component ─────────────────────────────────────
function TacticalGridBg() {
  const lines = useMemo(() => {
    const arr = [];
    const step = 28;
    for (let x = 0; x < SCREEN_WIDTH; x += step) {
      arr.push(<Line key={`v-${x}`} x1={x} y1={0} x2={x} y2={2200} stroke="rgba(75,46,255,0.07)" strokeWidth={1} />);
    }
    for (let y = 0; y < 2200; y += step) {
      arr.push(<Line key={`h-${y}`} x1={0} y1={y} x2={SCREEN_WIDTH} y2={y} stroke="rgba(75,46,255,0.07)" strokeWidth={1} />);
    }
    return arr;
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={SCREEN_WIDTH} height={2200}>
        {lines}
      </Svg>
    </View>
  );
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onSelectWorkout,
}) => {
  const [selectedGoalId, setSelectedGoalId] = useState<GoalId>('sub60');
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(new Set());
  const [adaptiveOpen, setAdaptiveOpen] = useState(false);
  const [selectedFeeling, setSelectedFeeling] = useState<string>('normal');

  // Load saved goal
  useEffect(() => {
    storageService.getSelectedGoal().then((g) => {
      if (g) setSelectedGoalId(g);
    });
  }, []);

  const handleSelectGoal = (gId: GoalId) => {
    Haptics.selectionAsync();
    setSelectedGoalId(gId);
    storageService.saveSelectedGoal(gId);
  };

  // Build schedule 100% matched with HTML
  const schedule = useMemo(() => buildSchedule(selectedGoalId), [selectedGoalId]);
  const currentWeek = useMemo(
    () => schedule.find((w) => w.week === selectedWeek) || schedule[0],
    [schedule, selectedWeek]
  );
  const weekTotalKm = useMemo(
    () => currentWeek.workouts.reduce((sum, w) => sum + w.totalKm, 0),
    [currentWeek]
  );

  // Animations
  const kenBurnsAnim = useRef(new Animated.Value(1)).current;
  const chevPulse = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Ken Burns loop: scale 1 -> 1.12 over 12s
    const kbLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(kenBurnsAnim, { toValue: 1.12, duration: 8000, useNativeDriver: true }),
        Animated.timing(kenBurnsAnim, { toValue: 1.0, duration: 8000, useNativeDriver: true }),
      ])
    );
    kbLoop.start();

    // Chevrons pulse loop
    const cpLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(chevPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(chevPulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    );
    cpLoop.start();

    // Next button bounce
    const bLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 1.05, duration: 700, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 1.0, duration: 700, useNativeDriver: true }),
      ])
    );
    bLoop.start();

    return () => {
      kbLoop.stop();
      cpLoop.stop();
      bLoop.stop();
    };
  }, [kenBurnsAnim, chevPulse, bounceAnim]);

  const toggleExpand = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedWorkouts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const currentGoalTier = GOAL_TIERS[selectedGoalId] || GOAL_TIERS.sub60;

  // Days left to 16.01.2027
  const daysLeft = useMemo(() => {
    const race = new Date('2027-01-16T06:00:00+07:00').getTime();
    const now = Date.now();
    return Math.max(0, Math.ceil((race - now) / (1000 * 60 * 60 * 24)));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <TacticalGridBg />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>

        {/* ══════════════════════════════════════════════════════════
            1. POSTER BENTO — Golden Ratio 1.618 : 1
        ══════════════════════════════════════════════════════════ */}
        <View style={styles.posterBento}>

          {/* Left Poster Card (61.8%) */}
          <View style={styles.posterLeftCard}>
            {/* Lime vertical marquee ribbon */}
            <View style={styles.limeRibbon}>
              <View style={styles.rotatedTextWrap}>
                <Text style={styles.limeRibbonText}>CHALLENGE</Text>
              </View>
            </View>

            {/* Purple vertical ribbon */}
            <View style={styles.purpleRibbon}>
              <View style={styles.rotatedTextWrap}>
                <Text style={styles.purpleRibbonText}>VER 1.0 // 10K</Text>
              </View>
            </View>

            {/* Poster Visual */}
            <View style={styles.posterVisual}>
              <Animated.Image
                source={require('../../assets/hero-track-banner.jpg')}
                style={[styles.heroImg, { transform: [{ scale: kenBurnsAnim }] }]}
                resizeMode="cover"
              />
              <View style={styles.posterDarkOverlay} />

              {/* Top row: SUB60 badge + chevrons */}
              <View style={styles.posterTopRow}>
                <View style={styles.posterGoalBadge}>
                  <Text style={styles.posterGoalBadgeText}>{currentGoalTier.name.toUpperCase()}</Text>
                </View>
                <View style={styles.chevRow}>
                  <Text style={[styles.chevText, { color: '#C8FF00' }]}>❯</Text>
                  <Text style={[styles.chevText, { color: '#C8FF00', opacity: 0.7 }]}>❯</Text>
                  <Text style={[styles.chevText, { color: '#C8FF00', opacity: 0.4 }]}>❯</Text>
                </View>
              </View>

              {/* Title layer */}
              <View style={styles.posterTitleWrap}>
                <Text style={styles.startingTitle}>STARTING</Text>
                <View style={styles.distPaceRow}>
                  <Text style={styles.distText}>10 KM</Text>
                  <Text style={styles.targetPaceText}>
                    {formatPaceMinutesSeconds(currentGoalTier.targetPaceMinSec)}/km
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Right Solid Lime Card (38.2%) */}
          <View style={styles.posterRightCard}>
            <View style={styles.rightCardTop}>
              <Text style={styles.finalsLabel}>FINALS</Text>
              <View style={styles.liveChip}>
                <Text style={styles.liveChipText}>LIVE</Text>
              </View>
            </View>

            <View style={styles.dashedDaysCircle}>
              <Text style={styles.daysNum}>{daysLeft}</Text>
              <Text style={styles.daysLabel}>DAYS</Text>
            </View>

            <View style={styles.dateBar}>
              <Text style={styles.dateBarText}>16.01.2027</Text>
            </View>
          </View>
        </View>

        {/* ══════════════════════════════════════════════════════════
            2. SEGMENTED GOAL SELECTOR (3 Clean Pills)
        ══════════════════════════════════════════════════════════ */}
        <View style={styles.goalGrid}>
          {(['sub60', 'sub65', 'under70'] as GoalId[]).map((gId) => {
            const tier = GOAL_TIERS[gId];
            const isSelected = gId === selectedGoalId;
            return (
              <TouchableOpacity
                key={gId}
                style={[styles.goalPill, isSelected && styles.goalPillActive]}
                onPress={() => handleSelectGoal(gId)}
              >
                <Text style={[styles.goalTitle, isSelected && styles.goalTitleActive]}>
                  {tier.name.toUpperCase()}
                </Text>
                <Text style={[styles.goalPace, isSelected && styles.goalPaceActive]}>
                  {formatPaceMinutesSeconds(tier.targetPaceMinSec)}/km
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ══════════════════════════════════════════════════════════
            3. WEEK SELECTOR & FOCUS
        ══════════════════════════════════════════════════════════ */}
        <View style={styles.weekSection}>
          <View style={styles.weekHeader}>
            <View style={styles.weekHeaderLeft}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth={2.3}>
                <Rect x={3} y={4} width={18} height={18} rx={2} />
                <Line x1={16} y1={2} x2={16} y2={6} />
                <Line x1={8} y1={2} x2={8} y2={6} />
                <Line x1={3} y1={10} x2={21} y2={10} />
              </Svg>
              <Text style={styles.weekHeaderTitle}>Lịch tập 9 tuần</Text>
            </View>
            <Text style={styles.weekTotalKmText}>{weekTotalKm.toFixed(1)} KM</Text>
          </View>

          {/* Week pills T1 - T9 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekPillsRow}>
            {schedule.map((w) => {
              const isSelected = w.week === selectedWeek;
              return (
                <TouchableOpacity
                  key={w.week}
                  style={[styles.weekBtn, isSelected && styles.weekBtnActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedWeek(w.week);
                  }}
                >
                  <Text style={[styles.weekBtnText, isSelected && styles.weekBtnTextActive]}>
                    T{w.week}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.weekDateRangeText}>{currentWeek.dateRange}</Text>
        </View>

        {/* ══════════════════════════════════════════════════════════
            4. TECHWEAR WORKOUT STAGES DIVIDER
        ══════════════════════════════════════════════════════════ */}
        <View style={styles.techDivider}>
          <View style={styles.techLeft}>
            <Svg width={44} height={12} viewBox="0 0 54 12" fill="#C8FF00">
              <Polygon points="0,0 6,0 10,12 4,12" />
              <Polygon points="10,0 16,0 20,12 14,12" />
              <Polygon points="20,0 26,0 30,12 24,12" />
              <Polygon points="30,0 36,0 40,12 34,12" />
              <Polygon points="40,0 46,0 50,12 44,12" />
            </Svg>
            <Text style={styles.techTitle}>WORKOUT STAGES</Text>
          </View>
          <Svg width={56} height={12} viewBox="0 0 70 12" fill="#9D85FF">
            <Polygon points="0,0 6,0 11,6 6,12 0,12 5,6" />
            <Polygon points="11,0 17,0 22,6 17,12 11,12 16,6" />
            <Polygon points="22,0 28,0 33,6 28,12 22,12 27,6" />
            <Polygon points="33,0 39,0 44,6 39,12 33,12 38,6" />
            <Polygon points="44,0 50,0 55,6 50,12 44,12 49,6" />
            <Polygon points="55,0 61,0 66,6 61,12 55,12 60,6" />
          </Svg>
        </View>

        {/* ══════════════════════════════════════════════════════════
            5. CLEAN WHITE WORKOUT CARDS — Exact Match with HTML
        ══════════════════════════════════════════════════════════ */}
        <View style={styles.workoutsList}>
          {currentWeek.workouts.map((w, idx) => {
            const isNext = idx === 0 && selectedWeek === 1;
            const isHighlight = isNext || w.type === 'Checkpoint' || w.type === 'Race';
            const isExpanded = expandedWorkouts.has(w.id);
            const mainSeg = w.segments.reduce((a, b) => (b.distKm > a.distKm ? b : a), w.segments[0]);

            return (
              <View
                key={w.id}
                style={[
                  styles.workoutCard,
                  isNext ? styles.cardBorderLime : styles.cardBorderPurple,
                ]}
              >
                {/* Top Row */}
                <View style={styles.cardTopRow}>
                  {/* Left Icon + Title block */}
                  <View style={styles.cardTopLeft}>
                    <View style={[styles.stageIconCircle, isHighlight ? styles.iconCircleLime : styles.iconCirclePurple]}>
                      <StageIcon type={w.type} isHighlight={isHighlight} />
                    </View>
                    <View style={styles.cardTitleCol}>
                      <View style={styles.badgeRow}>
                        <View style={styles.stageBadge}>
                          <Text style={styles.stageBadgeText}>STAGE 0{idx + 1}</Text>
                        </View>
                        {isNext && (
                          <View style={styles.nextBadge}>
                            <Text style={styles.nextBadgeText}>NEXT</Text>
                          </View>
                        )}
                        <Text style={styles.dayText}>{w.day.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.workoutCardTitle} numberOfLines={2}>
                        {w.title.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  {/* Right KM + Zone */}
                  <View style={styles.cardTopRight}>
                    <View style={styles.kmRow}>
                      <Text style={styles.kmNum}>{w.totalKm.toFixed(1)}</Text>
                      <Text style={styles.kmUnit}>KM</Text>
                    </View>
                    <Text style={styles.mainSegPace}>
                      Z{mainSeg.zone} · {formatPaceMinutesSeconds(mainSeg.paceMin)}
                    </Text>
                  </View>
                </View>

                {/* Mini Zone Timeline Bar */}
                <View style={styles.timelineTrack}>
                  {w.segments.map((seg, sIdx) => {
                    const widthPct = Math.max(8, (seg.distKm / w.totalKm) * 100);
                    return (
                      <View
                        key={sIdx}
                        style={[
                          styles.timelineSegment,
                          {
                            width: `${widthPct}%`,
                            backgroundColor: ZONE_COLORS[seg.zone] || '#4B2EFF',
                          },
                        ]}
                      />
                    );
                  })}
                </View>

                {/* Collapsible Segments List */}
                {isExpanded && (
                  <View style={styles.expandedSegsList}>
                    {w.segments.map((seg, sIdx) => (
                      <View key={sIdx} style={styles.expandedSegRow}>
                        <Text style={styles.segRowName} numberOfLines={1}>
                          {sIdx + 1}. {seg.name}
                        </Text>
                        <Text style={styles.segRowPace}>
                          {formatPaceMinutesSeconds(seg.paceMin)}–{formatPaceMinutesSeconds(seg.paceMax)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Bottom Actions Row */}
                <View style={styles.cardBottomRow}>
                  <TouchableOpacity style={styles.toggleSegsBtn} onPress={() => toggleExpand(w.id)}>
                    <Text style={styles.toggleSegsText}>
                      {isExpanded ? 'Ẩn ▴' : `${w.segments.length} chặng ▾`}
                    </Text>
                  </TouchableOpacity>

                  <Animated.View style={isNext ? { transform: [{ scale: bounceAnim }] } : undefined}>
                    <TouchableOpacity
                      style={[styles.runBtn, isNext ? styles.runBtnNext : styles.runBtnDark]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        onSelectWorkout(w as unknown as WorkoutPlan);
                      }}
                    >
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill={isNext ? '#08090C' : '#C8FF00'}>
                        <Polygon points="6,4 20,12 6,20 6,4" />
                      </Svg>
                      <Text style={[styles.runBtnText, isNext ? styles.runBtnTextDark : styles.runBtnTextLime]}>
                        {w.type === 'Checkpoint' || w.type === 'Race' ? 'TEST' : 'RUN'}
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                </View>
              </View>
            );
          })}
        </View>

        {/* ══════════════════════════════════════════════════════════
            6. ADAPTIVE QUICK DRAWER (Tùy chỉnh theo thể trạng)
        ══════════════════════════════════════════════════════════ */}
        <View style={styles.adaptiveCard}>
          <TouchableOpacity
            style={styles.adaptiveHeader}
            onPress={() => {
              Haptics.selectionAsync();
              setAdaptiveOpen(!adaptiveOpen);
            }}
          >
            <View style={styles.adaptiveHeaderLeft}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="#C8FF00">
                <Path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </Svg>
              <Text style={styles.adaptiveTitle}>Tùy chỉnh theo thể trạng</Text>
            </View>
            <Text style={styles.adaptiveChev}>{adaptiveOpen ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {adaptiveOpen && (
            <View style={styles.adaptiveContent}>
              <View style={styles.feelingChipsRow}>
                {[
                  { id: 'fresh', label: 'Sung sức' },
                  { id: 'normal', label: 'Bình thường' },
                  { id: 'tired', label: 'Mệt mỏi' },
                  { id: 'sore', label: 'Đau cơ nhẹ' },
                ].map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.feelingChip, selectedFeeling === f.id && styles.feelingChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedFeeling(f.id);
                    }}
                  >
                    <Text style={[styles.feelingChipText, selectedFeeling === f.id && styles.feelingChipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.adaptiveAdviceBox}>
                <Text style={styles.adaptiveAdviceTitle}>PT Khuyên Dùng:</Text>
                <Text style={styles.adaptiveAdviceText}>
                  {selectedFeeling === 'fresh'
                    ? 'Bạn đang sung sức! Có thể tăng nhịp bước lên 174 SPM ở đoạn cuối bài chạy.'
                    : selectedFeeling === 'tired'
                    ? 'Nếu thấy mệt mỏi, hãy giảm 30s/km ở chặng 2 và tập trung giữ nhịp tim dưới 150 bpm.'
                    : selectedFeeling === 'sore'
                    ? 'Cơ bắp đang căng nhẹ: Khởi động thật kỹ cổ chân 5 phút, chạy 4 phút đi bộ 1 phút.'
                    : 'Thể trạng sẵn sàng cho giáo án hôm nay. Giữ đều sải chân và hít thở sâu nhịp 2-2.'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  // ── Poster Bento ──
  posterBento: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 196,
  },
  posterLeftCard: {
    flex: 1.618,
    flexDirection: 'row',
    backgroundColor: '#111218',
    borderWidth: 1,
    borderColor: 'rgba(75,46,255,0.6)',
    borderRadius: 6,
    borderBottomLeftRadius: 18, // Chamfered feel
    overflow: 'hidden',
    minHeight: 196,
  },
  limeRibbon: {
    width: 28,
    backgroundColor: '#C8FF00',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    overflow: 'hidden',
  },
  rotatedTextWrap: {
    width: 140,
    height: 24,
    transform: [{ rotate: '-90deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  limeRibbonText: {
    color: '#08090C',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  purpleRibbon: {
    width: 20,
    backgroundColor: '#4B2EFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    overflow: 'hidden',
  },
  purpleRibbonText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  posterVisual: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.45,
  },
  posterDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,9,12,0.5)',
  },
  posterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  posterGoalBadge: {
    backgroundColor: '#4B2EFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  posterGoalBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  chevRow: {
    flexDirection: 'row',
    gap: 2,
  },
  chevText: {
    fontSize: 12,
    fontWeight: '900',
  },
  posterTitleWrap: {
    zIndex: 2,
    marginTop: 8,
  },
  startingTitle: {
    fontSize: 36,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#C8FF00',
    lineHeight: 34,
    letterSpacing: -1,
  },
  distPaceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  distText: {
    fontSize: 20,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#FFFFFF',
  },
  targetPaceText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#9D85FF',
  },
  // Right card
  posterRightCard: {
    flex: 1,
    backgroundColor: '#C8FF00',
    borderRadius: 6,
    borderBottomLeftRadius: 18,
    padding: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 196,
  },
  rightCardTop: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  finalsLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#08090C',
    letterSpacing: 1,
  },
  liveChip: {
    backgroundColor: '#08090C',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveChipText: {
    color: '#C8FF00',
    fontSize: 9,
    fontWeight: '900',
  },
  dashedDaysCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: '#08090C',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  daysNum: {
    fontSize: 34,
    fontWeight: '900',
    color: '#08090C',
    lineHeight: 36,
  },
  daysLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#08090C',
    letterSpacing: 2,
  },
  dateBar: {
    width: '100%',
    backgroundColor: '#4B2EFF',
    paddingVertical: 4,
    alignItems: 'center',
    borderRadius: 4,
    borderBottomLeftRadius: 10,
  },
  dateBarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  // ── Goal selector ──
  goalGrid: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#111218',
    padding: 6,
    borderRadius: 12,
  },
  goalPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  goalPillActive: {
    backgroundColor: '#C8FF00',
  },
  goalTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  goalTitleActive: {
    color: '#08090C',
  },
  goalPace: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  goalPaceActive: {
    color: '#08090C',
    fontWeight: '800',
  },
  // ── Week selector ──
  weekSection: {
    gap: 8,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  weekTotalKmText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#C8FF00',
  },
  weekPillsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  weekBtn: {
    width: 44,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#111218',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekBtnActive: {
    backgroundColor: '#4B2EFF',
  },
  weekBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#94A3B8',
  },
  weekBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  weekDateRangeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9D85FF',
  },
  // ── Tech Divider ──
  techDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111218',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#252838',
  },
  techLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  techTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  // ── White Workout Cards ──
  workoutsList: {
    gap: 14,
  },
  workoutCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 4,
    borderTopRightRadius: 20, // Contest-cut styling
    borderBottomWidth: 4,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 25,
    elevation: 8,
  },
  cardBorderLime: {
    borderBottomColor: '#C8FF00',
  },
  cardBorderPurple: {
    borderBottomColor: '#4B2EFF',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  stageIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  iconCircleLime: {
    backgroundColor: '#C8FF00',
  },
  iconCirclePurple: {
    backgroundColor: 'rgba(75,46,255,0.15)',
  },
  cardTitleCol: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  stageBadge: {
    backgroundColor: '#4B2EFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stageBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  nextBadge: {
    backgroundColor: '#C8FF00',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nextBadgeText: {
    color: '#08090C',
    fontSize: 10,
    fontWeight: '900',
  },
  dayText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  workoutCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#08090C',
    letterSpacing: 0.3,
    lineHeight: 20,
  },
  cardTopRight: {
    alignItems: 'flex-end',
  },
  kmRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  kmNum: {
    fontSize: 24,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#08090C',
  },
  kmUnit: {
    fontSize: 12,
    fontWeight: '900',
    color: '#4B2EFF',
    marginLeft: 2,
  },
  mainSegPace: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginTop: 2,
  },
  // Timeline Track
  timelineTrack: {
    height: 8,
    width: '100%',
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 3,
    padding: 2,
    overflow: 'hidden',
  },
  timelineSegment: {
    height: '100%',
    borderRadius: 999,
  },
  expandedSegsList: {
    gap: 6,
    paddingTop: 4,
  },
  expandedSegRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(226,232,240,0.7)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  segRowName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#08090C',
    flex: 1,
    paddingRight: 8,
  },
  segRowPace: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4B2EFF',
  },
  // Bottom Row
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  toggleSegsBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  toggleSegsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
  },
  runBtnNext: {
    backgroundColor: '#C8FF00',
    borderWidth: 2,
    borderColor: '#08090C',
  },
  runBtnDark: {
    backgroundColor: '#08090C',
  },
  runBtnText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  runBtnTextDark: {
    color: '#08090C',
  },
  runBtnTextLime: {
    color: '#C8FF00',
  },
  // ── Adaptive Drawer ──
  adaptiveCard: {
    backgroundColor: '#111218',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  adaptiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  adaptiveHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adaptiveTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  adaptiveChev: {
    fontSize: 12,
    color: '#94A3B8',
  },
  adaptiveContent: {
    gap: 12,
    paddingTop: 8,
  },
  feelingChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  feelingChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#181A24',
  },
  feelingChipActive: {
    backgroundColor: '#C8FF00',
  },
  feelingChipText: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  feelingChipTextActive: {
    color: '#08090C',
    fontWeight: '800',
  },
  adaptiveAdviceBox: {
    backgroundColor: '#08090C',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  adaptiveAdviceTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C8FF00',
  },
  adaptiveAdviceText: {
    fontSize: 12,
    color: '#E2E8F0',
    lineHeight: 18,
  },
});

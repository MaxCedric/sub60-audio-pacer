# Sub60 Audio Pacer — Trợ Lý Âm Thanh Chạy Bộ 10 KM Chuyên Sâu

Ứng dụng React Native / Expo (SDK 52, React Native 0.76, TypeScript) đóng vai trò một huấn luyện viên ảo (PT Audio Coach) thời gian thực bằng tiếng Việt, kết nối trực tiếp với đồng hồ thông minh (như **HUAWEI WATCH FIT 4**) qua chuẩn **Bluetooth GATT Heart Rate Service (`0x180D`)** và định vị GPS chạy nền trên iPhone. Biên dịch file `.ipa` unsigned **miễn phí 100% (0 USD)** qua GitHub Actions để cài đặt lên iPhone bằng [Sideloadly](https://sideloadly.io/).

---

## 1. Hồ Sơ Vận Động Viên (Cập nhật 15/11/2026 từ Huawei Health)

| Chỉ số / Thông tin | Giá trị thực tế | Ý nghĩa huấn luyện |
| :--- | :--- | :--- |
| **Cân nặng** | 73,7 kg | Cần kiểm soát lực tiếp đất bằng guồng chân cao (170–174 SPM) |
| **VO2max** | 35 | Mức hiếu khí đang xây lại, tránh ép tim vọt Z5 quá sớm |
| **Chỉ số chạy (RAI)** | 26,3 | Đánh giá năng lực chạy nền tảng |
| **Ngưỡng Lactate (LTHR)** | **176 bpm @ 7'31"/km** (451 s/km) | Cột mốc phân chia các vùng tim và pace tập |
| **Nhịp tim tối đa (HRmax)** | 195 bpm | Giới hạn trần sinh lý tuyệt đối |
| **Ngưỡng nguy hiểm** | **190 bpm** (30s) hoặc **195 bpm** (5s) | Báo động đỏ, yêu cầu đi bộ ngay lập tức |
| **3 km nhanh nhất** | **21:08** (7'03"/km = 423 s/km) | Cơ sở tính pace bài tập Interval |
| **PR 5K** | 35:44 (Pace 7'09"/km) | Thành tích tốt nhất trước đây |
| **Pace km nhanh nhất** | 6'17"/km (377 s/km) | Tiềm năng tốc độ tối đa |
| **Chạy dài nhất** | 9,15 km (Tháng 6/2026) | Đã từng chạm ngưỡng 10 km |
| **Khối lượng 4 tuần gần nhất** | 3–4 km/tuần | Đang mất nền, giáo án xây lại thể lực từ từ |
| **Huyết áp nền** | 128/88 mmHg | An toàn tim mạch là ưu tiên số một |
| **Lịch sinh hoạt tuần** | Thứ 3 đánh cầu lông; Thứ 5 và Thứ 7 chạy; Chủ Nhật tùy chọn |
| **Ngày thi đấu (Race Day)** | **16/01/2027 — Giải chạy 10 KM** | Đếm ngược 9 tuần huấn luyện thực chiến |

---

## 2. Hệ Thống 3 Bậc Mục Tiêu & Công Thức Riegel

Người dùng giữ **Sub 60** làm mục tiêu cao nhất, đồng thời app trang bị 3 bậc linh hoạt:

1. **Sub 60 (Mục tiêu chính):** Race pace 355–360 s/km (5'55"–6'00"/km).
2. **Sub 65 (Phương án an toàn 1):** Race pace 385–390 s/km (6'25"–6'30"/km).
3. **Dưới 70 phút (Phương án an toàn 2):** Race pace 415–420 s/km (6'55"–7'00"/km).

> **Ghi chú Riegel hiển thị trong app:**  
> *"Quy đổi theo công thức Riegel ($T_2 = T_1 \times (D_2 / D_1)^{1.06}$), Sub 60 tương đương 3 km khoảng 16:45 và 5 km khoảng 28:50. Thành tích hiện tại: 3 km 21:08."*

*Nút "Hạ mục tiêu"* ngay trên HUD cho phép chuyển bậc tức thì khi đuối sức (Sub 60 → Sub 65 → Dưới 70) kèm âm thanh động viên từ PT.

---

## 3. Bảng 5 Vùng Nhịp Tim Theo Joe Friel (LTHR = 176 bpm)

Các vùng tim được tính động theo ngưỡng LTHR (`lactateThresholdHrBpm`), không hard-code:

| Vùng (Zone) | Tên vùng tim | Khoảng nhịp tim (bpm) | Tỷ lệ % LTHR | Mục đích tập luyện |
| :---: | :--- | :---: | :---: | :--- |
| **Z1** | Hồi phục (Recovery) | **< 150** | < 85% | Khởi động, thả lỏng, bảo vệ cơ khớp |
| **Z2** | Nền tảng hiếu khí (Easy) | **150 – 157** | 85% – 89% | Đốt mỡ tối ưu, xây nền sức bền mao mạch |
| **Z3** | Aerobic cao (Steady / Tempo nhẹ) | **158 – 165** | 90% – 94% | Tăng khả năng thanh thải lactate vừa phải |
| **Z4** | Ngưỡng Lactate (Threshold) | **166 – 175** | 95% – 99% | Nâng cao ngưỡng yếm khí |
| **Z5** | Trên ngưỡng (VO2max / Sprint) | **≥ 176** | ≥ 100% | Tốc độ tối đa, chỉ duy trì trong các tổ ngắn |

### Quy tắc Cảnh Báo Nhịp Tim An Toàn:
1. **Nguy hiểm (Mọi loại bài tập):**
   - HR ≥ 190 bpm liên tục 30 giây → Báo động đỏ, yêu cầu đi bộ ngay.
   - HR ≥ 195 bpm (HRmax) dù chỉ 5 giây → Báo động đỏ lập tức.
2. **Theo từng loại chặng bài:**
   - `warmup`, `main` easy, `cooldown`, long run easy: Vượt trần đoạn (mặc định 157 bpm) liên tục 60 giây → nhắc chạy chậm lại.
   - `tempo`: Vượt 176 bpm liên tục 60 giây → nhắc hãm tốc.
   - `interval_work`, `stride`, `race_split`: **Không** nhắc nhịp tim để tránh gây phiền khi đang bứt tốc, chỉ kích hoạt khi chạm ngưỡng nguy hiểm.
   - `interval_rest`: Không nhắc pace; chỉ phát câu *"Nhịp tim đã hạ dưới 150, sẵn sàng cho tổ tiếp theo"* khi HR < 150 bpm.
3. Không can thiệp điều chỉnh pace theo HR trong các đoạn ngắn dưới 3 phút (do HR có độ trễ 30–90s).

---

## 4. Công Thức Tính Pace Tập Luyện Động

Pace bài tập được tính toán tự động từ 2 thông số đo đạc thực tế của VĐV: $P_{LT}$ (`lactateThresholdPaceSecPerKm` = 451 s/km = 7'31") và $P_{3K}$ (`fastest3kSec` / 3 = 423 s/km = 7'03"):

| Loại bài tập (`paceType`) | Công thức tính (s/km) | Pace thực tế hiện tại |
| :--- | :--- | :--- |
| **Easy / Long Run** | $P_{LT} + 45 \to P_{LT} + 90$ | **496 – 541** (8'16" – 9'01"/km) |
| **Tăng tốc cuối Long Run** | $P_{LT} + 10 \to P_{LT} + 20$ | **461 – 471** (7'41" – 7'51"/km) |
| **Tempo** | $P_{LT} - 5 \to P_{LT} + 5$ | **446 – 456** (7'26" – 7'36"/km) |
| **Interval** | $P_{3K} - 10 \to P_{3K}$ | **413 – 423** (6'53" – 7'03"/km) |
| **Stride (Bứt tốc ngắn)** | Theo cảm giác | Không nhắc pace, chỉ đếm thời gian |
| **Race Pace** | Theo Goal đang chọn | Sub 60: **355 – 360** (5'55" – 6'00"/km) |
| **Race-Pace Drill** | Race Pace $\pm 5$ | Sub 60: **350 – 365** (5'50" – 6'05"/km) |

*Mọi bài tập Easy, Tempo, Interval được tính từ chỉ số thể lực thật của VĐV, không ép theo tốc độ Sub 60 để phòng tránh chấn thương quá tải.*

---

## 5. Giáo Án 9 Tuần Chinh Phục 10 KM (16/11/2026 – 16/01/2027)

Lịch tập cố định: **Thứ 3** (Cầu lông bổ trợ), **Thứ 5** (Chất lượng), **Thứ 7** (Chạy dài). **Chủ Nhật** (Thả lỏng tùy chọn có công tắc bật/tắt):

| Tuần | Giai đoạn | Thứ 5 (Chất lượng) | Thứ 7 (Chạy dài) | CN (Tùy chọn) | Trọng tâm tuần |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **T1** | Xây nền | 3,0 km Easy (Z2) | 4,5 km Easy (Z2) | 2,5 km Easy | Tái kích hoạt hệ tim mạch, kiểm soát tim Z2 < 157 bpm |
| **T2** | Xây nền | 3,0 km Easy + 4×15s Strides | 5,0 km Easy (Z2) | 2,5 km Easy | Thêm nhịp sải chân nhanh với strides |
| **T3** | Phát triển | 3,5 km Easy + 5×20s Strides | 6,0 km Easy (Z2) | 3,0 km Easy | Tăng cự ly chạy dài chạm mốc 6 km |
| **T4** | **Kiểm tra 1** | **Bài Test 3 km All-out** | 5,0 km Easy (Hồi phục) | 2,5 km Easy | **Mốc Checkpoint 1**: Đánh giá khả năng bám Sub 60 |
| **T5** | Nâng ngưỡng | 1 km WU + 3×800m Interval + CD | 7,0 km Long Run | 3,0 km Easy | Bài tập interval đầu tiên theo pace 3K (6'53"–7'03") |
| **T6** | Nâng ngưỡng | 1 km WU + 2 km Tempo + CD | 8,0 km Long Run | 3,0 km Easy | Kéo dài khả năng chịu tải ngưỡng lactate 7'26"–7'36" |
| **T7** | **Kiểm tra 2** | 1 km WU + 4×600m Interval + CD | **9 km (kèm 2 km Race Pace)** | 3,0 km Easy | **Mốc Checkpoint 2**: Thử nghiệm race pace trong chạy dài |
| **T8** | Giảm tải | 1 km WU + 1,5 km Tempo + 3×15s | 6,0 km Long Run nhẹ nhàng | Nghỉ ngơi | Tích lũy năng lượng, thả lỏng gân cơ |
| **T9** | **Tuần Race** | 2,0 km Easy + 3×100m Race Drill | **RACE DAY 10 KM (16/01/2027)** | Ăn mừng | Chiến thuật 3-split: 0-3km (6'03"), 3-8km (5'57"), 8-10km (5'50") |

### Quy Tắc Đánh Giá Checkpoint Thông Minh (Chỉ gợi ý, không tự đổi):
- **Tuần 4 (Test 3 km):**
  - $\le 18:30$ $\to$ *"Đang đúng hướng Sub 60, tiếp tục duy trì!"*
  - $18:31 - 19:30$ $\to$ Gợi ý *"Nên chuyển sang Sub 65 để an toàn"*. Có nút Đồng ý / Giữ Sub 60.
  - $> 19:30$ $\to$ Gợi ý *"Nên chuyển sang Dưới 70 phút"*. Có nút Đồng ý / Giữ Sub 60.
- **Tuần 7 (2 km Race Pace):**
  - Nếu pace TB chậm hơn race pace $> 15$ s/km hoặc HR TB $\ge 186$ bpm $\to$ Gợi ý hạ một bậc mục tiêu.

---

## 6. Cấu Trúc Mã Nguồn & Module Hóa Thuần Túy

Dự án tách biệt hoàn toàn giữa **Pure Business Logic** (không import React/Expo, dễ dàng unit test bằng Jest) và **UI/Native Services**:

```text
sub60-audio-pacer/
├── src/
│   ├── config/
│   │   └── coachConfig.ts          # Bộ ngưỡng tập trung (dung sai pace, cooldown, ngưỡng tim, speech)
│   ├── logic/                      # PURE LOGIC (100% độc lập, không import react/expo)
│   │   ├── athlete.ts              # Hồ sơ VĐV, 3 goal tiers, công thức Riegel, checkpoint W4 & W7
│   │   ├── zones.ts                # 5 vùng tim Joe Friel, cảnh báo nguy hiểm 190/195 bpm, trần chặng
│   │   ├── paces.ts                # Công thức tính pace động (easy, tempo, interval, race), format pace
│   │   ├── eta.ts                  # Tính thời gian hoàn thành dự kiến (ETA) dựa trên 2 split gần nhất
│   │   ├── gpsFilter.ts            # Lọc GPS accuracy > 20m, grace period 20s/100m, auto-pause, check-in PT
│   │   └── __tests__/              # 5 bộ Unit Test Jest (34/34 tests passed)
│   ├── services/
│   │   ├── audioCoach.ts           # Hàng đợi ưu tiên âm thanh, Ducking iOS, Metronome phần cứng WAV loop
│   │   └── storage.ts              # AsyncStorage lưu session chạy, RPE, note 3 dòng, checkpoint history
│   ├── hooks/
│   │   ├── useBleHeartRate.ts      # BLE GATT Heart Rate 0x180D (HUAWEI WATCH FIT 4)
│   │   └── useRunningPacer.ts      # Pacer Engine chạy nền, GPS Background Task, Cadence qua Pedometer
│   ├── screens/
│   │   ├── HomeScreen.tsx          # Chọn bài tập 9 tuần, chỉnh chỉ số VĐV, chọn mục tiêu, toggle CN
│   │   ├── RunHudScreen.tsx        # HUD OLED tương phản cao, nút Hạ mục tiêu, nút LAP, RPE & Post-Run Note
│   │   └── StatsScreen.tsx         # Bảng 5 Zone Joe Friel động, tích lũy km, đánh giá checkpoint, lịch sử run
│   └── data/
│       └── trainingPlan.json       # Giáo án 9 tuần chuẩn hóa với trường paceType
├── .github/workflows/
│   └── ios-unsigned-ipa.yml        # Build unsigned IPA tự động trên macOS runner (Miễn phí 100%)
└── jest.config.js                  # Cấu hình Jest chạy TypeScript logic
```

---

## 7. Các Cải Tiến Kỹ Thuật Đáng Chú Ý

1. **Âm thanh Không Bị Trôi (Hardware WAV Loop Metronome):**
   - Loại bỏ hoàn toàn `setInterval` trong JavaScript thread. Sử dụng file buffer âm thanh WAV 16-bit PCM được tạo trực tiếp trong RAM và phát lặp vô tận bằng `expo-av` (`isLooping: true`) trên audio thread phần cứng của iOS.
2. **Hàng Đợi Âm Thanh Thông Minh (Audio Priority Queue):**
   - Phân cấp ưu tiên: `CRITICAL` (Ngắt ngay lập tức khi tim nguy hiểm), `SAFETY`, `MILESTONE` (Báo km, checkpoint), `COACHING` (Điều chỉnh pace).
   - Tự động hủy câu nhắc cũ quá hạn (TTL 15s) và giới hạn tối đa 2 câu trong hàng đợi để không nói liên tục làm phiền người chạy.
3. **Lọc GPS & Dung Sai Thông Minh (Smart Tolerance):**
   - Thời gian ân hạn 20 giây đầu chặng hoặc 100m không kích hoạt cảnh báo pace.
   - Dung sai êm dịu $\pm 12$ s/km giúp người chạy không bị giật mình khi pace dao động tự nhiên.
   - Khi tín hiệu GPS yếu ($accuracy > 20$m), tự động tạm ngắt thông báo pace để tránh đọc sai số.
4. **Tự Động Dừng (Auto-Pause):**
   - Vận tốc $< 1.0$ m/s liên tục 6 giây $\to$ tự động tạm dừng đếm thời gian.
   - Vận tốc $> 1.8$ m/s liên tục 3 giây $\to$ tự động tiếp tục.
5. **Đánh Giá RPE & Nhật Ký Buổi Chạy (Post-Run Notes):**
   - Cho phép nhập thang đo gắng sức RPE (1–10) và lưu trữ 3 dòng: *Làm tốt*, *Chưa được*, *Cách sửa buổi tới*.
6. **Dự Đoán Thời Gian Về Đích (ETA Milestone):**
   - Ở mỗi mốc 1 km, huấn luyện viên thông báo cự ly đã chạy, nhịp tim hiện tại, pace trung bình và thời gian về đích dự kiến dựa trên phong độ 2 km gần nhất.
7. **Huấn Luyện Viên AI Thích Ứng & Hỏi Đáp Trực Tuyến (AI Adaptive Coach & Gemini Integration):**
   - **Chạy ngẫu hứng thông minh (On-Demand Run):** Bất cứ khi nào có hứng chạy đột xuất, AI PT tự động phân tích:
     - Ngày trong tuần và lịch cố định (Thứ 3 cầu lông, Thứ 5 chất lượng, Thứ 7 chạy dài).
     - Khối lượng km và số buổi đã tích lũy trong tuần này.
     - Thời gian cách buổi chạy gần nhất.
     - Cảm giác thể trạng thực tế người dùng chọn: *⚡ Sung sức*, *😊 Bình thường*, *😮‍💨 Chân mỏi*, *⏱️ Gấp 20 phút*.
     - Tự động sinh ngay bài chạy tương ứng (Easy hồi phục, Easy kèm Strides, Tempo thử thách, Quick Shakeout 20 phút) kèm giải thích lý do, câu quote PT và nút bấm chạy ngay với Audio Coach!
   - **Tích hợp Trợ lý AI Đa Tầng:**
     - *Smart Offline Engine*: Chạy 100% offline nội bộ trên máy, không cần mạng, không tốn phí, phản hồi tức thì.
     - *Tùy chọn Google Gemini 1.5 Flash*: Cho phép dán API Key miễn phí từ [Google AI Studio](https://aistudio.google.com/) trong mục cài đặt để hỏi đáp trực tiếp các câu hỏi sinh lý, dinh dưỡng, chấn thương trước khi chạy.

---

## 8. Hướng Dẫn Kiểm Thử & Biên Dịch IPA

### Chạy Unit Test Logic
```bash
npm test
```
Toàn bộ 5 test suites (`athlete`, `paces`, `zones`, `eta`, `gpsFilter`) với 34 unit tests kiểm tra toàn diện các công thức toán học và ngưỡng an toàn.

### Kiểm Tra TypeScript
```bash
npm run typecheck
```

### Đóng Gói File `.ipa` Cho iPhone (Miễn Phí 100% Qua GitHub Actions)
1. Commit và Push mã nguồn lên nhánh `main` của repository GitHub:
   ```bash
   git add .
   git commit -m "feat: complete athlete profile, 9-week plan, pure logic, tests, and persistence"
   git push origin main
   ```
2. Vào tab **Actions** trên GitHub repository, quy trình `Build Unsigned iOS IPA for Sideloadly` sẽ tự động chạy trên macOS runner.
3. Khi hoàn tất, tải file artifact `Sub60AudioPacer-iOS-IPA` (chứa `Sub60AudioPacer-unsigned.ipa`).
4. Mở phần mềm [Sideloadly](https://sideloadly.io/) trên máy tính Windows, cắm cáp kết nối iPhone, kéo thả file `.ipa` vào và bấm **Start** với tài khoản Apple ID cá nhân miễn phí.

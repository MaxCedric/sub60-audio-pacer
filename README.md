# Thiết Kế Kiến Trúc & Toàn Bộ Mã Nguồn: Sub60 Audio Pacer (MVP)

Tài liệu kỹ thuật này tổng hợp cấu trúc dự án, mã nguồn hoàn chỉnh của cả 4 module cốt lõi và quy trình biên dịch file `.ipa` **miễn phí 100% (0 USD)** từ máy tính **Windows** để cài đặt lên **iPhone** qua [Sideloadly](https://sideloadly.io/) hoặc [AltStore](https://altstore.io/), kết nối trực tiếp với đồng hồ **HUAWEI WATCH FIT 4** qua chuẩn [Bluetooth GATT Heart Rate Service (`0x180D` / `0x2A37`)](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HRS_v1.0/out/en/index-en.html).

## 1. Cấu trúc thư mục dự án (Chuẩn Expo SDK 52+)

Ứng dụng sử dụng kiến trúc [Expo Prebuild (Development Build)](https://docs.expo.dev/develop/development-builds/introduction/) kết hợp các thư viện gốc [react-native-ble-plx](https://dotintent.github.io/react-native-ble-plx/), [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/), [Expo TaskManager](https://docs.expo.dev/versions/latest/sdk/task-manager/), [Expo Speech](https://docs.expo.dev/versions/latest/sdk/speech/) và [Expo Audio (`expo-av`)](https://docs.expo.dev/versions/latest/sdk/audio/):

```text
sub60-audio-pacer/
├── .github/
│   └── workflows/
│       └── ios-unsigned-ipa.yml      # GitHub Actions macOS runner build .ipa miễn phí cho Sideloadly
├── src/
│   ├── data/
│   │   └── trainingPlan.json         # Giáo án 10 tuần (10/11/2026 - 16/01/2027) & hồ sơ sinh lý
│   ├── hooks/
│   │   ├── useBleHeartRate.ts        # Module 1: Quét BLE 0x180D, giải mã 0x2A37 & Auto-Reconnect
│   │   └── useRunningPacer.ts        # Module 2: Background GPS, Rolling Pace 20s/90m & State Machine
│   ├── services/
│   │   └── audioCoach.ts             # Module 3: TTS Tiếng Việt, iOS Audio Ducking & Metronome 172 bpm
│   └── screens/
│       ├── HomeScreen.tsx            # Giao diện chọn bài chạy 10 tuần & kết nối HUAWEI WATCH FIT 4
│       └── RunHudScreen.tsx          # Giao diện HUD OLED tương phản cao + nút chuyển nhanh Sub65
├── App.tsx                           # Điểm vào ứng dụng giữ kết nối BLE xuyên suốt
├── app.json                          # Cấu hình Info.plist (UIBackgroundModes: location, audio, bluetooth-central)
├── eas.json                          # Cấu hình Expo EAS Build
├── package.json                      # Danh sách thư viện tương thích chuẩn Expo SDK 52
└── tsconfig.json                     # Cấu hình TypeScript
```

## 2. Phân tích Kỹ thuật & Huấn luyện theo Hồ sơ Cá nhân

| Thông số / Ràng buộc | Giá trị cấu hình trong Code | Cơ chế xử lý kỹ thuật & An toàn Y khoa |
| :--- | :--- | :--- |
| **Chuẩn BLE Nhịp tim** | Service `0x180D` / Char `0x2A37` | Giải mã bit `0` của byte Flags (`0x01`) trong [đặc tả GATT Heart Rate Service](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/HRS_v1.0/out/en/index-en.html) để tự động đọc cả định dạng `UINT8` lẫn `UINT16 Little-Endian` và tự động kết nối lại với hàm mũ lùi (`exponential backoff`) khi nhiễu sóng. |
| **Chống trùng lặp Strava** | Local-only Telemetry | App chỉ đọc luồng nhịp tim thời gian thực để nhắc âm thanh, hoàn toàn không ghi đè hay đẩy file `.fit`/`.gpx` lên Strava vì HUAWEI WATCH FIT 4 đã tự đồng bộ qua Huawei Health. |
| **Ngưỡng an toàn Tim mạch** | Hard Limit `>= 178 bpm` (30 giây) | Vượt nhẹ ngưỡng Lactate (`176 bpm`) và bảo vệ huyết áp nền (`128/88 mmHg`). Khi nhịp tim `>= 178 bpm` liên tục 30 giây, `audioCoach.ts` kích hoạt cờ `CRITICAL_HR` ngắt mọi thông báo khác để yêu cầu giảm tốc hoặc đi bộ 30 giây. |
| **Làm mượt GPS (Rolling Pace)** | Cửa sổ trượt `18–20s` hoặc `90m` | Lọc bỏ các điểm GPS có sai số ngang `accuracy > 25m` hoặc vận tốc tức thời ảo `> 7.5 m/s`, tính vận tốc trượt trên quãng đường thực tế giúp cảnh báo lệch Pace (`±10s/km` trong 20s, cooldown 45s) chính xác tuyệt đối. |
| **Audio Ducking trên iOS** | `InterruptionModeIOS.DuckOthers` | Trước khi đọc câu nhắc Tiếng Việt qua [Expo Speech](https://docs.expo.dev/versions/latest/sdk/speech/), `audioCoach.ts` chuyển `AVAudioSession` sang `DuckOthers` để nhạc Spotify/Apple Music nhỏ xuống êm ái, sau đó trả về `MixWithOthers` trong callback `onDone`. |
| **Metronome không cần file** | `170–175 bpm` (Mặc định `172 bpm`) | Tự động khởi tạo buffer âm thanh PCM WAV 16-bit (`createMetronomeTickDataUri`) trực tiếp trong RAM, giúp giữ guồng chân ngắn, giảm tải lực dội lên khớp gối ở mức cân nặng `73,7 kg`. |

## 3. Hướng dẫn Lệnh chạy trên Windows & Build file `.ipa` Miễn phí 100%

> **Lưu ý quan trọng về tài khoản Apple miễn phí ($0):**
> Dịch vụ đám mây [Expo EAS Build](https://docs.expo.dev/build/introduction/) khi đóng gói file `.ipa` cho thiết bị thật (`simulator: false`) sẽ yêu cầu đăng nhập tài khoản Apple Developer trả phí ($99/năm) để cấp Provisioning Profile trên cloud. Để **miễn phí 100% trên máy Windows**, cách tốt nhất là dùng **GitHub Actions (macOS Runner miễn phí 2.000 phút/tháng)** để biên dịch ra file `Sub60AudioPacer-unsigned.ipa`, sau đó dùng [Sideloadly](https://sideloadly.io/) trên Windows ký bằng **Apple ID cá nhân miễn phí** của bạn và cài thẳng vào iPhone!

### Bước 1: Khởi tạo dự án trên Windows (PowerShell / Command Prompt)

```powershell
# 1. Tạo thư mục dự án Expo mới
npx create-expo-app@latest sub60-audio-pacer --template blank-typescript
cd sub60-audio-pacer

# 2. Cài đặt toàn bộ gói thư viện chuẩn tương thích với Expo SDK
npx expo install expo-location expo-task-manager expo-speech expo-av expo-keep-awake expo-haptics react-native-ble-plx @config-plugins/react-native-ble-plx buffer react-native-safe-area-context

# 3. Tạo cấu trúc thư mục mã nguồn
mkdir src\data, src\hooks, src\services, src\screens, .github\workflows
```

Sau khi tạo xong thư mục, hãy chép các file đã được tạo sẵn (`package.json`, `app.json`, `eas.json`, `App.tsx`, `trainingPlan.json` vào `src/data/`, `useBleHeartRate.ts` & `useRunningPacer.ts` vào `src/hooks/`, `audioCoach.ts` vào `src/services/`, `HomeScreen.tsx` & `RunHudScreen.tsx` vào `src/screens/`).

### Bước 2: Tạo file GitHub Actions `.github/workflows/ios-unsigned-ipa.yml` (Build `.ipa` miễn phí trên macOS Cloud)

Tạo file `.github/workflows/ios-unsigned-ipa.yml` với nội dung sau:

```yaml
name: Build Unsigned iOS IPA for Sideloadly (100% Free)

on:
  workflow_dispatch:
  push:
    branches: [ main, master ]

jobs:
  build-ios-ipa:
    runs-on: macos-14
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - name: Expo Prebuild iOS Native Project
        run: npx expo prebuild --platform ios --clean

      - name: Install CocoaPods
        working-directory: ios
        run: pod install

      - name: Build Unsigned Release .app via Xcodebuild
        working-directory: ios
        run: |
          WORKSPACE=$(ls -d *.xcworkspace | head -n 1)
          SCHEME=$(basename "$WORKSPACE" .xcworkspace)
          xcodebuild -workspace "$WORKSPACE" \
            -scheme "$SCHEME" \
            -configuration Release \
            -sdk iphoneos \
            -derivedDataPath build \
            CODE_SIGN_IDENTITY="" \
            CODE_SIGNING_REQUIRED=NO \
            CODE_SIGNING_ALLOWED=NO \
             clean build

      - name: Package Payload into Sub60AudioPacer.ipa
        working-directory: ios
        run: |
          mkdir -p Payload
          APP_PATH=$(find build/Build/Products/Release-iphoneos -name "*.app" | head -n 1)
          cp -r "$APP_PATH" Payload/
          zip -r -9 Sub60AudioPacer-unsigned.ipa Payload

      - name: Upload .ipa Artifact for Sideloadly
        uses: actions/upload-artifact@v4
        with:
          name: Sub60AudioPacer-iOS-IPA
          path: ios/Sub60AudioPacer-unsigned.ipa
```

### Bước 3: Đẩy code lên GitHub & Cài file `.ipa` vào iPhone qua Sideloadly trên Windows

1. **Đẩy code lên GitHub từ Windows:**
   ```powershell
   git init
   git add .
   git commit -m "Initial MVP Sub60 Audio Pacer"
   git branch -M main
   git remote add origin https://github.com/<TEN_GITHUB_CUA_BAN>/sub60-audio-pacer.git
   git push -u origin main
   ```
2. **Tải file `.ipa`:** Mở tab **Actions** trên kho lưu trữ GitHub của bạn, đợi khoảng 8–12 phút để luồng `Build Unsigned iOS IPA for Sideloadly` chạy xong, sau đó tải gói **Sub60AudioPacer-iOS-IPA** về máy Windows và giải nén lấy file `Sub60AudioPacer-unsigned.ipa`.
3. **Cài đặt lên iPhone bằng [Sideloadly](https://sideloadly.io/):**
   * Cài đặt **iTunes** và **iCloud** bản chính thức từ trang chủ Apple cho Windows (không dùng bản Microsoft Store), sau đó mở [Sideloadly](https://sideloadly.io/).
   * Cắm cáp kết nối iPhone vào máy tính Windows, kéo file `Sub60AudioPacer-unsigned.ipa` vào ô **IPA** của Sideloadly, nhập **Apple ID miễn phí** của bạn và bấm **Start**.
   * Trên iPhone, vào **Cài đặt (Settings) &rarr; Cài đặt chung (General) &rarr; Quản lý VPN & Thiết bị (VPN & Device Management)** &rarr; chọn email Apple ID của bạn và bấm **Tin cậy (Trust)**, đồng thời bật **Chế độ Nhà phát triển (Developer Mode)** trong mục **Quyền riêng tư & Bảo mật (Privacy & Security)**.
4. **Chuẩn bị trước khi chạy bộ:**
   * Trên đồng hồ **HUAWEI WATCH FIT 4**: Vào **Cài đặt (Settings) &rarr; Thiết lập bài tập (Workout Settings) &rarr; Phát sóng dữ liệu nhịp tim (Heart Rate Data Broadcasts)** và bật lên.
   * Mở nhạc trên **Spotify / Apple Music** qua tai nghe Bluetooth, mở ứng dụng **Sub60 Audio Pacer**, bấm **Kết nối HUAWEI WATCH FIT 4**, chọn buổi chạy trong tuần, bấm **Bắt đầu chạy**, sau đó **khóa màn hình iPhone và bỏ vào túi chạy bộ**.

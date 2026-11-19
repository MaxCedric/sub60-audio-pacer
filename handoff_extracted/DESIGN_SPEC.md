# Sub60 Audio Pacer — UI/UX & Motion Spec for Antigravity

## 1. Brand Palette & Background
- **Background**: `#08090C` with 2-layer square tactical grid (`96px` `#4B2EFF` @ 12% + `24px` `#C8FF00` @ 5%) + subtle SVG `feTurbulence` noise grain overlay (`opacity: 0.25`, `mix-blend-mode: overlay`).
- **Primary Accent (Acid Lime)**: `#C8FF00`
- **Secondary Accent (Electric Purple)**: `#4B2EFF` (light tint `#9D85FF`)
- **Light Cards (Stage Cards, PACE/BPM, Telemetry Strip)**: `#F8FAFC` with `#08090C` pitch-black typography, `#C8FF00` / `#4B2EFF` 4px bottom/top accent borders, and subtle bottom-right halftone corner fade.

## 2. Typography & Golden Ratio (φ = 1.618)
- **Display Font**: `Barlow Condensed` (700, 800, 900; italic for live PACE & BPM numbers).
- **Body/UI Font**: `Space Grotesk` (400, 500, 600, 700).
- **Grid & Scale**: `1.618fr : 1fr` (61.8% : 38.2%) on Poster Hero & Run HUD Scoreboard (`PACE` 61.8% vs `BPM` 38.2%). Fibonacci type scale: `~84px` (PACE) -> `~55px` (BPM) -> `~34px` (Sub-metrics / KM) -> `~21px` (Stage Titles).
- **Chamfered Corners (`.contest-cut`)**: `clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))` (use `react-native-svg` or `Skia` in React Native/Expo).

## 3. Assets Included
- `index.html`: Complete working web reference (open in browser to inspect all animations & layouts).
- `assets/app-icon-variant-b.jpg`: Final locked-in App Icon (1024x1024).
- `assets/hero-track-banner.jpg`: Night track hero banner (16:9).

## 4. Key Components & Animations to Replicate
- **Header Wristband**: `#4B2EFF` top strip with checkered finish squares at both ends, `SUB60 WRISTBAND // 10.77°N 106.70°E`, `BIB #0060`.
- **Poster Hero**: Vertical `#C8FF00` marquee ribbon (`CHALLENGE`), `#4B2EFF` ribbon (`VER 1.0 // 10K`), slow Ken Burns zoom on `hero-track-banner.jpg`, sequential pulsing SVG chevrons (`>>>`), `STARTING` intro slide, 3D tilt on touch/move, and `#C8FF00` `FINALS 59 DAYS` countdown dial.
- **Stage Cards**: Light `#F8FAFC` cards with Nike-style 3-icon system (Oval 400m Track, Kinetic Swirl, Checkered Grid), proportional Zone mini-timeline bar, `NEXT` highlight with LightSweep + Bounce on the `▶ RUN` button, and `✓ DONE` sync.
- **Run HUD (5 Bands)**: Title/BLE/SIM -> Unified Segment Bar with checkered target -> Golden Ratio `PACE` / `BPM` Light Cards -> Unified `KM | TIME | SPM` + Audio Coach strip -> Watch-style circular controls (`68px` START vs `42px` Skip/SOS/Hold-Stop).
- **Candy-Crush PT Callout Popup**: Spring-bounce (`scale 0.35 -> 1.12 -> 1`) + 14 neon spark particles whenever Audio Coach speaks (`SWEET!`, `LEVEL UP!`, `KÌM CHÂN!`, `PUSH IT!`, `SLOW DOWN!`), auto-dismissing in 2.2s with `pointer-events: none`.

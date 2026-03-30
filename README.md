# Daily English

An iOS app for building daily English learning habits through 4 practice tasks: Reading, Writing & Speaking, Vocabulary, and Listening.

Standalone companion to the [English Learning Extension](https://github.com/cdcupt/english-learning-extension) Chrome extension.

## Features

### 4 Daily Practice Tasks

- **Reading** — AI-generated articles with comprehension quizzes
- **Write & Speak** — Write an essay → get AI feedback → practice speaking the corrected version
- **Vocabulary** — 20-word IELTS-style quiz with adaptive difficulty
- **Listening** — AI-generated passages with TTS audio and quiz questions

### Skill Tracking

- Score-based skill levels (1–10) mapped to CEFR (A1–C2), IELTS, and TOEFL equivalents
- Weekly summary bar chart and 30-day level growth curve
- Sub-skill breakdowns (e.g., grammar, coherence, inference)
- Adaptive difficulty — content gets harder as you level up

### Streak System

Complete all 4 tasks daily to build your streak. Track current and longest streaks on the Home dashboard.

## Screenshots

<!-- TODO: Add screenshots -->

## Requirements

- iOS 17.0+
- Xcode 15+
- An API key from one of: OpenAI, Claude, Kimi, DeepSeek, or Gemini

## Getting Started

1. Clone the repo
   ```bash
   git clone https://github.com/cdcupt/daily-english.git
   ```
2. Open `DailyEnglish.xcodeproj` in Xcode
3. Select an iPhone simulator and run (Cmd+R)
4. On first launch, go to **Me → Settings** and enter your AI provider API key
5. Start practicing!

## Tech Stack

- **SwiftUI** — Declarative UI with NavigationStack
- **SwiftData** — Local persistence (iOS 17+)
- **Swift Charts** — Weekly and growth visualizations
- **AVFoundation** — TTS audio playback
- **Speech Framework** — On-device speech recognition
- **URLSession** — AI provider API calls (no third-party dependencies)

## AI Providers

| Provider | API Format | Default Model |
|----------|-----------|---------------|
| OpenAI | OpenAI-compatible | gpt-4o-mini |
| Claude | Anthropic native | claude-sonnet-4-6 |
| Kimi | OpenAI-compatible | moonshot-v1-8k |
| DeepSeek | OpenAI-compatible | deepseek-chat |
| Gemini | OpenAI-compatible | gemini-2.5-flash |

## Project Structure

```
DailyEnglish/Sources/
├── App/           # Entry point, TabView
├── Models/        # SwiftData models, enums, level system
├── Services/      # AI client, TTS, speech recognition, coordinator
├── Views/         # Home, Reading, WritSpeak, Vocabulary, Listening, Profile
│   └── Components/  # Reusable UI (quiz, charts, cards)
└── Utils/         # AI prompts, extensions, design system
```

See [SKILL.md](SKILL.md) for the complete English skill system specification.

## License

MIT

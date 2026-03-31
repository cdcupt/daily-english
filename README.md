# Daily English

An iOS app for building daily English learning habits through 4 practice tasks: Reading, Writing, Vocabulary, and Listening.

Standalone companion to the [English Learning Extension](https://github.com/cdcupt/english-learning-extension) Chrome extension.

## Features

### 4 Daily Practice Tasks

- **Reading** — AI-generated articles with comprehension quizzes (main idea, detail, inference, vocabulary)
- **Writing** — Write an essay on a random topic, get AI feedback with sub-scores (grammar, vocabulary, coherence, task response), then practice speaking the corrected version with pronunciation evaluation
- **Vocabulary** — 20-word IELTS-style quiz with adaptive difficulty that increases as you level up
- **Listening** — AI-generated passages with TTS audio playback and 5 comprehension questions per session

### Skill Tracking

- Score-based skill levels (1-10) mapped to CEFR (A1-C2), IELTS, and TOEFL equivalents
- Weekly summary bar chart and 30-day level growth curve (Swift Charts)
- Sub-skill breakdowns per task (e.g., grammar, coherence, inference)
- Adaptive difficulty — AI generates harder content as you level up
- "My Level" detail screen showing CEFR/IELTS/TOEFL comparison

### Streak System

Complete all 4 tasks daily to build your streak. Track current and longest streaks on the Home dashboard with mascot encouragement.

### Config Sharing

- **Export** settings as `.elc` file (Share mode strips API keys, Backup mode includes everything)
- **Import** `.elc` config files — share mode preserves your local API keys, backup mode restores all

### Design

- Warm, friendly aesthetic inspired by [thevocabulary.app](https://thevocabulary.app/) and [monkeytaps.net](https://monkeytaps.net/)
- 5 cartoon mascot characters: Cat (Home), Owl (Reading), Fox (Writing), Bee (Vocabulary), Bear (Listening)
- Animated splash screen on launch
- Custom 6-tab bar with icon-only tabs and active dot indicator
- Colorful settings sheet with mascot-decorated section cards

## Screenshots

<!-- TODO: Add screenshots -->

## Requirements

- iOS 17.0+
- Xcode 15+
- An API key from one of the supported AI providers

## Getting Started

1. Clone the repo
   ```bash
   git clone https://github.com/cdcupt/daily-english.git
   ```
2. Open `DailyEnglish.xcodeproj` in Xcode
3. Select an iPhone simulator and run (Cmd+R)
4. On first launch, tap the gear icon on the **Me** tab to configure your AI provider and API key
5. Start practicing!

## Tech Stack

- **SwiftUI** — Declarative UI with NavigationStack
- **SwiftData** — Local persistence (iOS 17+)
- **Swift Charts** — Weekly bar chart and level growth line chart
- **AVFoundation** — TTS audio playback (OpenAI TTS, ByteDance TTS, system fallback)
- **Speech Framework** — On-device speech recognition for pronunciation practice
- **URLSession** — AI provider API calls
- **No third-party dependencies**

## AI Providers

| Provider | API Format | Default Model |
|----------|-----------|---------------|
| OpenAI | OpenAI-compatible | gpt-4o-mini |
| Claude | Anthropic native | claude-sonnet-4-6 |
| Kimi | OpenAI-compatible | moonshot-v1-8k |
| DeepSeek | OpenAI-compatible | deepseek-chat |
| Gemini | OpenAI-compatible | gemini-2.5-flash |

## TTS Providers

| Provider | Notes |
|----------|-------|
| System | iOS built-in AVSpeechSynthesizer (no API key needed) |
| OpenAI | High-quality TTS via OpenAI API (voice: alloy) |
| ByteDance | Volcengine TTS 2.0 — voices: Dacey (Female), Stokie (Female), Tim (Male) |

## Project Structure

```
DailyEnglish/Sources/
├── App/
│   ├── DailyEnglishApp.swift          # Entry point, SwiftData container, splash screen
│   └── ContentView.swift              # Custom 6-tab bar (Home, Reading, Writing, Vocab, Listening, Me)
├── Models/
│   ├── Enums.swift                    # AIProvider, TTSProvider, BytedanceVoice, Skill, EnglishLevel
│   ├── PracticeModels.swift           # Article, WritingEntry, VocabularyQuizDay, ListeningSession
│   ├── UserModels.swift               # AppSettings, DailyRecord
│   ├── StreakData.swift               # Streak tracking
│   └── DailySkillScore.swift          # Per-skill daily scores and level calculation
├── Services/
│   ├── AIService.swift                # Multi-provider AI client
│   ├── TTSService.swift               # OpenAI TTS + ByteDance TTS + system fallback
│   ├── SpeechRecognitionService.swift  # SFSpeechRecognizer wrapper
│   └── PracticeManager.swift          # Central coordinator (@Observable)
├── Views/
│   ├── SplashView.swift               # Animated launch screen with mascots
│   ├── HomeView.swift                 # Dashboard: tasks, skill progress
│   ├── ReadingView.swift              # Article list → detail → quiz
│   ├── WriteSpeakView.swift           # 5-phase: topic → write → feedback → speak → results
│   ├── VocabularyView.swift           # 20-word quiz flow
│   ├── ListeningView.swift            # Session list → audio + quiz
│   ├── ProfileView.swift              # Level overview, growth chart, settings sheet, config sharing
│   └── Components/
│       ├── TaskCardView.swift         # Task card for Home dashboard
│       ├── SkillProgressBar.swift     # Colored progress bar with level
│       ├── WeeklyChartView.swift      # 7-day bar chart
│       ├── LevelGrowthChart.swift     # 30-day line chart (4 skills)
│       ├── QuizQuestionView.swift     # Reusable multiple-choice question
│       └── AudioPlayerButton.swift    # Play/pause TTS button
└── Utils/
    ├── Prompts.swift                  # AI prompt templates + writing topics
    └── Extensions.swift               # Date, Color, Font, CardStyle helpers
```

See [SKILL.md](SKILL.md) for the complete English skill system specification.

## License

MIT

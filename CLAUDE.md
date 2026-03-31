# CLAUDE.md

## Project Overview

Daily English — an iOS app for building daily English learning habits. Standalone companion to the [english-learning-extension](https://github.com/cdcupt/english-learning-extension) Chrome extension (no data sync).

## Features

1. **Reading** — AI-generated articles + comprehension quizzes (3-5 MC questions, tagged by sub-skill)
2. **Writing** — Essay on random topic → AI feedback (4 sub-scores: grammar, vocabulary, coherence, task response) → TTS of corrected text → speech recording → pronunciation evaluation (60% accuracy + 40% fluency)
3. **Vocabulary** — Daily 20-word IELTS-style quiz with adaptive difficulty by level
4. **Listening** — AI-generated passages + TTS audio + 5 MC questions per session (tagged by sub-skill)
5. **Skill Progress** — Score-based levels (1-10) mapped to CEFR/IELTS/TOEFL, with weekly chart and 30-day growth curve
6. **Streak Tracking** — Complete all 4 tasks daily to build streaks
7. **Config Sharing** — Export/import settings as .elc files (share mode strips keys, backup keeps all)
8. **Animated Splash** — Launch screen with bouncing mascot characters

## Build & Run

Open `DailyEnglish.xcodeproj` in Xcode, select an iPhone simulator, and run (Cmd+R).

- Deployment target: iOS 17.0
- Language: Swift 5 / SwiftUI
- Persistence: SwiftData (auto-deletes store on schema migration failure during development)
- No external dependencies — uses URLSession, AVFoundation, Speech framework, Swift Charts

## Architecture

```
DailyEnglish/Sources/
├── App/
│   ├── DailyEnglishApp.swift          # Entry point, SwiftData modelContainer, splash → main transition
│   └── ContentView.swift              # Custom 6-tab bar (not system TabView — supports 6 tabs without "More")
├── Models/
│   ├── Enums.swift                    # AIProvider, TTSProvider, BytedanceVoice, Skill, EnglishLevel, ViewState
│   ├── PracticeModels.swift           # Article, WritingEntry, VocabularyQuizDay, ListeningSession + Codable structs
│   ├── UserModels.swift               # AppSettings (singleton), DailyRecord
│   ├── StreakData.swift               # StreakData (singleton)
│   └── DailySkillScore.swift          # Per-skill daily scores → level calculation
├── Services/
│   ├── AIService.swift                # Multi-provider AI client (OpenAI, Claude, Kimi, DeepSeek, Gemini)
│   ├── TTSService.swift               # OpenAI TTS + ByteDance TTS 2.0 (SSE) + AVSpeechSynthesizer fallback
│   ├── SpeechRecognitionService.swift  # SFSpeechRecognizer + AVAudioEngine wrapper
│   └── PracticeManager.swift          # Central coordinator (@Observable) — daily state, scores, streaks, TTS routing
├── Views/
│   ├── SplashView.swift               # Animated launch: mascots, gradient, pulsing dots
│   ├── HomeView.swift                 # Dashboard: greeting + streak, Today's Tasks (2x2 cards), Skill Progress bars
│   ├── ReadingView.swift              # Article list → detail → quiz (+ ArticleDetailView)
│   ├── WriteSpeakView.swift           # 5-phase state machine: topic → write → feedback → speak → results
│   ├── VocabularyView.swift           # Quiz start → one word at a time (20) → score + review
│   ├── ListeningView.swift            # Session list → audio player + quiz (+ ListeningSessionView)
│   ├── ProfileView.swift              # Level card, weekly chart, growth chart, settings sheet, config import/export, level detail
│   └── Components/
│       ├── TaskCardView.swift         # 2x2 task card for Home dashboard
│       ├── SkillProgressBar.swift     # Colored bar with level label
│       ├── WeeklyChartView.swift      # Swift Charts 7-day bar chart
│       ├── LevelGrowthChart.swift     # Swift Charts 30-day line chart (4 skill lines)
│       ├── QuizQuestionView.swift     # Reusable MC question (reading, vocab, listening)
│       └── AudioPlayerButton.swift    # Play/pause TTS button
└── Utils/
    ├── Prompts.swift                  # All AI prompt templates + 30 writing topics
    └── Extensions.swift               # Date helpers, Color design system (hex), SF Rounded fonts, CardStyle modifier
```

## Key Notes

- **Custom Tab Bar**: 6 tabs (Home, Reading, Writing, Vocabulary, Listening, Me) — icons only with dot indicator. Uses custom implementation instead of system TabView to avoid iOS 5-tab "More" overflow.
- **AI Providers**: OpenAI, Claude (Anthropic native format), Kimi, DeepSeek, Gemini — single `switch` on `usesAnthropicFormat` handles the API difference.
- **TTS Providers**: System (AVSpeechSynthesizer), OpenAI (`/v1/audio/speech`), ByteDance (Volcengine TTS 2.0 via SSE endpoint). Voices: Dacey, Stokie, Tim.
- **Skill Levels**: 1-10 based on average of daily best scores → CEFR A1-C2 mapping (see SKILL.md)
- **Scores displayed as fractions** (e.g., "17/20"), never percentages
- **Mascot characters**: Cat Cleo (Home/Settings), Owl Ollie (Reading), Fox Fenn (Writing), Bee Buzz (Vocabulary), Bear Benny (Listening)
- **SwiftData singletons**: AppSettings and StreakData — query first, create if missing
- **Schema migration**: On failure, deletes old store and recreates (dev-only safety net)
- **Audio session**: `.playback` for TTS, `.playAndRecord` for recording — `PracticeManager.playTTS()` routes to correct provider
- **Config sharing**: Export as `.elc` JSON (share strips keys, backup keeps all). Import merges with mode-aware logic.
- **Design system**: Colors in `Extensions.swift` — use `Color.appCharcoal`, `Color.skillReading`, etc. Always use `foregroundColor(Color.xxx)` not `foregroundStyle(.xxx)`.
- Bundle ID: `com.cdcupt.DailyEnglish`
- Display name: "Daily English"

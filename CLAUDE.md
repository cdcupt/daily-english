# CLAUDE.md

## Project Overview

Daily English — an iOS app for building daily English learning habits. Standalone companion to the [english-learning-extension](https://github.com/cdcupt/english-learning-extension) Chrome extension (no data sync).

## Features

1. **Reading** — AI-generated articles + comprehension quizzes (3-5 MC questions per article)
2. **Write & Speak** — Writing essay → AI feedback → TTS of corrected text → speech recording → pronunciation evaluation
3. **Vocabulary** — Daily 20-word IELTS-style quiz with adaptive difficulty
4. **Listening** — AI-generated passages + TTS audio + 5 MC questions per session
5. **Skill Progress** — Score-based levels (1-10) mapped to CEFR/IELTS/TOEFL, with growth charts
6. **Streak Tracking** — Complete all 4 tasks daily to build streaks

## Build & Run

Open `DailyEnglish.xcodeproj` in Xcode, select an iPhone simulator, and run (Cmd+R).

- Deployment target: iOS 17.0
- Language: Swift 5 / SwiftUI
- Persistence: SwiftData
- No external dependencies — uses URLSession, AVFoundation, Speech framework, Swift Charts

## Architecture

```
DailyEnglish/Sources/
├── App/
│   ├── DailyEnglishApp.swift       # Entry point, SwiftData modelContainer, PracticeManager init
│   └── ContentView.swift           # TabView (Home, Reading, Write&Speak, Vocabulary, Me)
├── Models/
│   ├── Enums.swift                 # AIProvider, ArticleTopic, Skill, EnglishLevel, ViewState
│   ├── PracticeModels.swift        # Article, WritingEntry, VocabularyQuizDay, ListeningSession
│   ├── UserModels.swift            # AppSettings (singleton), DailyRecord
│   ├── StreakData.swift            # StreakData (singleton)
│   └── DailySkillScore.swift       # Per-skill daily scores → level calculation
├── Services/
│   ├── AIService.swift             # Multi-provider AI client (OpenAI, Claude, Kimi, DeepSeek, Gemini)
│   ├── TTSService.swift            # OpenAI TTS + AVSpeechSynthesizer fallback
│   ├── SpeechRecognitionService.swift  # SFSpeechRecognizer wrapper
│   └── PracticeManager.swift       # Central coordinator (@Observable)
├── Views/
│   ├── HomeView.swift              # Dashboard: greeting, weekly chart, skill bars, task cards
│   ├── ReadingView.swift           # Article list → detail → quiz
│   ├── WriteSpeakView.swift        # 5-phase: topic → write → feedback → speak → results
│   ├── VocabularyView.swift        # 20-word quiz flow
│   ├── ListeningView.swift         # Session list → audio + quiz
│   ├── ProfileView.swift           # Level overview, growth chart, settings, level detail
│   └── Components/
│       ├── TaskCardView.swift      # 2x2 task card for dashboard
│       ├── SkillProgressBar.swift  # Colored bar with level label
│       ├── WeeklyChartView.swift   # Swift Charts 7-day bar chart
│       ├── LevelGrowthChart.swift  # Swift Charts 30-day line chart (4 skills)
│       ├── QuizQuestionView.swift  # Reusable MC question (reading, vocab, listening)
│       └── AudioPlayerButton.swift # Play/pause button
└── Utils/
    ├── Prompts.swift               # All AI prompt templates + writing topics
    └── Extensions.swift            # Date helpers, Color design system, Font helpers, CardStyle
```

## Key Notes

- **AI Providers**: OpenAI, Claude (Anthropic native format), Kimi, DeepSeek, Gemini (all OpenAI-compatible except Claude)
- **Skill Levels**: 1-10 based on average of daily best scores → CEFR A1-C2 mapping (see SKILL.md)
- **Scores displayed as fractions** (e.g., "17/20"), never percentages
- **Mascot characters**: Cat (Home), Owl (Reading), Fox (Writing), Bee (Vocabulary), Bear (Listening)
- **SwiftData singletons**: AppSettings and StreakData — query first, create if missing
- **Audio session**: .playback for TTS, .playAndRecord for recording — WriteSpeakView orchestrates
- Bundle ID: `com.cdcupt.DailyEnglish`
- Display name: "Daily English"

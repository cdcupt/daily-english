# CLAUDE.md

## Project Overview

Daily English — an iOS app for building daily English learning habits. Companion app to the [english-learning-extension](https://github.com/cdcupt/english-learning-extension) Chrome extension.

## Features (matching Chrome extension)

1. **Reading** — Article reading with comprehension quizzes
2. **Write & Speak** — Writing + speaking practice with AI feedback
3. **Vocabulary** — Daily vocabulary quiz (IELTS-style, 20 words)
4. **Listening** — Listening practice with audio
5. **Streak Tracking** — Complete all 4 tasks daily to build streaks

## Build & Run

Open `DailyEnglish.xcodeproj` in Xcode, select an iPhone simulator, and run (Cmd+R).

- Deployment target: iOS 17.0
- Language: Swift 5 / SwiftUI
- No external dependencies yet

## Architecture

```
DailyEnglish/
├── Sources/
│   ├── App/           # App entry point, ContentView (TabView)
│   ├── Views/         # Feature views (Reading, WritSpeak, Vocabulary, Listening, Profile)
│   ├── Models/        # Data models
│   ├── Services/      # API clients, persistence, AI integration
│   └── Utils/         # Helpers
└── Resources/
    └── Assets.xcassets
```

## Key Notes

- SwiftUI with NavigationStack (iOS 16+)
- Bundle ID: `com.cdcupt.DailyEnglish`
- Display name: "Daily English"

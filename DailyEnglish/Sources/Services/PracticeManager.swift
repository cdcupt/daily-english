import Foundation
import SwiftData
import SwiftUI

@Observable
final class PracticeManager {
    let modelContext: ModelContext
    let aiService: AIService
    let ttsService: TTSService
    let speechService: SpeechRecognitionService

    // Current state
    var todayRecord: DailyRecord?
    var streakData: StreakData?
    var settings: AppSettings?

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
        self.aiService = AIService()
        self.ttsService = TTSService()
        self.speechService = SpeechRecognitionService()
        loadState()
    }

    // MARK: - Load / Initialize State

    func loadState() {
        // Settings (singleton)
        let settingsDescriptor = FetchDescriptor<AppSettings>()
        if let existing = try? modelContext.fetch(settingsDescriptor).first {
            settings = existing
        } else {
            let newSettings = AppSettings()
            modelContext.insert(newSettings)
            settings = newSettings
        }

        // Sync AI service with settings
        if let settings {
            aiService.provider = settings.provider
            aiService.apiKey = settings.apiKey
            aiService.model = settings.aiModel
        }

        // Streak (singleton)
        let streakDescriptor = FetchDescriptor<StreakData>()
        if let existing = try? modelContext.fetch(streakDescriptor).first {
            streakData = existing
        } else {
            let newStreak = StreakData()
            modelContext.insert(newStreak)
            streakData = newStreak
        }

        // Today's record
        loadTodayRecord()
    }

    func loadTodayRecord() {
        let today = Calendar.current.startOfDay(for: .now)
        let descriptor = FetchDescriptor<DailyRecord>(
            predicate: #Predicate { $0.date == today }
        )
        if let existing = try? modelContext.fetch(descriptor).first {
            todayRecord = existing
        } else {
            let newRecord = DailyRecord(date: .now)
            modelContext.insert(newRecord)
            todayRecord = newRecord
        }
    }

    // MARK: - Settings Sync

    func syncAISettings() {
        guard let settings else { return }
        aiService.provider = settings.provider
        aiService.apiKey = settings.apiKey
        aiService.model = settings.aiModel
    }

    var isConfigured: Bool {
        guard let settings else { return false }
        return !settings.apiKey.isEmpty
    }

    // MARK: - Skill Level Queries

    func skillLevel(for skill: Skill) -> EnglishLevel {
        let scores = fetchAllScores(for: skill)
        return DailySkillScore.level(from: scores)
    }

    func skillAverageScore(for skill: Skill) -> Int {
        let scores = fetchAllScores(for: skill)
        return DailySkillScore.averageScore(from: scores)
    }

    func recentScores(for skill: Skill, days: Int = 14) -> [DailySkillScore] {
        let skillRaw = skill.rawValue
        let startDate = Calendar.current.date(byAdding: .day, value: -days, to: .now)!.startOfDay
        let descriptor = FetchDescriptor<DailySkillScore>(
            predicate: #Predicate { $0.skill == skillRaw && $0.date >= startDate },
            sortBy: [SortDescriptor(\.date)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func fetchAllScores(for skill: Skill) -> [DailySkillScore] {
        let skillRaw = skill.rawValue
        let descriptor = FetchDescriptor<DailySkillScore>(
            predicate: #Predicate { $0.skill == skillRaw }
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    // MARK: - Overall Level

    func overallLevel() -> EnglishLevel {
        let scores = Skill.allCases.map { skillAverageScore(for: $0) }
        let avg = scores.isEmpty ? 0 : scores.reduce(0, +) / scores.count
        return EnglishLevel.from(averageScore: avg)
    }

    // MARK: - Record Score

    func recordScore(skill: Skill, numerator: Int, denominator: Int, subScores: [String: Int] = [:]) {
        let today = Calendar.current.startOfDay(for: .now)
        let skillRaw = skill.rawValue
        let descriptor = FetchDescriptor<DailySkillScore>(
            predicate: #Predicate { $0.skill == skillRaw && $0.date == today }
        )

        let newScore = denominator > 0
            ? Int(round(Double(numerator) / Double(denominator) * 100))
            : 0

        if let existing = try? modelContext.fetch(descriptor).first {
            // Update if new score is better
            if newScore > existing.bestScore {
                existing.bestScore = newScore
                existing.scoreNumerator = numerator
                existing.scoreDenominator = denominator
                existing.subScores = subScores
            }
        } else {
            let score = DailySkillScore(
                skill: skill,
                date: .now,
                scoreNumerator: numerator,
                scoreDenominator: denominator,
                subScores: subScores
            )
            modelContext.insert(score)
        }

        try? modelContext.save()
    }

    // MARK: - Task Completion

    func markTaskCompleted(_ skill: Skill) {
        guard let todayRecord else { return }

        switch skill {
        case .reading: todayRecord.readingCompleted = true
        case .writing: todayRecord.writeSpeakCompleted = true
        case .vocabulary: todayRecord.vocabularyCompleted = true
        case .listening: todayRecord.listeningCompleted = true
        }

        updateStreak()
        try? modelContext.save()
    }

    private func updateStreak() {
        guard let todayRecord, todayRecord.allCompleted, let streakData else { return }
        streakData.update(for: todayRecord.date)
        try? modelContext.save()
    }

    // MARK: - Weekly Data

    func weeklyRecords() -> [(date: Date, record: DailyRecord?)] {
        let weekDays = Date.now.daysInCurrentWeek()
        return weekDays.map { day in
            let startOfDay = day.startOfDay
            let descriptor = FetchDescriptor<DailyRecord>(
                predicate: #Predicate { $0.date == startOfDay }
            )
            let record = try? modelContext.fetch(descriptor).first
            return (date: day, record: record)
        }
    }

    // MARK: - Reading

    func loadTodayArticles() -> [Article] {
        let today = Calendar.current.startOfDay(for: .now)
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: today)!
        let descriptor = FetchDescriptor<Article>(
            predicate: #Predicate { $0.dateGenerated >= today && $0.dateGenerated < tomorrow },
            sortBy: [SortDescriptor(\.dateGenerated)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    func generateArticles() async throws -> [Article] {
        let count = settings?.articlesPerDay ?? 3
        let level = skillLevel(for: .reading).level
        var articles: [Article] = []

        for _ in 0..<count {
            let topic = ArticleTopic.allCases.randomElement()!
            let response = try await aiService.generateArticle(topic: topic, level: level)
            let article = Article(topic: response.topic, title: response.title, content: response.content)
            modelContext.insert(article)
            articles.append(article)
        }

        try? modelContext.save()
        return articles
    }

    // MARK: - Vocabulary

    func loadTodayVocabulary() -> VocabularyQuizDay? {
        let today = Calendar.current.startOfDay(for: .now)
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: today)!
        let descriptor = FetchDescriptor<VocabularyQuizDay>(
            predicate: #Predicate { $0.date >= today && $0.date < tomorrow }
        )
        return try? modelContext.fetch(descriptor).first
    }

    func generateVocabularyQuiz() async throws -> VocabularyQuizDay {
        let level = skillLevel(for: .vocabulary).level
        let words = try await aiService.generateVocabularyWords(level: level)
        let quiz = VocabularyQuizDay(words: words)
        modelContext.insert(quiz)
        try? modelContext.save()
        return quiz
    }

    // MARK: - Listening

    func loadTodayListeningSessions() -> [ListeningSession] {
        let today = Calendar.current.startOfDay(for: .now)
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: today)!
        let descriptor = FetchDescriptor<ListeningSession>(
            predicate: #Predicate { $0.date >= today && $0.date < tomorrow },
            sortBy: [SortDescriptor(\.sessionIndex)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    // MARK: - Writing

    func loadTodayWriting() -> WritingEntry? {
        let today = Calendar.current.startOfDay(for: .now)
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: today)!
        let descriptor = FetchDescriptor<WritingEntry>(
            predicate: #Predicate { $0.date >= today && $0.date < tomorrow }
        )
        return try? modelContext.fetch(descriptor).first
    }
}

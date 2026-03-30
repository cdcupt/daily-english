import Foundation
import SwiftData

// MARK: - App Settings (singleton)

@Model
final class AppSettings {
    var id: UUID
    var aiProvider: String  // AIProvider rawValue
    var apiKey: String
    var aiModel: String  // allows custom model override
    var articlesPerDay: Int
    var listeningSessionsPerDay: Int
    var useTTSOpenAI: Bool
    var openAITTSApiKey: String?
    var ttsVoice: String

    var provider: AIProvider {
        get { AIProvider(rawValue: aiProvider) ?? .openai }
        set { aiProvider = newValue.rawValue }
    }

    init() {
        self.id = UUID()
        self.aiProvider = AIProvider.openai.rawValue
        self.apiKey = ""
        self.aiModel = ""
        self.articlesPerDay = 3
        self.listeningSessionsPerDay = 3
        self.useTTSOpenAI = true
        self.openAITTSApiKey = nil
        self.ttsVoice = "alloy"
    }
}

// MARK: - Daily Record

@Model
final class DailyRecord {
    var id: UUID
    var date: Date
    var readingCompleted: Bool
    var writeSpeakCompleted: Bool
    var vocabularyCompleted: Bool
    var listeningCompleted: Bool

    var allCompleted: Bool {
        readingCompleted && writeSpeakCompleted && vocabularyCompleted && listeningCompleted
    }

    var completedCount: Int {
        [readingCompleted, writeSpeakCompleted, vocabularyCompleted, listeningCompleted]
            .filter { $0 }.count
    }

    init(date: Date) {
        self.id = UUID()
        self.date = Calendar.current.startOfDay(for: date)
        self.readingCompleted = false
        self.writeSpeakCompleted = false
        self.vocabularyCompleted = false
        self.listeningCompleted = false
    }
}

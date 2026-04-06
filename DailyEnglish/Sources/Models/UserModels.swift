import Foundation
import SwiftData

// MARK: - App Settings (singleton)

@Model
final class AppSettings {
    var id: UUID
    // AI Provider
    var aiProvider: String  // AIProvider rawValue
    var apiKey: String
    var aiModel: String  // allows custom model override
    // Practice
    var articlesPerDay: Int
    var listeningSessionsPerDay: Int
    // TTS
    var ttsProvider: String  // TTSProvider rawValue
    var openAITTSApiKey: String?
    var openAITTSVoice: String
    // Gemini TTS
    var geminiVoice: String  // GeminiVoice rawValue
    // ByteDance TTS
    var bytedanceAppId: String
    var bytedanceToken: String
    var bytedanceCluster: String
    var bytedanceVoice: String  // BytedanceVoice rawValue
    // Demo Mode
    var demoMode: Bool

    var provider: AIProvider {
        get { AIProvider(rawValue: aiProvider) ?? .gemini }
        set { aiProvider = newValue.rawValue }
    }

    var ttsProviderEnum: TTSProvider {
        get { TTSProvider(rawValue: ttsProvider) ?? .system }
        set { ttsProvider = newValue.rawValue }
    }

    var geminiVoiceEnum: GeminiVoice {
        get { GeminiVoice(rawValue: geminiVoice) ?? .kore }
        set { geminiVoice = newValue.rawValue }
    }

    var openAIVoiceEnum: OpenAIVoice {
        get { OpenAIVoice(rawValue: openAITTSVoice) ?? .marin }
        set { openAITTSVoice = newValue.rawValue }
    }

    var bytedanceVoiceEnum: BytedanceVoice {
        get { BytedanceVoice(rawValue: bytedanceVoice) ?? .dacey }
        set { bytedanceVoice = newValue.rawValue }
    }

    init() {
        self.id = UUID()
        self.aiProvider = AIProvider.gemini.rawValue
        self.apiKey = ""
        self.aiModel = ""
        self.articlesPerDay = 3
        self.listeningSessionsPerDay = 3
        self.ttsProvider = TTSProvider.system.rawValue
        self.openAITTSApiKey = nil
        self.openAITTSVoice = OpenAIVoice.marin.rawValue
        self.geminiVoice = GeminiVoice.kore.rawValue
        self.bytedanceAppId = ""
        self.bytedanceToken = ""
        self.bytedanceCluster = "volcano_tts"
        self.bytedanceVoice = BytedanceVoice.dacey.rawValue
        self.demoMode = false
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

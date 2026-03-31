import Foundation

// MARK: - AI Provider

enum AIProvider: String, Codable, CaseIterable, Identifiable {
    case openai
    case claude
    case kimi
    case deepseek
    case gemini

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .openai: "OpenAI"
        case .claude: "Claude"
        case .kimi: "Kimi"
        case .deepseek: "DeepSeek"
        case .gemini: "Gemini"
        }
    }

    var baseURL: String {
        switch self {
        case .openai: "https://api.openai.com/v1/chat/completions"
        case .claude: "https://api.anthropic.com/v1/messages"
        case .kimi: "https://api.moonshot.cn/v1/chat/completions"
        case .deepseek: "https://api.deepseek.com/v1/chat/completions"
        case .gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        }
    }

    var defaultModel: String {
        switch self {
        case .openai: "gpt-4o-mini"
        case .claude: "claude-sonnet-4-6"
        case .kimi: "moonshot-v1-8k"
        case .deepseek: "deepseek-chat"
        case .gemini: "gemini-2.5-flash"
        }
    }

    var usesAnthropicFormat: Bool {
        self == .claude
    }
}

// MARK: - Article Topic

enum ArticleTopic: String, Codable, CaseIterable, Identifiable {
    case tech
    case science
    case globalAffairs
    case environment
    case health
    case business
    case education
    case culture

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .tech: "Technology"
        case .science: "Science"
        case .globalAffairs: "Global Affairs"
        case .environment: "Environment"
        case .health: "Health"
        case .business: "Business"
        case .education: "Education"
        case .culture: "Culture"
        }
    }
}

// MARK: - Skill

enum Skill: String, Codable, CaseIterable, Identifiable {
    case reading
    case writing
    case vocabulary
    case listening

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .reading: "Reading"
        case .writing: "Writing"
        case .vocabulary: "Vocabulary"
        case .listening: "Listening"
        }
    }

    var icon: String {
        switch self {
        case .reading: "book.fill"
        case .writing: "pencil.line"
        case .vocabulary: "textformat.abc"
        case .listening: "headphones"
        }
    }

    var mascotName: String {
        switch self {
        case .reading: "Ollie"
        case .writing: "Fenn"
        case .vocabulary: "Buzz"
        case .listening: "Benny"
        }
    }
}

// MARK: - English Level

struct EnglishLevel {
    let level: Int
    let label: String
    let cefr: String
    let scoreRange: ClosedRange<Int>
    let ielts: String
    let toefl: String
    let cefrDescription: String

    static let levels: [EnglishLevel] = [
        EnglishLevel(level: 1, label: "Beginner", cefr: "A1", scoreRange: 0...19, ielts: "-", toefl: "-",
                     cefrDescription: "Can understand and use familiar everyday expressions and very basic phrases."),
        EnglishLevel(level: 2, label: "Elementary", cefr: "A1+", scoreRange: 20...34, ielts: "3.0", toefl: "-",
                     cefrDescription: "Can introduce themselves and ask simple questions about personal details."),
        EnglishLevel(level: 3, label: "Pre-Intermediate", cefr: "A2", scoreRange: 35...49, ielts: "3.5", toefl: "32",
                     cefrDescription: "Can communicate in simple and routine tasks on familiar topics."),
        EnglishLevel(level: 4, label: "Intermediate", cefr: "B1", scoreRange: 50...59, ielts: "4.5", toefl: "42",
                     cefrDescription: "Can deal with most situations likely to arise while travelling."),
        EnglishLevel(level: 5, label: "Upper-Intermediate", cefr: "B1+", scoreRange: 60...69, ielts: "5.5", toefl: "60",
                     cefrDescription: "Can understand the main points of clear standard input on familiar matters."),
        EnglishLevel(level: 6, label: "Pre-Advanced", cefr: "B2", scoreRange: 70...76, ielts: "6.0", toefl: "79",
                     cefrDescription: "Can understand the main ideas of complex text, interact fluently with native speakers."),
        EnglishLevel(level: 7, label: "Advanced", cefr: "B2+", scoreRange: 77...83, ielts: "6.5", toefl: "93",
                     cefrDescription: "Can produce clear, detailed text on a wide range of subjects."),
        EnglishLevel(level: 8, label: "Upper-Advanced", cefr: "C1", scoreRange: 84...89, ielts: "7.0", toefl: "100",
                     cefrDescription: "Can express ideas fluently and spontaneously, use language flexibly for professional purposes."),
        EnglishLevel(level: 9, label: "Expert", cefr: "C1+", scoreRange: 90...95, ielts: "8.0", toefl: "110",
                     cefrDescription: "Can understand a wide range of demanding, longer texts and recognize implicit meaning."),
        EnglishLevel(level: 10, label: "Master", cefr: "C2", scoreRange: 96...100, ielts: "9.0", toefl: "118",
                     cefrDescription: "Can understand virtually everything heard or read, express with precision and fluency."),
    ]

    static func from(averageScore: Int) -> EnglishLevel {
        let clamped = max(0, min(100, averageScore))
        return levels.last(where: { $0.scoreRange.lowerBound <= clamped }) ?? levels[0]
    }
}

// MARK: - TTS Provider

enum TTSProvider: String, Codable, CaseIterable, Identifiable {
    case system
    case openai
    case bytedance

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .system: "System"
        case .openai: "OpenAI"
        case .bytedance: "ByteDance"
        }
    }
}

// MARK: - ByteDance Voice

enum BytedanceVoice: String, Codable, CaseIterable, Identifiable {
    case dacey = "en_female_dacey_uranus_bigtts"
    case jackson = "BV504_streaming"
    case ariana = "BV503_streaming"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .dacey: "Dacey (English Female - TTS 2.0)"
        case .jackson: "Jackson (English Male)"
        case .ariana: "Ariana (English Female)"
        }
    }
}

// MARK: - Quiz Question Sub-skill Tags

enum ReadingSubSkill: String, Codable {
    case mainIdea = "main_idea"
    case detail
    case inference
    case vocabulary
}

enum ListeningSubSkill: String, Codable {
    case recall
    case intent
    case inference
    case sequence
    case vocabulary
}

// MARK: - View State

enum ViewState<T> {
    case idle
    case loading
    case loaded(T)
    case error(Error)
}

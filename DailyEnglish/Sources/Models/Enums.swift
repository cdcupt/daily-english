import Foundation

// MARK: - AI Provider

struct AIModel: Identifiable {
    let id: String
    let displayName: String
    let price: String

    init(_ id: String, name: String, price: String) {
        self.id = id
        self.displayName = name
        self.price = price
    }
}

enum AIProvider: String, Codable, CaseIterable, Identifiable {
    case gemini
    case openai
    case kimi

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .gemini: "Gemini"
        case .openai: "OpenAI"
        case .kimi: "Kimi"
        }
    }

    var baseURL: String {
        switch self {
        case .gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
        case .openai: "https://api.openai.com/v1/chat/completions"
        case .kimi: "https://api.moonshot.cn/v1/chat/completions"
        }
    }

    var defaultModel: String {
        availableModels.first?.id ?? ""
    }

    var availableModels: [AIModel] {
        switch self {
        case .gemini:
            [
                AIModel("gemini-3.1-flash-lite-preview", name: "Gemini 3.1 Flash Lite", price: "$0.25~$1.50"),
                AIModel("gemini-3-flash-preview", name: "Gemini 3 Flash", price: "$0.50~$3"),
                AIModel("gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", price: "$2~$12"),
            ]
        case .openai:
            [
                AIModel("gpt-5.4-nano", name: "GPT-5.4 Nano", price: "$0.20~$1.25"),
                AIModel("gpt-5.4-mini", name: "GPT-5.4 Mini", price: "$0.75~$4.50"),
                AIModel("gpt-5.4", name: "GPT-5.4", price: "$2.50~$15"),
            ]
        case .kimi:
            [
                AIModel("kimi-k2.5", name: "Kimi K2.5", price: "$0.60~$2.50"),
                AIModel("kimi-k2-turbo-preview", name: "Kimi K2 Turbo", price: "$0.60~$2.50"),
                AIModel("kimi-k2-thinking", name: "Kimi K2 Thinking", price: "$0.60~$3"),
            ]
        }
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
    case gemini
    case openai
    case bytedance

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .system: "System"
        case .gemini: "Gemini"
        case .openai: "OpenAI"
        case .bytedance: "ByteDance"
        }
    }
}

// MARK: - Gemini TTS Voice

enum GeminiVoice: String, Codable, CaseIterable, Identifiable {
    case kore = "Kore"
    case puck = "Puck"
    case aoede = "Aoede"
    case charon = "Charon"
    case fenrir = "Fenrir"
    case leda = "Leda"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .kore: "Kore (Female)"
        case .puck: "Puck (Male)"
        case .aoede: "Aoede (Female)"
        case .charon: "Charon (Male)"
        case .fenrir: "Fenrir (Male)"
        case .leda: "Leda (Female)"
        }
    }
}

// MARK: - OpenAI TTS Voice

enum OpenAIVoice: String, Codable, CaseIterable, Identifiable {
    case marin
    case cedar
    case alloy
    case coral
    case nova
    case sage
    case ash
    case ballad
    case echo
    case fable
    case onyx
    case shimmer
    case verse

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .marin: "Marin ★"
        case .cedar: "Cedar ★"
        case .alloy: "Alloy"
        case .coral: "Coral"
        case .nova: "Nova"
        case .sage: "Sage"
        case .ash: "Ash"
        case .ballad: "Ballad"
        case .echo: "Echo"
        case .fable: "Fable"
        case .onyx: "Onyx"
        case .shimmer: "Shimmer"
        case .verse: "Verse"
        }
    }
}

// MARK: - ByteDance Voice

enum BytedanceVoice: String, Codable, CaseIterable, Identifiable {
    case dacey = "en_female_dacey_uranus_bigtts"
    case stokie = "en_female_stokie_uranus_bigtts"
    case tim = "en_male_tim_uranus_bigtts"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .dacey: "Dacey (Female)"
        case .stokie: "Stokie (Female)"
        case .tim: "Tim (Male)"
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

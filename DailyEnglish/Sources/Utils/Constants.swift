import Foundation

enum AppConstants {
    /// Verbatim CEFR disclaimer required on every surface that shows a level.
    static let cefrDisclaimer =
        "Your current CEFR level is an AI estimate for learning reference only. " +
        "It is not an official language test score or certification."

    static let supportedNativeLanguages: [String] = [
        "中文 (Chinese)", "English", "日本語 (Japanese)", "한국어 (Korean)", "Español (Spanish)",
    ]

    static let dimensionOrder: [String] = [
        "vocabulary", "grammar", "coherence", "interaction", "fluency", "pronunciation",
    ]

    static func dimensionLabel(_ key: String) -> String {
        key.prefix(1).uppercased() + key.dropFirst()
    }
}

import Foundation
import SwiftData

// MARK: - Daily Skill Score

@Model
final class DailySkillScore {
    var id: UUID
    var skill: String  // Skill rawValue
    var date: Date
    var bestScore: Int  // 0-100
    var scoreNumerator: Int  // e.g., 17
    var scoreDenominator: Int  // e.g., 20
    var subScores: [String: Int]  // e.g., {"grammar": 20, "vocabulary": 22}

    /// Display string like "17/20"
    var scoreDisplay: String {
        "\(scoreNumerator)/\(scoreDenominator)"
    }

    init(skill: Skill, date: Date, scoreNumerator: Int, scoreDenominator: Int, subScores: [String: Int] = [:]) {
        self.id = UUID()
        self.skill = skill.rawValue
        self.date = Calendar.current.startOfDay(for: date)
        self.scoreNumerator = scoreNumerator
        self.scoreDenominator = scoreDenominator
        self.bestScore = scoreDenominator > 0
            ? Int(round(Double(scoreNumerator) / Double(scoreDenominator) * 100))
            : 0
        self.subScores = subScores
    }

    // MARK: - Level Calculation

    /// Calculate the level for a skill from an array of daily scores
    static func averageScore(from scores: [DailySkillScore]) -> Int {
        guard !scores.isEmpty else { return 0 }
        let total = scores.reduce(0) { $0 + $1.bestScore }
        return total / scores.count
    }

    static func level(from scores: [DailySkillScore]) -> EnglishLevel {
        EnglishLevel.from(averageScore: averageScore(from: scores))
    }
}

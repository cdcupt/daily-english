import Foundation
import SwiftData

// MARK: - Streak Data (singleton)

@Model
final class StreakData {
    var id: UUID
    var currentStreak: Int
    var longestStreak: Int
    var lastPerfectDate: Date?

    init() {
        self.id = UUID()
        self.currentStreak = 0
        self.longestStreak = 0
        self.lastPerfectDate = nil
    }

    func update(for completedDate: Date) {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: completedDate)

        if let lastDate = lastPerfectDate {
            let lastDay = calendar.startOfDay(for: lastDate)
            let daysBetween = calendar.dateComponents([.day], from: lastDay, to: today).day ?? 0

            if daysBetween == 1 {
                // Consecutive day
                currentStreak += 1
            } else if daysBetween == 0 {
                // Same day, no change
                return
            } else {
                // Streak broken
                currentStreak = 1
            }
        } else {
            // First perfect day
            currentStreak = 1
        }

        longestStreak = max(longestStreak, currentStreak)
        lastPerfectDate = today
    }
}

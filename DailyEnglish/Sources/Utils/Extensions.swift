import Foundation
import SwiftUI

// MARK: - Date Extensions

extension Date {
    var startOfDay: Date {
        Calendar.current.startOfDay(for: self)
    }

    func isSameDay(as other: Date) -> Bool {
        Calendar.current.isDate(self, inSameDayAs: other)
    }

    /// Monday = 0, Sunday = 6
    var weekdayIndex: Int {
        let weekday = Calendar.current.component(.weekday, from: self)
        // Calendar weekday: 1=Sun, 2=Mon, ..., 7=Sat
        return (weekday + 5) % 7
    }

    /// Returns dates for Mon-Sun of the current week
    func daysInCurrentWeek() -> [Date] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: self)
        let weekdayOffset = today.weekdayIndex
        let monday = calendar.date(byAdding: .day, value: -weekdayOffset, to: today)!
        return (0..<7).map { calendar.date(byAdding: .day, value: $0, to: monday)! }
    }

    var shortWeekdayName: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        return formatter.string(from: self)
    }

    var formattedDate: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d"
        return formatter.string(from: self)
    }
}

// MARK: - Color Extensions (Design System)

extension Color {
    // Background
    static let appBackground = Color(hex: "FAF8F5")

    // Primary accent
    static let appTeal = Color(hex: "14B8A6")

    // Secondary
    static let appCoral = Color(hex: "F97316")

    // Success
    static let appGreen = Color(hex: "22C55E")

    // Text
    static let appCharcoal = Color(hex: "1C1917")
    static let appWarmGray = Color(hex: "78716C")

    // Skill colors
    static let skillReading = Color(hex: "3B82F6")
    static let skillWriting = Color(hex: "8B5CF6")
    static let skillVocabulary = Color(hex: "F59E0B")
    static let skillListening = Color(hex: "EC4899")

    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b: UInt64
        (r, g, b) = ((int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: 1
        )
    }
}

extension Skill {
    var color: Color {
        switch self {
        case .reading: .skillReading
        case .writing: .skillWriting
        case .vocabulary: .skillVocabulary
        case .listening: .skillListening
        }
    }
}

// MARK: - Font Extensions (SF Rounded)

extension Font {
    static func roundedTitle() -> Font {
        .system(.title, design: .rounded, weight: .bold)
    }

    static func roundedTitle2() -> Font {
        .system(.title2, design: .rounded, weight: .bold)
    }

    static func roundedTitle3() -> Font {
        .system(.title3, design: .rounded, weight: .semibold)
    }

    static func roundedHeadline() -> Font {
        .system(.headline, design: .rounded, weight: .semibold)
    }

    static func roundedLargeNumber() -> Font {
        .system(size: 42, weight: .bold, design: .rounded)
    }

    static func roundedScore() -> Font {
        .system(size: 24, weight: .bold, design: .rounded)
    }
}

// MARK: - Card Modifier

struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .shadow(color: .black.opacity(0.05), radius: 12, y: 6)
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardStyle())
    }

    func mascotStyle(cornerRadius: CGFloat = 10) -> some View {
        self
            .background(Color.appBackground)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
    }
}

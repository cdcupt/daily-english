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
    // Warm editorial surfaces
    static let appBackground = Color(hex: "FAF8F5")
    static let appPaper = Color(hex: "FFFDFB")
    static let appBorder = Color(hex: "EBE4DC")

    // Semantic accents — Teal = action, Coral = correction, Violet = CEFR/progress
    static let appTeal = Color(hex: "14B8A6")
    static let appCoral = Color(hex: "F97316")
    static let appViolet = Color(hex: "8B5CF6")

    // Success
    static let appGreen = Color(hex: "22C55E")

    // Text
    static let appCharcoal = Color(hex: "1C1917")
    static let appWarmGray = Color(hex: "78716C")

    // 3-tier feedback diff (original struck coral → corrected teal → natural violet)
    static let diffOriginal = Color(hex: "EF4444")
    static let diffCorrected = Color(hex: "0D9488")
    static let diffNatural = Color(hex: "7C3AED")

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
    var cornerRadius: CGFloat = 20
    func body(content: Content) -> some View {
        content
            .background(Color.appPaper)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(Color.appBorder, lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.04), radius: 14, y: 8)
    }
}

extension View {
    func cardStyle(cornerRadius: CGFloat = 20) -> some View {
        modifier(CardStyle(cornerRadius: cornerRadius))
    }
}

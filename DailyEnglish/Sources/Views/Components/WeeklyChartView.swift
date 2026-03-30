import Charts
import SwiftUI

struct WeeklyChartView: View {
    let weekData: [(date: Date, record: DailyRecord?)]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("This Week")
                    .font(.roundedHeadline())
                    .foregroundStyle(.appCharcoal)

                Spacer()

                Text("\(completedDays)/7 days")
                    .font(.caption)
                    .foregroundStyle(.appWarmGray)
            }

            Chart(weekData, id: \.date) { item in
                BarMark(
                    x: .value("Day", item.date.shortWeekdayName),
                    y: .value("Tasks", item.record?.completedCount ?? 0)
                )
                .foregroundStyle(barColor(for: item))
                .cornerRadius(6)
            }
            .chartYScale(domain: 0...4)
            .chartYAxis {
                AxisMarks(values: [0, 1, 2, 3, 4]) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let intValue = value.as(Int.self) {
                            Text("\(intValue)")
                                .font(.caption2)
                                .foregroundStyle(.appWarmGray)
                        }
                    }
                }
            }
            .frame(height: 120)
        }
        .padding(16)
        .cardStyle()
    }

    private var completedDays: Int {
        weekData.filter { $0.record?.allCompleted == true }.count
    }

    private func barColor(for item: (date: Date, record: DailyRecord?)) -> Color {
        guard let record = item.record else { return Color.gray.opacity(0.2) }
        if record.allCompleted {
            return .appTeal
        } else if record.completedCount > 0 {
            return .appTeal.opacity(0.4)
        }
        return Color.gray.opacity(0.2)
    }
}

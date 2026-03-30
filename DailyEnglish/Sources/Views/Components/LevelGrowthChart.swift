import Charts
import SwiftUI

struct LevelGrowthChart: View {
    let scores: [Skill: [DailySkillScore]]
    var showLegend: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Level Growth")
                .font(.roundedHeadline())
                .foregroundStyle(.appCharcoal)

            Chart {
                ForEach(Skill.allCases) { skill in
                    if let skillScores = scores[skill] {
                        ForEach(skillScores, id: \.id) { score in
                            LineMark(
                                x: .value("Date", score.date),
                                y: .value("Score", score.bestScore)
                            )
                            .foregroundStyle(skill.color)
                            .interpolationMethod(.catmullRom)

                            PointMark(
                                x: .value("Date", score.date),
                                y: .value("Score", score.bestScore)
                            )
                            .foregroundStyle(skill.color)
                            .symbolSize(20)
                        }
                    }
                }

                // Level threshold lines
                ForEach([20, 35, 50, 60, 70, 77, 84, 90, 96], id: \.self) { threshold in
                    RuleMark(y: .value("Level", threshold))
                        .foregroundStyle(.gray.opacity(0.2))
                        .lineStyle(StrokeStyle(dash: [4, 4]))
                }
            }
            .chartYScale(domain: 0...100)
            .chartYAxis {
                AxisMarks(values: [0, 25, 50, 75, 100]) { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let intValue = value.as(Int.self) {
                            Text("\(intValue)")
                                .font(.caption2)
                        }
                    }
                }
            }
            .frame(height: 200)

            if showLegend {
                HStack(spacing: 16) {
                    ForEach(Skill.allCases) { skill in
                        HStack(spacing: 4) {
                            Circle()
                                .fill(skill.color)
                                .frame(width: 8, height: 8)
                            Text(skill.displayName)
                                .font(.caption2)
                                .foregroundStyle(.appWarmGray)
                        }
                    }
                }
            }
        }
        .padding(16)
        .cardStyle()
    }
}

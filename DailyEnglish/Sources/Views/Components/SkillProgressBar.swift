import SwiftUI

struct SkillProgressBar: View {
    let skill: Skill
    let level: EnglishLevel
    let averageScore: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: skill.icon)
                    .foregroundStyle(skill.color)
                    .font(.subheadline)

                Text(skill.displayName)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(Color.appCharcoal)

                Spacer()

                Text("Level \(level.level)")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(skill.color)
            }

            HStack(spacing: 8) {
                // Progress bar
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(skill.color.opacity(0.15))

                        Capsule()
                            .fill(
                                LinearGradient(
                                    colors: [skill.color, skill.color.opacity(0.8)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(0, geo.size.width * progressFraction))
                    }
                }
                .frame(height: 10)

                // Score display
                Text("\(averageScore)/100")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundColor(Color.appWarmGray)
                    .monospacedDigit()
                    .frame(width: 50, alignment: .trailing)
            }
        }
    }

    private var progressFraction: CGFloat {
        let range = level.scoreRange
        let rangeSize = range.upperBound - range.lowerBound
        guard rangeSize > 0 else { return 0 }
        let progress = Double(averageScore - range.lowerBound) / Double(rangeSize)
        return CGFloat(max(0, min(1, progress)))
    }
}

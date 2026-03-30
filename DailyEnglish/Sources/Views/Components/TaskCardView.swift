import SwiftUI

struct TaskCardView: View {
    let skill: Skill
    let isCompleted: Bool
    let scoreDisplay: String?
    let progressText: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: skill.icon)
                        .font(.title3)
                        .foregroundStyle(isCompleted ? .white : skill.color)

                    Spacer()

                    if isCompleted {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(.white)
                    }
                }

                Spacer()

                Text(skill.displayName)
                    .font(.roundedHeadline())
                    .foregroundStyle(isCompleted ? .white : .appCharcoal)

                if isCompleted, let score = scoreDisplay {
                    Text("Score: \(score)")
                        .font(.caption)
                        .foregroundStyle(isCompleted ? .white.opacity(0.8) : .appWarmGray)
                } else if let progress = progressText {
                    Text(progress)
                        .font(.caption)
                        .foregroundStyle(.appWarmGray)
                } else {
                    Text("Start")
                        .font(.caption)
                        .foregroundStyle(.appWarmGray)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
            .background(isCompleted ? skill.color : .white)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .shadow(color: .black.opacity(0.05), radius: 12, y: 6)
        }
        .buttonStyle(.plain)
    }
}

import SwiftUI

struct QuizQuestionView: View {
    let question: String
    let options: [String]
    let correctIndex: Int
    @Binding var selectedIndex: Int?
    var showResult: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(question)
                .font(.body)
                .fontWeight(.medium)
                .foregroundStyle(.appCharcoal)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 10) {
                ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                    Button {
                        if !showResult {
                            selectedIndex = index
                        }
                    } label: {
                        HStack {
                            Text(optionLabel(index))
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundStyle(labelColor(for: index))
                                .frame(width: 28, height: 28)
                                .background(labelBackground(for: index))
                                .clipShape(Circle())

                            Text(option)
                                .font(.subheadline)
                                .foregroundStyle(.appCharcoal)
                                .multilineTextAlignment(.leading)

                            Spacer()

                            if showResult && index == correctIndex {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.appGreen)
                            } else if showResult && index == selectedIndex && index != correctIndex {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.red)
                            }
                        }
                        .padding(12)
                        .background(optionBackground(for: index))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(optionBorderColor(for: index), lineWidth: selectedIndex == index ? 2 : 0)
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(showResult)
                }
            }
        }
    }

    private func optionLabel(_ index: Int) -> String {
        ["A", "B", "C", "D"][index]
    }

    private func labelColor(for index: Int) -> Color {
        if showResult && index == correctIndex { return .white }
        if selectedIndex == index { return .white }
        return .appWarmGray
    }

    private func labelBackground(for index: Int) -> Color {
        if showResult && index == correctIndex { return .appGreen }
        if showResult && index == selectedIndex && index != correctIndex { return .red }
        if selectedIndex == index { return .appTeal }
        return Color.gray.opacity(0.1)
    }

    private func optionBackground(for index: Int) -> Color {
        if showResult && index == correctIndex { return .appGreen.opacity(0.1) }
        if showResult && index == selectedIndex && index != correctIndex { return .red.opacity(0.1) }
        return Color.gray.opacity(0.05)
    }

    private func optionBorderColor(for index: Int) -> Color {
        if showResult && index == correctIndex { return .appGreen }
        if showResult && index == selectedIndex && index != correctIndex { return .red }
        if selectedIndex == index { return .appTeal }
        return .clear
    }
}

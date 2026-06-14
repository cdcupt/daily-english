import SwiftUI

struct StudyView: View {
    @State private var coordinator = StudyCoordinator()

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()
                content
            }
            .navigationTitle("Study")
            .navigationBarTitleDisplayMode(.large)
        }
        .task {
            if coordinator.current == nil { await coordinator.bootstrap() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch coordinator.phase {
        case .onboarding, .loading:
            loadingState
        case .empty:
            emptyState
        case .practice:
            practiceState
        case .feedback:
            feedbackState
        case let .error(message):
            errorState(message)
        }
    }

    // MARK: - States

    private var loadingState: some View {
        VStack(spacing: 16) {
            MascotBadge(size: 72)
            ProgressView()
            Text("Setting up your session…")
                .font(.system(size: 14))
                .foregroundColor(.appWarmGray)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            MascotBadge(size: 80)
            Text("All caught up")
                .font(.roundedTitle2())
                .foregroundColor(.appCharcoal)
            Text("There are no practice items waiting right now. Check back soon.")
                .font(.system(size: 14))
                .foregroundColor(.appWarmGray)
                .multilineTextAlignment(.center)
            Button("Refresh") { Task { await coordinator.loadNext() } }
                .buttonStyle(PrimaryButtonStyle())
                .frame(maxWidth: 220)
        }
        .padding(28)
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 40))
                .foregroundColor(.appCoral)
            Text("Something went wrong")
                .font(.roundedTitle3())
                .foregroundColor(.appCharcoal)
            Text(message)
                .font(.system(size: 13))
                .foregroundColor(.appWarmGray)
                .multilineTextAlignment(.center)
            Button("Try again") { Task { await coordinator.retry() } }
                .buttonStyle(PrimaryButtonStyle())
                .frame(maxWidth: 220)
        }
        .padding(28)
    }

    // MARK: - Practice

    private var practiceState: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if coordinator.isReview, let review = coordinator.currentReview {
                    reviewCard(review)
                } else if let item = coordinator.currentItem {
                    itemCard(item)
                    answerField
                }
            }
            .padding(20)
        }
    }

    private func itemCard(_ item: StudyItem) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                MascotBadge(size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.scenario?.title ?? modeLabel(item.mode))
                        .font(.roundedHeadline())
                        .foregroundColor(.appCharcoal)
                    if let category = item.scenario?.category {
                        Text(category.capitalized)
                            .font(.system(size: 12))
                            .foregroundColor(.appWarmGray)
                    }
                }
                Spacer()
                CEFRPill(level: item.cefrLevel)
            }

            Divider()

            Label(item.learningGoal, systemImage: "target")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.appTeal)

            Text(item.promptCn)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(.appCharcoal)
                .fixedSize(horizontal: false, vertical: true)

            if !item.targetPhrases.isEmpty {
                phraseChips(item.targetPhrases)
            }
        }
        .padding(18)
        .cardStyle()
    }

    private func phraseChips(_ phrases: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Try to use")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(.appWarmGray)
            FlowChips(items: phrases)
        }
    }

    private var answerField: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your answer")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.appWarmGray)
            TextEditor(text: $coordinator.draftAnswer)
                .font(.system(size: 16))
                .frame(minHeight: 120)
                .padding(10)
                .scrollContentBackground(.hidden)
                .background(Color.appPaper)
                .overlay(
                    RoundedRectangle(cornerRadius: 12).stroke(Color.appBorder, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 12))

            Button {
                Task { await coordinator.checkAnswer() }
            } label: {
                if coordinator.isSubmitting {
                    ProgressView().tint(.white)
                } else {
                    Text("Check my answer")
                }
            }
            .buttonStyle(PrimaryButtonStyle(
                enabled: !coordinator.draftAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ))
            .disabled(coordinator.isSubmitting ||
                coordinator.draftAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private func reviewCard(_ review: ReviewPrompt) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("Review", systemImage: "arrow.triangle.2.circlepath")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.appViolet)
                Spacer()
            }
            Text(review.prompt)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(.appCharcoal)
            if let natural = review.naturalExpression {
                Text(natural)
                    .font(.system(size: 15))
                    .foregroundColor(.appWarmGray)
            }
            answerField
        }
        .padding(18)
        .cardStyle()
    }

    // MARK: - Feedback

    private var feedbackState: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let item = coordinator.currentItem {
                    HStack {
                        Text("Feedback")
                            .font(.roundedTitle3())
                            .foregroundColor(.appCharcoal)
                        Spacer()
                        CEFRPill(level: item.cefrLevel)
                    }
                }

                if let feedback = coordinator.lastFeedback {
                    FeedbackDiffView(feedback: feedback)

                    if !feedback.issues.isEmpty {
                        issuesSection(feedback.issues)
                    }
                    if !feedback.save_candidates.isEmpty {
                        saveSection(feedback.save_candidates)
                    }
                }

                CEFRDisclaimer()

                Button("Next") { Task { await coordinator.loadNext() } }
                    .buttonStyle(PrimaryButtonStyle())
            }
            .padding(20)
        }
    }

    private func issuesSection(_ issues: [FeedbackIssue]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What to watch")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.appWarmGray)
            ForEach(issues) { issue in
                HStack(alignment: .top, spacing: 8) {
                    Text(issue.type.replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.appCoral)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Color.appCoral.opacity(0.12))
                        .clipShape(Capsule())
                    Text(issue.explanation)
                        .font(.system(size: 13))
                        .foregroundColor(.appCharcoal)
                }
            }
        }
        .padding(16)
        .cardStyle()
    }

    private func saveSection(_ candidates: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Save to your bank")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.appWarmGray)
            ForEach(candidates, id: \.self) { candidate in
                HStack {
                    Text(candidate)
                        .font(.system(size: 14))
                        .foregroundColor(.appCharcoal)
                    Spacer()
                    Button {
                        Task { await coordinator.saveExpression(candidate) }
                    } label: {
                        Image(systemName: "bookmark")
                            .foregroundColor(.appTeal)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .padding(16)
        .cardStyle()
    }

    private func modeLabel(_ mode: String?) -> String {
        switch mode {
        case "translation": return "Translate this"
        case "dialogue": return "Respond in the dialogue"
        case "description": return "Describe this"
        default: return "Practice"
        }
    }
}

// MARK: - Simple flowing chips

struct FlowChips: View {
    let items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.appTeal)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color.appTeal.opacity(0.10))
                    .clipShape(Capsule())
            }
        }
    }
}

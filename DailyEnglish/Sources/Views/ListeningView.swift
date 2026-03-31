import SwiftUI

struct ListeningView: View {
    var manager: PracticeManager
    @State private var sessions: [ListeningSession] = []
    @State private var selectedSession: ListeningSession?
    @State private var isGenerating: Bool = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if isGenerating {
                    VStack(spacing: 12) {
                        Text("🐻")
                            .font(.system(size: 40))
                        ProgressView("Generating listening sessions...")
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if sessions.isEmpty {
                    emptyState
                } else {
                    sessionList
                }
            }
            .background(Color.appBackground)
            .navigationTitle("Listening")
            .navigationDestination(item: $selectedSession) { session in
                ListeningSessionView(session: session, manager: manager) {
                    checkCompletion()
                }
            }
        }
        .onAppear(perform: loadSessions)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Text("🐻")
                .font(.system(size: 60))
            Text("Listening Practice")
                .font(.roundedTitle2())
                .foregroundColor(Color.appCharcoal)
            Text("Generate sessions to start listening practice.")
                .font(.subheadline)
                .foregroundColor(Color.appWarmGray)

            if let error {
                Text(error).font(.caption).foregroundStyle(.red)
            }

            Button {
                Task { await generateSessions() }
            } label: {
                Text("Generate Sessions")
                    .font(.roundedHeadline())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 14)
                    .background(Color.skillListening)
                    .clipShape(Capsule())
            }
        }
        .padding()
    }

    private var sessionList: some View {
        List(sessions, id: \.id) { session in
            Button {
                selectedSession = session
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(session.scenario)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(Color.appCharcoal)

                        Text("Session \(session.sessionIndex + 1)")
                            .font(.caption)
                            .foregroundColor(Color.appWarmGray)
                    }

                    Spacer()

                    if session.isCompleted {
                        if let score = session.score {
                            Text("\(score)/\(session.questions.count)")
                                .font(.caption)
                                .fontWeight(.bold)
                                .foregroundColor(Color.appGreen)
                        }
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(Color.appGreen)
                    } else {
                        Image(systemName: "chevron.right")
                            .foregroundColor(Color.appWarmGray)
                    }
                }
                .padding(.vertical, 4)
            }
            .buttonStyle(.plain)
        }
        .listStyle(.plain)
    }

    private func loadSessions() {
        sessions = manager.loadTodayListeningSessions()
    }

    private func generateSessions() async {
        isGenerating = true
        error = nil
        let count = manager.settings?.listeningSessionsPerDay ?? 3
        let level = manager.skillLevel(for: .listening).level

        do {
            for i in 0..<count {
                let response = try await manager.aiService.generateListeningSession(level: level)
                let session = ListeningSession(sessionIndex: i, scenario: response.scenario, passage: response.passage)
                session.questions = response.questions.map { q in
                    ListeningQuestion(
                        question: q.question,
                        options: q.options,
                        correctIndex: q.correctIndex,
                        subSkill: q.subSkill
                    )
                }
                manager.modelContext.insert(session)
                sessions.append(session)
            }
            try? manager.modelContext.save()
        } catch {
            self.error = error.localizedDescription
        }
        isGenerating = false
    }

    private func checkCompletion() {
        sessions = manager.loadTodayListeningSessions()
        if sessions.allSatisfy({ $0.isCompleted }) {
            let totalCorrect = sessions.reduce(0) { $0 + ($1.score ?? 0) }
            let totalQuestions = sessions.reduce(0) { $0 + $1.questions.count }
            manager.recordScore(skill: .listening, numerator: totalCorrect, denominator: totalQuestions)
            manager.markTaskCompleted(.listening)
        }
    }
}

// MARK: - Single Session View

struct ListeningSessionView: View {
    let session: ListeningSession
    var manager: PracticeManager
    var onComplete: () -> Void

    @State private var answers: [Int?] = []
    @State private var showResults: Bool = false
    @State private var audioData: Data?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text(session.scenario)
                    .font(.roundedTitle3())
                    .foregroundColor(Color.appCharcoal)

                // Audio player
                AudioPlayerButton(
                    isPlaying: manager.ttsService.isPlaying,
                    onPlay: { playPassage() },
                    onStop: { manager.ttsService.stop() }
                )

                // Questions
                if !session.questions.isEmpty {
                    ForEach(Array(session.questions.enumerated()), id: \.offset) { index, question in
                        QuizQuestionView(
                            question: question.question,
                            options: question.options,
                            correctIndex: question.correctIndex,
                            selectedIndex: Binding(
                                get: { answers.indices.contains(index) ? answers[index] : nil },
                                set: { if answers.indices.contains(index) { answers[index] = $0 } }
                            ),
                            showResult: showResults
                        )
                        .padding()
                        .cardStyle()
                    }
                }

                if !showResults && answers.allSatisfy({ $0 != nil }) && !answers.isEmpty {
                    Button {
                        submitAnswers()
                    } label: {
                        Text("Submit")
                            .font(.roundedHeadline())
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.skillListening)
                            .clipShape(Capsule())
                    }
                }

                if showResults {
                    let correct = session.questions.enumerated()
                        .filter { answers[$0.offset] == $0.element.correctIndex }.count

                    VStack(spacing: 8) {
                        Text("🐻")
                            .font(.system(size: 40))
                        Text("\(correct)/\(session.questions.count)")
                            .font(.roundedLargeNumber())
                            .foregroundColor(Color.skillListening)
                        Text("Session Complete!")
                            .font(.roundedHeadline())
                            .foregroundColor(Color.appCharcoal)
                    }
                    .padding()

                    Button("Done") {
                        dismiss()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color.skillListening)
                }
            }
            .padding()
        }
        .background(Color.appBackground)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            answers = Array(repeating: nil, count: session.questions.count)
        }
    }

    private func playPassage() {
        manager.playTTS(text: session.passage)
    }

    private func submitAnswers() {
        let correct = session.questions.enumerated()
            .filter { answers[$0.offset] == $0.element.correctIndex }.count
        session.score = correct
        session.isCompleted = true
        showResults = true
        onComplete()
    }
}

extension ListeningSession: @retroactive Hashable {
    static func == (lhs: ListeningSession, rhs: ListeningSession) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

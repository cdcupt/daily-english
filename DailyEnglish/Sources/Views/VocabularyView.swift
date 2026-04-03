import SwiftUI

struct VocabularyView: View {
    var manager: PracticeManager
    @State private var quiz: VocabularyQuizDay?
    @State private var currentIndex: Int = 0
    @State private var showAnswer: Bool = false
    @State private var isCompleted: Bool = false
    @State private var isLoading: Bool = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    loadingState
                } else if isCompleted, let quiz {
                    resultsView(quiz)
                } else if let quiz, !quiz.words.isEmpty {
                    quizView(quiz)
                } else {
                    startView
                }
            }
            .background(Color.appBackground)
            .navigationTitle("Vocabulary")
        }
        .onAppear(perform: loadExisting)
    }

    // MARK: - Start

    private var startView: some View {
        VStack(spacing: 16) {
            Image("mascot_bee")
                .resizable().scaledToFit()
                .frame(width: 72, height: 72)
            Text("20 IELTS Words")
                .font(.roundedTitle2())
                .foregroundColor(Color.appCharcoal)
            Text("Test your vocabulary with today's quiz!")
                .font(.subheadline)
                .foregroundColor(Color.appWarmGray)

            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Button {
                Task { await generateQuiz() }
            } label: {
                Text("Start Quiz")
                    .font(.roundedHeadline())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 14)
                    .background(Color.skillVocabulary)
                    .clipShape(Capsule())
            }
        }
        .padding()
    }

    private var loadingState: some View {
        VStack(spacing: 12) {
            Image("mascot_bee")
                .resizable().scaledToFit()
                .frame(width: 48, height: 48)
            ProgressView("Generating words...")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Quiz

    private func quizView(_ quiz: VocabularyQuizDay) -> some View {
        VStack(spacing: 20) {
            // Progress
            HStack {
                Text("Word \(currentIndex + 1)/20")
                    .font(.roundedHeadline())
                    .foregroundColor(Color.appCharcoal)
                Spacer()
                ProgressView(value: Double(currentIndex + 1), total: 20)
                    .tint(Color.skillVocabulary)
                    .frame(width: 100)
            }
            .padding(.horizontal)

            ScrollView {
                VStack(spacing: 16) {
                    let word = quiz.words[currentIndex]

                    Text(word.word)
                        .font(.roundedTitle())
                        .foregroundColor(Color.skillVocabulary)

                    Text(word.meaning)
                        .font(.subheadline)
                        .foregroundColor(Color.appWarmGray)
                        .italic()

                    QuizQuestionView(
                        question: "What does \"\(word.word)\" mean?",
                        options: word.options,
                        correctIndex: word.correctIndex,
                        selectedIndex: Binding(
                            get: { quiz.words[currentIndex].userAnswer },
                            set: { newValue in
                                quiz.words[currentIndex].userAnswer = newValue
                                showAnswer = true
                            }
                        ),
                        showResult: showAnswer
                    )

                    if showAnswer {
                        Label(word.exampleSentence, systemImage: "pencil.line")
                            .font(.subheadline)
                            .foregroundColor(Color.appWarmGray)
                            .padding()
                            .background(Color.skillVocabulary.opacity(0.05))
                            .clipShape(RoundedRectangle(cornerRadius: 12))

                        Button {
                            nextWord(quiz)
                        } label: {
                            Text(currentIndex < 19 ? "Next Word" : "See Results")
                                .font(.roundedHeadline())
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.skillVocabulary)
                                .clipShape(Capsule())
                        }
                    }
                }
                .padding()
            }
        }
    }

    // MARK: - Results

    private func resultsView(_ quiz: VocabularyQuizDay) -> some View {
        ScrollView {
            VStack(spacing: 20) {
                let correct = quiz.words.filter { $0.userAnswer == $0.correctIndex }.count

                Image("mascot_bee")
                    .resizable().scaledToFit()
                    .frame(width: 60, height: 60)
                Text("\(correct)/20")
                    .font(.roundedLargeNumber())
                    .foregroundColor(Color.skillVocabulary)
                Text("Quiz Complete!")
                    .font(.roundedTitle3())
                    .foregroundColor(Color.appCharcoal)

                // Word review list
                VStack(spacing: 8) {
                    ForEach(Array(quiz.words.enumerated()), id: \.offset) { index, word in
                        HStack {
                            Image(systemName: word.userAnswer == word.correctIndex
                                  ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundColor(word.userAnswer == word.correctIndex ? Color.appGreen : .red)

                            Text(word.word)
                                .font(.subheadline)
                                .fontWeight(.medium)

                            Spacer()

                            Text(word.options[word.correctIndex])
                                .font(.caption)
                                .foregroundColor(Color.appWarmGray)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .padding()
                .cardStyle()
            }
            .padding()
        }
    }

    // MARK: - Actions

    private func loadExisting() {
        if let existing = manager.loadTodayVocabulary() {
            quiz = existing
            if existing.isCompleted {
                isCompleted = true
            } else if let lastAnswered = existing.words.lastIndex(where: { $0.userAnswer != nil }) {
                currentIndex = min(lastAnswered + 1, 19)
            }
        }
    }

    private func generateQuiz() async {
        isLoading = true
        error = nil
        do {
            quiz = try await manager.generateVocabularyQuiz()
            currentIndex = 0
            showAnswer = false
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func nextWord(_ quiz: VocabularyQuizDay) {
        showAnswer = false
        if currentIndex < 19 {
            currentIndex += 1
        } else {
            // Complete
            let correct = quiz.words.filter { $0.userAnswer == $0.correctIndex }.count
            quiz.score = correct
            quiz.isCompleted = true
            isCompleted = true

            manager.recordScore(skill: .vocabulary, numerator: correct, denominator: 20)
            manager.markTaskCompleted(.vocabulary)
        }
    }
}

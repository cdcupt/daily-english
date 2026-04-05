import SwiftUI

struct ReadingView: View {
    var manager: PracticeManager
    @State private var state: ViewState<[Article]> = .idle
    @State private var selectedArticle: Article?

    var body: some View {
        NavigationStack {
            Group {
                switch state {
                case .idle:
                    emptyState
                case .loading:
                    ProgressView("Generating articles...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .loaded(let articles):
                    articleList(articles)
                case .error(let error):
                    errorState(error)
                }
            }
            .background(Color.appBackground)
            .navigationTitle("Reading")
            .navigationDestination(item: $selectedArticle) { article in
                ArticleDetailView(article: article, manager: manager)
            }
        }
        .onAppear(perform: loadArticles)
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image("mascot_owl")
                .resizable().scaledToFit()
                .frame(width: 72, height: 72)
                .mascotStyle(cornerRadius: 14)
            Text("Let's practice reading today!")
                .font(.roundedTitle3())
                .foregroundColor(Color.appCharcoal)
            Text("Generate articles to start your reading practice.")
                .font(.subheadline)
                .foregroundColor(Color.appWarmGray)
                .multilineTextAlignment(.center)

            Button {
                Task { await generateArticles() }
            } label: {
                Text("Generate Articles")
                    .font(.roundedHeadline())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 14)
                    .background(Color.skillReading)
                    .clipShape(Capsule())
            }
        }
        .padding()
    }

    private func articleList(_ articles: [Article]) -> some View {
        List(articles, id: \.id) { article in
            Button {
                selectedArticle = article
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(article.title)
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(Color.appCharcoal)
                            .lineLimit(2)

                        HStack(spacing: 8) {
                            Text(article.topic.capitalized)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Color.skillReading.opacity(0.1))
                                .clipShape(Capsule())

                            if article.isRead {
                                Label("Read", systemImage: "checkmark.circle.fill")
                                    .font(.caption)
                                    .foregroundColor(Color.appGreen)
                            }

                            if let score = article.quizScore, let total = article.quizTotal {
                                Text("\(score)/\(total)")
                                    .font(.caption)
                                    .foregroundColor(Color.appWarmGray)
                            }
                        }
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(Color.appWarmGray)
                }
                .padding(.vertical, 4)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .listStyle(.plain)
    }

    private func errorState(_ error: Error) -> some View {
        VStack(spacing: 12) {
            Text("Something went wrong")
                .font(.roundedHeadline())
            Text(error.localizedDescription)
                .font(.caption)
                .foregroundColor(Color.appWarmGray)
                .multilineTextAlignment(.center)
            Button("Try Again") {
                Task { await generateArticles() }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }

    private func loadArticles() {
        let existing = manager.loadTodayArticles()
        if !existing.isEmpty {
            state = .loaded(existing)
        }
    }

    private func generateArticles() async {
        state = .loading
        do {
            let articles = try await manager.generateArticles()
            state = .loaded(articles)
        } catch {
            state = .error(error)
        }
    }
}

// MARK: - Article Detail View

struct ArticleDetailView: View {
    let article: Article
    var manager: PracticeManager
    @State private var showQuiz = false
    @State private var quizQuestions: [QuizQuestion] = []
    @State private var currentQuestionIndex = 0
    @State private var answers: [Int?] = []
    @State private var showResults = false
    @State private var isLoadingQuiz = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(article.title)
                    .font(.roundedTitle2())
                    .foregroundColor(Color.appCharcoal)

                Text(article.topic.capitalized)
                    .font(.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.skillReading.opacity(0.1))
                    .clipShape(Capsule())

                Text(article.content)
                    .font(.body)
                    .foregroundColor(Color.appCharcoal)
                    .lineSpacing(6)

                if !showQuiz && article.quizScore == nil {
                    Button {
                        Task { await loadQuiz() }
                    } label: {
                        HStack {
                            if isLoadingQuiz {
                                ProgressView()
                                    .tint(.white)
                            }
                            Text(isLoadingQuiz ? "Generating Quiz..." : "Take Quiz")
                                .font(.roundedHeadline())
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.skillReading)
                        .clipShape(Capsule())
                    }
                    .disabled(isLoadingQuiz)
                }

                if showQuiz && !quizQuestions.isEmpty {
                    quizSection
                }

                if showResults {
                    resultsSection
                }
            }
            .padding(16)
        }
        .background(Color.appBackground)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var quizSection: some View {
        VStack(spacing: 16) {
            Text("Question \(currentQuestionIndex + 1)/\(quizQuestions.count)")
                .font(.roundedHeadline())
                .foregroundColor(Color.appCharcoal)

            let q = quizQuestions[currentQuestionIndex]
            QuizQuestionView(
                question: q.question,
                options: q.options,
                correctIndex: q.correctIndex,
                selectedIndex: Binding(
                    get: { answers[currentQuestionIndex] },
                    set: { answers[currentQuestionIndex] = $0 }
                ),
                showResult: false
            )

            if answers[currentQuestionIndex] != nil {
                Button {
                    if currentQuestionIndex < quizQuestions.count - 1 {
                        currentQuestionIndex += 1
                    } else {
                        submitQuiz()
                    }
                } label: {
                    Text(currentQuestionIndex < quizQuestions.count - 1 ? "Next" : "Submit")
                        .font(.roundedHeadline())
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.appTeal)
                        .clipShape(Capsule())
                }
            }
        }
    }

    private var resultsSection: some View {
        VStack(spacing: 12) {
            let correct = quizQuestions.enumerated().filter { answers[$0.offset] == $0.element.correctIndex }.count

            Image("mascot_owl")
                .resizable().scaledToFit()
                .frame(width: 48, height: 48)
                .mascotStyle()
            Text("\(correct)/\(quizQuestions.count)")
                .font(.roundedLargeNumber())
                .foregroundColor(Color.skillReading)
            Text("Quiz Complete!")
                .font(.roundedHeadline())
                .foregroundColor(Color.appCharcoal)
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .cardStyle()
    }

    private func loadQuiz() async {
        isLoadingQuiz = true
        do {
            let questions = try await manager.aiService.generateQuizQuestions(title: article.title, content: article.content)
            quizQuestions = questions
            answers = Array(repeating: nil, count: questions.count)
            showQuiz = true
        } catch {
            // Handle error
        }
        isLoadingQuiz = false
    }

    private func submitQuiz() {
        let correct = quizQuestions.enumerated().filter { answers[$0.offset] == $0.element.correctIndex }.count
        article.quizScore = correct
        article.quizTotal = quizQuestions.count
        article.isRead = true
        showQuiz = false
        showResults = true

        // Record score
        manager.recordScore(skill: .reading, numerator: correct, denominator: quizQuestions.count)

        // Check if all articles are quizzed
        let todayArticles = manager.loadTodayArticles()
        if todayArticles.allSatisfy({ $0.quizScore != nil }) {
            manager.markTaskCompleted(.reading)
        }
    }
}

extension Article: @retroactive Hashable {
    static func == (lhs: Article, rhs: Article) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

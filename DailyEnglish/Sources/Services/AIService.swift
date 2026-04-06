import Foundation

// MARK: - AI Response Types

struct ArticleResponse: Codable {
    let title: String
    let content: String
    let topic: String
}

struct QuizQuestionsResponse: Codable {
    let questions: [QuizQuestionResponse]
}

struct QuizQuestionResponse: Codable {
    let question: String
    let options: [String]
    let correctIndex: Int
    let subSkill: String?
}

struct WritingReview: Codable {
    let score: Int
    let grammarScore: Int
    let vocabularyRangeScore: Int
    let coherenceScore: Int
    let taskResponseScore: Int
    let grammarIssues: [String]
    let styleNotes: [String]
    let correctedText: String
}

struct PronunciationResult: Codable {
    let accuracyScore: Double
    let fluencyScore: Double
    let notes: [String]
}

struct VocabularyWordsResponse: Codable {
    let words: [VocabularyWordResponse]
}

struct VocabularyWordResponse: Codable {
    let word: String
    let meaning: String
    let options: [String]
    let correctIndex: Int
    let exampleSentence: String
}

struct ListeningSessionResponse: Codable {
    let title: String
    let scenario: String
    let passage: String
    let questions: [ListeningQuestionResponse]
}

struct ListeningQuestionResponse: Codable {
    let question: String
    let options: [String]
    let correctIndex: Int
    let subSkill: String?
}

// MARK: - AI Service

@Observable
final class AIService {
    var provider: AIProvider = .gemini
    var apiKey: String = ""
    var model: String = ""
    var demoMode: Bool = false

    private var effectiveModel: String {
        model.isEmpty ? provider.defaultModel : model
    }

    // MARK: - Core Request

    func sendPrompt(systemPrompt: String, userPrompt: String) async throws -> String {
        guard !apiKey.isEmpty else {
            throw AIError.noAPIKey
        }

        let request = buildOpenAIRequest(system: systemPrompt, user: userPrompt)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw AIError.invalidResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw AIError.apiError(statusCode: httpResponse.statusCode, message: body)
        }

        return try parseResponse(data: data)
    }

    // MARK: - Request Builders

    private func buildOpenAIRequest(system: String, user: String) -> URLRequest {
        let url = URL(string: provider.baseURL)!

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "model": effectiveModel,
            "messages": [
                ["role": "system", "content": system],
                ["role": "user", "content": user],
            ],
            "temperature": 0.7,
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return request
    }

    // MARK: - Response Parsing

    private func parseResponse(data: Data) throws -> String {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AIError.invalidResponse
        }

        // OpenAI-compatible format: choices[0].message.content
        guard let choices = json["choices"] as? [[String: Any]],
              let message = choices.first?["message"] as? [String: Any],
              let content = message["content"] as? String
        else {
            throw AIError.invalidResponse
        }
        return content
    }

    // MARK: - JSON Helper

    private func parseJSON<T: Decodable>(_ text: String, as type: T.Type) throws -> T {
        // Strip markdown fences if present
        var cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("```json") {
            cleaned = String(cleaned.dropFirst(7))
        } else if cleaned.hasPrefix("```") {
            cleaned = String(cleaned.dropFirst(3))
        }
        if cleaned.hasSuffix("```") {
            cleaned = String(cleaned.dropLast(3))
        }
        cleaned = cleaned.trimmingCharacters(in: .whitespacesAndNewlines)

        guard let data = cleaned.data(using: .utf8) else {
            throw AIError.jsonParseError
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Domain Methods

    func generateArticle(topic: ArticleTopic, level: Int) async throws -> ArticleResponse {
        if demoMode { return DemoData.randomArticle(topic: topic) }
        let levelDesc = Prompts.difficultyDescription(for: level)
        let system = Prompts.articleGeneration(topic: topic, difficulty: levelDesc)
        let user = "Generate an article about \(topic.displayName)."
        let response = try await sendPrompt(systemPrompt: system, userPrompt: user)
        return try parseJSON(response, as: ArticleResponse.self)
    }

    func generateQuizQuestions(title: String, content: String) async throws -> [QuizQuestion] {
        if demoMode { return DemoData.quizQuestions(for: title) }
        let system = Prompts.readingQuiz
        let user = "Article title: \(title)\n\nArticle content:\n\(content)"
        let response = try await sendPrompt(systemPrompt: system, userPrompt: user)
        let parsed = try parseJSON(response, as: QuizQuestionsResponse.self)
        return parsed.questions.map { q in
            QuizQuestion(
                question: q.question,
                options: q.options,
                correctIndex: q.correctIndex,
                subSkill: q.subSkill
            )
        }
    }

    func reviewEssay(topic: String, essay: String) async throws -> WritingReview {
        if demoMode { return DemoData.writingReview(essay: essay) }
        let system = Prompts.writingReview
        let user = "Topic: \(topic)\n\nEssay:\n\(essay)"
        let response = try await sendPrompt(systemPrompt: system, userPrompt: user)
        return try parseJSON(response, as: WritingReview.self)
    }

    func evaluatePronunciation(original: String, recognized: String) async throws -> PronunciationResult {
        if demoMode { return DemoData.pronunciationResult }
        let system = Prompts.pronunciationEvaluation
        let user = "Target text: \(original)\n\nRecognized speech: \(recognized)"
        let response = try await sendPrompt(systemPrompt: system, userPrompt: user)
        return try parseJSON(response, as: PronunciationResult.self)
    }

    func generateVocabularyWords(level: Int) async throws -> [VocabularyWord] {
        if demoMode { return DemoData.vocabularyWords }
        let levelDesc = Prompts.difficultyDescription(for: level)
        let system = Prompts.vocabularyQuiz(difficulty: levelDesc)
        let user = "Generate 20 vocabulary words for today's quiz."
        let response = try await sendPrompt(systemPrompt: system, userPrompt: user)
        let parsed = try parseJSON(response, as: VocabularyWordsResponse.self)

        return parsed.words.map { w in
            var word = VocabularyWord(
                word: w.word,
                meaning: w.meaning,
                options: w.options,
                correctIndex: w.correctIndex,
                exampleSentence: w.exampleSentence
            )
            // Shuffle options to prevent positional bias
            word.shuffleOptions()
            return word
        }
    }

    func generateListeningSession(level: Int) async throws -> ListeningSessionResponse {
        if demoMode { return DemoData.randomListeningSession() }
        let levelDesc = Prompts.difficultyDescription(for: level)
        let system = Prompts.listeningPractice(difficulty: levelDesc)
        let user = "Generate a listening practice session."
        let response = try await sendPrompt(systemPrompt: system, userPrompt: user)
        return try parseJSON(response, as: ListeningSessionResponse.self)
    }
}

// MARK: - Demo Data

enum DemoData {

    // MARK: Reading

    private static let articles: [(topic: String, title: String, content: String)] = [
        (
            "tech",
            "How Smartphones Changed the Way We Learn",
            "Smartphones have transformed education in ways that were unimaginable just two decades ago. Today, students can access entire libraries from their pockets, watch lectures from world-renowned professors, and practice new languages with native speakers across the globe.\n\nOne of the most significant changes is the rise of micro-learning — short, focused lessons that fit into a busy schedule. Apps like Duolingo and Khan Academy have made it possible to study during a commute or a lunch break. Research shows that these brief but consistent study sessions can be just as effective as longer classroom periods.\n\nHowever, smartphones also bring challenges. The constant stream of notifications can fragment attention, making deep reading more difficult. Studies suggest that students who frequently switch between studying and social media retain less information than those who focus on a single task.\n\nDespite these drawbacks, the overall impact has been positive. Access to educational resources is no longer limited by geography or income. A student in a rural village can now learn the same material as one in a major city, leveling the playing field in unprecedented ways."
        ),
        (
            "science",
            "The Secret Life of Ocean Currents",
            "Beneath the surface of the world's oceans lies an invisible highway system that shapes our climate, feeds marine ecosystems, and even influences human history. These ocean currents, driven by differences in temperature and salinity, circulate water around the globe in patterns that scientists call thermohaline circulation.\n\nThe Gulf Stream, one of the most well-known currents, carries warm water from the Gulf of Mexico across the Atlantic to Europe. Without it, cities like London and Paris would experience winters similar to those in Labrador, Canada, which sits at the same latitude.\n\nRecent research has raised concerns that climate change may be weakening these vital currents. As polar ice melts, it adds fresh water to the ocean, reducing the salinity that helps drive circulation. A significant slowdown could disrupt weather patterns, reduce fish populations, and raise sea levels along certain coastlines.\n\nScientists are using an array of underwater sensors and satellite data to monitor these changes in real time. Understanding ocean currents is no longer just an academic exercise — it is essential for predicting the future of our planet."
        ),
        (
            "health",
            "Why Sleep Matters More Than You Think",
            "Most adults know they should get seven to nine hours of sleep each night, yet nearly a third consistently fall short. The consequences extend far beyond feeling tired the next day. Sleep deprivation affects memory, immune function, emotional regulation, and even long-term heart health.\n\nDuring sleep, the brain enters a cleaning cycle. Cerebrospinal fluid flows through neural tissue, washing away toxic proteins that accumulate during waking hours. One of these proteins, beta-amyloid, is strongly linked to Alzheimer's disease. Chronic poor sleep may therefore increase the risk of neurodegenerative conditions.\n\nSleep also plays a crucial role in learning. During the deep-sleep stage, the brain replays and consolidates new information, transferring it from short-term to long-term memory. Students who review material before bed and sleep well afterward perform significantly better on tests.\n\nImproving sleep hygiene does not require dramatic changes. Keeping a consistent bedtime, reducing screen exposure in the evening, and avoiding caffeine after mid-afternoon can make a noticeable difference. Small adjustments today can protect both cognitive function and overall health for years to come."
        ),
    ]

    static func randomArticle(topic: ArticleTopic) -> ArticleResponse {
        let article = articles.randomElement()!
        return ArticleResponse(title: article.title, content: article.content, topic: article.topic)
    }

    // MARK: Quiz Questions

    static func quizQuestions(for title: String) -> [QuizQuestion] {
        [
            QuizQuestion(
                question: "What is the main idea of this article?",
                options: [
                    "To inform readers about a key topic",
                    "To advertise a new product",
                    "To criticize modern technology",
                    "To describe a personal experience"
                ],
                correctIndex: 0,
                subSkill: "main_idea"
            ),
            QuizQuestion(
                question: "According to the article, what is one significant benefit mentioned?",
                options: [
                    "Reduced costs for businesses",
                    "Greater accessibility for people worldwide",
                    "Faster transportation networks",
                    "Improved agricultural yields"
                ],
                correctIndex: 1,
                subSkill: "detail"
            ),
            QuizQuestion(
                question: "What concern does the article raise?",
                options: [
                    "Overpopulation in urban areas",
                    "Potential negative side effects or risks",
                    "Lack of government funding",
                    "Shortage of trained professionals"
                ],
                correctIndex: 1,
                subSkill: "inference"
            ),
        ]
    }

    // MARK: Writing

    static func writingReview(essay: String) -> WritingReview {
        WritingReview(
            score: 72,
            grammarScore: 19,
            vocabularyRangeScore: 17,
            coherenceScore: 18,
            taskResponseScore: 18,
            grammarIssues: [
                "Consider using past perfect tense for events that occurred before another past event.",
                "Watch for subject-verb agreement in complex sentences."
            ],
            styleNotes: [
                "Try varying sentence length to create a more engaging rhythm.",
                "Good use of transition words between paragraphs."
            ],
            correctedText: essay
        )
    }

    // MARK: Pronunciation

    static let pronunciationResult = PronunciationResult(
        accuracyScore: 78.5,
        fluencyScore: 72.0,
        notes: [
            "Good overall clarity.",
            "Pay attention to the 'th' sound — practice placing tongue between teeth.",
            "Slight hesitation between clauses; try reading aloud more often."
        ]
    )

    // MARK: Vocabulary

    static let vocabularyWords: [VocabularyWord] = {
        let raw: [(word: String, meaning: String, correct: String, wrong: [String], sentence: String)] = [
            ("ubiquitous", "Present, appearing, or found everywhere", "Widespread", ["Rare", "Hidden", "Ancient"], "Smartphones have become ubiquitous in modern life."),
            ("resilient", "Able to recover quickly from difficulties", "Tough", ["Fragile", "Rigid", "Passive"], "Children are remarkably resilient after setbacks."),
            ("ambiguous", "Open to more than one interpretation", "Unclear", ["Definite", "Simple", "Obvious"], "The contract language was deliberately ambiguous."),
            ("pragmatic", "Dealing with things in a practical way", "Practical", ["Idealistic", "Emotional", "Reckless"], "She took a pragmatic approach to solving the problem."),
            ("eloquent", "Fluent or persuasive in speaking or writing", "Articulate", ["Clumsy", "Silent", "Dull"], "The lawyer gave an eloquent closing argument."),
            ("meticulous", "Showing great attention to detail", "Thorough", ["Careless", "Hasty", "Vague"], "The scientist was meticulous in recording her data."),
            ("candid", "Truthful and straightforward", "Honest", ["Deceptive", "Evasive", "Polite"], "He gave a candid assessment of the project's flaws."),
            ("diligent", "Having or showing care in one's work", "Hardworking", ["Lazy", "Indifferent", "Reckless"], "She was a diligent student who never missed a deadline."),
            ("inevitable", "Certain to happen; unavoidable", "Unavoidable", ["Unlikely", "Optional", "Preventable"], "Change is inevitable in every industry."),
            ("novel", "New or unusual in an interesting way", "Original", ["Common", "Boring", "Traditional"], "The team proposed a novel solution to the energy crisis."),
            ("obsolete", "No longer produced or used; out of date", "Outdated", ["Modern", "Popular", "Essential"], "Floppy disks became obsolete years ago."),
            ("profound", "Very great or intense; having deep meaning", "Deep", ["Shallow", "Minor", "Surface"], "The book had a profound impact on her worldview."),
            ("skeptical", "Not easily convinced; having doubts", "Doubtful", ["Trusting", "Certain", "Eager"], "Scientists remained skeptical of the initial findings."),
            ("versatile", "Able to adapt to many different functions", "Adaptable", ["Limited", "Rigid", "Fixed"], "She is a versatile musician who plays five instruments."),
            ("concise", "Giving a lot of information clearly in few words", "Brief", ["Lengthy", "Wordy", "Rambling"], "A good summary should be clear and concise."),
            ("endure", "To suffer through something difficult patiently", "Withstand", ["Collapse", "Avoid", "Ignore"], "The team had to endure months of harsh training."),
            ("fluctuate", "To rise and fall irregularly", "Vary", ["Stabilize", "Remain", "Fix"], "Stock prices fluctuate based on market conditions."),
            ("impartial", "Treating all rivals or disputants equally", "Fair", ["Biased", "Partial", "Prejudiced"], "A good judge must be completely impartial."),
            ("nurture", "To care for and encourage growth", "Foster", ["Neglect", "Hinder", "Destroy"], "Parents nurture their children's curiosity."),
            ("trivial", "Of little value or importance", "Insignificant", ["Crucial", "Vital", "Serious"], "Don't waste time on trivial details."),
        ]

        return raw.map { item in
            var word = VocabularyWord(
                word: item.word,
                meaning: item.meaning,
                options: [item.correct] + item.wrong,
                correctIndex: 0,
                exampleSentence: item.sentence
            )
            word.shuffleOptions()
            return word
        }
    }()

    // MARK: Listening

    private static let listeningSessions: [(title: String, scenario: String, passage: String, questions: [(q: String, opts: [String], correct: Int, sub: String)])] = [
        (
            "A Visit to the Museum",
            "A tour guide explains the history of an art exhibit to visitors.",
            "Welcome to the National Art Gallery. Today we'll be visiting our newest exhibition, which features works from the Impressionist period. The Impressionists were a group of artists who worked in France during the late 1800s. They were known for painting outdoors and capturing the effects of light on everyday scenes. One of the most famous Impressionists was Claude Monet, whose water lily paintings you'll see in the next room. Unlike earlier artists who aimed for photographic accuracy, the Impressionists used loose brushstrokes and vivid colors to convey a feeling or mood. At the time, many critics dismissed their work as unfinished, but today these paintings are among the most beloved in the world. Please feel free to ask questions as we go through each room.",
            [
                ("Where does this tour take place?", ["A science museum", "An art gallery", "A history library", "A university lecture hall"], 1, "detail"),
                ("When did the Impressionist movement take place?", ["Early 1700s", "Mid 1900s", "Late 1800s", "Early 2000s"], 2, "detail"),
                ("What was unusual about how Impressionists painted?", ["They only painted indoors", "They used loose brushstrokes outdoors", "They never used color", "They copied photographs exactly"], 1, "inference"),
                ("How did critics initially react to Impressionist art?", ["They praised it highly", "They considered it unfinished", "They ignored it completely", "They banned it from galleries"], 1, "recall"),
                ("What can be inferred about the speaker's attitude toward Impressionism?", ["Critical and dismissive", "Neutral and uninterested", "Positive and appreciative", "Confused and uncertain"], 2, "inference"),
            ]
        ),
        (
            "Booking a Hotel Room",
            "A traveler calls a hotel to make a reservation.",
            "Good afternoon, thank you for calling the Riverside Inn. How may I help you? I'd like to book a room for three nights, checking in on Friday the 15th. Certainly. We have standard rooms available at 89 dollars per night, and deluxe rooms with a river view at 129 dollars per night. Both include complimentary breakfast. I'll go with the deluxe room, please. The river view sounds lovely. Excellent choice. Could I have your name and a credit card number to hold the reservation? Yes, my name is Sarah Chen. And just to confirm, checkout would be Monday the 18th. That's correct. Also, please note that check-in time is 3 PM and checkout is 11 AM. We also offer free parking and airport shuttle service. That's perfect. Thank you very much.",
            [
                ("How many nights does the guest want to stay?", ["Two", "Three", "Four", "Five"], 1, "detail"),
                ("How much does the deluxe room cost per night?", ["$89", "$99", "$119", "$129"], 3, "detail"),
                ("What is included with both room types?", ["Free parking only", "Complimentary breakfast", "Airport shuttle only", "A river view"], 1, "recall"),
                ("When is checkout time?", ["10 AM", "11 AM", "12 PM", "3 PM"], 1, "detail"),
                ("Why did the guest choose the deluxe room?", ["It was cheaper", "It had a river view", "It was the only option", "A friend recommended it"], 1, "inference"),
            ]
        ),
        (
            "Climate Change Discussion",
            "A professor gives a brief lecture on the effects of rising sea levels.",
            "Today we're going to look at one of the most visible consequences of climate change: rising sea levels. Over the past century, global sea levels have risen by about 20 centimeters, and the rate is accelerating. There are two main causes. First, as the planet warms, glaciers and ice sheets in Greenland and Antarctica are melting, adding water to the oceans. Second, warmer water expands — a process called thermal expansion — which also raises sea levels. The effects are already being felt in low-lying coastal areas. Some island nations in the Pacific are experiencing increased flooding, and several have begun planning relocations for their populations. Major cities like Miami, Jakarta, and Shanghai are also at risk. Scientists estimate that if current trends continue, sea levels could rise by another 30 to 60 centimeters by the end of this century. Addressing this challenge requires both reducing emissions and adapting infrastructure to a changing coastline.",
            [
                ("How much have sea levels risen in the past century?", ["About 5 centimeters", "About 20 centimeters", "About 50 centimeters", "About 1 meter"], 1, "detail"),
                ("What is thermal expansion?", ["Ice sheets breaking apart", "Warmer water taking up more space", "Cold water sinking deeper", "Ocean currents speeding up"], 1, "vocabulary"),
                ("Which regions are already affected by rising seas?", ["Mountainous areas in Europe", "Desert regions in Africa", "Low-lying Pacific island nations", "Landlocked countries in Asia"], 2, "recall"),
                ("What does the professor suggest is needed to address this issue?", ["Only reducing emissions", "Only building sea walls", "Both reducing emissions and adapting infrastructure", "Relocating all coastal cities"], 2, "inference"),
                ("What can be inferred about the future if trends continue?", ["Sea levels will stabilize", "The problem will solve itself", "Coastal areas will face greater challenges", "Only islands will be affected"], 2, "inference"),
            ]
        ),
    ]

    static func randomListeningSession() -> ListeningSessionResponse {
        let session = listeningSessions.randomElement()!
        return ListeningSessionResponse(
            title: session.title,
            scenario: session.scenario,
            passage: session.passage,
            questions: session.questions.map { q in
                ListeningQuestionResponse(
                    question: q.q,
                    options: q.opts,
                    correctIndex: q.correct,
                    subSkill: q.sub
                )
            }
        )
    }
}

// MARK: - VocabularyWord Shuffle

extension VocabularyWord {
    mutating func shuffleOptions() {
        let correctAnswer = options[correctIndex]
        options.shuffle()
        if let newIndex = options.firstIndex(of: correctAnswer) {
            correctIndex = newIndex
        }
    }
}

// MARK: - AI Errors

enum AIError: LocalizedError {
    case noAPIKey
    case invalidResponse
    case apiError(statusCode: Int, message: String)
    case jsonParseError

    var errorDescription: String? {
        switch self {
        case .noAPIKey:
            "No API key configured. Please set your API key in Settings."
        case .invalidResponse:
            "Received an invalid response from the AI provider."
        case .apiError(let code, let message):
            "API error (\(code)): \(message)"
        case .jsonParseError:
            "Failed to parse the AI response. Please try again."
        }
    }
}

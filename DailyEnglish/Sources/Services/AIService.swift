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
    var provider: AIProvider = .openai
    var apiKey: String = ""
    var model: String = ""

    private var effectiveModel: String {
        model.isEmpty ? provider.defaultModel : model
    }

    // MARK: - Core Request

    func sendPrompt(systemPrompt: String, userPrompt: String) async throws -> String {
        guard !apiKey.isEmpty else {
            throw AIError.noAPIKey
        }

        let request: URLRequest
        if provider.usesAnthropicFormat {
            request = buildAnthropicRequest(system: systemPrompt, user: userPrompt)
        } else {
            request = buildOpenAIRequest(system: systemPrompt, user: userPrompt)
        }

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
        var url = URL(string: provider.baseURL)!

        // Gemini passes API key as query param
        if provider == .gemini {
            url = URL(string: "\(provider.baseURL)?key=\(apiKey)")!
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if provider != .gemini {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

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

    private func buildAnthropicRequest(system: String, user: String) -> URLRequest {
        var request = URLRequest(url: URL(string: provider.baseURL)!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue("2023-06-01", forHTTPHeaderField: "anthropic-version")

        let body: [String: Any] = [
            "model": effectiveModel,
            "max_tokens": 4096,
            "system": system,
            "messages": [
                ["role": "user", "content": user],
            ],
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        return request
    }

    // MARK: - Response Parsing

    private func parseResponse(data: Data) throws -> String {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AIError.invalidResponse
        }

        // Anthropic format: content[0].text
        if provider.usesAnthropicFormat {
            guard let content = json["content"] as? [[String: Any]],
                  let text = content.first?["text"] as? String
            else {
                throw AIError.invalidResponse
            }
            return text
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
        let levelDesc = Prompts.difficultyDescription(for: level)
        let system = Prompts.articleGeneration(topic: topic, difficulty: levelDesc)
        let user = "Generate an article about \(topic.displayName)."
        let response = try await sendPrompt(systemPrompt: system, userPrompt: user)
        return try parseJSON(response, as: ArticleResponse.self)
    }

    func generateQuizQuestions(title: String, content: String) async throws -> [QuizQuestion] {
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
        let system = Prompts.writingReview
        let user = "Topic: \(topic)\n\nEssay:\n\(essay)"
        let response = try await sendPrompt(systemPrompt: system, userPrompt: user)
        return try parseJSON(response, as: WritingReview.self)
    }

    func evaluatePronunciation(original: String, recognized: String) async throws -> PronunciationResult {
        let system = Prompts.pronunciationEvaluation
        let user = "Target text: \(original)\n\nRecognized speech: \(recognized)"
        let response = try await sendPrompt(systemPrompt: system, userPrompt: user)
        return try parseJSON(response, as: PronunciationResult.self)
    }

    func generateVocabularyWords(level: Int) async throws -> [VocabularyWord] {
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
        let levelDesc = Prompts.difficultyDescription(for: level)
        let system = Prompts.listeningPractice(difficulty: levelDesc)
        let user = "Generate a listening practice session."
        let response = try await sendPrompt(systemPrompt: system, userPrompt: user)
        return try parseJSON(response, as: ListeningSessionResponse.self)
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

import Foundation
import SwiftData

// MARK: - Codable Structs (embedded in @Model types)

struct QuizQuestion: Codable, Identifiable {
    var id = UUID()
    let question: String
    let options: [String]
    let correctIndex: Int
    let subSkill: String?  // ReadingSubSkill or ListeningSubSkill rawValue
    var userAnswer: Int?
}

struct VocabularyWord: Codable, Identifiable {
    var id = UUID()
    let word: String
    let meaning: String
    var options: [String]  // 4 choices, shuffled on client
    var correctIndex: Int
    let exampleSentence: String
    var userAnswer: Int?
}

struct ListeningQuestion: Codable, Identifiable {
    var id = UUID()
    let question: String
    let options: [String]
    let correctIndex: Int
    let subSkill: String?  // ListeningSubSkill rawValue
    var userAnswer: Int?
}

// MARK: - Article

@Model
final class Article {
    var id: UUID
    var topic: String
    var title: String
    var content: String
    var dateGenerated: Date
    var isRead: Bool
    var quizQuestions: [QuizQuestion]
    var quizScore: Int?  // e.g., 12 (out of total questions)
    var quizTotal: Int?  // e.g., 15
    var wordsLearned: [String]

    init(
        topic: String,
        title: String,
        content: String,
        dateGenerated: Date = .now
    ) {
        self.id = UUID()
        self.topic = topic
        self.title = title
        self.content = content
        self.dateGenerated = dateGenerated
        self.isRead = false
        self.quizQuestions = []
        self.quizScore = nil
        self.quizTotal = nil
        self.wordsLearned = []
    }
}

// MARK: - Writing Entry

@Model
final class WritingEntry {
    var id: UUID
    var date: Date
    var topic: String
    var userEssay: String
    var aiScore: Int?  // 0-100
    var grammarScore: Int?  // 0-25
    var vocabularyRangeScore: Int?  // 0-25
    var coherenceScore: Int?  // 0-25
    var taskResponseScore: Int?  // 0-25
    var grammarIssues: [String]
    var styleNotes: [String]
    var correctedText: String?
    var speakingCompleted: Bool
    var pronunciationAccuracy: Double?
    var pronunciationFluency: Double?
    var recognizedSpeechText: String?

    var pronunciationScore: Double? {
        guard let acc = pronunciationAccuracy, let flu = pronunciationFluency else { return nil }
        return acc * 0.6 + flu * 0.4
    }

    init(date: Date = .now, topic: String, userEssay: String) {
        self.id = UUID()
        self.date = date
        self.topic = topic
        self.userEssay = userEssay
        self.aiScore = nil
        self.grammarScore = nil
        self.vocabularyRangeScore = nil
        self.coherenceScore = nil
        self.taskResponseScore = nil
        self.grammarIssues = []
        self.styleNotes = []
        self.correctedText = nil
        self.speakingCompleted = false
        self.pronunciationAccuracy = nil
        self.pronunciationFluency = nil
        self.recognizedSpeechText = nil
    }
}

// MARK: - Vocabulary Quiz Day

@Model
final class VocabularyQuizDay {
    var id: UUID
    var date: Date
    var words: [VocabularyWord]
    var score: Int?  // e.g., 17 (out of 20)
    var isCompleted: Bool

    init(date: Date = .now, words: [VocabularyWord]) {
        self.id = UUID()
        self.date = date
        self.words = words
        self.score = nil
        self.isCompleted = false
    }
}

// MARK: - Listening Session

@Model
final class ListeningSession {
    var id: UUID
    var date: Date
    var sessionIndex: Int
    var scenario: String
    var passage: String
    var questions: [ListeningQuestion]
    var score: Int?  // e.g., 4 (out of 5)
    var isCompleted: Bool

    init(date: Date = .now, sessionIndex: Int, scenario: String, passage: String) {
        self.id = UUID()
        self.date = date
        self.sessionIndex = sessionIndex
        self.scenario = scenario
        self.passage = passage
        self.questions = []
        self.score = nil
        self.isCompleted = false
    }
}

import Foundation

// MARK: - API Envelope

/// Standard server envelope: { data, error, meta }. `APIClient` unwraps this.
struct APIEnvelope<T: Decodable>: Decodable {
    let data: T?
    let error: APIErrorBody?
    let meta: APIMeta?
}

struct APIErrorBody: Decodable, Sendable {
    let code: String
    let message: String
}

/// `meta` is loosely typed across endpoints; we only read the fields we use.
struct APIMeta: Decodable, Sendable {
    let total: Int?
    let page: Int?
    let limit: Int?
    let reason: String?
}

// MARK: - Auth

struct AuthSession: Decodable, Sendable {
    let userId: String
    let deviceId: String
    let access: String
    let refresh: String
}

struct RefreshResponse: Decodable, Sendable {
    let access: String
    let refresh: String
}

// MARK: - Study feed

/// GET /v1/study/next → { kind, sessionId, item?, review? }
struct StudyNext: Decodable, Sendable {
    let kind: String          // "practice" | "review"
    let reason: String?
    let sessionId: String
    let item: StudyItem?
    let review: ReviewPrompt?
}

struct StudyScenario: Decodable, Sendable {
    let title: String
    let category: String?
    let userRole: String?
    let aiRole: String?
    let goal: String?
}

struct StudyItem: Decodable, Sendable, Identifiable {
    let itemId: String
    let type: String
    let mode: String?
    let cefrLevel: String
    let promptCn: String
    let learningGoal: String
    let targetPhrases: [String]
    let scenario: StudyScenario?

    var id: String { itemId }
}

struct ReviewPrompt: Decodable, Sendable {
    let expressionId: String
    let type: String
    let content: String
    let userOriginal: String?
    let naturalExpression: String?
    let prompt: String
    let reviewKind: String?
}

// MARK: - Sessions / turns

struct SessionRef: Decodable, Sendable {
    let sessionId: String
    let state: String?
}

struct FeedbackIssue: Decodable, Sendable, Identifiable {
    let type: String
    let explanation: String

    var id: String { type + explanation }
}

/// FeedbackPayload mirrors server schemas.ts FeedbackPayloadSchema.
struct FeedbackPayload: Decodable, Sendable {
    let original: String
    let corrected: String
    let natural_version: String
    let issues: [FeedbackIssue]
    let save_candidates: [String]
}

struct TurnResult: Decodable, Sendable {
    let turnId: String
    let turnIndex: Int?
    let lowConfidence: Bool?
    let feedback: FeedbackPayload
    let savedExpressionId: String?
    let saveCandidates: [String]
}

// MARK: - Score report

struct DimensionScore: Decodable, Sendable {
    let score: Double
    let level: String
}

/// POST /v1/sessions/:id/finish → ScoreReport
struct ScoreReport: Decodable, Sendable {
    let session_id: String?
    let total: Double
    let cefr_estimate: String
    let dimensions: [String: DimensionScore]
    let summary: String
    let weak_points: [String]
    let recommended_review: [String]
    let disclaimer: String?
}

// MARK: - Ability profile (You)

/// GET /v1/profile
struct AbilityProfile: Decodable, Sendable {
    let overall_cefr: String
    let stable_range: [String]
    let dimensions: [String: DimensionScore]
    let weaknesses: [String]
    let disclaimer: String
}

// MARK: - Trends (You chart)

struct TrendPoint: Decodable, Sendable, Identifiable {
    let date: String
    let total: Double?
    let dimensions: [String: Double]

    var id: String { date }
}

/// GET /v1/profile/trends?days=30
struct Trends: Decodable, Sendable {
    let days: Int
    let series: [TrendPoint]
}

// MARK: - Expression bank

struct Expression: Decodable, Sendable, Identifiable {
    let id: String
    let type: String
    let content: String
    let meaningCn: String?
    let userOriginal: String?
    let naturalExpression: String?
    let createdAt: String?
}

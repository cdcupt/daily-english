import Foundation
import SwiftUI

/// Drives the Study feed: onboards anonymously, fetches the next item, submits
/// answers for inline 3-tier feedback, and tracks a lightweight session score.
/// The server is the source of truth; everything here is a transient read-cache.
@Observable
@MainActor
final class StudyCoordinator {
    enum Phase: Equatable {
        case onboarding
        case loading
        case empty            // bank exhausted / no items
        case practice         // showing an item + answer field
        case feedback         // inline feedback for the current answer
        case error(String)
    }

    private let api: APIClient

    // Feed state
    var phase: Phase = .onboarding
    var current: StudyNext?
    var draftAnswer: String = ""
    var lastFeedback: FeedbackPayload?
    var lastSavedExpressionId: String?
    var isSubmitting: Bool = false
    var checkedCount: Int = 0

    init(api: APIClient = .shared) {
        self.api = api
    }

    var currentItem: StudyItem? { current?.item }
    var currentReview: ReviewPrompt? { current?.review }
    var isReview: Bool { current?.kind == "review" }

    // MARK: - Lifecycle

    func bootstrap() async {
        phase = .loading
        do {
            try await api.ensureSession()
            await loadNext()
        } catch {
            phase = .error(message(for: error))
        }
    }

    func loadNext() async {
        phase = .loading
        lastFeedback = nil
        lastSavedExpressionId = nil
        draftAnswer = ""
        do {
            guard let next = try await api.studyNext() else {
                current = nil
                phase = .empty
                return
            }
            current = next
            phase = .practice
        } catch {
            phase = .error(message(for: error))
        }
    }

    // MARK: - Answering

    func checkAnswer() async {
        let text = draftAnswer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard let next = current, let item = next.item else { return }

        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let result = try await api.submitTurn(
                sessionId: next.sessionId, itemId: item.itemId, userText: text
            )
            lastFeedback = result.feedback
            lastSavedExpressionId = result.savedExpressionId
            checkedCount += 1
            phase = .feedback
        } catch {
            phase = .error(message(for: error))
        }
    }

    func saveExpression(_ content: String) async {
        do {
            _ = try await api.saveExpression(type: "save_candidate", content: content)
        } catch {
            // Non-fatal: keep the user in the feedback view.
        }
    }

    func retry() async {
        await bootstrap()
    }

    private func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
}

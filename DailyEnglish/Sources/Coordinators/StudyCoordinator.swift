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
        case warming          // custom topic generating its first item
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

    // Topic state — the active topic lives on the session server-side; we mirror
    // it locally so the bar/picker render synchronously, restoring it on launch.
    var topic: ActiveTopic?
    var isClearingTopic: Bool = false

    init(api: APIClient = .shared) {
        self.api = api
    }

    var currentItem: StudyItem? { current?.item }
    var currentReview: ReviewPrompt? { current?.review }
    var isReview: Bool { current?.kind == "review" }
    var warmingLabel: String { topic?.label ?? "your topic" }

    // MARK: - Lifecycle

    func bootstrap() async {
        phase = .loading
        do {
            try await api.ensureSession()
            await restoreTopic()
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
            let (next, reason) = try await api.studyNextRaw()
            guard let next else {
                current = nil
                // A custom topic warming (no item yet) gets its own building state
                // so it reads as "almost ready" rather than "all caught up".
                if reason == "topic_warming" || (topic?.isCustom == true && topic?.isGenerating == true) {
                    phase = .warming
                } else {
                    phase = .empty
                }
                return
            }
            current = next
            phase = .practice
        } catch {
            phase = .error(message(for: error))
        }
    }

    // MARK: - Topic sessions

    /// Restore the active topic on launch (GET /v1/study/topic).
    func restoreTopic() async {
        do {
            let result = try await api.currentTopic()
            topic = result.topic
        } catch {
            // Non-fatal: fall back to the adaptive mix.
            topic = nil
        }
    }

    /// Apply a category topic, then pull the first item for it.
    func setCategoryTopic(_ category: String) async {
        do {
            let result = try await api.setCategoryTopic(category)
            topic = result.topic
            await loadNext()
        } catch {
            phase = .error(message(for: error))
        }
    }

    /// Apply a custom topic. May come back "generating"; loadNext then shows the
    /// warming state until the first item is published. Throws so the picker can
    /// surface inline rejection (422) / rate-limit (429) messages and stay open.
    func setCustomTopic(_ text: String) async throws {
        let result = try await api.setCustomTopic(text)
        topic = result.topic
        await loadNext()
    }

    /// Clear the topic, back to the adaptive mix.
    func clearTopic() async {
        guard !isClearingTopic else { return }
        isClearingTopic = true
        defer { isClearingTopic = false }
        do {
            _ = try await api.clearTopic()
            topic = nil
            await loadNext()
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

    // MARK: - Review grading

    /// Grade the current due review (SM-2 0–5) → POST /v1/review/:id/complete → next.
    func gradeReview(_ grade: Int) async {
        guard let review = currentReview else { return }
        // Keep isSubmitting true through loadNext() so the grade buttons stay
        // disabled in the gap — otherwise the same review could be completed twice.
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            try await api.completeReview(expressionId: review.expressionId, grade: grade)
            await loadNext()
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

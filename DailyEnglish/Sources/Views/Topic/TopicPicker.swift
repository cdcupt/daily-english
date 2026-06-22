import SwiftUI

/// Loads /v1/topics and tracks the picker's selection + submission state. Mirrors
/// the web TopicPicker's logic (category instant, custom may generate, inline
/// rejection on 422 / rate-limit on 429).
@Observable
@MainActor
final class TopicPickerModel {
    enum Selection: Equatable {
        case adaptive
        case category(String)
        case custom
    }

    static let customMin = 2
    static let customMax = 60
    private static let rejectionCodes: Set<String> = ["topic_rejected", "topic_off_domain"]
    private static let rejectionMessage = "Let's keep it about everyday English — try another topic."

    private let api: APIClient

    var categories: [TopicCategory] = []
    var suggestions: [String] = ["Job interview", "Café order", "Doctor visit"]
    var isLoadingTopics = true
    var selection: Selection = .adaptive
    var customText: String = ""
    var isBusy = false
    var error: String?

    init(api: APIClient = .shared, activeTopic: ActiveTopic?) {
        self.api = api
        if let activeTopic {
            if activeTopic.kind == "category", let category = activeTopic.category {
                selection = .category(category)
            } else if activeTopic.isCustom {
                selection = .custom
                customText = activeTopic.label
            }
        }
    }

    var trimmedCustom: String {
        customText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var customValid: Bool {
        trimmedCustom.count >= Self.customMin && trimmedCustom.count <= Self.customMax
    }

    var canStart: Bool {
        switch selection {
        case .adaptive, .category: return true
        case .custom: return customValid
        }
    }

    func loadTopics() async {
        isLoadingTopics = true
        defer { isLoadingTopics = false }
        do {
            let result = try await api.topics()
            categories = result.categories
            if !result.suggestions.isEmpty {
                suggestions = result.suggestions.map { $0.capitalized }
            }
        } catch {
            // Non-fatal: keep the Adaptive option + default suggestions usable.
        }
    }

    func selectCategory(_ key: String) {
        error = nil
        selection = .category(key)
    }

    func selectAdaptive() {
        error = nil
        selection = .adaptive
    }

    func onCustomInput(_ value: String) {
        error = nil
        customText = value
        if !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            selection = .custom
        }
    }

    /// Apply the selection via the coordinator. Returns true when the sheet should
    /// close; false keeps it open (a rejection/rate-limit was surfaced inline).
    func start(using coordinator: StudyCoordinator) async -> Bool {
        guard !isBusy, canStart else { return false }
        isBusy = true
        error = nil
        defer { isBusy = false }

        switch selection {
        case .adaptive:
            await coordinator.clearTopic()
            return true
        case let .category(key):
            await coordinator.setCategoryTopic(key)
            return true
        case .custom:
            do {
                try await coordinator.setCustomTopic(trimmedCustom)
                return true
            } catch let APIError.server(code, message) {
                if Self.rejectionCodes.contains(code) {
                    error = Self.rejectionMessage
                } else if code == "rate_limited" {
                    error = "You've started a lot of new topics — give it a few minutes."
                } else {
                    error = message
                }
                return false
            } catch let failure {
                error = (failure as? LocalizedError)?.errorDescription ?? "Could not set that topic."
                return false
            }
        }
    }
}

/// A modal sheet for choosing what to practise: category chips (first chip
/// "Adaptive mix" clears the topic), an "or" divider, and a custom free-text
/// field with example quick-fills. Mirrors the web TopicPicker.
struct TopicPicker: View {
    let coordinator: StudyCoordinator
    @State private var model: TopicPickerModel
    @Environment(\.dismiss) private var dismiss

    init(coordinator: StudyCoordinator) {
        self.coordinator = coordinator
        _model = State(initialValue: TopicPickerModel(activeTopic: coordinator.topic))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Pick a category for instant practice, or describe any everyday-English topic and we'll build a focused session.")
                        .font(.system(size: 14))
                        .foregroundColor(.appWarmGray)
                        .fixedSize(horizontal: false, vertical: true)

                    categoryChips
                    dividerOr
                    customField
                    quickFills

                    if let error = model.error {
                        errorBanner(error)
                    }

                    startButton
                }
                .padding(20)
            }
            .background(Color.appBackground.ignoresSafeArea())
            .navigationTitle("Choose a topic")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                        .foregroundColor(.appWarmGray)
                }
            }
        }
        .task { await model.loadTopics() }
    }

    private var categoryChips: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Categories")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.appWarmGray)
            FlowLayout(spacing: 8) {
                chip(label: "Adaptive mix", selected: model.selection == .adaptive) {
                    model.selectAdaptive()
                }
                if model.isLoadingTopics {
                    ForEach(0..<3, id: \.self) { _ in
                        chipSkeleton
                    }
                }
                ForEach(model.categories) { category in
                    chip(
                        label: category.label,
                        count: category.publishedItemCount,
                        selected: model.selection == .category(category.key)
                    ) {
                        model.selectCategory(category.key)
                    }
                }
            }
        }
    }

    private func chip(label: String, count: Int? = nil, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(label)
                    .font(.system(size: 14, weight: .medium))
                if let count {
                    Text("\(count)")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(selected ? .white.opacity(0.8) : .appWarmGray)
                }
            }
            .foregroundColor(selected ? .white : .appCharcoal)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(selected ? Color.appTeal : Color.appPaper)
            .overlay(
                Capsule().stroke(selected ? Color.appTeal : Color.appBorder, lineWidth: 1)
            )
            .clipShape(Capsule())
        }
    }

    private var chipSkeleton: some View {
        Capsule()
            .fill(Color.appBorder.opacity(0.5))
            .frame(width: 90, height: 36)
    }

    private var dividerOr: some View {
        HStack(spacing: 10) {
            Rectangle().fill(Color.appBorder).frame(height: 1)
            Text("or").font(.system(size: 12, weight: .medium)).foregroundColor(.appWarmGray)
            Rectangle().fill(Color.appBorder).frame(height: 1)
        }
    }

    private var customField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Describe your own topic")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.appWarmGray)
            TextField("e.g. Returning a faulty phone", text: Binding(
                get: { model.customText },
                set: { model.onCustomInput($0) }
            ))
            .font(.system(size: 16))
            .padding(12)
            .background(Color.appPaper)
            .overlay(
                RoundedRectangle(cornerRadius: 12).stroke(Color.appBorder, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .submitLabel(.go)
            .onSubmit { Task { await submit() } }

            if model.selection == .custom, !model.trimmedCustom.isEmpty, !model.customValid {
                Text("Topics are between \(TopicPickerModel.customMin) and \(TopicPickerModel.customMax) characters.")
                    .font(.system(size: 12))
                    .foregroundColor(.appWarmGray)
            }
        }
    }

    private var quickFills: some View {
        FlowLayout(spacing: 8) {
            ForEach(model.suggestions, id: \.self) { suggestion in
                Button {
                    model.onCustomInput(suggestion)
                } label: {
                    Text(suggestion)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.appViolet)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Color.appViolet.opacity(0.10))
                        .clipShape(Capsule())
                }
            }
        }
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.appCoral)
            VStack(alignment: .leading, spacing: 2) {
                Text("Try another topic")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.appCharcoal)
                Text(message)
                    .font(.system(size: 13))
                    .foregroundColor(.appWarmGray)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.appCoral.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var startButton: some View {
        Button {
            Task { await submit() }
        } label: {
            if model.isBusy {
                ProgressView().tint(.white)
            } else {
                Text(startLabel)
            }
        }
        .buttonStyle(PrimaryButtonStyle(enabled: model.canStart))
        .disabled(!model.canStart || model.isBusy)
    }

    private var startLabel: String {
        if model.isBusy, model.selection == .custom { return "Building…" }
        return "Start session"
    }

    private func submit() async {
        let shouldClose = await model.start(using: coordinator)
        if shouldClose { dismiss() }
    }
}

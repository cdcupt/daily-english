import Charts
import SwiftUI

@Observable
@MainActor
final class YouViewModel {
    enum LoadState: Equatable {
        case idle, loading, loaded, failed(String)
    }

    private let api: APIClient

    var state: LoadState = .idle
    var profile: AbilityProfile?
    var trends: Trends?
    var expressions: [Expression] = []

    init(api: APIClient = .shared) {
        self.api = api
    }

    func load() async {
        state = .loading
        do {
            try await api.ensureSession()
            async let p = api.profile()
            async let t = api.trends(days: 30)
            async let e = api.expressions()
            profile = try await p
            trends = try await t
            expressions = try await e
            state = .loaded
        } catch {
            state = .failed((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)
        }
    }
}

struct YouView: View {
    @State private var model = YouViewModel()
    @State private var selectedTab: Int = 0

    var body: some View {
        NavigationStack {
            ZStack {
                Color.appBackground.ignoresSafeArea()
                content
            }
            .navigationTitle("You")
        }
        .task { if model.profile == nil { await model.load() } }
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .idle, .loading:
            ProgressView().tint(.appTeal)
        case let .failed(message):
            VStack(spacing: 12) {
                Image(systemName: "person.crop.circle.badge.exclamationmark")
                    .font(.system(size: 36)).foregroundColor(.appCoral)
                Text(message).font(.system(size: 13)).foregroundColor(.appWarmGray)
                    .multilineTextAlignment(.center)
                Button("Retry") { Task { await model.load() } }
                    .buttonStyle(PrimaryButtonStyle()).frame(maxWidth: 200)
            }
            .padding(28)
        case .loaded:
            loaded
        }
    }

    private var loaded: some View {
        ScrollView {
            VStack(spacing: 18) {
                Picker("View", selection: $selectedTab) {
                    Text("Profile").tag(0)
                    Text("Trend").tag(1)
                    Text("Bank").tag(2)
                }
                .pickerStyle(.segmented)

                switch selectedTab {
                case 0: profileSection
                case 1: trendSection
                default: bankSection
                }
            }
            .padding(20)
        }
    }

    // MARK: - Profile

    private var profileSection: some View {
        VStack(spacing: 16) {
            if let profile = model.profile {
                VStack(spacing: 10) {
                    MascotBadge(size: 64)
                    Text(profile.overall_cefr)
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .foregroundColor(.appViolet)
                    if profile.stable_range.count == 2 {
                        Text("Stable range \(profile.stable_range[0])–\(profile.stable_range[1])")
                            .font(.system(size: 13)).foregroundColor(.appWarmGray)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(20)
                .cardStyle()

                dimensionsCard(profile.dimensions)

                if !profile.weaknesses.isEmpty {
                    weaknessesCard(profile.weaknesses)
                }

                CEFRDisclaimer()
            }
        }
    }

    private func dimensionsCard(_ dimensions: [String: DimensionScore]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Dimensions")
                .font(.roundedHeadline()).foregroundColor(.appCharcoal)
            ForEach(AppConstants.dimensionOrder, id: \.self) { key in
                if let dim = dimensions[key] {
                    dimensionRow(label: AppConstants.dimensionLabel(key), dim: dim)
                }
            }
        }
        .padding(18)
        .cardStyle()
    }

    private func dimensionRow(label: String, dim: DimensionScore) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.system(size: 14, weight: .medium)).foregroundColor(.appCharcoal)
                Spacer()
                Text(dim.level).font(.system(size: 12, weight: .bold)).foregroundColor(.appViolet)
                Text("\(Int(dim.score))").font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(.appTeal)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.appBorder).frame(height: 6)
                    Capsule().fill(Color.appTeal)
                        .frame(width: geo.size.width * CGFloat(dim.score / 100), height: 6)
                }
            }
            .frame(height: 6)
        }
    }

    private func weaknessesCard(_ weaknesses: [String]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Focus areas")
                .font(.roundedHeadline()).foregroundColor(.appCharcoal)
            ForEach(weaknesses, id: \.self) { w in
                Label(w, systemImage: "arrow.up.forward")
                    .font(.system(size: 13)).foregroundColor(.appCoral)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }

    // MARK: - Trend

    private var trendSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("30-day trend")
                .font(.roundedHeadline()).foregroundColor(.appCharcoal)

            let points = (model.trends?.series ?? []).filter { $0.total != nil }
            if points.isEmpty {
                Text("Finish a few sessions to start your trend.")
                    .font(.system(size: 13)).foregroundColor(.appWarmGray)
                    .frame(maxWidth: .infinity, minHeight: 160)
            } else {
                Chart(points) { point in
                    LineMark(
                        x: .value("Date", point.date),
                        y: .value("Total", point.total ?? 0)
                    )
                    .foregroundStyle(Color.appViolet)
                    .interpolationMethod(.catmullRom)

                    AreaMark(
                        x: .value("Date", point.date),
                        y: .value("Total", point.total ?? 0)
                    )
                    .foregroundStyle(Color.appViolet.opacity(0.12))
                    .interpolationMethod(.catmullRom)
                }
                .chartYScale(domain: 0...100)
                .chartXAxis(.hidden)
                .frame(height: 220)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }

    // MARK: - Expression bank

    private var bankSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Expression bank")
                .font(.roundedHeadline()).foregroundColor(.appCharcoal)
            if model.expressions.isEmpty {
                Text("Saved corrections and phrases will appear here.")
                    .font(.system(size: 13)).foregroundColor(.appWarmGray)
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else {
                ForEach(model.expressions) { expr in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(expr.content)
                            .font(.system(size: 15, weight: .medium)).foregroundColor(.appCharcoal)
                        if let natural = expr.naturalExpression, !natural.isEmpty {
                            Text(natural)
                                .font(.system(size: 13)).foregroundColor(.diffNatural)
                        }
                        Text(expr.type.replacingOccurrences(of: "_", with: " "))
                            .font(.system(size: 10, weight: .bold)).foregroundColor(.appWarmGray)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(Color.appBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }
}

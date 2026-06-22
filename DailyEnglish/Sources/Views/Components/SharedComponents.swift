import SwiftUI

// MARK: - CEFR pill (+ verbatim disclaimer)

struct CEFRPill: View {
    let level: String

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "chart.bar.fill")
                .font(.system(size: 10, weight: .bold))
            Text("CEFR \(level)")
                .font(.system(size: 12, weight: .bold, design: .rounded))
        }
        .foregroundColor(.appViolet)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color.appViolet.opacity(0.12))
        .clipShape(Capsule())
    }
}

struct CEFRDisclaimer: View {
    var body: some View {
        Text(AppConstants.cefrDisclaimer)
            .font(.system(size: 11))
            .foregroundColor(.appWarmGray)
            .padding(11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.appBackground)
            .clipShape(RoundedRectangle(cornerRadius: 11))
    }
}

// MARK: - Score chip

struct ScoreChip: View {
    let label: String
    let value: Int
    var tint: Color = .appTeal

    var body: some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.appWarmGray)
            Text("\(value)")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundColor(tint)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(tint.opacity(0.10))
        .clipShape(Capsule())
    }
}

// MARK: - Mascot

struct MascotBadge: View {
    var size: CGFloat = 44

    var body: some View {
        Image("mascot_cleo")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(Circle())
            .overlay(Circle().stroke(Color.appBorder, lineWidth: 1))
    }
}

// MARK: - 3-tier feedback diff

/// original (struck, coral) → corrected (teal) → natural (violet).
struct FeedbackDiffView: View {
    let feedback: FeedbackPayload

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            tier(
                title: "You wrote",
                text: feedback.original,
                color: .diffOriginal,
                struck: true,
                icon: "pencil"
            )
            tier(
                title: "Corrected",
                text: feedback.corrected,
                color: .diffCorrected,
                struck: false,
                icon: "checkmark.circle.fill"
            )
            tier(
                title: "More natural",
                text: feedback.natural_version,
                color: .diffNatural,
                struck: false,
                icon: "sparkles"
            )
        }
    }

    @ViewBuilder
    private func tier(title: String, text: String, color: Color, struck: Bool, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .bold))
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .tracking(0.5)
            }
            .foregroundColor(color)

            Text(text)
                .font(.system(size: 16))
                .strikethrough(struck, color: color)
                .foregroundColor(struck ? .appWarmGray : .appCharcoal)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(color.opacity(0.07))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(color.opacity(0.25), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Flow layout (wrapping chips)

/// A simple wrapping layout: lays children left-to-right, wrapping to the next
/// line when the row runs out of width. Used by the topic chips / quick-fills.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var rows: [[LayoutSubviews.Element]] = [[]]
        var rowWidth: CGFloat = 0
        var totalHeight: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if rowWidth + size.width > maxWidth, !rows[rows.count - 1].isEmpty {
                totalHeight += rowHeight + spacing
                rows.append([])
                rowWidth = 0
                rowHeight = 0
            }
            rows[rows.count - 1].append(subview)
            rowWidth += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        totalHeight += rowHeight
        return CGSize(width: maxWidth == .infinity ? rowWidth : maxWidth, height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        let maxWidth = bounds.width
        var x = bounds.minX
        var y = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > bounds.minX + maxWidth, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

// MARK: - Primary button

struct PrimaryButtonStyle: ButtonStyle {
    var tint: Color = .appTeal
    var enabled: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(enabled ? tint : tint.opacity(0.4))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

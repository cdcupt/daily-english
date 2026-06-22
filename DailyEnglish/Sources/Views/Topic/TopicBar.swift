import SwiftUI

/// A slim row pinned at the top of Study, above the item card and present across
/// loading / practice / empty states. Default shows the adaptive mix plus a
/// "Choose a topic" trigger; when a topic is active it shows a colour-coded chip
/// (teal = category, violet = custom) with a clear "×". Mirrors the web TopicBar.
struct TopicBar: View {
    let topic: ActiveTopic?
    let isBusy: Bool
    let onOpenPicker: () -> Void
    let onClear: () -> Void

    var body: some View {
        if let topic {
            activeChip(topic)
        } else {
            adaptiveDefault
        }
    }

    private var adaptiveDefault: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Color.appTeal)
                .frame(width: 7, height: 7)
            Text("Today's mix · Adaptive")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.appWarmGray)
            Spacer()
            Button(action: onOpenPicker) {
                HStack(spacing: 4) {
                    Image(systemName: "plus")
                        .font(.system(size: 11, weight: .bold))
                    Text("Choose a topic")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundColor(.appTeal)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.appPaper)
        .overlay(
            RoundedRectangle(cornerRadius: 12).stroke(Color.appBorder, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func activeChip(_ topic: ActiveTopic) -> some View {
        let tint: Color = topic.isCustom ? .appViolet : .appTeal
        let kindLabel = topic.isCustom ? "Custom" : "Topic"

        return HStack(spacing: 8) {
            Button(action: onOpenPicker) {
                HStack(spacing: 6) {
                    Text(kindLabel.uppercased())
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .tracking(0.4)
                        .foregroundColor(tint)
                    Text(topic.label)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.appCharcoal)
                        .lineLimit(1)
                }
            }
            if topic.isGenerating {
                Text("Building…")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(tint)
            }
            Spacer()
            Button(action: onClear) {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.appWarmGray)
                    .padding(6)
                    .background(Color.appBackground)
                    .clipShape(Circle())
            }
            .disabled(isBusy)
            .accessibilityLabel("Clear topic, back to adaptive mix")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(tint.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 12).stroke(tint.opacity(0.30), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

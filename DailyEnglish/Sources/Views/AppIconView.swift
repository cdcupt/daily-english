import SwiftUI

/// Temporary view for rendering and saving the 1024x1024 app icon.
/// To use: set AppIconExportView() as the root view in DailyEnglishApp,
/// run on simulator, tap "Save to Photos", then revert.
struct AppIconView: View {
    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(hex: "14B8A6"),
                    Color(hex: "0D9488"),
                    Color(hex: "0F766E"),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Decorative circles
            Circle()
                .fill(.white.opacity(0.08))
                .frame(width: 500, height: 500)
                .offset(x: -200, y: -250)

            Circle()
                .fill(.white.opacity(0.06))
                .frame(width: 400, height: 400)
                .offset(x: 250, y: 300)

            Circle()
                .fill(.white.opacity(0.04))
                .frame(width: 300, height: 300)
                .offset(x: 200, y: -200)

            // Main content
            VStack(spacing: 40) {
                Text("🐱")
                    .font(.system(size: 340))
                    .shadow(color: .black.opacity(0.15), radius: 20, y: 10)

                HStack(spacing: 24) {
                    Text("📖")
                        .font(.system(size: 80))
                    Text("✨")
                        .font(.system(size: 60))
                        .offset(y: -20)
                }
                .offset(y: -30)
            }
            .offset(y: -20)

            // Bottom accent
            VStack {
                Spacer()
                Text("DE")
                    .font(.system(size: 120, weight: .black, design: .rounded))
                    .foregroundStyle(.white.opacity(0.15))
                    .padding(.bottom, 60)
            }
        }
        .frame(width: 1024, height: 1024)
    }
}

// MARK: - Export Screen (run this to save the icon)

struct AppIconExportView: View {
    @State private var saved = false

    var body: some View {
        VStack(spacing: 24) {
            AppIconView()
                .frame(width: 256, height: 256)
                .clipShape(RoundedRectangle(cornerRadius: 56))

            Text("App Icon Preview")
                .font(.roundedTitle3())
                .foregroundColor(Color.appCharcoal)

            Button {
                saveIcon()
            } label: {
                HStack {
                    Image(systemName: saved ? "checkmark.circle.fill" : "square.and.arrow.down")
                    Text(saved ? "Saved!" : "Save to Photos (1024x1024)")
                }
                .font(.roundedHeadline())
                .foregroundStyle(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
                .background(saved ? Color.appGreen : Color.appTeal)
                .clipShape(Capsule())
            }

            Text("After saving, drag the image from Photos\ninto Assets.xcassets → AppIcon")
                .font(.caption)
                .foregroundColor(Color.appWarmGray)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.appBackground)
    }

    @MainActor
    private func saveIcon() {
        let renderer = ImageRenderer(content: AppIconView())
        renderer.scale = 1.0  // 1024x1024 at 1x = 1024x1024 pixels

        if let image = renderer.uiImage {
            UIImageWriteToSavedPhotosAlbum(image, nil, nil, nil)
            saved = true
        }
    }
}

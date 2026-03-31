import SwiftUI

/// Temporary view for rendering the app icon at 1024x1024.
/// To use: set this as the root view in DailyEnglishApp, run on simulator,
/// take a screenshot, crop to the icon, then remove this file.
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
                // Cat mascot
                Text("🐱")
                    .font(.system(size: 340))
                    .shadow(color: .black.opacity(0.15), radius: 20, y: 10)

                // Small book accent
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

            // Bottom accent: "DE" letters
            VStack {
                Spacer()
                Text("DE")
                    .font(.system(size: 120, weight: .black, design: .rounded))
                    .foregroundStyle(.white.opacity(0.15))
                    .padding(.bottom, 60)
            }
        }
        .frame(width: 1024, height: 1024)
        .clipShape(RoundedRectangle(cornerRadius: 0))
    }
}

#Preview {
    AppIconView()
        .previewLayout(.fixed(width: 1024, height: 1024))
}

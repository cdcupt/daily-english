import SwiftUI

struct SplashView: View {
    @State private var catScale: CGFloat = 0.5
    @State private var catOpacity: Double = 0
    @State private var titleOffset: CGFloat = 30
    @State private var titleOpacity: Double = 0
    @State private var subtitleOpacity: Double = 0
    @State private var mascotBounce: CGFloat = 0
    @State private var dotsOpacity: Double = 0

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(hex: "F0FDFA"),
                    Color.appBackground,
                    Color(hex: "FEF3C7").opacity(0.3),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                // Mascot characters row
                HStack(spacing: 16) {
                    Image("mascot_owl")
                        .resizable().scaledToFit()
                        .frame(width: 36, height: 36)
                        .offset(y: mascotBounce)
                    Image("mascot_fox")
                        .resizable().scaledToFit()
                        .frame(width: 36, height: 36)
                        .offset(y: -mascotBounce)
                    Image("mascot_cat")
                        .resizable().scaledToFit()
                        .frame(width: 72, height: 72)
                        .scaleEffect(catScale)
                        .opacity(catOpacity)
                    Image("mascot_bee")
                        .resizable().scaledToFit()
                        .frame(width: 36, height: 36)
                        .offset(y: mascotBounce)
                    Image("mascot_bear")
                        .resizable().scaledToFit()
                        .frame(width: 36, height: 36)
                        .offset(y: -mascotBounce)
                }

                // App name
                VStack(spacing: 8) {
                    Text("Daily English")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundColor(Color.appCharcoal)
                        .offset(y: titleOffset)
                        .opacity(titleOpacity)

                    Text("Build your English skills, one day at a time")
                        .font(.system(size: 15, design: .rounded))
                        .foregroundColor(Color.appWarmGray)
                        .opacity(subtitleOpacity)
                }

                Spacer()

                // Loading dots
                HStack(spacing: 6) {
                    ForEach(0..<3, id: \.self) { i in
                        LoadingDot(delay: Double(i) * 0.2)
                    }
                }
                .opacity(dotsOpacity)
                .padding(.bottom, 60)
            }

            // Decorative skill color dots
            GeometryReader { geo in
                Circle()
                    .fill(Color.skillReading.opacity(0.15))
                    .frame(width: 120, height: 120)
                    .offset(x: -30, y: geo.size.height * 0.15)

                Circle()
                    .fill(Color.skillVocabulary.opacity(0.12))
                    .frame(width: 80, height: 80)
                    .offset(x: geo.size.width - 60, y: geo.size.height * 0.25)

                Circle()
                    .fill(Color.skillListening.opacity(0.1))
                    .frame(width: 60, height: 60)
                    .offset(x: geo.size.width * 0.2, y: geo.size.height * 0.75)

                Circle()
                    .fill(Color.skillWriting.opacity(0.12))
                    .frame(width: 90, height: 90)
                    .offset(x: geo.size.width - 80, y: geo.size.height * 0.7)
            }
            .allowsHitTesting(false)
        }
        .onAppear {
            // Cat entrance
            withAnimation(.spring(response: 0.6, dampingFraction: 0.6).delay(0.1)) {
                catScale = 1.0
                catOpacity = 1.0
            }

            // Title slide up
            withAnimation(.easeOut(duration: 0.5).delay(0.3)) {
                titleOffset = 0
                titleOpacity = 1.0
            }

            // Subtitle fade in
            withAnimation(.easeIn(duration: 0.4).delay(0.6)) {
                subtitleOpacity = 1.0
            }

            // Loading dots
            withAnimation(.easeIn(duration: 0.3).delay(0.8)) {
                dotsOpacity = 1.0
            }

            // Mascot bounce loop
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true).delay(0.5)) {
                mascotBounce = -6
            }
        }
    }

}

// MARK: - Loading Dot

struct LoadingDot: View {
    let delay: Double
    @State private var scale: CGFloat = 0.5

    var body: some View {
        Circle()
            .fill(Color.appTeal)
            .frame(width: 8, height: 8)
            .scaleEffect(scale)
            .onAppear {
                withAnimation(
                    .easeInOut(duration: 0.6)
                    .repeatForever(autoreverses: true)
                    .delay(delay)
                ) {
                    scale = 1.2
                }
            }
    }
}

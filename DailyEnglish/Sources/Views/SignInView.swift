import AuthenticationServices
import SwiftUI

/// Login-first sign-in gate. The app requires a linked account, so this is the
/// only thing an unauthenticated visitor sees: the Cleo hero plus the social
/// sign-in buttons as the primary CTA. Mirrors the web Onboarding screen.
struct SignInView: View {
    @Bindable var account: AccountStore

    var body: some View {
        ZStack {
            Color.appBackground.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 22) {
                    Spacer(minLength: 40)

                    MascotBadge(size: 110)

                    VStack(spacing: 12) {
                        Text("Practice English in real scenarios.")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundColor(.appCharcoal)
                            .multilineTextAlignment(.center)

                        Text("Order coffee, negotiate a deadline, check into a hotel — answer in English and get warm, three-tier coaching from Cleo. Sign in to start.")
                            .font(.system(size: 15))
                            .foregroundColor(.appWarmGray)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 8)

                    buttons

                    if let error = account.signInError {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundColor(.appCoral)
                            .multilineTextAlignment(.center)
                    }
                    if let error = account.bootstrapError {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundColor(.appCoral)
                            .multilineTextAlignment(.center)
                    }

                    Spacer(minLength: 30)
                }
                .padding(.horizontal, 28)
                .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private var buttons: some View {
        VStack(spacing: 12) {
            SignInWithAppleButton(.signIn) { _ in
                // The actual request is driven by AppleSignInController to control
                // the nonce; this label-only button hands off on tap.
            } onCompletion: { _ in }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 52)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .allowsHitTesting(false)
                .overlay(
                    Button {
                        Task { await account.signInWithApple() }
                    } label: {
                        Color.clear
                    }
                    .accessibilityLabel("Sign in with Apple")
                    .disabled(account.busyProvider != nil)
                )

            if account.busyProvider == "apple" {
                ProgressView().tint(.appTeal)
            }

            // Google button: only when an iOS GIDClientID is configured AND the
            // backend reports a Google client id (config-gated, dormant otherwise).
            if GoogleConfig.isAvailable && account.providers.hasGoogle {
                Button {
                    Task { await account.signInWithGoogle() }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "globe")
                            .font(.system(size: 16, weight: .semibold))
                        Text(account.busyProvider == "google" ? "Signing in…" : "Continue with Google")
                            .font(.system(size: 16, weight: .semibold, design: .rounded))
                    }
                    .foregroundColor(.appCharcoal)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(Color.appPaper)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14).stroke(Color.appBorder, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(account.busyProvider != nil)
            }
        }
        .frame(maxWidth: 360)
    }
}

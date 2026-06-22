import Foundation
import Observation

/// App-level account/auth controller backing the login-first gate.
///
/// On launch it establishes an anonymous device session under the hood (so the
/// session always exists), then loads `/auth/config` to learn which providers
/// are available. The app shows the sign-in gate until an account is *linked*
/// (a social provider stored in the keychain); once linked the TabView shows.
@Observable
@MainActor
final class AccountStore {
    enum Gate: Equatable {
        case loading        // bootstrapping anonymous session + config
        case signIn         // anonymous: show the sign-in gate
        case linked         // a social account is linked: show the app
    }

    private let api: APIClient
    private let tokens = TokenStore.shared

    var gate: Gate = .loading
    /// Providers whose clientId came back from /auth/config (drives buttons).
    var providers = AvailableProviders()
    /// The linked account email (for Settings), or nil when anonymous.
    var email: String?
    /// A provider sign-in is currently in flight.
    var busyProvider: String?
    var bootstrapError: String?
    var signInError: String?

    struct AvailableProviders: Equatable {
        var appleClientId: String?
        var googleClientId: String?
        var hasApple: Bool { true } // native Apple is always available on iOS
        var hasGoogle: Bool { googleClientId != nil }
    }

    init(api: APIClient = .shared) {
        self.api = api
        email = tokens.email
    }

    // MARK: - Lifecycle

    /// Establish the session + load config, then resolve the gate.
    func bootstrap() async {
        gate = tokens.isLinked ? .linked : .loading
        bootstrapError = nil
        do {
            try await api.ensureSession()
        } catch {
            bootstrapError = message(for: error)
        }
        await loadConfig()
        resolveGate()
    }

    /// Fetch /auth/config; failure leaves providers empty (Apple still works natively).
    private func loadConfig() async {
        do {
            let config = try await api.authConfig()
            providers = AvailableProviders(
                appleClientId: config.apple.clientId,
                googleClientId: config.google.clientId
            )
        } catch {
            // Dormant or unreachable config → no remote providers. Native Apple
            // sign-in does not need a config clientId, so the gate is never bricked.
            providers = AvailableProviders()
        }
    }

    private func resolveGate() {
        if tokens.isLinked {
            email = tokens.email
            gate = .linked
        } else {
            gate = .signIn
        }
    }

    // MARK: - Apple

    func signInWithApple() async {
        guard busyProvider == nil else { return }
        busyProvider = "apple"
        signInError = nil
        defer { busyProvider = nil }
        do {
            let controller = AppleSignInController()
            let credential = try await controller.signIn()
            let result = try await api.oauthApple(
                identityToken: credential.identityToken, nonce: credential.rawNonce
            )
            email = result.email
            gate = .linked
        } catch let error as AppleSignInController.SignInError {
            if case .cancelled = error { return }  // silent on user cancel
            signInError = error.errorDescription
        } catch {
            signInError = message(for: error)
        }
    }

    // MARK: - Google (config-gated; dormant until GIDClientID + backend client id exist)

    func signInWithGoogle() async {
        guard busyProvider == nil else { return }
        busyProvider = "google"
        signInError = nil
        defer { busyProvider = nil }
        do {
            let credential = try await GoogleSignInController.signIn()
            let result = try await api.oauthGoogle(idToken: credential.idToken, nonce: credential.rawNonce)
            email = result.email
            gate = .linked
        } catch let error as GoogleSignInController.SignInError {
            if case .cancelled = error { return }
            signInError = error.errorDescription
        } catch {
            signInError = message(for: error)
        }
    }

    // MARK: - Sign out

    /// Sign out on the server, clear local tokens, re-bootstrap anonymous, return to the gate.
    func signOut() async {
        guard busyProvider == nil else { return }
        busyProvider = "signout"
        defer { busyProvider = nil }
        do {
            try await api.signOut()
        } catch {
            // Server may already consider the token stale; clear locally regardless.
        }
        tokens.clear()
        email = nil
        gate = .loading
        do {
            try await api.ensureSession()
        } catch {
            bootstrapError = message(for: error)
        }
        // Refresh provider config so the gate's buttons (e.g. Google) reflect the
        // current backend state rather than going stale after re-login.
        await loadConfig()
        gate = .signIn
    }

    private func message(for error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }
}

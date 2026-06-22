import AuthenticationServices
import CryptoKit
import Foundation

/// Drives the native Sign in with Apple flow via ASAuthorizationController.
///
/// Apple requires the *hashed* nonce (SHA256) in the authorization request, and
/// our backend requires the *raw* nonce to bind the returned identity token to
/// this sign-in (anti-replay). So we generate one raw nonce, hand Apple its
/// SHA256, and report the raw nonce + identityToken back to the caller.
@MainActor
final class AppleSignInController: NSObject {
    /// The (identityToken, rawNonce) Apple returns on success.
    struct Credential {
        let identityToken: String
        let rawNonce: String
    }

    enum SignInError: LocalizedError {
        case cancelled
        case missingToken
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .cancelled: return "Sign in was cancelled."
            case .missingToken: return "Apple did not return an identity token."
            case let .failed(message): return message
            }
        }
    }

    private var continuation: CheckedContinuation<Credential, Error>?
    private var currentNonce: String?
    /// Retain the controller so it cannot deallocate before its delegate fires
    /// (which would leak the continuation and hang the sign-in flow).
    private var activeController: ASAuthorizationController?

    /// Presents the system Apple sign-in sheet and resolves with the credential.
    func signIn() async throws -> Credential {
        let rawNonce = try Self.randomNonceString()
        currentNonce = rawNonce

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256(rawNonce)

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.activeController = controller
            controller.performRequests()
        }
    }

    // MARK: - Nonce helpers

    /// A cryptographically secure random string for the OAuth nonce.
    private static func randomNonceString(length: Int = 32) throws -> String {
        let charset: [Character] =
            Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length
        while remaining > 0 {
            var random: UInt8 = 0
            let status = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
            guard status == errSecSuccess else {
                throw SignInError.failed("Could not generate a secure nonce.")
            }
            if random < charset.count {
                result.append(charset[Int(random)])
                remaining -= 1
            }
        }
        return result
    }

    private static func sha256(_ input: String) -> String {
        let digest = SHA256.hash(data: Data(input.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - ASAuthorizationControllerDelegate

extension AppleSignInController: ASAuthorizationControllerDelegate {
    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        defer {
            continuation = nil
            currentNonce = nil
            activeController = nil
        }
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let identityToken = String(data: tokenData, encoding: .utf8),
            let rawNonce = currentNonce
        else {
            continuation?.resume(throwing: SignInError.missingToken)
            return
        }
        continuation?.resume(returning: Credential(identityToken: identityToken, rawNonce: rawNonce))
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        defer {
            continuation = nil
            currentNonce = nil
            activeController = nil
        }
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            continuation?.resume(throwing: SignInError.cancelled)
        } else {
            continuation?.resume(throwing: SignInError.failed(error.localizedDescription))
        }
    }
}

// MARK: - ASAuthorizationControllerPresentationContextProviding

extension AppleSignInController: ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
            ?? scenes.first as? UIWindowScene
        return windowScene?.keyWindow
            ?? windowScene?.windows.first
            ?? ASPresentationAnchor()
    }
}

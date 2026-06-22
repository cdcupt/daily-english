import Foundation
#if canImport(GoogleSignIn)
import GoogleSignIn
import UIKit
#endif

/// Google Sign-In wrapper.
///
/// The GoogleSignIn SwiftPM package is wired up (project.yml `packages:`), but
/// the flow stays DORMANT until an iOS `GIDClientID` is present in Info.plist
/// AND the backend reports a Google client id (/auth/config). `GoogleConfig`
/// gates the button; if `signIn()` is somehow invoked without a client id it
/// throws `.notConfigured`. When the client id is supplied the real GIDSignIn
/// flow runs (idToken → POST /v1/auth/oauth/google) with no further code change.
enum GoogleSignInController {
    struct Credential {
        let idToken: String
        /// GoogleSignIn-iOS (8.x) does not support nonce binding, so this is nil
        /// for Google; the backend's verifyGoogle only enforces a nonce when one
        /// is supplied. Apple, which requires the nonce, is handled separately.
        let rawNonce: String?
    }

    enum SignInError: LocalizedError {
        case cancelled
        case notConfigured
        case missingToken
        case noPresenter
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .cancelled: return "Sign in was cancelled."
            case .notConfigured: return "Google sign-in is not configured yet."
            case .missingToken: return "Google did not return an ID token."
            case .noPresenter: return "Could not present Google sign-in."
            case let .failed(message): return message
            }
        }
    }

    @MainActor
    static func signIn() async throws -> Credential {
        guard let clientId = GoogleConfig.clientId else { throw SignInError.notConfigured }

        #if canImport(GoogleSignIn)
        guard let presenter = topViewController() else { throw SignInError.noPresenter }

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientId)

        // GoogleSignIn-iOS 8.x has no nonce parameter, so the ID token is not
        // nonce-bound; we send no nonce and the backend's verifyGoogle skips the
        // nonce check accordingly.
        return try await withCheckedThrowingContinuation { continuation in
            GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
                if let error {
                    if let gidError = error as? GIDSignInError, gidError.code == .canceled {
                        continuation.resume(throwing: SignInError.cancelled)
                    } else {
                        continuation.resume(throwing: SignInError.failed(error.localizedDescription))
                    }
                    return
                }
                guard let idToken = result?.user.idToken?.tokenString else {
                    continuation.resume(throwing: SignInError.missingToken)
                    return
                }
                continuation.resume(returning: Credential(idToken: idToken, rawNonce: nil))
            }
        }
        #else
        throw SignInError.notConfigured
        #endif
    }

    #if canImport(GoogleSignIn)
    @MainActor
    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes
        let windowScene = scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
            ?? scenes.first as? UIWindowScene
        var top = windowScene?.keyWindow?.rootViewController
            ?? windowScene?.windows.first?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }
    #endif
}

/// Reads the iOS Google client id from Info.plist (`GIDClientID`). When absent,
/// the Google button is hidden so the build/app works without the iOS client id.
enum GoogleConfig {
    static var clientId: String? {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
              !value.isEmpty else { return nil }
        return value
    }

    static var isAvailable: Bool { clientId != nil }
}

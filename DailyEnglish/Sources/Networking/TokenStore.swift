import Foundation
import Security

/// Persists the auth tokens + identity in the Keychain (never UserDefaults).
/// Tokens are short strings; we store each under a distinct account key.
struct TokenStore {
    static let shared = TokenStore()

    private let service = "com.cdcupt.DailyEnglish.auth"

    private enum Key: String {
        case access
        case refresh
        case userId
        case deviceId
        case email
        case provider
    }

    // MARK: - Public

    var accessToken: String? { read(.access) }
    var refreshToken: String? { read(.refresh) }
    var userId: String? { read(.userId) }
    var deviceId: String? { read(.deviceId) }

    /// The linked account email, or `nil` for an anonymous session.
    var email: String? { read(.email) }
    /// The linked provider ("apple" / "google"), or `nil` when anonymous.
    var provider: String? { read(.provider) }

    var hasSession: Bool { accessToken != nil }
    /// True once a social account is linked (the app gate opens on this).
    var isLinked: Bool { provider != nil }

    func save(session: AuthSession) {
        write(.access, value: session.access)
        write(.refresh, value: session.refresh)
        write(.userId, value: session.userId)
        write(.deviceId, value: session.deviceId)
    }

    /// Persist a successful OAuth exchange as the active linked session.
    func save(oauth: OAuthResult) {
        write(.access, value: oauth.access)
        write(.refresh, value: oauth.refresh)
        write(.userId, value: oauth.userId)
        write(.deviceId, value: oauth.deviceId)
        write(.email, value: oauth.email)
        write(.provider, value: oauth.provider)
    }

    func updateTokens(access: String, refresh: String) {
        write(.access, value: access)
        write(.refresh, value: refresh)
    }

    /// Drop only the linked-account identity (keeps tokens/device id intact).
    func clearAccountIdentity() {
        delete(.email)
        delete(.provider)
    }

    /// Returns the device id, generating + persisting a new one if absent.
    func ensureDeviceId() -> String {
        if let existing = deviceId, !existing.isEmpty { return existing }
        let generated = UUID().uuidString
        write(.deviceId, value: generated)
        return generated
    }

    func clear() {
        for key in [Key.access, .refresh, .userId, .deviceId, .email, .provider] { delete(key) }
    }

    // MARK: - Keychain primitives

    private func baseQuery(_ key: Key) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
    }

    private func read(_ key: Key) -> String? {
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Keychain accessibility per key. The session secrets (access/refresh tokens)
    /// are sensitive and must not sync off-device, so they require the device to be
    /// unlocked and stay device-local; identity/device metadata can stay as-is.
    private func accessibility(for key: Key) -> CFString {
        switch key {
        case .access, .refresh:
            return kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        case .userId, .deviceId, .email, .provider:
            return kSecAttrAccessibleAfterFirstUnlock
        }
    }

    private func write(_ key: Key, value: String) {
        let data = Data(value.utf8)
        let query = baseQuery(key)
        let attributes: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = data
            insert[kSecAttrAccessible as String] = accessibility(for: key)
            SecItemAdd(insert as CFDictionary, nil)
        }
    }

    private func delete(_ key: Key) {
        SecItemDelete(baseQuery(key) as CFDictionary)
    }
}

#if DEBUG
extension TokenStore {
    /// E2E-only: seed a pre-minted linked session from launch env so the app opens
    /// straight into the logged-in state without any sign-in or network bootstrap.
    /// No-op in release builds (this whole extension is `#if DEBUG`) and when the
    /// `E2E_ACCESS_TOKEN` env var is absent, so the normal flow is unaffected.
    /// Returns true only when a session was seeded.
    func seedE2ESessionFromEnvironmentIfPresent() -> Bool {
        let env = ProcessInfo.processInfo.environment
        guard let access = env["E2E_ACCESS_TOKEN"], !access.isEmpty else { return false }
        let refresh = env["E2E_REFRESH_TOKEN"] ?? ""
        let email = env["E2E_EMAIL"] ?? "e2e@dailingo.test"
        write(.access, value: access)
        write(.refresh, value: refresh)
        write(.email, value: email)
        write(.provider, value: "test")
        write(.userId, value: "e2e-user")
        _ = ensureDeviceId()
        return true
    }
}
#endif

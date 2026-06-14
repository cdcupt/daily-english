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
    }

    // MARK: - Public

    var accessToken: String? { read(.access) }
    var refreshToken: String? { read(.refresh) }
    var userId: String? { read(.userId) }
    var deviceId: String? { read(.deviceId) }

    var hasSession: Bool { accessToken != nil }

    func save(session: AuthSession) {
        write(.access, value: session.access)
        write(.refresh, value: session.refresh)
        write(.userId, value: session.userId)
        write(.deviceId, value: session.deviceId)
    }

    func updateTokens(access: String, refresh: String) {
        write(.access, value: access)
        write(.refresh, value: refresh)
    }

    /// Returns the device id, generating + persisting a new one if absent.
    func ensureDeviceId() -> String {
        if let existing = deviceId, !existing.isEmpty { return existing }
        let generated = UUID().uuidString
        write(.deviceId, value: generated)
        return generated
    }

    func clear() {
        for key in [Key.access, .refresh, .userId, .deviceId] { delete(key) }
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

    private func write(_ key: Key, value: String) {
        let data = Data(value.utf8)
        let query = baseQuery(key)
        let attributes: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = data
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(insert as CFDictionary, nil)
        }
    }

    private func delete(_ key: Key) {
        SecItemDelete(baseQuery(key) as CFDictionary)
    }
}

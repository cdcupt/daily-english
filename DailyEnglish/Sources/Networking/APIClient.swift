import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case transport(Error)
    case http(Int)
    case server(code: String, message: String)
    case empty
    case decoding(Error)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid request URL."
        case let .transport(err): return err.localizedDescription
        case let .http(code): return "Server returned HTTP \(code)."
        case let .server(_, message): return message
        case .empty: return "The server returned no data."
        case let .decoding(err): return "Could not read the server response. \(err.localizedDescription)"
        case .unauthorized: return "Your session expired. Please try again."
        }
    }
}

/// Thin URLSession client against the Scenario English backend.
/// Unwraps the `{ data, error, meta }` envelope, injects the Bearer access
/// token, and transparently refreshes once on 401 (TECH §B3).
actor APIClient {
    static let shared = APIClient()

    // Trailing slash is REQUIRED: URL(string:relativeTo:) replaces the last path
    // segment of a base without one, which would drop the "/v1" prefix and 404.
    private let baseURL = URL(string: "https://api.english.daichenlab.com/v1/")!
    private let session: URLSession
    private let tokens = TokenStore.shared

    init(session: URLSession = .shared) {
        self.session = session
    }

    // MARK: - Auth

    func authenticateAnonymous() async throws -> AuthSession {
        let deviceId = tokens.ensureDeviceId()
        let body = ["deviceId": deviceId]
        let auth: AuthSession = try await send(
            path: "auth/anonymous", method: "POST", body: body, authenticated: false, allowRetry: false
        )
        tokens.save(session: auth)
        return auth
    }

    /// Ensures a valid session exists, performing anonymous onboarding on first launch.
    @discardableResult
    func ensureSession() async throws -> Bool {
        if tokens.hasSession { return true }
        _ = try await authenticateAnonymous()
        return true
    }

    // MARK: - Account / OAuth

    /// GET /v1/auth/config — which social providers the backend has wired up.
    func authConfig() async throws -> AuthConfig {
        try await send(path: "auth/config", method: "GET", authenticated: false, allowRetry: false)
    }

    /// POST /v1/auth/oauth/apple — exchange a verified Apple identity token for a
    /// linked session. Persists the re-issued tokens + identity.
    func oauthApple(identityToken: String, nonce: String) async throws -> OAuthResult {
        let body = ["identityToken": identityToken, "nonce": nonce]
        let result: OAuthResult = try await send(
            path: "auth/oauth/apple", method: "POST", body: body, authenticated: true, allowRetry: false
        )
        tokens.save(oauth: result)
        return result
    }

    /// POST /v1/auth/oauth/google — exchange a Google ID token for a linked session.
    /// `nonce` is optional: GoogleSignIn-iOS does not nonce-bind the token, and the
    /// backend only enforces the nonce when one is supplied.
    func oauthGoogle(idToken: String, nonce: String?) async throws -> OAuthResult {
        var body = ["idToken": idToken]
        if let nonce { body["nonce"] = nonce }
        let result: OAuthResult = try await send(
            path: "auth/oauth/google", method: "POST", body: body, authenticated: true, allowRetry: false
        )
        tokens.save(oauth: result)
        return result
    }

    /// GET /v1/auth/me — the current session's identity (anonymous vs linked).
    func me() async throws -> MeResponse {
        try await send(path: "auth/me", method: "GET")
    }

    /// POST /v1/auth/signout — invalidate server tokens; the caller then clears
    /// local tokens and re-bootstraps anonymously.
    func signOut() async throws {
        struct SignOutResult: Decodable { let signedOut: Bool? }
        let _: SignOutResult = try await send(path: "auth/signout", method: "POST", body: EmptyBody())
    }

    // MARK: - Topic sessions

    func topics() async throws -> TopicsResponse {
        try await send(path: "topics", method: "GET")
    }

    func currentTopic() async throws -> TopicResult {
        try await send(path: "study/topic", method: "GET")
    }

    func setCategoryTopic(_ category: String) async throws -> TopicResult {
        try await send(path: "study/topic", method: "POST", body: ["kind": "category", "category": category])
    }

    func setCustomTopic(_ topic: String) async throws -> TopicResult {
        try await send(path: "study/topic", method: "POST", body: ["kind": "custom", "topic": topic])
    }

    func clearTopic() async throws -> TopicResult {
        try await send(path: "study/topic", method: "DELETE")
    }

    // MARK: - Review

    /// POST /v1/review/:id/complete — grade a due review (0–5) and reschedule via SM-2.
    func completeReview(expressionId: String, grade: Int) async throws {
        struct ReviewCompleteResult: Decodable { let expressionId: String? }
        let _: ReviewCompleteResult = try await send(
            path: "review/\(expressionId)/complete", method: "POST", body: ["grade": grade]
        )
    }

    private func refresh() async throws {
        guard let refresh = tokens.refreshToken else { throw APIError.unauthorized }
        let body = ["refresh": refresh]
        do {
            let res: RefreshResponse = try await send(
                path: "auth/refresh", method: "POST", body: body, authenticated: false, allowRetry: false
            )
            tokens.updateTokens(access: res.access, refresh: res.refresh)
        } catch {
            // Refresh failed → re-onboard anonymously.
            _ = try await authenticateAnonymous()
        }
    }

    // MARK: - Study

    func studyNext() async throws -> StudyNext? {
        try await sendOptional(path: "study/next", method: "GET")
    }

    /// GET /v1/study/next, keeping the envelope `meta` so the caller can read the
    /// empty sub-state (`meta.reason == "topic_warming"` while a custom topic
    /// generates, vs "empty_bank" when caught up). `data` may be nil.
    func studyNextRaw() async throws -> (next: StudyNext?, reason: String?) {
        try await requestWithMeta(path: "study/next", method: "GET")
    }

    func startSession(mode: String = "mixed") async throws -> SessionRef {
        try await send(path: "sessions", method: "POST", body: ["mode": mode])
    }

    func submitTurn(sessionId: String, itemId: String, userText: String) async throws -> TurnResult {
        try await send(
            path: "sessions/\(sessionId)/turns", method: "POST",
            body: ["itemId": itemId, "userText": userText]
        )
    }

    func finishSession(sessionId: String) async throws -> ScoreReport {
        try await send(path: "sessions/\(sessionId)/finish", method: "POST", body: EmptyBody())
    }

    // MARK: - Profile / trends

    func profile() async throws -> AbilityProfile {
        try await send(path: "profile", method: "GET")
    }

    func trends(days: Int = 30) async throws -> Trends {
        try await send(path: "profile/trends?days=\(days)", method: "GET")
    }

    // MARK: - Expressions

    func expressions(type: String? = nil) async throws -> [Expression] {
        var path = "expressions"
        if let type {
            var components = URLComponents()
            components.queryItems = [URLQueryItem(name: "type", value: type)]
            if let query = components.percentEncodedQuery { path += "?\(query)" }
        }
        return try await send(path: path, method: "GET")
    }

    func saveExpression(type: String, content: String, meaningCn: String? = nil) async throws -> Expression {
        var body: [String: String] = ["type": type, "content": content]
        if let meaningCn { body["meaningCn"] = meaningCn }
        return try await send(path: "expressions", method: "POST", body: body)
    }

    // MARK: - Core request plumbing

    private struct EmptyBody: Encodable {}

    /// Request that requires a non-null `data` payload.
    private func send<T: Decodable>(
        path: String,
        method: String,
        body: (any Encodable)? = nil,
        authenticated: Bool = true,
        allowRetry: Bool = true
    ) async throws -> T {
        guard let value: T = try await request(
            path: path, method: method, body: body, authenticated: authenticated, allowRetry: allowRetry
        ) else {
            throw APIError.empty
        }
        return value
    }

    /// Request where `data` may legitimately be null (e.g. empty study bank).
    private func sendOptional<T: Decodable>(
        path: String,
        method: String,
        body: (any Encodable)? = nil,
        authenticated: Bool = true,
        allowRetry: Bool = true
    ) async throws -> T? {
        try await request(path: path, method: method, body: body, authenticated: authenticated, allowRetry: allowRetry)
    }

    private func request<T: Decodable>(
        path: String,
        method: String,
        body: (any Encodable)?,
        authenticated: Bool,
        allowRetry: Bool
    ) async throws -> T? {
        let env: APIEnvelope<T> = try await requestEnvelope(
            path: path, method: method, body: body, authenticated: authenticated, allowRetry: allowRetry
        )
        return env.data
    }

    /// Like `studyNext`, but also surfaces the envelope `meta.reason`.
    private func requestWithMeta<T: Decodable>(
        path: String,
        method: String,
        body: (any Encodable)? = nil,
        authenticated: Bool = true,
        allowRetry: Bool = true
    ) async throws -> (next: T?, reason: String?) {
        let env: APIEnvelope<T> = try await requestEnvelope(
            path: path, method: method, body: body, authenticated: authenticated, allowRetry: allowRetry
        )
        return (env.data, env.meta?.reason)
    }

    /// Core HTTP + envelope decode. Returns the full envelope so callers can read
    /// either `data` alone or `data` + `meta`. Refreshes once on 401.
    private func requestEnvelope<T: Decodable>(
        path: String,
        method: String,
        body: (any Encodable)?,
        authenticated: Bool,
        allowRetry: Bool
    ) async throws -> APIEnvelope<T> {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        if authenticated, let token = tokens.accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            throw APIError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else { throw APIError.http(-1) }

        if http.statusCode == 401, authenticated, allowRetry {
            try await refresh()
            return try await requestEnvelope(
                path: path, method: method, body: body, authenticated: authenticated, allowRetry: false
            )
        }

        let envelope: APIEnvelope<T>
        do {
            envelope = try JSONDecoder().decode(APIEnvelope<T>.self, from: data)
        } catch {
            if !(200...299).contains(http.statusCode) { throw APIError.http(http.statusCode) }
            throw APIError.decoding(error)
        }

        if let err = envelope.error {
            throw APIError.server(code: err.code, message: err.message)
        }
        if !(200...299).contains(http.statusCode) {
            throw APIError.http(http.statusCode)
        }
        return envelope
    }
}

/// Type-erased Encodable so the client can accept heterogeneous bodies.
private struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    init(_ wrapped: any Encodable) {
        encodeFn = wrapped.encode
    }
    func encode(to encoder: Encoder) throws {
        try encodeFn(encoder)
    }
}

import SwiftUI
#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

@main
struct DailyEnglishApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    // Google OAuth redirect back into the app (reversed-client-id
                    // scheme). No-op until a GIDClientID + URL scheme are configured.
                    #if canImport(GoogleSignIn)
                    GIDSignIn.sharedInstance.handle(url)
                    #endif
                }
        }
    }
}

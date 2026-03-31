import SwiftData
import SwiftUI

@main
struct DailyEnglishApp: App {
    @State private var manager: PracticeManager?
    @State private var showSplash = true

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            AppSettings.self,
            DailyRecord.self,
            StreakData.self,
            DailySkillScore.self,
            Article.self,
            WritingEntry.self,
            VocabularyQuizDay.self,
            ListeningSession.self,
        ])
        let config = ModelConfiguration(isStoredInMemoryOnly: false)
        do {
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            // Schema migration failed — delete old store and retry
            let url = config.url
            try? FileManager.default.removeItem(at: url)
            let dir = url.deletingLastPathComponent()
            let name = url.lastPathComponent
            for suffix in ["-shm", "-wal"] {
                try? FileManager.default.removeItem(at: dir.appendingPathComponent(name + suffix))
            }
            do {
                return try ModelContainer(for: schema, configurations: [config])
            } catch {
                fatalError("Could not create ModelContainer: \(error)")
            }
        }
    }()

    var body: some Scene {
        WindowGroup {
            ZStack {
                if let manager, !showSplash {
                    ContentView(manager: manager)
                        .transition(.opacity)
                }

                if showSplash {
                    SplashView()
                        .transition(.opacity)
                }
            }
            .animation(.easeInOut(duration: 0.5), value: showSplash)
            .onAppear {
                let context = sharedModelContainer.mainContext
                manager = PracticeManager(modelContext: context)

                // Show splash for at least 2 seconds
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    showSplash = false
                }
            }
        }
        .modelContainer(sharedModelContainer)
    }
}

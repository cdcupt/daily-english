import SwiftData
import SwiftUI

@main
struct DailyEnglishApp: App {
    @State private var manager: PracticeManager?

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
            // Also remove journal/wal files
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
            Group {
                if let manager {
                    ContentView(manager: manager)
                } else {
                    ProgressView()
                        .onAppear {
                            let context = sharedModelContainer.mainContext
                            manager = PracticeManager(modelContext: context)
                        }
                }
            }
        }
        .modelContainer(sharedModelContainer)
    }
}

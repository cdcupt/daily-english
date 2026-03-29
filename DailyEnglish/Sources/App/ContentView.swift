import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            ReadingView()
                .tabItem {
                    Label("Reading", systemImage: "book")
                }

            WriteSpeakView()
                .tabItem {
                    Label("Write & Speak", systemImage: "pencil.and.outline")
                }

            VocabularyView()
                .tabItem {
                    Label("Vocabulary", systemImage: "textformat.abc")
                }

            ListeningView()
                .tabItem {
                    Label("Listening", systemImage: "headphones")
                }

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.circle")
                }
        }
    }
}

#Preview {
    ContentView()
}

import SwiftUI

struct ContentView: View {
    var manager: PracticeManager
    @State private var selectedTab: Int = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView(manager: manager, selectedTab: $selectedTab)
                .tag(0)
                .tabItem {
                    Image(systemName: "house.fill")
                }

            ReadingView(manager: manager)
                .tag(1)
                .tabItem {
                    Image(systemName: "book.fill")
                }

            WriteSpeakView(manager: manager)
                .tag(2)
                .tabItem {
                    Image(systemName: "pencil.and.outline")
                }

            VocabularyView(manager: manager)
                .tag(3)
                .tabItem {
                    Image(systemName: "textformat.abc")
                }

            ProfileView(manager: manager)
                .tag(4)
                .tabItem {
                    Image(systemName: "person.fill")
                }
        }
        .tint(Color.appTeal)
    }
}

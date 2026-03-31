import SwiftUI

struct TabItem {
    let icon: String
    let tag: Int
}

struct ContentView: View {
    var manager: PracticeManager
    @State private var selectedTab: Int = 0

    private let tabs: [TabItem] = [
        TabItem(icon: "house.fill", tag: 0),
        TabItem(icon: "book.fill", tag: 1),
        TabItem(icon: "pencil.and.outline", tag: 2),
        TabItem(icon: "textformat.abc", tag: 3),
        TabItem(icon: "headphones", tag: 4),
        TabItem(icon: "person.fill", tag: 5),
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Content area
            Group {
                switch selectedTab {
                case 0: HomeView(manager: manager, selectedTab: $selectedTab)
                case 1: ReadingView(manager: manager)
                case 2: WriteSpeakView(manager: manager)
                case 3: VocabularyView(manager: manager)
                case 4: ListeningView(manager: manager)
                case 5: ProfileView(manager: manager)
                default: HomeView(manager: manager, selectedTab: $selectedTab)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Custom tab bar
            Divider()
            HStack(spacing: 0) {
                ForEach(tabs, id: \.tag) { tab in
                    Button {
                        selectedTab = tab.tag
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: tab.icon)
                                .font(.system(size: 20))
                                .foregroundColor(selectedTab == tab.tag ? Color.appTeal : Color.appWarmGray)

                            // Active indicator dot
                            Circle()
                                .fill(selectedTab == tab.tag ? Color.appTeal : .clear)
                                .frame(width: 5, height: 5)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                        .padding(.bottom, 4)
                    }
                }
            }
            .padding(.bottom, 16) // Safe area padding
            .background(Color.white)
        }
        .ignoresSafeArea(.container, edges: .bottom)
    }
}

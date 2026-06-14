import SwiftUI

private struct TabItem {
    let icon: String
    let label: String
    let tag: Int
}

/// Custom 3-tab shell: Study · You · Settings (warm editorial identity).
struct ContentView: View {
    @State private var selectedTab: Int = 0

    private let tabs: [TabItem] = [
        TabItem(icon: "graduationcap.fill", label: "Study", tag: 0),
        TabItem(icon: "person.fill", label: "You", tag: 1),
        TabItem(icon: "gearshape.fill", label: "Settings", tag: 2),
    ]

    var body: some View {
        VStack(spacing: 0) {
            Group {
                switch selectedTab {
                case 0: StudyView()
                case 1: YouView()
                default: SettingsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Divider()
            HStack(spacing: 0) {
                ForEach(tabs, id: \.tag) { tab in
                    Button {
                        selectedTab = tab.tag
                    } label: {
                        VStack(spacing: 3) {
                            Image(systemName: tab.icon)
                                .font(.system(size: 19))
                            Text(tab.label)
                                .font(.system(size: 11, weight: .medium, design: .rounded))
                        }
                        .foregroundColor(selectedTab == tab.tag ? Color.appTeal : Color.appWarmGray)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                        .padding(.bottom, 4)
                    }
                }
            }
            .padding(.bottom, 16)
            .background(Color.appPaper)
        }
        .ignoresSafeArea(.container, edges: .bottom)
    }
}

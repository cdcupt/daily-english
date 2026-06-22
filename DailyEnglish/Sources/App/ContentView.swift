import SwiftUI

private struct TabItem {
    let icon: String
    let label: String
    let tag: Int
}

/// Root view: the login-first gate. Shows SignInView until an account is linked,
/// then the main TabView. The anonymous session is bootstrapped under the hood.
struct ContentView: View {
    @State private var account = AccountStore()

    var body: some View {
        Group {
            switch account.gate {
            case .loading:
                GateLoadingView()
            case .signIn:
                SignInView(account: account)
            case .linked:
                MainTabView(account: account)
            }
        }
        .task { await account.bootstrap() }
    }
}

private struct GateLoadingView: View {
    var body: some View {
        ZStack {
            Color.appBackground.ignoresSafeArea()
            VStack(spacing: 16) {
                MascotBadge(size: 84)
                ProgressView().tint(.appTeal)
            }
        }
    }
}

/// The signed-in shell: custom 3-tab bar (Study · You · Settings).
struct MainTabView: View {
    @Bindable var account: AccountStore
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
                default: SettingsView(account: account)
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

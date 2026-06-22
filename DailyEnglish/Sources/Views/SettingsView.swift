import SwiftUI

struct SettingsView: View {
    @AppStorage("nativeLanguage") private var nativeLanguage: String = "中文 (Chinese)"
    @AppStorage("ttsVoice") private var ttsVoice: String = "System"

    @Bindable var account: AccountStore
    @State private var showSignOutConfirm = false

    private let voices = ["System", "Marin", "Kore", "Alloy"]

    private var isSigningOut: Bool { account.busyProvider == "signout" }

    var body: some View {
        NavigationStack {
            Form {
                accountSection
                preferencesSection
                aboutSection
            }
            .scrollContentBackground(.hidden)
            .background(Color.appBackground.ignoresSafeArea())
            .navigationTitle("Settings")
        }
    }

    private var accountSection: some View {
        Section {
            HStack {
                MascotBadge(size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(account.email ?? "Signed in")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.appCharcoal)
                    Text(providerLabel)
                        .font(.system(size: 12))
                        .foregroundColor(.appWarmGray)
                }
            }
            Button(role: .destructive) {
                showSignOutConfirm = true
            } label: {
                if isSigningOut {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Signing out…")
                    }
                } else {
                    Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
            .disabled(isSigningOut)
            .confirmationDialog(
                "Sign out of your account?",
                isPresented: $showSignOutConfirm, titleVisibility: .visible
            ) {
                Button("Sign out", role: .destructive) {
                    Task { await account.signOut() }
                }
                Button("Cancel", role: .cancel) {}
            }
        } header: {
            Text("Account")
        }
    }

    private var providerLabel: String {
        switch TokenStore.shared.provider {
        case "apple": return "Signed in with Apple"
        case "google": return "Signed in with Google"
        default: return "Linked account"
        }
    }

    private var preferencesSection: some View {
        Section {
            Picker("Native language", selection: $nativeLanguage) {
                ForEach(AppConstants.supportedNativeLanguages, id: \.self) { Text($0).tag($0) }
            }
            Picker("Voice", selection: $ttsVoice) {
                ForEach(voices, id: \.self) { Text($0).tag($0) }
            }
        } header: {
            Text("Preferences")
        }
    }

    private var aboutSection: some View {
        Section {
            HStack {
                Text("Version")
                Spacer()
                Text("2.0").foregroundColor(.appWarmGray)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("About CEFR levels")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.appCharcoal)
                Text(AppConstants.cefrDisclaimer)
                    .font(.system(size: 12))
                    .foregroundColor(.appWarmGray)
            }
            .padding(.vertical, 4)
        } header: {
            Text("About")
        }
    }
}

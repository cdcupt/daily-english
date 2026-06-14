import SwiftUI

struct SettingsView: View {
    @AppStorage("nativeLanguage") private var nativeLanguage: String = "中文 (Chinese)"
    @AppStorage("ttsVoice") private var ttsVoice: String = "System"

    @State private var userId: String? = TokenStore.shared.userId
    @State private var showResetConfirm = false

    private let voices = ["System", "Marin", "Kore", "Alloy"]

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
                    Text("Anonymous account")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.appCharcoal)
                    Text(userId.map { "ID " + String($0.prefix(8)) } ?? "Not signed in")
                        .font(.system(size: 12))
                        .foregroundColor(.appWarmGray)
                }
            }
            Button(role: .destructive) {
                showResetConfirm = true
            } label: {
                Label("Reset device account", systemImage: "arrow.counterclockwise")
            }
            .confirmationDialog(
                "Reset this device account? Your progress is tied to it.",
                isPresented: $showResetConfirm, titleVisibility: .visible
            ) {
                Button("Reset", role: .destructive) {
                    TokenStore.shared.clear()
                    userId = nil
                }
                Button("Cancel", role: .cancel) {}
            }
        } header: {
            Text("Account")
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

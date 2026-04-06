import SwiftUI

struct ProfileView: View {
    var manager: PracticeManager
    @State private var showLevelDetail = false
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Overall Level Card
                    overallLevelCard

                    // Weekly Summary
                    WeeklyChartView(weekData: manager.weeklyRecords())

                    // Level Growth Chart
                    LevelGrowthChart(
                        scores: Dictionary(
                            uniqueKeysWithValues: Skill.allCases.map { skill in
                                (skill, manager.recentScores(for: skill, days: 30))
                            }
                        )
                    )
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
            }
            .background(Color.appBackground)
            .navigationTitle("Me")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape.fill")
                            .foregroundColor(Color.appTeal)
                    }
                }
            }
            .navigationDestination(isPresented: $showLevelDetail) {
                LevelDetailView(manager: manager)
            }
            .sheet(isPresented: $showSettings) {
                SettingsSheet(manager: manager)
            }
        }
    }

    // MARK: - Overall Level Card

    private var overallLevelCard: some View {
        let level = manager.overallLevel()
        return Button {
            showLevelDetail = true
        } label: {
            VStack(spacing: 8) {
                Image("mascot_cat")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 48, height: 48)
                    .mascotStyle()

                Text("Level \(level.level)")
                    .font(.roundedLargeNumber())
                    .foregroundColor(Color.appTeal)

                Text(level.label)
                    .font(.roundedHeadline())
                    .foregroundColor(Color.appCharcoal)

                Text("CEFR: \(level.cefr)")
                    .font(.caption)
                    .foregroundColor(Color.appWarmGray)

                Text("Tap to see detailed proficiency mapping →")
                    .font(.caption2)
                    .foregroundColor(Color.appTeal)
            }
            .frame(maxWidth: .infinity)
            .padding(20)
            .cardStyle()
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Settings Sheet

struct SettingsSheet: View {
    var manager: PracticeManager
    @Environment(\.dismiss) private var dismiss
    @State private var showExportOptions = false
    @State private var showImportPicker = false
    @State private var exportFileURL: IdentifiableURL?
    @State private var importMessage: String?
    @State private var importSuccess = false
    @State private var showPasswordPrompt = false
    @State private var password = ""
    @State private var pendingAction: (() -> Void)?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Header mascot
                    VStack(spacing: 8) {
                        Image("mascot_cat")
                            .resizable().scaledToFit()
                            .frame(width: 64, height: 64)
                            .mascotStyle(cornerRadius: 12)
                        Text("Settings")
                            .font(.roundedTitle2())
                            .foregroundColor(Color.appCharcoal)
                        Text("Customize your learning experience")
                            .font(.subheadline)
                            .foregroundColor(Color.appWarmGray)
                    }
                    .padding(.top, 8)

                    if let settings = manager.settings {
                        // Demo Mode Section
                        settingsCard(
                            icon: "play.circle.fill",
                            iconColor: Color.appGreen,
                            title: "Demo Mode",
                            mascot: "mascot_cat"
                        ) {
                            Toggle(isOn: Binding(
                                get: { settings.demoMode },
                                set: {
                                    settings.demoMode = $0
                                    manager.syncAISettings()
                                }
                            )) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Enable Demo Mode")
                                        .font(.subheadline)
                                        .foregroundColor(Color.appCharcoal)
                                    Text("Try all features without an API key. Uses sample content and system voice.")
                                        .font(.caption)
                                        .foregroundColor(Color.appWarmGray)
                                }
                            }
                            .tint(Color.appGreen)
                        }

                        // AI Provider Section
                        settingsCard(
                            icon: "brain",
                            iconColor: Color.skillWriting,
                            title: "AI Provider",
                            mascot: "mascot_owl"
                        ) {
                            Picker("Provider", selection: Binding(
                                get: { settings.provider },
                                set: {
                                    settings.provider = $0
                                    settings.aiModel = $0.defaultModel
                                    manager.syncAISettings()
                                }
                            )) {
                                ForEach(AIProvider.allCases) { provider in
                                    Text(provider.displayName).tag(provider)
                                }
                            }
                            .pickerStyle(.segmented)

                            settingsField(label: "API Key", icon: "key.fill", iconColor: Color.appCoral) {
                                SecureField("Enter your API key", text: Binding(
                                    get: { settings.apiKey },
                                    set: {
                                        settings.apiKey = $0
                                        manager.syncAISettings()
                                    }
                                ))
                                .textFieldStyle(.roundedBorder)
                            }

                            DisclosureGroup {
                                VStack(spacing: 0) {
                                    let selectedModel = settings.aiModel.isEmpty ? settings.provider.defaultModel : settings.aiModel
                                    ForEach(settings.provider.availableModels) { model in
                                        Button {
                                            settings.aiModel = model.id
                                            manager.syncAISettings()
                                        } label: {
                                            HStack {
                                                VStack(alignment: .leading, spacing: 2) {
                                                    Text(model.displayName)
                                                        .font(.subheadline)
                                                        .foregroundColor(Color.appCharcoal)
                                                    Text(model.price)
                                                        .font(.caption)
                                                        .foregroundColor(Color.appWarmGray)
                                                }
                                                Spacer()
                                                if model.id == selectedModel {
                                                    Image(systemName: "checkmark")
                                                        .font(.caption)
                                                        .fontWeight(.bold)
                                                        .foregroundColor(Color.appTeal)
                                                }
                                            }
                                            .padding(.vertical, 8)
                                            .padding(.horizontal, 4)
                                        }
                                        if model.id != settings.provider.availableModels.last?.id {
                                            Divider()
                                        }
                                    }
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "cpu")
                                        .font(.caption)
                                        .foregroundColor(Color.appWarmGray)
                                    Text("Model")
                                        .font(.caption)
                                        .foregroundColor(Color.appWarmGray)
                                    Spacer()
                                    let displayModel = settings.provider.availableModels.first(where: { $0.id == (settings.aiModel.isEmpty ? settings.provider.defaultModel : settings.aiModel) })
                                    Text(displayModel?.displayName ?? settings.provider.defaultModel)
                                        .font(.caption)
                                        .foregroundColor(Color.appTeal)
                                }
                            }
                            .tint(Color.appWarmGray)
                        }

                        // TTS Section
                        settingsCard(
                            icon: "speaker.wave.3.fill",
                            iconColor: Color.skillListening,
                            title: "Text-to-Speech",
                            mascot: "mascot_bear"
                        ) {
                            Picker("TTS Provider", selection: Binding(
                                get: { settings.ttsProviderEnum },
                                set: { settings.ttsProviderEnum = $0 }
                            )) {
                                ForEach(TTSProvider.allCases) { provider in
                                    Text(provider.displayName).tag(provider)
                                }
                            }
                            .pickerStyle(.segmented)

                            if settings.ttsProviderEnum == .gemini {
                                Picker("Voice", selection: Binding(
                                    get: { settings.geminiVoiceEnum },
                                    set: { settings.geminiVoiceEnum = $0 }
                                )) {
                                    ForEach(GeminiVoice.allCases) { voice in
                                        Text(voice.displayName).tag(voice)
                                    }
                                }
                            }

                            if settings.ttsProviderEnum == .openai {
                                settingsField(label: "TTS API Key (optional)", icon: "key.fill", iconColor: Color.appCoral) {
                                    SecureField("Uses AI key if empty", text: Binding(
                                        get: { settings.openAITTSApiKey ?? "" },
                                        set: { settings.openAITTSApiKey = $0.isEmpty ? nil : $0 }
                                    ))
                                    .textFieldStyle(.roundedBorder)
                                }

                                Picker("Voice", selection: Binding(
                                    get: { settings.openAIVoiceEnum },
                                    set: { settings.openAIVoiceEnum = $0 }
                                )) {
                                    ForEach(OpenAIVoice.allCases) { voice in
                                        Text(voice.displayName).tag(voice)
                                    }
                                }
                            }

                            if settings.ttsProviderEnum == .bytedance {
                                settingsField(label: "App ID", icon: "app.badge", iconColor: Color.skillVocabulary) {
                                    TextField("Volcengine App ID", text: Binding(
                                        get: { settings.bytedanceAppId },
                                        set: { settings.bytedanceAppId = $0 }
                                    ))
                                    .textFieldStyle(.roundedBorder)
                                    .autocorrectionDisabled()
                                }

                                settingsField(label: "Access Token", icon: "lock.fill", iconColor: Color.appCoral) {
                                    SecureField("Volcengine access token", text: Binding(
                                        get: { settings.bytedanceToken },
                                        set: { settings.bytedanceToken = $0 }
                                    ))
                                    .textFieldStyle(.roundedBorder)
                                }

                                settingsField(label: "Cluster", icon: "server.rack", iconColor: Color.appWarmGray) {
                                    TextField("e.g. volcano_tts", text: Binding(
                                        get: { settings.bytedanceCluster },
                                        set: { settings.bytedanceCluster = $0 }
                                    ))
                                    .textFieldStyle(.roundedBorder)
                                    .autocorrectionDisabled()
                                }

                                Picker("Voice", selection: Binding(
                                    get: { settings.bytedanceVoiceEnum },
                                    set: { settings.bytedanceVoiceEnum = $0 }
                                )) {
                                    ForEach(BytedanceVoice.allCases) { voice in
                                        Text(voice.displayName).tag(voice)
                                    }
                                }
                            }
                        }

                        // Practice Section
                        settingsCard(
                            icon: "flame.fill",
                            iconColor: Color.appCoral,
                            title: "Daily Practice",
                            mascot: "mascot_bee"
                        ) {
                            HStack {
                                Label("Articles per day", systemImage: "book.fill")
                                    .font(.subheadline)
                                    .foregroundColor(Color.appCharcoal)
                                Spacer()
                                Stepper("\(settings.articlesPerDay)",
                                        value: Binding(
                                            get: { settings.articlesPerDay },
                                            set: { settings.articlesPerDay = $0 }
                                        ),
                                        in: 2...5)
                                .fixedSize()
                            }

                            HStack {
                                Label("Listening sessions", systemImage: "headphones")
                                    .font(.subheadline)
                                    .foregroundColor(Color.appCharcoal)
                                Spacer()
                                Stepper("\(settings.listeningSessionsPerDay)",
                                        value: Binding(
                                            get: { settings.listeningSessionsPerDay },
                                            set: { settings.listeningSessionsPerDay = $0 }
                                        ),
                                        in: 1...5)
                                .fixedSize()
                            }
                        }
                        // Import / Export Section
                        settingsCard(
                            icon: "arrow.up.arrow.down",
                            iconColor: Color.appTeal,
                            title: "Config Sharing",
                            mascot: "mascot_fox"
                        ) {
                            // Import
                            Button {
                                showImportPicker = true
                            } label: {
                                HStack {
                                    Image(systemName: "square.and.arrow.down")
                                        .foregroundColor(Color.skillWriting)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Import Config")
                                            .font(.subheadline)
                                            .fontWeight(.medium)
                                            .foregroundColor(Color.appCharcoal)
                                        Text("Load settings from .elc file")
                                            .font(.caption)
                                            .foregroundColor(Color.appWarmGray)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundColor(Color.appWarmGray)
                                }
                            }

                            Divider()

                            // Export
                            Button {
                                showExportOptions = true
                            } label: {
                                HStack {
                                    Image(systemName: "square.and.arrow.up")
                                        .foregroundColor(Color.appTeal)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Export Config")
                                            .font(.subheadline)
                                            .fontWeight(.medium)
                                            .foregroundColor(Color.appCharcoal)
                                        Text("Share or backup your settings")
                                            .font(.caption)
                                            .foregroundColor(Color.appWarmGray)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundColor(Color.appWarmGray)
                                }
                            }

                            if let importMessage {
                                HStack(spacing: 4) {
                                    Image(systemName: importSuccess ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                                    Text(importMessage)
                                        .font(.caption)
                                }
                                .foregroundColor(importSuccess ? Color.appGreen : .red)
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
            }
            .background(Color.appBackground)
            .navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("Export Config", isPresented: $showExportOptions) {
                Button("Share (without API keys)") { exportConfig(mode: .share) }
                Button("Backup (with API keys)") { exportConfig(mode: .backup) }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Share mode strips sensitive keys. Backup includes everything.")
            }
            .fileImporter(isPresented: $showImportPicker, allowedContentTypes: [.json, .data], allowsMultipleSelection: false) { result in
                handleImport(result)
            }
            .sheet(item: $exportFileURL) { url in
                ActivityView(activityItems: [url])
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Text("Done")
                            .fontWeight(.semibold)
                            .foregroundColor(Color.appTeal)
                    }
                }
            }
        }
    }

    // MARK: - Settings Card

    private func settingsCard<Content: View>(
        icon: String,
        iconColor: Color,
        title: String,
        mascot: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundColor(iconColor)
                Text(title)
                    .font(.roundedHeadline())
                    .foregroundColor(Color.appCharcoal)
                Spacer()
                Image(mascot)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 32, height: 32)
                    .mascotStyle(cornerRadius: 8)
            }

            Divider()

            content()
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .shadow(color: .black.opacity(0.05), radius: 12, y: 6)
    }

    // MARK: - Settings Field

    private func settingsField<Content: View>(
        label: String,
        icon: String,
        iconColor: Color,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption)
                    .foregroundColor(iconColor)
                Text(label)
                    .font(.caption)
                    .foregroundColor(Color.appWarmGray)
            }
            content()
        }
    }

    // MARK: - Export

    private func exportConfig(mode: ConfigExportMode) {
        guard let settings = manager.settings else { return }

        var config: [String: Any] = [
            "aiProvider": settings.aiProvider,
            "aiModel": settings.aiModel,
            "articlesPerDay": settings.articlesPerDay,
            "listeningSessionsPerDay": settings.listeningSessionsPerDay,
            "ttsProvider": settings.ttsProvider,
            "geminiVoice": settings.geminiVoice,
            "openAITTSVoice": settings.openAITTSVoice,
            "bytedanceCluster": settings.bytedanceCluster,
            "bytedanceVoice": settings.bytedanceVoice,
        ]

        if mode == .backup {
            config["apiKey"] = settings.apiKey
            config["openAITTSApiKey"] = settings.openAITTSApiKey ?? ""
            config["bytedanceAppId"] = settings.bytedanceAppId
            config["bytedanceToken"] = settings.bytedanceToken
        }

        let envelope: [String: Any] = [
            "version": 1,
            "mode": mode.rawValue,
            "createdAt": ISO8601DateFormatter().string(from: .now),
            "config": config,
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: envelope, options: .prettyPrinted) else { return }

        let fileName = mode == .share ? "daily-english-share.elc" : "daily-english-backup.elc"
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent(fileName)
        try? data.write(to: tempURL)
        exportFileURL = IdentifiableURL(url: tempURL)
    }

    // MARK: - Import

    private func handleImport(_ result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            guard url.startAccessingSecurityScopedResource() else {
                importMessage = "Cannot access file"
                importSuccess = false
                return
            }
            defer { url.stopAccessingSecurityScopedResource() }

            guard let data = try? Data(contentsOf: url),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let version = json["version"] as? Int, version == 1,
                  let config = json["config"] as? [String: Any]
            else {
                importMessage = "Invalid config file"
                importSuccess = false
                return
            }

            let mode = json["mode"] as? String ?? "share"
            guard let settings = manager.settings else { return }

            // Apply non-sensitive fields
            if let v = config["aiProvider"] as? String { settings.aiProvider = v }
            if let v = config["aiModel"] as? String { settings.aiModel = v }
            if let v = config["articlesPerDay"] as? Int { settings.articlesPerDay = v }
            if let v = config["listeningSessionsPerDay"] as? Int { settings.listeningSessionsPerDay = v }
            if let v = config["ttsProvider"] as? String { settings.ttsProvider = v }
            if let v = config["geminiVoice"] as? String { settings.geminiVoice = v }
            if let v = config["openAITTSVoice"] as? String { settings.openAITTSVoice = v }
            if let v = config["bytedanceCluster"] as? String { settings.bytedanceCluster = v }
            if let v = config["bytedanceVoice"] as? String { settings.bytedanceVoice = v }

            // Only apply sensitive fields from backup
            if mode == "backup" {
                if let v = config["apiKey"] as? String, !v.isEmpty { settings.apiKey = v }
                if let v = config["openAITTSApiKey"] as? String, !v.isEmpty { settings.openAITTSApiKey = v }
                if let v = config["bytedanceAppId"] as? String, !v.isEmpty { settings.bytedanceAppId = v }
                if let v = config["bytedanceToken"] as? String, !v.isEmpty { settings.bytedanceToken = v }
            }

            manager.syncAISettings()
            importMessage = mode == "backup" ? "Backup restored successfully" : "Config imported (API keys preserved)"
            importSuccess = true

        case .failure:
            importMessage = "Failed to open file"
            importSuccess = false
        }
    }
}

// MARK: - Helper Types

enum ConfigExportMode: String {
    case share
    case backup
}

struct IdentifiableURL: Identifiable {
    let id = UUID()
    let url: URL
}

struct ActivityView: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Level Detail View

struct LevelDetailView: View {
    var manager: PracticeManager

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                let level = manager.overallLevel()

                // Overall
                VStack(spacing: 4) {
                    Text("Overall Level: \(level.level)")
                        .font(.roundedTitle2())
                        .foregroundColor(Color.appTeal)
                    Text(level.label)
                        .font(.roundedHeadline())
                        .foregroundColor(Color.appCharcoal)
                }

                // Comparison card
                VStack(alignment: .leading, spacing: 8) {
                    Text("How does this compare?")
                        .font(.roundedHeadline())
                    HStack {
                        Text("CEFR:")
                            .fontWeight(.medium)
                        Text("\(level.cefr)")
                    }
                    HStack {
                        Text("IELTS:")
                            .fontWeight(.medium)
                        Text("~\(level.ielts) (est.)")
                    }
                    HStack {
                        Text("TOEFL:")
                            .fontWeight(.medium)
                        Text("~\(level.toefl) (est.)")
                    }
                }
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .cardStyle()

                // CEFR description
                VStack(alignment: .leading, spacing: 8) {
                    Text("What \(level.cefr) means:")
                        .font(.roundedHeadline())
                    Text(level.cefrDescription)
                        .font(.subheadline)
                        .foregroundColor(Color.appWarmGray)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .cardStyle()

                // Reference table
                VStack(alignment: .leading, spacing: 8) {
                    Text("Level Mapping Reference")
                        .font(.roundedHeadline())

                    ForEach(EnglishLevel.levels, id: \.level) { lvl in
                        HStack {
                            Text("Lvl \(lvl.level)")
                                .frame(width: 40)
                            Text("\(lvl.scoreRange.lowerBound)-\(lvl.scoreRange.upperBound)")
                                .frame(width: 45)
                            Text(lvl.cefr)
                                .frame(width: 35)
                            Text(lvl.ielts)
                                .frame(width: 35)
                            Text(lvl.toefl)
                                .frame(width: 35)
                            Spacer()
                            if lvl.level == level.level {
                                Text("← You")
                                    .font(.caption)
                                    .foregroundColor(Color.appTeal)
                                    .fontWeight(.bold)
                            }
                        }
                        .font(.caption)
                        .foregroundColor(lvl.level == level.level ? Color.appTeal : Color.appCharcoal)
                        .padding(.vertical, 2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .cardStyle()

                // Disclaimer
                Text("ⓘ These are estimated equivalents based on your practice scores. For official certification, take the actual IELTS/TOEFL exam.")
                    .font(.caption)
                    .foregroundColor(Color.appWarmGray)
                    .multilineTextAlignment(.center)

                // Per-skill breakdown
                VStack(alignment: .leading, spacing: 8) {
                    Text("Per-Skill Breakdown")
                        .font(.roundedHeadline())

                    ForEach(Skill.allCases) { skill in
                        let skillLvl = manager.skillLevel(for: skill)
                        HStack {
                            Image(systemName: skill.icon)
                                .foregroundStyle(skill.color)
                            Text(skill.displayName)
                                .font(.subheadline)
                            Spacer()
                            Text("Lvl \(skillLvl.level)")
                                .font(.caption)
                                .fontWeight(.bold)
                            Text(skillLvl.cefr)
                                .font(.caption)
                                .foregroundColor(Color.appWarmGray)
                            Text("IELTS ~\(skillLvl.ielts)")
                                .font(.caption)
                                .foregroundColor(Color.appWarmGray)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .cardStyle()
            }
            .padding()
        }
        .background(Color.appBackground)
        .navigationTitle("My English Level")
        .navigationBarTitleDisplayMode(.inline)
    }
}

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
                Text("🐱")
                    .font(.system(size: 40))

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

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Header mascot
                    VStack(spacing: 8) {
                        Text("🐱")
                            .font(.system(size: 56))
                        Text("Settings")
                            .font(.roundedTitle2())
                            .foregroundColor(Color.appCharcoal)
                        Text("Customize your learning experience")
                            .font(.subheadline)
                            .foregroundColor(Color.appWarmGray)
                    }
                    .padding(.top, 8)

                    if let settings = manager.settings {
                        // AI Provider Section
                        settingsCard(
                            icon: "brain",
                            iconColor: Color.skillWriting,
                            title: "AI Provider",
                            mascot: "🦉"
                        ) {
                            Picker("Provider", selection: Binding(
                                get: { settings.provider },
                                set: {
                                    settings.provider = $0
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

                            settingsField(label: "Custom Model", icon: "cpu", iconColor: Color.appWarmGray) {
                                TextField("Default: \(settings.provider.defaultModel)", text: Binding(
                                    get: { settings.aiModel },
                                    set: {
                                        settings.aiModel = $0
                                        manager.syncAISettings()
                                    }
                                ))
                                .textFieldStyle(.roundedBorder)
                                .autocorrectionDisabled()
                            }
                        }

                        // TTS Section
                        settingsCard(
                            icon: "speaker.wave.3.fill",
                            iconColor: Color.skillListening,
                            title: "Text-to-Speech",
                            mascot: "🐻"
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

                            if settings.ttsProviderEnum == .openai {
                                settingsField(label: "TTS API Key (optional)", icon: "key.fill", iconColor: Color.appCoral) {
                                    SecureField("Uses AI key if empty", text: Binding(
                                        get: { settings.openAITTSApiKey ?? "" },
                                        set: { settings.openAITTSApiKey = $0.isEmpty ? nil : $0 }
                                    ))
                                    .textFieldStyle(.roundedBorder)
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

                                HStack(spacing: 4) {
                                    Image(systemName: "info.circle")
                                        .font(.caption2)
                                    Text("Get credentials at console.volcengine.com/speech/app")
                                        .font(.caption)
                                }
                                .foregroundColor(Color.skillListening)
                            }
                        }

                        // Practice Section
                        settingsCard(
                            icon: "flame.fill",
                            iconColor: Color.appCoral,
                            title: "Daily Practice",
                            mascot: "🐝"
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
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
            }
            .background(Color.appBackground)
            .navigationBarTitleDisplayMode(.inline)
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
                Text(mascot)
                    .font(.title2)
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

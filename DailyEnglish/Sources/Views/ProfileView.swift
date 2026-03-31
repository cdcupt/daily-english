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
            Form {
                if let settings = manager.settings {
                    // AI Provider
                    Section("AI Provider") {
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

                        SecureField("API Key", text: Binding(
                            get: { settings.apiKey },
                            set: {
                                settings.apiKey = $0
                                manager.syncAISettings()
                            }
                        ))

                        TextField("Custom Model (optional)", text: Binding(
                            get: { settings.aiModel },
                            set: {
                                settings.aiModel = $0
                                manager.syncAISettings()
                            }
                        ))
                        .autocorrectionDisabled()

                        if settings.aiModel.isEmpty {
                            Text("Default: \(settings.provider.defaultModel)")
                                .font(.caption)
                                .foregroundColor(Color.appWarmGray)
                        }
                    }

                    // TTS Provider
                    Section("Text-to-Speech") {
                        Picker("TTS Provider", selection: Binding(
                            get: { settings.ttsProviderEnum },
                            set: { settings.ttsProviderEnum = $0 }
                        )) {
                            ForEach(TTSProvider.allCases) { provider in
                                Text(provider.displayName).tag(provider)
                            }
                        }

                        if settings.ttsProviderEnum == .openai {
                            SecureField("OpenAI TTS API Key (optional)", text: Binding(
                                get: { settings.openAITTSApiKey ?? "" },
                                set: { settings.openAITTSApiKey = $0.isEmpty ? nil : $0 }
                            ))
                            Text("Leave empty to use your AI API key")
                                .font(.caption)
                                .foregroundColor(Color.appWarmGray)
                        }

                        if settings.ttsProviderEnum == .bytedance {
                            TextField("App ID", text: Binding(
                                get: { settings.bytedanceAppId },
                                set: { settings.bytedanceAppId = $0 }
                            ))
                            .autocorrectionDisabled()

                            SecureField("Access Token", text: Binding(
                                get: { settings.bytedanceToken },
                                set: { settings.bytedanceToken = $0 }
                            ))

                            TextField("Cluster", text: Binding(
                                get: { settings.bytedanceCluster },
                                set: { settings.bytedanceCluster = $0 }
                            ))
                            .autocorrectionDisabled()

                            Picker("Voice", selection: Binding(
                                get: { settings.bytedanceVoiceEnum },
                                set: { settings.bytedanceVoiceEnum = $0 }
                            )) {
                                ForEach(BytedanceVoice.allCases) { voice in
                                    Text(voice.displayName).tag(voice)
                                }
                            }

                            Text("Get credentials at console.volcengine.com/speech/app")
                                .font(.caption)
                                .foregroundColor(Color.appWarmGray)
                        }
                    }

                    // Practice
                    Section("Practice") {
                        Stepper("Articles per day: \(settings.articlesPerDay)",
                                value: Binding(
                                    get: { settings.articlesPerDay },
                                    set: { settings.articlesPerDay = $0 }
                                ),
                                in: 2...5)

                        Stepper("Listening sessions: \(settings.listeningSessionsPerDay)",
                                value: Binding(
                                    get: { settings.listeningSessionsPerDay },
                                    set: { settings.listeningSessionsPerDay = $0 }
                                ),
                                in: 1...5)
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
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

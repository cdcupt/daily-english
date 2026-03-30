import SwiftUI

struct ProfileView: View {
    var manager: PracticeManager
    @State private var showLevelDetail = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Overall Level Card
                    overallLevelCard

                    // Level Growth Chart
                    LevelGrowthChart(
                        scores: Dictionary(
                            uniqueKeysWithValues: Skill.allCases.map { skill in
                                (skill, manager.recentScores(for: skill, days: 30))
                            }
                        )
                    )

                    // Settings
                    settingsSection
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
            }
            .background(Color.appBackground)
            .navigationTitle("Me")
            .navigationDestination(isPresented: $showLevelDetail) {
                LevelDetailView(manager: manager)
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
                    .foregroundStyle(.appTeal)

                Text(level.label)
                    .font(.roundedHeadline())
                    .foregroundStyle(.appCharcoal)

                Text("CEFR: \(level.cefr)")
                    .font(.caption)
                    .foregroundStyle(.appWarmGray)

                Text("Tap to see detailed proficiency mapping →")
                    .font(.caption2)
                    .foregroundStyle(.appTeal)
            }
            .frame(maxWidth: .infinity)
            .padding(20)
            .cardStyle()
        }
        .buttonStyle(.plain)
    }

    // MARK: - Settings

    private var settingsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Settings")
                .font(.roundedHeadline())
                .foregroundStyle(.appCharcoal)

            if let settings = manager.settings {
                // AI Provider
                VStack(alignment: .leading, spacing: 4) {
                    Text("AI Provider")
                        .font(.caption)
                        .foregroundStyle(.appWarmGray)
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
                }

                // API Key
                VStack(alignment: .leading, spacing: 4) {
                    Text("API Key")
                        .font(.caption)
                        .foregroundStyle(.appWarmGray)
                    SecureField("Enter your API key", text: Binding(
                        get: { settings.apiKey },
                        set: {
                            settings.apiKey = $0
                            manager.syncAISettings()
                        }
                    ))
                    .textFieldStyle(.roundedBorder)
                }

                // Model override
                VStack(alignment: .leading, spacing: 4) {
                    Text("Custom Model (optional)")
                        .font(.caption)
                        .foregroundStyle(.appWarmGray)
                    TextField("Default: \(settings.provider.defaultModel)", text: Binding(
                        get: { settings.aiModel },
                        set: {
                            settings.aiModel = $0
                            manager.syncAISettings()
                        }
                    ))
                    .textFieldStyle(.roundedBorder)
                }

                // Articles per day
                Stepper("Articles per day: \(settings.articlesPerDay)",
                        value: Binding(
                            get: { settings.articlesPerDay },
                            set: { settings.articlesPerDay = $0 }
                        ),
                        in: 2...5)

                // Listening sessions per day
                Stepper("Listening sessions: \(settings.listeningSessionsPerDay)",
                        value: Binding(
                            get: { settings.listeningSessionsPerDay },
                            set: { settings.listeningSessionsPerDay = $0 }
                        ),
                        in: 1...5)

                // TTS
                Toggle("Use OpenAI TTS", isOn: Binding(
                    get: { settings.useTTSOpenAI },
                    set: { settings.useTTSOpenAI = $0 }
                ))
            }
        }
        .padding(16)
        .cardStyle()
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
                        .foregroundStyle(.appTeal)
                    Text(level.label)
                        .font(.roundedHeadline())
                        .foregroundStyle(.appCharcoal)
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
                        .foregroundStyle(.appWarmGray)
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
                                    .foregroundStyle(.appTeal)
                                    .fontWeight(.bold)
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(lvl.level == level.level ? .appTeal : .appCharcoal)
                        .padding(.vertical, 2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .cardStyle()

                // Disclaimer
                Text("ⓘ These are estimated equivalents based on your practice scores. For official certification, take the actual IELTS/TOEFL exam.")
                    .font(.caption)
                    .foregroundStyle(.appWarmGray)
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
                                .foregroundStyle(.appWarmGray)
                            Text("IELTS ~\(skillLvl.ielts)")
                                .font(.caption)
                                .foregroundStyle(.appWarmGray)
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

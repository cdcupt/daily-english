import SwiftUI

struct HomeView: View {
    var manager: PracticeManager
    @Binding var selectedTab: Int

    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Greeting + Streak
                    greetingSection

                    // Weekly Chart
                    WeeklyChartView(weekData: manager.weeklyRecords())

                    // Skill Progress
                    skillProgressSection

                    // Today's Tasks
                    todayTasksSection
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 20)
            }
            .background(Color.appBackground)
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    // MARK: - Greeting

    private var greetingSection: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text("🐱")
                        .font(.title)
                    Text(greetingText)
                        .font(.roundedTitle3())
                        .foregroundColor(Color.appCharcoal)
                }

                Text(streakMessage)
                    .font(.subheadline)
                    .foregroundColor(Color.appWarmGray)

                Text(Date.now.formattedDate)
                    .font(.caption)
                    .foregroundColor(Color.appWarmGray)
            }

            Spacer()

            // Streak badge
            if let streak = manager.streakData, streak.currentStreak > 0 {
                VStack(spacing: 2) {
                    Text("🔥")
                        .font(.title2)
                    Text("\(streak.currentStreak)")
                        .font(.roundedScore())
                        .foregroundColor(Color.appCoral)
                }
                .padding(12)
                .background(Color.appCoral.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
        }
        .padding(.top, 8)
    }

    private var greetingText: String {
        let hour = Calendar.current.component(.hour, from: .now)
        if hour < 12 { return "Good morning!" }
        if hour < 18 { return "Good afternoon!" }
        return "Good evening!"
    }

    private var streakMessage: String {
        guard let streak = manager.streakData else { return "Let's start today!" }
        switch streak.currentStreak {
        case 0: return "Let's start today!"
        case 1...3: return "Keep going!"
        case 4...7: return "You're on fire!"
        default: return "Amazing streak!"
        }
    }

    // MARK: - Skill Progress

    private var skillProgressSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Skill Progress")
                .font(.roundedHeadline())
                .foregroundColor(Color.appCharcoal)

            ForEach(Skill.allCases) { skill in
                SkillProgressBar(
                    skill: skill,
                    level: manager.skillLevel(for: skill),
                    averageScore: manager.skillAverageScore(for: skill)
                )
            }
        }
        .padding(16)
        .cardStyle()
    }

    // MARK: - Today's Tasks

    private var todayTasksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Today's Tasks")
                    .font(.roundedHeadline())
                    .foregroundColor(Color.appCharcoal)

                Spacer()

                let completed = manager.todayRecord?.completedCount ?? 0
                Text("\(completed)/4 ✓")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(Color.appTeal)
            }

            LazyVGrid(columns: columns, spacing: 12) {
                TaskCardView(
                    skill: .reading,
                    isCompleted: manager.todayRecord?.readingCompleted ?? false,
                    scoreDisplay: nil,
                    progressText: nil
                ) {
                    selectedTab = 1  // Reading tab
                }

                TaskCardView(
                    skill: .writing,
                    isCompleted: manager.todayRecord?.writeSpeakCompleted ?? false,
                    scoreDisplay: nil,
                    progressText: nil
                ) {
                    selectedTab = 2  // Write & Speak tab
                }

                TaskCardView(
                    skill: .vocabulary,
                    isCompleted: manager.todayRecord?.vocabularyCompleted ?? false,
                    scoreDisplay: nil,
                    progressText: nil
                ) {
                    selectedTab = 3  // Vocabulary tab
                }

                TaskCardView(
                    skill: .listening,
                    isCompleted: manager.todayRecord?.listeningCompleted ?? false,
                    scoreDisplay: nil,
                    progressText: nil
                ) {
                    // TODO: Push listening view
                }
            }
        }
    }
}

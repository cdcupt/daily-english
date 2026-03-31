import SwiftUI

enum WriteSpeakPhase {
    case topic
    case writing
    case feedback
    case speaking
    case results
}

struct WriteSpeakView: View {
    var manager: PracticeManager
    @State private var phase: WriteSpeakPhase = .topic
    @State private var topic: String = ""
    @State private var essayText: String = ""
    @State private var writingReview: WritingReview?
    @State private var entry: WritingEntry?
    @State private var isLoading: Bool = false
    @State private var error: String?

    // Speaking
    @State private var audioData: Data?
    @State private var hasRecorded: Bool = false
    @State private var pronunciationResult: PronunciationResult?

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .topic: topicPhase
                case .writing: writingPhase
                case .feedback: feedbackPhase
                case .speaking: speakingPhase
                case .results: resultsPhase
                }
            }
            .background(Color.appBackground)
            .navigationTitle("Writing")
        }
        .onAppear(perform: loadExisting)
    }

    // MARK: - Topic Phase

    private var topicPhase: some View {
        VStack(spacing: 20) {
            Text("🦊")
                .font(.system(size: 60))
            Text("Today's Topic")
                .font(.roundedTitle2())
                .foregroundColor(Color.appCharcoal)

            Text(topic.isEmpty ? "Tap below to get your topic" : topic)
                .font(.body)
                .foregroundColor(Color.appCharcoal)
                .multilineTextAlignment(.center)
                .padding()
                .frame(maxWidth: .infinity)
                .cardStyle()

            Button {
                if topic.isEmpty {
                    topic = Prompts.randomWritingTopic()
                } else {
                    phase = .writing
                }
            } label: {
                Text(topic.isEmpty ? "Get Topic" : "Start Writing")
                    .font(.roundedHeadline())
                    .foregroundStyle(.white)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 14)
                    .background(Color.skillWriting)
                    .clipShape(Capsule())
            }
        }
        .padding()
    }

    // MARK: - Writing Phase

    private var writingPhase: some View {
        VStack(spacing: 16) {
            Text(topic)
                .font(.subheadline)
                .foregroundColor(Color.appWarmGray)
                .padding(.horizontal)

            TextEditor(text: $essayText)
                .font(.body)
                .padding(12)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(color: .black.opacity(0.05), radius: 8, y: 4)
                .padding(.horizontal)

            HStack {
                let wordCount = essayText.split(separator: " ").count
                Text("\(wordCount) words")
                    .font(.caption)
                    .foregroundColor(wordCount >= 10 ? Color.appGreen : Color.appWarmGray)

                Spacer()

                Button {
                    Task { await submitEssay() }
                } label: {
                    HStack {
                        if isLoading {
                            ProgressView()
                                .tint(.white)
                        }
                        Text("Submit")
                            .font(.roundedHeadline())
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(essayText.split(separator: " ").count >= 10 ? Color.skillWriting : Color.gray)
                    .clipShape(Capsule())
                }
                .disabled(essayText.split(separator: " ").count < 10 || isLoading)
            }
            .padding(.horizontal)

            if let error {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
            }
        }
        .padding(.vertical)
    }

    // MARK: - Feedback Phase

    private var feedbackPhase: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let review = writingReview {
                    // Score
                    HStack {
                        Text("🦊")
                            .font(.system(size: 40))
                        VStack(alignment: .leading) {
                            Text("\(review.score)/100")
                                .font(.roundedLargeNumber())
                                .foregroundColor(Color.skillWriting)
                            Text("Writing Score")
                                .font(.caption)
                                .foregroundColor(Color.appWarmGray)
                        }
                    }

                    // Sub-scores
                    HStack(spacing: 12) {
                        subScoreView("Grammar", review.grammarScore)
                        subScoreView("Vocabulary", review.vocabularyRangeScore)
                        subScoreView("Coherence", review.coherenceScore)
                        subScoreView("Response", review.taskResponseScore)
                    }

                    // Issues
                    if !review.grammarIssues.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Grammar Issues")
                                .font(.roundedHeadline())
                            ForEach(review.grammarIssues, id: \.self) { issue in
                                Text("• \(issue)")
                                    .font(.subheadline)
                                    .foregroundColor(Color.appWarmGray)
                            }
                        }
                    }

                    // Corrected text
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Corrected Version")
                            .font(.roundedHeadline())
                        Text(review.correctedText)
                            .font(.subheadline)
                            .foregroundColor(Color.appCharcoal)
                            .padding()
                            .background(Color.skillWriting.opacity(0.05))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }

                    Button {
                        phase = .speaking
                    } label: {
                        Text("Practice Speaking")
                            .font(.roundedHeadline())
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.skillWriting)
                            .clipShape(Capsule())
                    }
                }
            }
            .padding()
        }
    }

    private func subScoreView(_ label: String, _ score: Int) -> some View {
        VStack(spacing: 4) {
            Text("\(score)/25")
                .font(.roundedScore())
                .foregroundColor(Color.skillWriting)
            Text(label)
                .font(.caption2)
                .foregroundColor(Color.appWarmGray)
        }
        .frame(maxWidth: .infinity)
        .padding(8)
        .cardStyle()
    }

    // MARK: - Speaking Phase

    private var speakingPhase: some View {
        VStack(spacing: 20) {
            Text("🦊")
                .font(.system(size: 40))

            if let corrected = writingReview?.correctedText {
                Text(corrected)
                    .font(.subheadline)
                    .foregroundColor(Color.appCharcoal)
                    .padding()
                    .cardStyle()
            }

            AudioPlayerButton(
                isPlaying: manager.ttsService.isPlaying,
                onPlay: { playAudio() },
                onStop: { manager.ttsService.stop() }
            )

            // Record button
            Button {
                if manager.speechService.isRecording {
                    let text = manager.speechService.stopRecording()
                    hasRecorded = true
                    Task { await evaluateSpeech(text) }
                } else {
                    try? manager.speechService.startRecording()
                }
            } label: {
                HStack {
                    Image(systemName: manager.speechService.isRecording ? "stop.fill" : "mic.fill")
                    Text(manager.speechService.isRecording ? "Stop Recording" : "Record")
                        .font(.roundedHeadline())
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
                .background(manager.speechService.isRecording ? Color.red : Color.appCoral)
                .clipShape(Capsule())
            }

            if !manager.speechService.recognizedText.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Your speech:")
                        .font(.caption)
                        .foregroundColor(Color.appWarmGray)
                    Text(manager.speechService.recognizedText)
                        .font(.subheadline)
                        .foregroundColor(Color.appCharcoal)
                }
                .padding()
                .cardStyle()
            }

            if isLoading {
                ProgressView("Evaluating...")
            }
        }
        .padding()
    }

    // MARK: - Results Phase

    private var resultsPhase: some View {
        VStack(spacing: 20) {
            Text("🦊")
                .font(.system(size: 50))

            if let result = pronunciationResult {
                let overall = result.accuracyScore * 0.6 + result.fluencyScore * 0.4

                Text("\(Int(overall))/100")
                    .font(.roundedLargeNumber())
                    .foregroundColor(Color.skillWriting)

                Text("Speaking Score")
                    .font(.roundedHeadline())
                    .foregroundColor(Color.appCharcoal)

                HStack(spacing: 20) {
                    VStack {
                        Text("\(Int(result.accuracyScore))/100")
                            .font(.roundedScore())
                            .foregroundColor(Color.skillWriting)
                        Text("Accuracy")
                            .font(.caption)
                            .foregroundColor(Color.appWarmGray)
                    }
                    VStack {
                        Text("\(Int(result.fluencyScore))/100")
                            .font(.roundedScore())
                            .foregroundColor(Color.skillWriting)
                        Text("Fluency")
                            .font(.caption)
                            .foregroundColor(Color.appWarmGray)
                    }
                }

                ForEach(result.notes, id: \.self) { note in
                    Text("💡 \(note)")
                        .font(.subheadline)
                        .foregroundColor(Color.appWarmGray)
                }
            }

            Text("Write & Speak Complete! ✓")
                .font(.roundedHeadline())
                .foregroundColor(Color.appGreen)
        }
        .padding()
    }

    // MARK: - Actions

    private func loadExisting() {
        if let existing = manager.loadTodayWriting() {
            entry = existing
            topic = existing.topic
            essayText = existing.userEssay

            if existing.speakingCompleted {
                phase = .results
            } else if existing.correctedText != nil {
                phase = .speaking
            } else if existing.aiScore != nil {
                phase = .feedback
            } else {
                phase = .writing
            }
        } else {
            topic = Prompts.randomWritingTopic()
        }
    }

    private func submitEssay() async {
        isLoading = true
        error = nil
        do {
            let review = try await manager.aiService.reviewEssay(topic: topic, essay: essayText)
            writingReview = review

            // Save entry
            let newEntry = WritingEntry(topic: topic, userEssay: essayText)
            newEntry.aiScore = review.score
            newEntry.grammarScore = review.grammarScore
            newEntry.vocabularyRangeScore = review.vocabularyRangeScore
            newEntry.coherenceScore = review.coherenceScore
            newEntry.taskResponseScore = review.taskResponseScore
            newEntry.grammarIssues = review.grammarIssues
            newEntry.styleNotes = review.styleNotes
            newEntry.correctedText = review.correctedText
            manager.modelContext.insert(newEntry)
            entry = newEntry

            phase = .feedback
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    private func playAudio() {
        guard let text = writingReview?.correctedText else { return }
        manager.playTTS(text: text)
    }

    private func evaluateSpeech(_ recognizedText: String) async {
        guard let original = writingReview?.correctedText else { return }
        isLoading = true
        do {
            let result = try await manager.aiService.evaluatePronunciation(
                original: original,
                recognized: recognizedText
            )
            pronunciationResult = result

            // Update entry
            entry?.speakingCompleted = true
            entry?.pronunciationAccuracy = result.accuracyScore
            entry?.pronunciationFluency = result.fluencyScore
            entry?.recognizedSpeechText = recognizedText

            // Record writing score
            if let score = entry?.aiScore {
                manager.recordScore(
                    skill: .writing,
                    numerator: score,
                    denominator: 100,
                    subScores: [
                        "grammar": entry?.grammarScore ?? 0,
                        "vocabulary_range": entry?.vocabularyRangeScore ?? 0,
                        "coherence": entry?.coherenceScore ?? 0,
                        "task_response": entry?.taskResponseScore ?? 0,
                    ]
                )
            }

            manager.markTaskCompleted(.writing)
            phase = .results
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

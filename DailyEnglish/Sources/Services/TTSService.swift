import AVFoundation
import Foundation

@Observable
final class TTSService {
    private var audioPlayer: AVAudioPlayer?
    private let synthesizer = AVSpeechSynthesizer()

    var isPlaying: Bool = false

    // MARK: - OpenAI TTS

    func synthesize(text: String, apiKey: String, voice: String = "alloy") async throws -> Data {
        let url = URL(string: "https://api.openai.com/v1/audio/speech")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "model": "tts-1",
            "voice": voice,
            "input": text,
            "speed": 0.9,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode)
        else {
            throw TTSError.synthesizeFailed
        }

        return data
    }

    // MARK: - Play Audio Data

    @MainActor
    func playAudio(data: Data) {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)

            audioPlayer = try AVAudioPlayer(data: data)
            audioPlayer?.play()
            isPlaying = true

            // Monitor playback completion
            Task {
                while audioPlayer?.isPlaying == true {
                    try? await Task.sleep(for: .milliseconds(200))
                }
                isPlaying = false
            }
        } catch {
            isPlaying = false
        }
    }

    // MARK: - System TTS Fallback

    @MainActor
    func speakWithSystem(text: String, rate: Float = 0.45) {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {}

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = rate
        utterance.pitchMultiplier = 1.0

        synthesizer.stopSpeaking(at: .immediate)
        synthesizer.speak(utterance)
        isPlaying = true
    }

    // MARK: - Stop

    func stop() {
        audioPlayer?.stop()
        synthesizer.stopSpeaking(at: .immediate)
        isPlaying = false
    }
}

enum TTSError: LocalizedError {
    case synthesizeFailed

    var errorDescription: String? {
        "Failed to synthesize speech. Please try again."
    }
}

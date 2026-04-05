import AVFoundation
import Foundation

@Observable
final class TTSService {
    private var audioPlayer: AVAudioPlayer?
    private let synthesizer = AVSpeechSynthesizer()

    var isPlaying: Bool = false

    // MARK: - Gemini TTS

    func synthesizeGemini(text: String, apiKey: String, voice: String = "Kore") async throws -> Data {
        let url = URL(string: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=\(apiKey)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "contents": [
                ["parts": [["text": text]]],
            ],
            "generationConfig": [
                "response_modalities": ["AUDIO"],
                "speech_config": [
                    "voice_config": [
                        "prebuilt_voice_config": [
                            "voice_name": voice,
                        ],
                    ],
                ],
            ],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode)
        else {
            throw TTSError.synthesizeFailed
        }

        return try parseGeminiAudio(data)
    }

    private func parseGeminiAudio(_ data: Data) throws -> Data {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let candidates = json["candidates"] as? [[String: Any]],
              let content = candidates.first?["content"] as? [String: Any],
              let parts = content["parts"] as? [[String: Any]],
              let inlineData = parts.first?["inlineData"] as? [String: Any],
              let audioBase64 = inlineData["data"] as? String,
              let audioData = Data(base64Encoded: audioBase64)
        else {
            throw TTSError.synthesizeFailed
        }
        return audioData
    }

    // MARK: - OpenAI TTS

    func synthesizeOpenAI(text: String, apiKey: String, voice: String = "marin") async throws -> Data {
        let url = URL(string: "https://api.openai.com/v1/audio/speech")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")

        let body: [String: Any] = [
            "model": "gpt-4o-mini-tts",
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

    // MARK: - ByteDance TTS

    func synthesizeBytedance(
        text: String,
        appId: String,
        token: String,
        cluster: String = "volcano_tts",
        voice: String = "en_female_dacey_uranus_bigtts",
        speed: Double = 1.0
    ) async throws -> Data {
        let url = URL(string: "https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(appId, forHTTPHeaderField: "X-Api-App-Key")
        request.setValue(token, forHTTPHeaderField: "X-Api-Access-Key")
        request.setValue("seed-tts-2.0", forHTTPHeaderField: "X-Api-Resource-Id")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Api-Request-Id")

        let speedRate = Int((speed - 1.0) * 100)
        let body: [String: Any] = [
            "user": ["uid": "daily_english_ios"],
            "req_params": [
                "text": text,
                "speaker": voice,
                "audio_params": [
                    "format": "mp3",
                    "sample_rate": 24000,
                    "speech_rate": speedRate,
                ],
            ],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode)
        else {
            throw TTSError.synthesizeFailed
        }

        // Parse SSE response — extract base64 audio from event code 352
        return try parseBytedanceSSE(data)
    }

    private func parseBytedanceSSE(_ data: Data) throws -> Data {
        guard let text = String(data: data, encoding: .utf8) else {
            throw TTSError.synthesizeFailed
        }

        var audioChunks: [Data] = []

        for line in text.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("data:") else { continue }
            let jsonStr = String(trimmed.dropFirst(5)).trimmingCharacters(in: .whitespaces)
            guard let jsonData = jsonStr.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
                  let eventCode = json["event_code"] as? Int,
                  eventCode == 352,
                  let audioBase64 = json["data"] as? String,
                  let chunk = Data(base64Encoded: audioBase64)
            else { continue }
            audioChunks.append(chunk)
        }

        guard !audioChunks.isEmpty else {
            throw TTSError.synthesizeFailed
        }

        return audioChunks.reduce(Data()) { $0 + $1 }
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

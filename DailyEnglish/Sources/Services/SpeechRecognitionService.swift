import AVFoundation
import Foundation
import Speech

@Observable
final class SpeechRecognitionService {
    var isRecording: Bool = false
    var recognizedText: String = ""
    var error: String?

    private var recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var audioEngine = AVAudioEngine()

    // MARK: - Permissions

    func requestPermissions() async -> Bool {
        let speechAuthorized = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }

        let micAuthorized: Bool
        if #available(iOS 17.0, *) {
            micAuthorized = await AVAudioApplication.requestRecordPermission()
        } else {
            micAuthorized = await withCheckedContinuation { continuation in
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
        }

        return speechAuthorized && micAuthorized
    }

    // MARK: - Start Recording

    func startRecording() throws {
        // Cancel previous task
        recognitionTask?.cancel()
        recognitionTask = nil
        recognizedText = ""
        error = nil

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playAndRecord, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest else {
            throw SpeechError.requestCreationFailed
        }
        recognitionRequest.shouldReportPartialResults = true

        guard let recognizer, recognizer.isAvailable else {
            throw SpeechError.recognizerUnavailable
        }

        recognitionTask = recognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self else { return }

            if let result {
                self.recognizedText = result.bestTranscription.formattedString
            }

            if error != nil || (result?.isFinal ?? false) {
                self.stopRecordingInternal()
            }
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            self.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()
        isRecording = true
    }

    // MARK: - Stop Recording

    func stopRecording() -> String {
        stopRecordingInternal()
        return recognizedText
    }

    private func stopRecordingInternal() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        isRecording = false
    }
}

enum SpeechError: LocalizedError {
    case requestCreationFailed
    case recognizerUnavailable
    case permissionDenied

    var errorDescription: String? {
        switch self {
        case .requestCreationFailed:
            "Failed to create speech recognition request."
        case .recognizerUnavailable:
            "Speech recognition is not available on this device."
        case .permissionDenied:
            "Microphone or speech recognition permission was denied."
        }
    }
}

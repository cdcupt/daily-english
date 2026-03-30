import SwiftUI

struct AudioPlayerButton: View {
    let isPlaying: Bool
    let onPlay: () -> Void
    let onStop: () -> Void

    var body: some View {
        Button {
            if isPlaying {
                onStop()
            } else {
                onPlay()
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: isPlaying ? "stop.circle.fill" : "play.circle.fill")
                    .font(.title2)
                Text(isPlaying ? "Stop" : "Play Audio")
                    .font(.roundedHeadline())
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
            .background(isPlaying ? Color.appCoral : Color.appTeal)
            .clipShape(Capsule())
        }
    }
}

import AppKit
import AudioToolbox

final class SoundPlayer {
    static let shared = SoundPlayer()

    private var loopingSound: NSSound?
    private var loopTask: Task<Void, Never>?

    private init() {}

    /// Play the meeting ring sound on loop until stopped
    func startMeetingRing() {
        stopMeetingRing()

        // Use system sound that loops
        let soundURL = URL(fileURLWithPath: "/System/Library/Sounds/Funk.aiff")
        if let sound = NSSound(contentsOf: soundURL, byReference: true) {
            loopingSound = sound
            sound.loops = true
            sound.play()
        } else {
            // Fallback: loop manually with a task
            loopTask = Task {
                while !Task.isCancelled {
                    NSSound.beep()
                    try? await Task.sleep(for: .seconds(2))
                }
            }
        }
    }

    /// Stop the looping ring sound
    func stopMeetingRing() {
        loopingSound?.stop()
        loopingSound = nil
        loopTask?.cancel()
        loopTask = nil
    }

    /// Play a single notification sound (non-looping)
    func playSubtleNotification() {
        let soundURL = URL(fileURLWithPath: "/System/Library/Sounds/Pop.aiff")
        if let sound = NSSound(contentsOf: soundURL, byReference: true) {
            sound.play()
        }
    }
}

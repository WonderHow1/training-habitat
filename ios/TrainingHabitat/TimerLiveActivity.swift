#if os(iOS)
import ActivityKit
import Foundation

enum TimerLiveActivity {
    static func sync(timer: TrainingTimer?, title: String?, allowStart: Bool) async {
        let activities = Activity<TimerActivity>.activities
        for activity in activities where activity.attributes.sessionID != timer?.sessionID {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        guard let timer, let title else { return }
        let content = ActivityContent(state: TimerActivity.ContentState(
            title: title,
            displayStart: timer.displayStart,
            pausedSeconds: timer.isPaused ? timer.seconds(at: Date()) : nil
        ), staleDate: nil)
        if let activity = activities.first(where: { $0.attributes.sessionID == timer.sessionID }) {
            if activity.content.state != content.state { await activity.update(content) }
        } else if allowStart, ActivityAuthorizationInfo().areActivitiesEnabled {
            // A disabled or unavailable system surface doesn't interrupt the on-device timer.
            _ = try? Activity.request(attributes: TimerActivity(sessionID: timer.sessionID),
                                      content: content, pushType: nil)
        }
    }
}
#endif

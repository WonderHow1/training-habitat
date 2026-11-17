import Foundation

enum WorkoutTimerAction: String, Sendable {
    case pause, resume, cancel, finish
}

#if os(iOS)
import ActivityKit
import AppIntents

struct TimerActivity: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let title: String
        let displayStart: Date
        let pausedSeconds: Int?
    }

    let sessionID: String
}

extension WorkoutTimerAction: AppEnum {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "计时操作"
    static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
        .pause: "暂停", .resume: "继续", .cancel: "取消计时", .finish: "完成"
    ]
}

struct WorkoutTimerIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "训练计时操作"
    static let isDiscoverable = false

    @Parameter(title: "计时场次") var sessionID: String
    @Parameter(title: "操作") var action: WorkoutTimerAction

    init() {}

    init(_ action: WorkoutTimerAction, sessionID: String) {
        self.action = action
        self.sessionID = sessionID
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        #if TRAINING_APP
        // LiveActivityIntent runs in the containing app, using its existing local store.
        await AppModel.shared.performLiveTimerAction(action, sessionID: sessionID)
        #endif
        return .result()
    }
}
#endif

import ActivityKit
import SwiftUI
import WidgetKit

@main
struct TrainingTimerWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TimerActivity.self) { context in
            VStack(alignment: .leading, spacing: 12) {
                header(context.state)
                controls(context)
            }
            .padding()
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 9) {
                        header(context.state)
                        controls(context)
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.pausedSeconds == nil ? "timer" : "pause.fill")
                    .accessibilityLabel(context.state.pausedSeconds == nil ? "训练计时" : "训练计时已暂停")
            } compactTrailing: {
                clock(context.state).frame(width: 46, alignment: .trailing)
            } minimal: {
                Image(systemName: context.state.pausedSeconds == nil ? "timer" : "pause.fill")
            }
        }
    }

    private func header(_ state: TimerActivity.ContentState) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Label(state.title, systemImage: state.pausedSeconds == nil ? "timer" : "pause.fill")
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            clock(state)
                .font(.system(.headline, design: .rounded))
                .frame(width: 68, alignment: .trailing)
                .layoutPriority(1)
        }
    }

    private func clock(_ state: TimerActivity.ContentState) -> some View {
        Group {
            if let seconds = state.pausedSeconds {
                Text(Duration.seconds(seconds).formatted(.time(pattern: .minuteSecond)))
            } else {
                Text(state.displayStart, style: .timer)
            }
        }
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }

    private func controls(_ context: ActivityViewContext<TimerActivity>) -> some View {
        let paused = context.state.pausedSeconds != nil
        let id = context.attributes.sessionID
        return HStack(spacing: 0) {
            action(paused ? .resume : .pause, title: paused ? "继续" : "暂停",
                   icon: paused ? "play.fill" : "pause.fill", sessionID: id)
            action(.finish, title: "完成", icon: "checkmark", sessionID: id)
            action(.cancel, title: "取消", icon: "xmark", sessionID: id)
                .foregroundStyle(.red)
        }
        .padding(.horizontal, 4)
        .background(.primary.opacity(0.11), in: .rect(cornerRadius: 18))
    }

    private func action(_ action: WorkoutTimerAction, title: String, icon: String, sessionID: String) -> some View {
        Button(intent: WorkoutTimerIntent(action, sessionID: sessionID)) {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold))
                Text(title).font(.caption.weight(.medium)).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, minHeight: 46)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}

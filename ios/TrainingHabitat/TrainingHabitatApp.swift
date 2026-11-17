import SwiftUI
import UserNotifications

@main
struct TrainingHabitatApp: App {
    var body: some Scene {
        WindowGroup { AppRoot().preferredColorScheme(.light) }
    }
}

@MainActor
@Observable
final class AppModel {
    static let shared = AppModel()
    private(set) var state = TrainingState()
    private(set) var now = Date()
    private(set) var loadError: String?
    var error: String?
    private var store: LocalStore?
    private var notificationTask: Task<Void, Never>?
    private var activityTask: Task<Void, Never>?

    init() { load() }

    var today: Date { TrainingCalendar.day(now) }

    func load() {
        do {
            let nextStore = try LocalStore.appStorage()
            state = try nextStore.load()
            store = nextStore
            loadError = nil
            refresh()
        } catch {
            store = nil
            loadError = error.localizedDescription
        }
    }

    @discardableResult
    func change(_ update: (inout TrainingState, Date) throws -> Void) -> Bool {
        let currentTime = Date()
        now = currentTime
        guard let store else { return false }
        do {
            var next = state
            next.reconcile(at: currentTime)
            try update(&next, currentTime)
            if next != state {
                try store.save(next)
                let timerChanged = next.timer != state.timer || timerTitle(in: next) != timerTitle(in: state)
                state = next
                updateNotifications()
                if timerChanged { syncTimerActivity() }
            }
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func refresh() { change { _, _ in } }

    var timerPlan: TrainingPlan? {
        guard let timer = state.timer else { return nil }
        return state.plans.first { $0.id == timer.planID }
    }

    func timerAction(_ action: WorkoutTimerAction, sessionID: String) {
        guard state.timer?.sessionID == sessionID else { return }
        change { next, now in
            switch action {
            case .pause: next.pauseTimer(at: now)
            case .resume: next.resumeTimer(at: now)
            case .cancel: next.clearTimer()
            case .finish: try next.finishTimer(at: now)
            }
        }
    }

    func performLiveTimerAction(_ action: WorkoutTimerAction, sessionID: String) async {
        guard let timer = state.timer, timer.sessionID == sessionID else { return }
        if action == .finish, timer.seconds(at: Date()) < 60 { return }
        timerAction(action, sessionID: sessionID)
        await activityTask?.value
    }

    func syncTimerActivity(allowStart: Bool = false) {
        #if os(iOS)
        let previous = activityTask
        activityTask = Task {
            await previous?.value
            await TimerLiveActivity.sync(timer: state.timer, title: timerPlan?.title, allowStart: allowStart)
        }
        #endif
    }

    private func timerTitle(in state: TrainingState) -> String? {
        guard let timer = state.timer else { return nil }
        return state.plans.first { $0.id == timer.planID }?.title
    }

    func stage(of pet: Pet) -> Int { min(3, state.experience(of: pet.id, at: now) / 100 + 1) }

    func setReminders(_ enabled: Bool) async {
        if enabled {
            do {
                let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
                guard granted else {
                    error = "请在系统设置中允许训练栖地发送通知。"
                    return
                }
            } catch {
                self.error = error.localizedDescription
                return
            }
        }
        change { state, _ in state.setReminders(enabled) }
    }

    private func updateNotifications() {
        notificationTask?.cancel()
        let state = state
        let now = now
        notificationTask = Task {
            let center = UNUserNotificationCenter.current()
            let pending = await center.pendingNotificationRequests()
            guard !Task.isCancelled else { return }
            center.removePendingNotificationRequests(withIdentifiers: pending.map(\.identifier))
            guard state.reminders else { return }
            let calendar = TrainingCalendar.calendar
            let reminders = state.plans.flatMap { plan -> [(String, Date, String)] in
                guard state.status(of: plan, at: now) != .done else { return [] }
                let scheduled = plan.scheduledAt ?? calendar.date(bySettingHour: 18, minute: 30, second: 0, of: plan.day)!
                return [(plan.id.uuidString + "-plan", scheduled, "今天有一项训练安排。"),
                        (plan.id.uuidString + "-grace", plan.deadline, "有一项训练可以补记。打开 App 查看截止时间。")]
            }.filter { $0.1 > now }.sorted { $0.1 < $1.1 }
            for (id, date, message) in reminders.prefix(40) {
                guard !Task.isCancelled else { return }
                let content = UNMutableNotificationContent()
                content.title = "训练栖地"
                content.body = message
                content.sound = .default
                let parts = calendar.dateComponents([.calendar, .timeZone, .year, .month, .day, .hour, .minute, .second], from: date)
                let trigger = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
                do {
                    try await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
                } catch {
                    if !Task.isCancelled { self.error = "设置提醒失败。\(error.localizedDescription)" }
                    return
                }
            }
        }
    }
}

extension View {
    func compactNavigationTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    func hideTabBar(_ hidden: Bool) -> some View {
        #if os(iOS)
        toolbarVisibility(hidden ? .hidden : .visible, for: .tabBar)
        #else
        self
        #endif
    }

    func digitsKeyboard() -> some View {
        #if os(iOS)
        keyboardType(.numberPad)
        #else
        self
        #endif
    }
}

enum SheetRoute: Identifiable {
    case addPlan(Date), plan(TrainingPlan), editPlan(TrainingPlan), manual(TrainingPlan?, Workout?), workout(Workout), settings

    var id: String {
        switch self {
        case .addPlan: "addPlan"
        case let .plan(plan): "plan-\(plan.id)"
        case let .editPlan(plan): "editPlan-\(plan.id)"
        case let .manual(plan, workout): "manual-\(plan?.id.uuidString ?? "")-\(workout?.id.uuidString ?? "")"
        case let .workout(workout): "workout-\(workout.id)"
        case .settings: "settings"
        }
    }
}

private enum AppTab: Hashable { case today, plan, review, pet }

struct AppRoot: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var model = AppModel.shared
    @State private var selection: AppTab = .today
    @State private var habitatVisible = true
    @State private var sheet: SheetRoute?
    @State private var timerPlan: TrainingPlan?

    var body: some View {
        Group {
            if let error = model.loadError {
                ContentUnavailableView {
                    Label("无法读取训练数据", systemImage: "externaldrive.badge.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("重新读取", action: model.load)
                }
            } else if model.state.didOnboard {
                mainTabs
            } else {
                Onboarding(model: model)
            }
        }
        .environment(\.calendar, TrainingCalendar.calendar)
        .environment(\.timeZone, TrainingCalendar.timeZone)
        .tint(.primary)
        .alert("训练栖地", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("好") { model.error = nil }
        } message: {
            Text(model.error ?? "")
        }
        .sheet(item: $sheet) { item in
            NavigationStack {
                switch item {
                case let .addPlan(day):
                    PlanEditor(model: model, day: day)
                case let .editPlan(plan):
                    PlanEditor(model: model, day: plan.day, plan: plan)
                case let .plan(plan):
                    PlanDetails(model: model, plan: plan)
                case let .manual(plan, workout):
                    WorkoutEditor(model: model, plan: plan, existing: workout)
                case let .workout(workout):
                    WorkoutDetails(model: model, entry: workout)
                case .settings:
                    SettingsView(model: model)
                }
            }
        }
        .sheet(item: $timerPlan) { plan in
            NavigationStack { TimerView(model: model, plan: plan) }
        }
        .onChange(of: model.state.timer?.sessionID) { _, sessionID in
            if sessionID == nil { timerPlan = nil }
        }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            model.refresh()
            model.syncTimerActivity(allowStart: true)
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(20)) } catch { break }
                model.refresh()
            }
        }
    }

    private var mainTabs: some View {
        TabView(selection: $selection) {
            Tab("今天", systemImage: "house", value: .today) {
                TodayView(model: model, expanded: $habitatVisible, open: { sheet = $0 }, openTimer: { timerPlan = $0 })
                    .safeAreaInset(edge: .bottom, spacing: 0) { timerPreview }
                    .hideTabBar(habitatVisible)
            }
            Tab("计划", systemImage: "calendar", value: .plan) {
                NavigationStack { PlansView(model: model) { sheet = $0 } }
                    .safeAreaInset(edge: .bottom, spacing: 0) { timerPreview }
            }
            Tab("回顾", systemImage: "clock.arrow.circlepath", value: .review) {
                NavigationStack { ReviewView(model: model) { sheet = $0 } }
                    .safeAreaInset(edge: .bottom, spacing: 0) { timerPreview }
            }
            Tab("宠物", systemImage: "pawprint", value: .pet) {
                PetPage(model: model, active: selection == .pet) { sheet = $0 }
                    .safeAreaInset(edge: .bottom, spacing: 0) { timerPreview }
            }
        }
    }

    @ViewBuilder private var timerPreview: some View {
        if let timer = model.state.timer, let plan = model.timerPlan {
            TimerPreview(timer: timer, title: plan.title) { timerPlan = plan }
        }
    }
}

private struct SettingsView: View {
    let model: AppModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section("训练") {
                LabeledContent("每日训练目标", value: "\(model.state.goalMinutes) 分钟")
                Toggle("训练与补记提醒", isOn: Binding(get: { model.state.reminders }, set: { enabled in
                    Task { await model.setReminders(enabled) }
                }))
            }
            Section("数据") {
                LabeledContent("存储位置", value: "仅此 iPhone")
                Text("Apple 健康读取通过工程中的 HealthCheck 单独验证。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("设置")
        .compactNavigationTitle()
        .toolbar { Button("完成") { dismiss() } }
    }
}

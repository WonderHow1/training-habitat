import SwiftUI

struct PlanEditor: View {
    let model: AppModel
    let plan: TrainingPlan?
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var day: Date
    @State private var time: Date
    @State private var hasTime: Bool
    @State private var minutes: Int?
    @State private var showDuration = false

    init(model: AppModel, day: Date, plan: TrainingPlan? = nil) {
        self.model = model
        self.plan = plan
        _title = State(initialValue: plan?.title ?? "")
        _day = State(initialValue: plan?.day ?? day)
        _time = State(initialValue: plan?.scheduledAt ?? Date())
        _hasTime = State(initialValue: plan?.scheduledAt != nil)
        _minutes = State(initialValue: plan?.minutes)
    }

    var body: some View {
        Form {
            Section {
                TextField("训练项目", text: $title)
                if !model.state.recentProjects.isEmpty {
                    Menu("之前使用的项目") {
                        ForEach(Array(model.state.recentProjects.prefix(8)), id: \.self) { project in
                            Button(project) { title = project }
                        }
                    }
                }
                DatePicker("计划日期", selection: $day, displayedComponents: .date)
                Toggle("指定开始时间", isOn: $hasTime)
                if hasTime { DatePicker("开始时间", selection: $time, displayedComponents: .hourAndMinute) }
                EditorValueButton(title: "目标时长", value: minutes.map { "\($0) 分钟" }) {
                    showDuration = true
                }
            } footer: {
                Text("日期与训练截止时间按北京时间计算。")
            }
        }
        .navigationTitle(plan == nil ? "新增计划" : "编辑训练计划")
        .compactNavigationTitle()
        .sheet(isPresented: $showDuration) {
            PlanDurationPicker(minutes: minutes) { minutes = $0 }
                .presentationDetents([.medium, .large])
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    guard let minutes else { return }
                    if model.change({ state, now in
                        try state.savePlan(id: plan?.id, title: title, day: day, time: hasTime ? time : nil,
                                           minutes: minutes, at: now)
                    }) { dismiss() }
                }
                .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || minutes == nil)
            }
        }
    }
}

private struct PlanDurationPicker: View {
    @Environment(\.dismiss) private var dismiss
    @State private var hours: Int
    @State private var minutes: Int
    let select: (Int) -> Void

    init(minutes current: Int?, select: @escaping (Int) -> Void) {
        let duration = current ?? 0
        _hours = State(initialValue: duration / 60)
        _minutes = State(initialValue: duration % 60)
        self.select = select
    }

    var body: some View {
        NavigationStack {
            HourMinuteWheel(hours: $hours, minutes: $minutes)
            .navigationTitle("目标时长")
            .compactNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") {
                        select(hours * 60 + minutes)
                        dismiss()
                    }
                    .disabled(hours == 0 && minutes == 0)
                }
            }
        }
    }
}

struct WorkoutEditor: View {
    private enum TimeField: String, Identifiable {
        case start = "开始时间"
        case end = "结束时间"
        var id: String { rawValue }
    }

    let model: AppModel
    let plan: TrainingPlan?
    let existing: Workout?
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var timing: WorkoutTiming
    @State private var timeField: TimeField?

    init(model: AppModel, plan: TrainingPlan?, existing: Workout?) {
        self.model = model
        self.plan = plan
        self.existing = existing
        _title = State(initialValue: existing?.title ?? plan?.title ?? "")
        let seconds = Double((plan?.minutes ?? 20) * 60)
        let latest = model.now.addingTimeInterval(-seconds)
        let suggestion = plan.flatMap { entry in
            entry.scheduledAt ?? (entry.day < model.today ? entry.day.addingTimeInterval(18.5 * 3600) : nil)
        } ?? latest
        let suggestedStart = min(suggestion, latest)
        let start = existing?.start ?? TrainingCalendar.combining(day: suggestedStart, time: suggestedStart)
        _timing = State(initialValue: WorkoutTiming(start: start, end: existing?.end ?? start.addingTimeInterval(seconds)))
    }

    private var editing: Bool { existing.map { item in model.state.workouts.contains { $0.id == item.id } } ?? false }
    private var draft: Workout? { timing.entry(title: title, existing: existing, at: Date()) }

    var body: some View {
        Form {
            TextField("训练项目", text: $title)
            if !model.state.recentProjects.isEmpty {
                Menu("之前使用的项目") {
                    ForEach(Array(model.state.recentProjects.prefix(8)), id: \.self) { project in
                        Button(project) { title = project }
                    }
                }
            }
            DatePicker("实际日期", selection: Binding(get: { timing.start }, set: { timing.moveStartDay(to: $0) }),
                       in: ...model.now, displayedComponents: .date)
            EditorValueButton(title: TimeField.start.rawValue, value: DisplayDate.clock(timing.start)) {
                timeField = .start
            }
            EditorValueButton(title: TimeField.end.rawValue,
                              value: TrainingCalendar.day(timing.start) == TrainingCalendar.day(timing.end)
                              ? DisplayDate.clock(timing.end) : DisplayDate.dateTime(timing.end)) {
                timeField = .end
            }
            if draft == nil {
                Text("请选择已结束的训练，时长须在 1 分钟到 24 小时之间。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if let plan {
                Text("达标时关联「\(plan.title)」。").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle(editing ? "编辑训练记录" : "手动记录")
        .compactNavigationTitle()
        .sheet(item: $timeField) { field in
            WorkoutTimePicker(
                title: field.rawValue,
                value: field == .start ? timing.start : timing.end,
                includesDate: field == .end
            ) { date in
                if field == .start {
                    timing.start = date
                } else {
                    timing.end = date
                }
            }
            .presentationDetents([.medium, .large])
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    guard let record = draft else { return }
                    if model.change({ state, now in
                        try state.saveWorkout(record, for: plan?.id, at: now)
                        if state.timer?.planID == plan?.id { state.clearTimer() }
                    }) { dismiss() }
                }
                .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || draft == nil)
            }
        }
    }
}

private struct EditorValueButton: View {
    let title: String
    let value: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title)
                Spacer()
                if let value { Text(value).foregroundStyle(.secondary) }
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityValue(value ?? "未设置")
    }
}

private struct WorkoutTimePicker: View {
    @Environment(\.dismiss) private var dismiss
    @State private var day: Date
    @State private var hours: Int
    @State private var minutes: Int
    let title: String
    let value: Date
    let includesDate: Bool
    let select: (Date) -> Void

    init(title: String, value: Date, includesDate: Bool, select: @escaping (Date) -> Void) {
        self.title = title
        self.value = value
        self.includesDate = includesDate
        self.select = select
        let parts = TrainingCalendar.calendar.dateComponents([.hour, .minute], from: value)
        _day = State(initialValue: TrainingCalendar.day(value))
        _hours = State(initialValue: parts.hour ?? 0)
        _minutes = State(initialValue: parts.minute ?? 0)
    }

    var body: some View {
        NavigationStack {
            VStack {
                if includesDate {
                    DatePicker("结束日期", selection: $day, displayedComponents: .date)
                        .padding(.horizontal, 20)
                }
                HourMinuteWheel(hours: $hours, minutes: $minutes)
            }
            .navigationTitle(title)
            .compactNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") {
                        let calendar = TrainingCalendar.calendar
                        if let date = calendar.date(bySettingHour: hours, minute: minutes, second: 0, of: day),
                           !calendar.isDate(date, equalTo: value, toGranularity: .minute) {
                            select(date)
                        }
                        dismiss()
                    }
                }
            }
        }
    }
}

private struct HourMinuteWheel: View {
    @Binding var hours: Int
    @Binding var minutes: Int

    var body: some View {
        HStack(spacing: 0) {
            Picker("小时", selection: $hours) {
                ForEach(0..<24) { Text("\($0) 小时").tag($0) }
            }
            Picker("分钟", selection: $minutes) {
                ForEach(0..<60) { Text("\($0) 分钟").tag($0) }
            }
        }
        .labelsHidden()
        #if os(iOS)
        .pickerStyle(.wheel)
        #endif
    }
}

struct PlanDetails: View {
    let model: AppModel
    let plan: TrainingPlan
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var recording = false

    private var current: TrainingPlan { model.state.plans.first { $0.id == plan.id } ?? plan }
    private var status: PlanStatus { model.state.status(of: current, at: model.now) }

    var body: some View {
        List {
            Section {
                LabeledContent("状态", value: status.rawValue)
                LabeledContent("目标时长", value: "\(current.minutes) 分钟")
                LabeledContent("计划日期", value: current.scheduledAt.map(DisplayDate.dateTime) ?? DisplayDate.day(current.day))
                LabeledContent("训练截止", value: DisplayDate.dateTime(current.deadline))
                LabeledContent("补记截止", value: DisplayDate.dateTime(current.graceEnds))
                LabeledContent("关联记录", value: model.state.workouts.first { $0.planID == current.id }?.title ?? "暂无")
            }
            if status == .upcoming || status == .grace {
                Button("记录训练") { recording = true }
            }
            Button("编辑") { editing = true }
        }
        .navigationTitle(current.title)
        .compactNavigationTitle()
        .toolbar { Button("完成") { dismiss() } }
        .sheet(isPresented: $editing) {
            NavigationStack { PlanEditor(model: model, day: current.day, plan: current) }
        }
        .sheet(isPresented: $recording) {
            NavigationStack { WorkoutEditor(model: model, plan: current, existing: nil) }
        }
    }
}

struct WorkoutDetails: View {
    let model: AppModel
    let entry: Workout
    @Environment(\.dismiss) private var dismiss
    @State private var editing = false
    @State private var deleting = false

    private var current: Workout { model.state.workouts.first { $0.id == entry.id } ?? entry }

    var body: some View {
        List {
            Section {
                LabeledContent("实际开始", value: DisplayDate.dateTime(current.start))
                LabeledContent("实际时长", value: "\(current.minutes) 分钟")
                LabeledContent("来源", value: current.source == .manual ? "手动" : "Apple 健康")
                LabeledContent("关联计划", value: model.state.plans.first { $0.id == current.planID }?.title ?? "暂无")
            }
            let eligible = model.state.eligiblePlans(for: current, at: model.now)
            if !eligible.isEmpty {
                Section("关联计划") {
                    ForEach(eligible) { plan in
                        Button(plan.title) {
                            model.change { state, now in try state.link(current.id, to: plan.id, at: now) }
                        }
                    }
                }
            }
            Section {
                Button("编辑记录") { editing = true }
                Button("删除记录", role: .destructive) { deleting = true }
            }
        }
        .navigationTitle(current.title)
        .compactNavigationTitle()
        .toolbar { Button("完成") { dismiss() } }
        .sheet(isPresented: $editing) {
            NavigationStack { WorkoutEditor(model: model, plan: nil, existing: current) }
        }
        .confirmationDialog("删除这条训练记录？", isPresented: $deleting, titleVisibility: .visible) {
            Button("删除", role: .destructive) {
                if model.change({ state, now in state.deleteWorkout(current.id, at: now) }) { dismiss() }
            }
        }
    }
}

struct TimerView: View {
    let model: AppModel
    let plan: TrainingPlan
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 20) {
            Text(plan.title).font(.title2.bold())
            if let timer = model.state.timer, timer.planID == plan.id {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let elapsed = timer.seconds(at: context.date)
                    Text(Duration.seconds(elapsed).formatted(.time(pattern: .minuteSecond)))
                        .font(.system(size: 60, weight: .bold, design: .monospaced))
                    timerControls(timer, elapsed: elapsed)
                }
            }
        }
        .padding()
        .navigationTitle("训练计时")
        .compactNavigationTitle()
        .toolbar { Button("最小化") { dismiss() } }
    }

    private func timerControls(_ timer: TrainingTimer, elapsed: Int) -> some View {
        VStack(spacing: 14) {
            Button {
                model.timerAction(timer.isPaused ? .resume : .pause, sessionID: timer.sessionID)
            } label: {
                controlLabel(timer.isPaused ? "继续" : "暂停", icon: timer.isPaused ? "play.fill" : "pause.fill")
            }
            .buttonStyle(.glass)

            VStack(spacing: 7) {
                Button {
                    model.timerAction(.finish, sessionID: timer.sessionID)
                } label: {
                    controlLabel("结束并记录", icon: "checkmark")
                }
                .buttonStyle(.glassProminent)
                .disabled(elapsed < 60)
                if elapsed < 60 {
                    Text("累计满 1 分钟才能记录").font(.footnote).foregroundStyle(.secondary)
                }
            }

            Button(role: .destructive) {
                model.timerAction(.cancel, sessionID: timer.sessionID)
            } label: {
                controlLabel("取消计时", icon: "xmark").foregroundStyle(.red)
            }
            .buttonStyle(.glass)
        }
        .frame(maxWidth: 320)
    }

    private func controlLabel(_ title: String, icon: String) -> some View {
        Label(title, systemImage: icon)
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: 48)
    }
}

struct TimerPreview: View {
    let timer: TrainingTimer
    let title: String
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            HStack(spacing: 10) {
                Image(systemName: timer.isPaused ? "pause.fill" : "timer")
                Text(title).lineLimit(1)
                if timer.isPaused { Text("已暂停").font(.caption).foregroundStyle(.secondary) }
                Spacer(minLength: 8)
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    Text(Duration.seconds(timer.seconds(at: context.date)).formatted(.time(pattern: .minuteSecond)))
                        .monospacedDigit()
                }
                Image(systemName: "chevron.up").font(.caption.weight(.semibold))
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 12).padding(.vertical, 6)
        }
        .buttonStyle(.glass)
        .accessibilityHint("打开训练计时")
        .padding(.horizontal, 16).padding(.vertical, 6)
    }
}

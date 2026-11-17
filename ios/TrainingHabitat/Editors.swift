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
                Button { showDuration = true } label: {
                    HStack {
                        Text("目标时长")
                        Spacer()
                        if let minutes { Text("\(minutes) 分钟").foregroundStyle(.secondary) }
                        Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("目标时长")
                .accessibilityValue(minutes.map { "\($0) 分钟" } ?? "未设置")
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
    let model: AppModel
    let plan: TrainingPlan?
    let existing: Workout?
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var start: Date
    @State private var minutes: String

    init(model: AppModel, plan: TrainingPlan?, existing: Workout?) {
        self.model = model
        self.plan = plan
        self.existing = existing
        _title = State(initialValue: existing?.title ?? plan?.title ?? "")
        let length = existing?.minutes ?? plan?.minutes ?? 20
        let latest = model.now.addingTimeInterval(-Double(length * 60))
        let suggestion = plan.flatMap { entry in
            entry.scheduledAt ?? (entry.day < model.today ? entry.day.addingTimeInterval(18.5 * 3600) : nil)
        } ?? latest
        _start = State(initialValue: existing?.start ?? min(suggestion, latest))
        _minutes = State(initialValue: String(length))
    }

    private var editing: Bool { existing.map { item in model.state.workouts.contains { $0.id == item.id } } ?? false }

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
            DatePicker("实际日期", selection: $start, in: ...model.now, displayedComponents: .date)
            DatePicker("开始时间", selection: $start, displayedComponents: .hourAndMinute)
            TextField("实际时长（分钟）", text: $minutes)
                .digitsKeyboard().accessibilityLabel("实际时长（分钟）")
            if let plan {
                Text("达标时关联「\(plan.title)」。").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle(editing ? "编辑训练记录" : "手动记录")
        .compactNavigationTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    let length = Int(minutes) ?? 0
                    var record = existing ?? Workout(title: title, start: start, end: start, seconds: 0)
                    record.title = title
                    if existing?.start != start || existing?.minutes != length {
                        record.start = start
                        record.end = start.addingTimeInterval(Double(length * 60))
                        record.seconds = length * 60
                    }
                    if model.change({ state, now in
                        try state.saveWorkout(record, for: plan?.id, at: now)
                        if state.timer?.planID == plan?.id { state.clearTimer() }
                    }) { dismiss() }
                }
                .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !(1...1440).contains(Int(minutes) ?? 0))
            }
        }
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
    @State private var draft: Workout?

    var body: some View {
        VStack(spacing: 20) {
            Text(plan.title).font(.title2.bold())
            if let timer = model.state.timer, timer.planID == plan.id {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let elapsed = max(0, Int(context.date.timeIntervalSince(timer.startedAt)))
                    Text(Duration.seconds(elapsed).formatted(.time(pattern: .minuteSecond)))
                        .font(.system(size: 60, weight: .bold, design: .monospaced))
                    Button("结束并记录") {
                        let end = Date()
                        let seconds = min(86_400, Int(end.timeIntervalSince(timer.startedAt)))
                        guard seconds >= 60 else { return }
                        draft = Workout(title: plan.title, start: timer.startedAt, end: end, seconds: seconds)
                    }
                    .buttonStyle(.glassProminent).disabled(elapsed < 60)
                }
                Button("取消计时", role: .destructive) {
                    if model.change({ state, _ in state.clearTimer() }) { dismiss() }
                }
            }
        }
        .padding()
        .navigationTitle("训练计时")
        .compactNavigationTitle()
        .toolbar { Button("稍后回来") { dismiss() } }
        .sheet(item: $draft, onDismiss: {
            if model.state.timer == nil { dismiss() }
        }) { workout in
            NavigationStack { WorkoutEditor(model: model, plan: plan, existing: workout) }
        }
    }
}

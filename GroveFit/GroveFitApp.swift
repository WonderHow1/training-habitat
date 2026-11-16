import SwiftUI

@main
struct GroveFitApp: App {
    var body: some Scene {
        WindowGroup("动森训练") {
            MainScreen()
                .preferredColorScheme(.light)
                .environment(\.calendar, Beijing.calendar)
                .environment(\.timeZone, Beijing.zone)
                .environment(\.locale, Locale(identifier: "zh_CN"))
#if os(macOS)
                .frame(minWidth: 365, idealWidth: 414, minHeight: 620, idealHeight: 820)
#endif
        }
#if os(macOS)
        .defaultSize(width: 414, height: 820)
        .windowResizability(.contentMinSize)
#endif
    }
}

private enum Tab: String, CaseIterable {
    case home = "小屋", plans = "计划", history = "历史", settings = "设置"

    var symbol: String {
        switch self {
        case .home: "house.fill"
        case .plans: "calendar"
        case .history: "clock.arrow.circlepath"
        case .settings: "gearshape"
        }
    }
}

private enum Route: Identifiable, Hashable {
    case plan(Date), detail(UUID), reschedule(UUID), record(UUID?, Bool), authorization(UUID?), match(UUID, UUID?)
    case clock, adopt, recover(UUID)

    var id: Self { self }
}

private struct MainScreen: View {
    private static let storageKey = "grovefit.training.v1"
    @State private var state: Training = {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              var stored = try? JSONDecoder().decode(Training.self, from: data) else { return Training() }
        try? stored.advance(to: stored.now)
        return stored
    }()
    @State private var tab: Tab = .home
    @State private var weekOffset = 0
    @State private var route: Route?
    @State private var error: String?
    @State private var message: String?
    @State private var reset = false

    var body: some View {
        Group {
            if state.onboarded {
                VStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            appHeader
                            if let message {
                                HStack(alignment: .top, spacing: 9) {
                                    Image(systemName: "leaf.fill").padding(.top, 1)
                                    Text(message).frame(maxWidth: .infinity, alignment: .leading)
                                    Button { self.message = nil } label: { Image(systemName: "xmark").padding(3) }
                                        .buttonStyle(.plain)
                                        .accessibilityLabel("关闭提示")
                                }
                                .font(.footnote.weight(.medium))
                                .padding(12)
                                .background(Grove.moss, in: RoundedRectangle(cornerRadius: 14))
                            }
                            switch tab {
                            case .home: home
                            case .plans: plans
                            case .history: history
                            case .settings: settings
                            }
                        }
                        .frame(maxWidth: 480)
                        .padding(.horizontal, 22)
                        .padding(.top, 16)
                        .padding(.bottom, 18)
                        .frame(maxWidth: .infinity)
                    }
                    tabBar
                }
            } else {
                onboarding
            }
        }
        .foregroundStyle(Grove.ink)
        .background(Grove.paper.ignoresSafeArea())
        .tint(Grove.green)
        .sheet(item: $route) { current in
            sheet(current)
                .environment(\.calendar, Beijing.calendar)
                .environment(\.timeZone, Beijing.zone)
                .environment(\.locale, Locale(identifier: "zh_CN"))
                .tint(Grove.green)
        }
        .alert("开始新的体验？", isPresented: $reset) {
            Button("取消", role: .cancel) {}
            Button("重新开始", role: .destructive) {
                state = Training()
                message = nil
                tab = .home
                weekOffset = 0
                persist()
            }
        } message: { Text("这台设备上的演示进度将被清除。") }
        .alert("请检查输入", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
            Button("好", role: .cancel) { error = nil }
        } message: { Text(error ?? "") }
    }

    private var onboarding: some View {
        let step = state.activePet == nil ? 1 : state.plans.isEmpty ? 2 : 3
        return VStack(spacing: 0) {
            HStack(spacing: 9) {
                brandIcon
                Text("动森训练").font(.subheadline.weight(.bold))
                Spacer()
                Text("\(step) / 3")
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .padding(.horizontal, 11).padding(.vertical, 6)
                    .background(Grove.moss, in: Capsule())
                    .accessibilityLabel("第 \(step) 步，共 3 步")
            }
            .padding(.top, 16)
            .padding(.bottom, 15)
            GeometryReader { proxy in
                ScrollView {
                    Group {
                        switch step {
                        case 1:
                            VStack(alignment: .leading, spacing: 18) {
                                Meadow()
                                    .frame(height: min(277, max(170, proxy.size.height * 0.43)))
                                    .clipShape(RoundedRectangle(cornerRadius: 24))
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("领养你的\n像素伙伴").font(.system(size: 39, weight: .heavy, design: .rounded))
                                        .lineSpacing(-1)
                                        .accessibilityAddTraits(.isHeader)
                                    Text("完成训练，它会一点点长大。")
                                        .font(.subheadline).foregroundStyle(Grove.muted)
                                }
                                AdoptForm(onboarding: true) { name in
                                    try update { try $0.adopt(name) }
                                }
                            }
                        case 2:
                            VStack(alignment: .leading, spacing: 18) {
                                sectionTitle("安排第一项训练", "选一天，想好练什么和练多久。")
                                PlanForm(state: state, first: true, chosen: state.today) { name, day, minutes in
                                    try update { try $0.addPlan(name, on: day, target: minutes) }
                                }
                            }
                            .padding(.top, 20)
                        default:
                            VStack(alignment: .leading, spacing: 18) {
                                Image(systemName: "heart.text.square.fill")
                                    .font(.system(size: 43, weight: .medium))
                                    .foregroundStyle(Grove.coral)
                                    .padding(17).background(Grove.blush, in: RoundedRectangle(cornerRadius: 22))
                                sectionTitle("连接 Apple 健康", "开启模拟授权，即可体验训练同步与漏练更正。你也可以跳过，用手动记录开始。")
                                Primary("开启模拟授权", icon: "link") { finishOnboarding(true) }
                                Secondary("跳过，进入小屋") { finishOnboarding(false) }
                            }
                            .padding(.top, 28)
                        }
                    }
                    .padding(.bottom, 20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .id(step)
            }
        }
        .frame(maxWidth: 456)
        .padding(.horizontal, 22)
        .frame(maxWidth: .infinity)
    }

    private var brandIcon: some View {
        Image(systemName: "leaf.fill")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Grove.paper)
            .frame(width: 32, height: 32)
            .background(Grove.green, in: RoundedRectangle(cornerRadius: 9))
            .accessibilityHidden(true)
    }

    private var appHeader: some View {
        HStack(spacing: 9) {
            brandIcon
            Text("动森训练").font(.subheadline.weight(.bold))
            Spacer()
            Button {
                route = .clock
            } label: {
                Label(Beijing.format(state.now, "M/d HH:mm"), systemImage: "clock")
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .padding(9)
                    .background(Grove.moss, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("演示时钟")
            .accessibilityValue(Beijing.format(state.now, "M月d日 HH:mm"))
        }
    }

    private var tabBar: some View {
        HStack(spacing: 3) {
            ForEach(Tab.allCases, id: \.self) { item in
                Button {
                    tab = item
                } label: {
                    VStack(spacing: 5) {
                        Image(systemName: item.symbol).font(.system(size: 18, weight: .medium))
                        Text(item.rawValue).font(.caption2.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity).frame(height: 47)
                    .background(tab == item ? Grove.moss : Color.clear, in: RoundedRectangle(cornerRadius: 11))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == item ? .isSelected : [])
            }
        }
        .padding(.horizontal, 15).padding(.vertical, 7)
        .background(Grove.card)
        .overlay(alignment: .top) { Rectangle().fill(Grove.line).frame(height: 1) }
    }

    private var home: some View {
        let todays = state.orderedPlans.filter { $0.date == state.today }
        let grace = state.orderedPlans.filter { $0.status == .grace }
        let upcoming = state.orderedPlans.first { $0.date > state.today && $0.status == .pending }
        return VStack(alignment: .leading, spacing: 15) {
            petCard
            ForEach(state.recoverable) { pet in
                Button {
                    route = .recover(pet.id)
                } label: {
                    HStack {
                        Label("\(pet.name) 已恢复 \(state.hearts(pet.id)) 格血", systemImage: "heart.text.square")
                        Spacer()
                        Text("查看").fontWeight(.semibold)
                    }.padding(12).background(Grove.moss, in: RoundedRectangle(cornerRadius: 12))
                }.buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 10) {
                header("今天的训练", accessory: "plus") { route = .plan(state.today) }
                if todays.isEmpty {
                    Text("今天无计划训练").font(.subheadline).foregroundStyle(Grove.muted)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 10)
                }
                ForEach(todays) { plan in
                    planRow(plan)
                    if plan.status == .pending {
                        HStack(spacing: 8) {
                            Primary("记录训练", icon: "square.and.pencil") { route = .record(plan.id, false) }
                            Secondary("改期") { route = .reschedule(plan.id) }
                                .fixedSize()
                        }
                    }
                }
            }
            .card()
            if !grace.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("待补记").font(.headline)
                    ForEach(grace) { planRow($0) }
                }.card()
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("下一次训练").font(.headline)
                if let upcoming {
                    planRow(upcoming)
                } else {
                    Text("还没有安排").font(.subheadline).foregroundStyle(Grove.muted)
                }
            }.card()
        }
    }

    private var petCard: some View {
        let pet = state.activePet ?? state.latestPet
        let hp = pet.map { state.hearts($0.id) } ?? 0
        let xp = pet.map { state.growth($0.id) } ?? 0
        let stage = xp >= 5 ? 2 : xp >= 2 ? 1 : 0
        let goal = stage == 0 ? 2 : 5
        return VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(pet?.name ?? "宠物小屋").font(.system(size: 28, weight: .heavy, design: .rounded))
                    Text(state.activePet == nil ? (hp == 0 ? "血量耗尽" : "可以恢复") : ["幼崽期", "成长中", "森林伙伴"][stage])
                        .font(.caption.weight(.medium)).foregroundStyle(Grove.muted)
                }
                Spacer()
                Hearts(count: hp)
            }
            Meadow(stage: stage, dead: state.activePet == nil)
                .frame(height: 175)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            if state.activePet != nil {
                HStack {
                    Text("成长进度")
                    Spacer()
                    Text(stage == 2 ? "\(xp) 次成长" : "\(xp) / \(goal) 次训练")
                }.font(.caption.weight(.semibold)).foregroundStyle(Grove.muted)
                ProgressView(value: Double(min(xp, goal)), total: Double(goal)).tint(Grove.green)
                    .accessibilityLabel("成长进度")
            } else {
                Primary("领养新伙伴", icon: "pawprint.fill") { route = .adopt }
            }
        }
        .card()
    }

    private var plans: some View {
        let start = Beijing.add(weekOffset * 7, to: state.currentWeek)
        let end = Beijing.add(6, to: start)
        let items = state.orderedPlans.filter { $0.date >= start && $0.date <= end }
        return VStack(alignment: .leading, spacing: 14) {
            sectionTitle("训练计划", "\(items.filter { $0.status == .done }.count) / \(items.count) 项已完成")
            VStack(spacing: 12) {
                HStack {
                    iconButton("chevron.left", label: "上一周") { weekOffset -= 1 }
                    Spacer()
                    Text("\(Beijing.format(start, "M/d")) – \(Beijing.format(end, "M/d"))").font(.subheadline.weight(.semibold))
                    Spacer()
                    iconButton("chevron.right", label: "下一周") { weekOffset += 1 }
                }
                HStack(spacing: 4) {
                    ForEach(0..<7) { i in
                        let day = Beijing.add(i, to: start)
                        let hasPlan = items.contains { $0.date == day }
                        VStack(spacing: 6) {
                            Text(["一", "二", "三", "四", "五", "六", "日"][i]).font(.caption2)
                            Text(Beijing.format(day, "d")).font(.subheadline.weight(.semibold))
                            Circle().fill(hasPlan ? Grove.green : Color.clear).frame(width: 4, height: 4)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(day == state.today ? Grove.moss : Color.clear, in: RoundedRectangle(cornerRadius: 9))
                        .accessibilityHidden(true)
                    }
                }
                if weekOffset == 0 {
                    Primary("添加训练", icon: "plus") { route = .plan(state.today) }
                }
            }.card()
            if items.isEmpty { empty("这一周没有计划训练") }
            ForEach(items) { planRow($0) }
        }
    }

    private var history: some View {
        let ordered = state.workouts.sorted { $0.start > $1.start }
        let settlements = state.orderedPlans.filter { $0.status == .missed || $0.corrected }.reversed()
        return VStack(alignment: .leading, spacing: 12) {
            sectionTitle("训练历史", "查看训练记录和对应的计划结算。")
            HStack(spacing: 8) {
                Primary("手动记录", icon: "square.and.pencil") { route = .record(nil, false) }
                Secondary("同步设备", icon: "arrow.clockwise") { sync(nil) }
            }
            if ordered.isEmpty { empty("还没有训练记录") }
            ForEach(ordered) { workout in
                Button {
                    route = .match(workout.id, nil)
                } label: {
                    HStack(spacing: 10) {
                        tile("figure.run")
                        VStack(alignment: .leading, spacing: 4) {
                            Text(workout.name).font(.subheadline.weight(.semibold))
                            Text("\(Beijing.format(workout.start, "M/d HH:mm")) · \(workout.minutes) 分钟 · \(workout.source.rawValue)")
                                .font(.caption).foregroundStyle(Grove.muted)
                            Text(state.plans.first { $0.id == workout.planID }?.name ?? "未关联计划")
                                .font(.caption).foregroundStyle(Grove.muted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption)
                    }.card()
                }.buttonStyle(.plain)
            }
            if !settlements.isEmpty {
                Text("漏练与更正").font(.headline).padding(.top, 7)
                ForEach(settlements) { planRow($0) }
            }
        }
    }

    private var settings: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionTitle("设置", "本地体验 · 北京时间")
            VStack(spacing: 14) {
                Toggle("训练提醒", isOn: preference(\.reminders))
                Divider()
                Toggle("Apple 健康模拟授权", isOn: preference(\.healthAccess))
            }.card()
            Secondary("演示时钟", icon: "clock") { route = .clock }
            Secondary("重新体验领养", icon: "arrow.counterclockwise") { reset = true }
        }
    }

    private func preference(_ key: WritableKeyPath<Training, Bool>) -> Binding<Bool> {
        Binding(get: { state[keyPath: key] }, set: {
            state[keyPath: key] = $0
            persist()
        })
    }

    private func planRow(_ plan: Plan) -> some View {
        Button {
            route = .detail(plan.id)
        } label: {
            HStack(spacing: 10) {
                tile(plan.name.contains("跑") ? "figure.run" : "figure.strengthtraining.traditional")
                VStack(alignment: .leading, spacing: 4) {
                    Text(plan.name).font(.subheadline.weight(.semibold))
                    Text(plan.status == .grace
                         ? "补记至 \(Beijing.format(plan.graceEnd, "M/d HH:mm"))"
                         : "\(Beijing.format(plan.date, "M/d")) · \(plan.target) 分钟")
                    .font(.caption).foregroundStyle(Grove.muted)
                    if plan.status == .pending && plan.date == state.today {
                        Text("截止 \(Beijing.format(plan.cutoff, "M/d HH:mm"))").font(.caption2).foregroundStyle(Grove.muted)
                    }
                }
                Spacer()
                StatusBadge(status: plan.status)
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(Grove.muted)
            }
            .padding(10)
            .background(Grove.paper, in: RoundedRectangle(cornerRadius: 12))
        }.buttonStyle(.plain)
    }

    private func finishOnboarding(_ health: Bool) {
        state.healthAccess = health
        state.onboarded = true
        persist()
    }

    private func update(_ mutation: (inout Training) throws -> Void) throws {
        var revised = state
        try mutation(&revised)
        state = revised
        persist()
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(state) { UserDefaults.standard.set(data, forKey: Self.storageKey) }
    }

    private func attempt(_ action: () throws -> Void) {
        do { try action() } catch { self.error = error.localizedDescription }
    }

    private func sync(_ id: UUID?) {
        route = state.healthAccess ? .record(id, true) : .authorization(id)
    }

    private func advance(_ date: Date) throws {
        let previous = state
        try update { try $0.advance(to: date) }
        let newlyOpen = state.plans.filter { plan in
            plan.status == .grace && previous.plans.first(where: { $0.id == plan.id })?.status == .pending
        }.sorted { $0.graceEnd < $1.graceEnd }
        let today = state.plans.filter { $0.date == state.today && $0.status == .pending }
        if state.reminders, let plan = newlyOpen.first {
            message = "\(plan.name)待补记，截止 \(Beijing.format(plan.graceEnd, "M/d HH:mm"))。"
        } else if state.reminders, state.today != previous.today, !today.isEmpty {
            message = "今天有 \(today.count) 项训练。"
        } else {
            message = "演示时间已推进至 \(Beijing.format(state.now, "M/d HH:mm"))。"
        }
        weekOffset = 0
        route = nil
    }

    @ViewBuilder
    private func sheet(_ current: Route) -> some View {
        switch current {
        case .plan(let day):
            panel("添加训练") {
                PlanForm(state: state, chosen: day) { name, day, target in
                    try update { try $0.addPlan(name, on: day, target: target) }
                    route = nil
                }
            }
        case .detail(let id):
            if let plan = state.plans.first(where: { $0.id == id }) {
                panel(plan.name) { planDetail(plan) }
            }
        case .reschedule(let id):
            if let plan = state.plans.first(where: { $0.id == id }) {
                panel("训练改期") {
                    PlanForm(state: state, chosen: plan.date, plan: plan) { _, day, _ in
                        try update { try $0.reschedule(id, to: day) }
                        route = .detail(id)
                    }
                }
            }
        case .record(let id, let device):
            let plan = state.plans.first { $0.id == id }
            panel(device ? "模拟设备同步" : "记录训练") {
                RecordForm(training: state, plan: plan, device: device) { workout, merge in
                    var saved: UUID?
                    try update { saved = try $0.save(workout, mergedInto: merge) }
                    if let saved { route = .match(saved, id) }
                }
            }
        case .authorization(let id):
            panel("连接 Apple 健康") {
                Text("开启模拟授权后，可以导入示例训练，体验关联、去重和漏练更正。")
                    .font(.subheadline).foregroundStyle(Grove.muted)
                Primary("开启模拟授权", icon: "link") {
                    state.healthAccess = true
                    persist()
                    route = .record(id, true)
                }
                Secondary("继续手动记录") { route = .record(id, false) }
            }
        case .match(let workoutID, let planID):
            if let workout = state.workouts.first(where: { $0.id == workoutID }) {
                panel("训练记录") {
                    MatchForm(training: state, workout: workout, preferred: planID, detail: { route = .detail($0) }, finish: { route = nil }) { plan in
                        let corrected = state.plans.first { $0.id == plan }?.status == .missed
                        try update { try $0.confirm(workout: workoutID, for: plan) }
                        message = corrected ? "已更正漏练结算。" : "训练已完成，伙伴获得一次成长。"
                        route = nil
                    }
                }
            }
        case .clock:
            panel("演示时钟") {
                ClockForm(state: state) { try advance($0) }
            }
        case .adopt:
            panel("领养新伙伴") {
                Text("新伙伴从 3 格血开始。之前的计划和训练记录会保留。")
                    .font(.subheadline).foregroundStyle(Grove.muted)
                AdoptForm(onboarding: false) { name in
                    try update { try $0.adopt(name) }
                    route = nil
                }
            }
        case .recover(let id):
            if let pet = state.recoverable.first(where: { $0.id == id }) {
                panel("恢复\(pet.name)") {
                    Hearts(count: state.hearts(id))
                    Text("\(pet.name)有 \(state.hearts(id)) 格血，已完成 \(state.growth(id)) 次成长。")
                    if let active = state.activePet {
                        Text("恢复后，\(active.name)的生命和成长进度会保留。")
                            .font(.subheadline).foregroundStyle(Grove.muted)
                    }
                    Primary("恢复\(pet.name)", icon: "heart.fill") {
                        attempt {
                            try update { try $0.restore(id) }
                            message = "已恢复\(pet.name)。"
                            route = nil
                        }
                    }
                    Secondary(state.activePet.map { "继续养\($0.name)" } ?? "稍后再决定") { route = nil }
                }
            }
        }
    }

    private func panel<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
                Spacer()
                iconButton("xmark", label: "关闭") { route = nil }
            }
            .padding(.horizontal, 22).padding(.vertical, 16)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 14, content: content)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(22)
            }
        }
        .foregroundStyle(Grove.ink)
        .background(Grove.paper.ignoresSafeArea())
#if os(macOS)
        .frame(width: 405, height: 595)
#endif
    }

    private func planDetail(_ plan: Plan) -> some View {
        let owner = state.pets.first { $0.id == plan.missPet }
        let growth = state.pets.first { $0.id == plan.growthPet }
        let record = state.workouts.first { $0.id == plan.workoutID }
        let settlement: String
        if plan.corrected {
            settlement = owner.map { "已撤销\($0.name)的扣血，补发成长" } ?? "已更正"
        } else if plan.status == .missed {
            settlement = owner.map { "\($0.name)扣 1 格血" } ?? "截止时无在养伙伴"
        } else if plan.status == .done {
            settlement = growth.map { "\($0.name)获得一次成长" } ?? "已确认达标"
        } else {
            settlement = "待结算"
        }
        return VStack(alignment: .leading, spacing: 13) {
            HStack {
                StatusBadge(status: plan.status)
                Spacer()
                Text("编号 \(plan.id.uuidString.prefix(6))").font(.caption.monospaced()).foregroundStyle(Grove.muted)
            }
            VStack(spacing: 10) {
                item("目标", "\(plan.target) 分钟")
                item("训练截止", Beijing.format(plan.cutoff, "M/d HH:mm"))
                item("补记截止", Beijing.format(plan.graceEnd, "M/d HH:mm"))
                item("更正截止", Beijing.format(plan.correctionEnd, "M/d HH:mm"))
                item("关联记录", record.map { "\($0.name) · \($0.minutes) 分钟" } ?? "暂无")
                item("宠物结算", settlement)
            }.card()
            if plan.status == .missed {
                Text("补记期内没有已确认的达标训练。").font(.footnote).foregroundStyle(Grove.muted)
                if state.now < plan.correctionEnd {
                    Primary("同步迟到记录", icon: "arrow.clockwise") { sync(plan.id) }
                }
            }
            if plan.status == .pending || plan.status == .grace {
                Primary(plan.status == .grace ? "手动补记" : "记录训练", icon: "square.and.pencil") { route = .record(plan.id, false) }
                Secondary("同步设备", icon: "arrow.clockwise") { sync(plan.id) }
            }
            if plan.status == .pending {
                Secondary("改期", icon: "calendar") { route = .reschedule(plan.id) }
            }
            if let record {
                Secondary("查看关联记录") { route = .match(record.id, nil) }
            }
        }
    }

    private func header(_ text: String, accessory: String, action: @escaping () -> Void) -> some View {
        HStack {
            Text(text).font(.headline).accessibilityAddTraits(.isHeader)
            Spacer()
            iconButton(accessory, label: "添加训练", action: action)
        }
    }
}

private struct AdoptForm: View {
    let onboarding: Bool
    let submit: (String) throws -> Void
    @State private var name = "阿团"
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack {
                Text("伙伴名字").font(.subheadline.weight(.semibold))
                Spacer()
                Hearts(count: 3)
            }
            TextField("给伙伴起个名字", text: $name).inputField()
                .accessibilityLabel("伙伴名字")
            if let error { inlineError(error) }
            Primary(onboarding ? "领养并继续" : "确认领养", icon: "arrow.right") {
                do { try submit(name) } catch { self.error = error.localizedDescription }
            }
        }
    }
}

private struct PlanForm: View {
    let state: Training
    var first = false
    var chosen: Date
    var plan: Plan?
    let submit: (String, Date, Int) throws -> Void
    @State private var name = ""
    @State private var day = Beijing.demoStart
    @State private var minutes = "25"
    @State private var error: String?

    var body: some View {
        let range = state.today...Beijing.add(6, to: Beijing.week(plan?.date ?? state.today))
        VStack(alignment: .leading, spacing: 14) {
            if plan == nil {
                Text("训练项目").font(.subheadline.weight(.semibold))
                TextField("例如：操场慢跑", text: $name).inputField().accessibilityLabel("训练项目")
                ScrollView(.horizontal) {
                    HStack(spacing: 7) {
                        ForEach(["操场慢跑", "核心训练", "全身拉伸"], id: \.self) { preset in
                            Button(preset) { name = preset }
                                .buttonStyle(.plain)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 10).padding(.vertical, 8)
                                .background(name == preset ? Grove.moss : Grove.card, in: Capsule())
                        }
                    }
                }.scrollIndicators(.hidden)
            } else {
                Text("\(plan?.name ?? "") · \(minutes) 分钟").font(.subheadline).foregroundStyle(Grove.muted)
            }
            DatePicker("训练日期", selection: $day, in: range, displayedComponents: .date).inputField()
            if plan == nil {
                Text("目标时长（分钟）").font(.subheadline.weight(.semibold))
                TextField("25", text: $minutes).numberField().inputField().accessibilityLabel("目标时长（分钟）")
            }
            Text("可选择本周的今天或未来日期。").font(.footnote).foregroundStyle(Grove.muted)
            if let error { inlineError(error) }
            Primary(first ? "保存计划并继续" : plan == nil ? "添加训练" : "保存改期", icon: "arrow.right") {
                do { try submit(name, day, Int(minutes) ?? 0) } catch { self.error = error.localizedDescription }
            }
        }
        .onAppear {
            day = min(range.upperBound, max(range.lowerBound, plan?.date ?? chosen))
            if let plan {
                name = plan.name
                minutes = String(plan.target)
            }
        }
    }
}

private struct RecordForm: View {
    let training: Training
    let plan: Plan?
    let device: Bool
    let save: (Workout, UUID?) throws -> Void
    @State private var name = ""
    @State private var start = Beijing.demoStart
    @State private var minutes = "25"
    @State private var source: RecordSource = .manual
    @State private var error: String?
    @State private var duplicate: Workout?
    @State private var candidate: Workout?
    @State private var confirmDuplicate = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if device {
                Text("编辑示例记录，模拟从 Apple 健康读到的训练。")
                    .font(.subheadline).foregroundStyle(Grove.muted)
            }
            if let plan {
                Text("计划：\(plan.name) · \(plan.target) 分钟")
                    .font(.subheadline.weight(.semibold))
            }
            Text("实际训练项目").font(.subheadline.weight(.semibold))
            TextField("例如：操场慢跑", text: $name).inputField().accessibilityLabel("实际训练项目")
            DatePicker("开始日期", selection: $start, displayedComponents: .date).inputField()
            DatePicker("开始时间", selection: $start, displayedComponents: .hourAndMinute).inputField()
            Text("实际时长（分钟）").font(.subheadline.weight(.semibold))
            TextField("25", text: $minutes).numberField().inputField().accessibilityLabel("实际时长（分钟）")
            if device {
                Picker("记录类型", selection: $source) {
                    Text(RecordSource.device.rawValue).tag(RecordSource.device)
                    Text(RecordSource.healthManual.rawValue).tag(RecordSource.healthManual)
                }.inputField()
            }
            if let error { inlineError(error) }
            Primary(device ? "导入并匹配" : "保存并匹配", icon: "arrow.right") { prepare() }
        }
        .onAppear {
            let draft = training.draft(for: plan, source: device ? .device : .manual)
            name = draft.name
            start = draft.start
            minutes = String(draft.minutes)
            source = draft.source
        }
        .alert("发现可能重复的训练", isPresented: $confirmDuplicate) {
            Button("合并记录") { if let candidate { finish(candidate, merge: duplicate?.id) } }
            Button("确认为另一场") { if let candidate { finish(candidate, merge: nil) } }
            Button("取消", role: .cancel) {}
        } message: {
            if let duplicate {
                Text("已有\(duplicate.name)，开始于 \(Beijing.format(duplicate.start, "M/d HH:mm"))，时长 \(duplicate.minutes) 分钟。")
            }
        }
    }

    private func prepare() {
        let value = Workout(name: name.trimmingCharacters(in: .whitespacesAndNewlines), start: start,
                            minutes: Int(minutes) ?? 0, source: source)
        do {
            try training.validate(value)
            if training.exactMatch(value) == nil, let existing = training.possibleMatch(value) {
                duplicate = existing
                candidate = value
                confirmDuplicate = true
            } else {
                try save(value, nil)
            }
        } catch { self.error = error.localizedDescription }
    }

    private func finish(_ workout: Workout, merge: UUID?) {
        do { try save(workout, merge) } catch { self.error = error.localizedDescription }
    }
}

private struct MatchForm: View {
    let training: Training
    let workout: Workout
    let preferred: UUID?
    let detail: (UUID) -> Void
    let finish: () -> Void
    let submit: (UUID) throws -> Void
    @State private var selection: UUID?
    @State private var error: String?

    var body: some View {
        let choices = training.orderedPlans.filter { training.mismatch(workout, for: $0) == nil }
        let linked = training.plans.first { $0.id == workout.planID }
        VStack(alignment: .leading, spacing: 12) {
            Text(workout.name).font(.title3.weight(.bold))
            VStack(spacing: 10) {
                item("来源", workout.source.rawValue)
                item("开始", Beijing.format(workout.start, "M/d HH:mm"))
                item("结束", Beijing.format(workout.end, "M/d HH:mm"))
                item("时长", "\(workout.minutes) 分钟")
                item("关联计划", linked?.name ?? "未关联")
            }.card()
            if let linked {
                StatusBadge(status: linked.status)
                Secondary("查看已完成计划") { detail(linked.id) }
                Primary("完成", icon: "checkmark", action: finish)
            } else {
                if let plan = training.plans.first(where: { $0.id == preferred }),
                   let reason = training.mismatch(workout, for: plan) {
                    Text("\(plan.name)：\(reason)").font(.footnote).foregroundStyle(Grove.muted)
                }
                if choices.isEmpty {
                    Text("暂无可关联的计划，这条记录已保存在训练历史。")
                        .font(.subheadline).foregroundStyle(Grove.muted)
                    Primary("完成", icon: "checkmark", action: finish)
                } else {
                    Picker("关联计划", selection: $selection) {
                        ForEach(choices) { plan in
                            Text("\(Beijing.format(plan.date, "M/d")) · \(plan.name)").tag(Optional(plan.id))
                        }
                    }.inputField()
                    if let error { inlineError(error) }
                    Primary("确认关联", icon: "checkmark") {
                        if let selection {
                            do { try submit(selection) } catch { self.error = error.localizedDescription }
                        }
                    }.disabled(selection == nil)
                    Secondary("仅保留在历史", action: finish)
                }
            }
        }
        .onAppear {
            selection = choices.contains { $0.id == preferred } ? preferred : choices.first?.id
        }
    }
}

private struct ClockForm: View {
    let state: Training
    let advance: (Date) throws -> Void
    @State private var selected = Beijing.demoStart
    @State private var error: String?

    var body: some View {
        let next = state.orderedPlans.first { $0.status == .pending || $0.status == .grace }
        VStack(alignment: .leading, spacing: 12) {
            Text(Beijing.format(state.now, "M 月 d 日 HH:mm")).font(.title2.monospacedDigit().weight(.bold))
            Text("北京时间。推进时钟会结算到期的训练，可用来体验补记、扣血和更正。")
                .font(.subheadline).foregroundStyle(Grove.muted)
            HStack(spacing: 8) {
                Secondary("+1 小时") { set(state.now.addingTimeInterval(3600)) }
                Secondary("+1 天") { set(Beijing.add(1, to: state.now)) }
            }
            if let next {
                Secondary(next.status == .grace ? "到补记截止" : "到训练截止", icon: "clock.arrow.circlepath") {
                    set(next.status == .grace ? next.graceEnd : next.cutoff)
                }
            }
            DatePicker("跳转日期", selection: $selected, displayedComponents: .date).inputField()
            DatePicker("跳转时间", selection: $selected, displayedComponents: .hourAndMinute).inputField()
            if let error { inlineError(error) }
            Primary("应用时间", icon: "arrow.right") { set(selected) }
        }
        .onAppear { selected = state.now }
    }

    private func set(_ date: Date) {
        do { try advance(date) } catch { self.error = error.localizedDescription }
    }
}

private struct Primary: View {
    let text: String
    var icon: String
    let action: () -> Void

    init(_ text: String, icon: String, action: @escaping () -> Void) {
        self.text = text
        self.icon = icon
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(text)
                Image(systemName: icon).font(.system(size: 13, weight: .semibold)).accessibilityHidden(true)
            }
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity).padding(.horizontal, 10).frame(minHeight: 46)
            .foregroundStyle(Grove.card)
            .background(Grove.green, in: RoundedRectangle(cornerRadius: 13))
        }.buttonStyle(.plain)
    }
}

private struct Secondary: View {
    let text: String
    var icon: String?
    let action: () -> Void

    init(_ text: String, icon: String? = nil, action: @escaping () -> Void) {
        self.text = text
        self.icon = icon
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon { Image(systemName: icon).accessibilityHidden(true) }
                Text(text)
            }
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity).padding(.horizontal, 11).frame(minHeight: 44)
            .foregroundStyle(Grove.green)
            .background(Grove.card, in: RoundedRectangle(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).strokeBorder(Grove.line) }
        }.buttonStyle(.plain)
    }
}

private struct StatusBadge: View {
    let status: PlanStatus

    var body: some View {
        Text(status.rawValue)
            .font(.caption2.weight(.semibold))
            .lineLimit(1).fixedSize()
            .padding(.horizontal, 7).padding(.vertical, 5)
            .foregroundStyle(status == .missed ? Grove.coral : Grove.green)
            .background(status == .missed ? Grove.blush : status == .grace ? Grove.amber : Grove.moss, in: Capsule())
    }
}

private struct Hearts: View {
    let count: Int

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3) { index in PixelHeart(filled: index < count) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(count) 格血，共 3 格")
    }
}

private func sectionTitle(_ title: String, _ note: String) -> some View {
    VStack(alignment: .leading, spacing: 7) {
        Text(title).font(.system(size: 32, weight: .heavy, design: .rounded)).accessibilityAddTraits(.isHeader)
        Text(note).font(.subheadline).foregroundStyle(Grove.muted).fixedSize(horizontal: false, vertical: true)
    }
}

private func iconButton(_ icon: String, label: String, action: @escaping () -> Void) -> some View {
    Button(action: action) {
        Image(systemName: icon).font(.system(size: 13, weight: .semibold))
            .frame(width: 44, height: 44)
            .background(Grove.moss, in: RoundedRectangle(cornerRadius: 11))
    }.buttonStyle(.plain).accessibilityLabel(label)
}

private func tile(_ icon: String) -> some View {
    Image(systemName: icon).font(.system(size: 16, weight: .medium)).foregroundStyle(Grove.green)
        .frame(width: 37, height: 37)
        .background(Grove.moss, in: RoundedRectangle(cornerRadius: 9))
        .accessibilityHidden(true)
}

private func item(_ title: String, _ value: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
        Text(title).foregroundStyle(Grove.muted)
        Spacer(minLength: 0)
        Text(value).fontWeight(.medium).multilineTextAlignment(.trailing)
    }
    .font(.subheadline)
}

private func empty(_ text: String) -> some View {
    Text(text).font(.subheadline).foregroundStyle(Grove.muted)
        .frame(maxWidth: .infinity).padding(.vertical, 12).card()
}

private func inlineError(_ text: String) -> some View {
    Text(text).font(.footnote).foregroundStyle(Grove.coral).accessibilityAddTraits(.updatesFrequently)
}

private extension View {
    func inputField() -> some View {
        self.padding(.horizontal, 13).padding(.vertical, 11)
            .background(Grove.card, in: RoundedRectangle(cornerRadius: 11))
            .overlay { RoundedRectangle(cornerRadius: 11).strokeBorder(Grove.line) }
    }

    func card() -> some View {
        self.padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Grove.card, in: RoundedRectangle(cornerRadius: 19))
            .overlay { RoundedRectangle(cornerRadius: 19).strokeBorder(Grove.line) }
    }
}

private extension TextField {
    @ViewBuilder
    func numberField() -> some View {
#if os(iOS)
        keyboardType(.numberPad)
#else
        self
#endif
    }
}

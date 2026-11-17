import SwiftUI

@MainActor
enum DisplayDate {
    private static let shortDate = formatter("M月d日")
    private static let fullDate = formatter("yyyy年M月d日")
    private static let stamp = formatter("M月d日 HH:mm")
    private static let time = formatter("HH:mm")

    static func day(_ date: Date) -> String { shortDate.string(from: date) }
    static func adoption(_ date: Date) -> String { fullDate.string(from: date) }
    static func dateTime(_ date: Date) -> String { stamp.string(from: date) }
    static func clock(_ date: Date) -> String { time.string(from: date) }

    private static func formatter(_ format: String) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.timeZone = TrainingCalendar.timeZone
        formatter.dateFormat = format
        return formatter
    }
}

struct TodayView: View {
    let model: AppModel
    @Binding var expanded: Bool
    let open: (SheetRoute) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @GestureState private var isDragging = false
    @State private var drag = HabitatZoomDrag()
    @State private var dragDistance: CGFloat = 0
    @State private var dragProgress: CGFloat?
    @State private var scrollOffset: CGFloat = 0
    @State private var cardFrame: CGRect = .zero
    @State private var transitionSource: CGRect?
    @State private var recordOptions: UUID?
    @State private var timerPlan: TrainingPlan?

    private var todayPlans: [TrainingPlan] {
        model.state.plans.filter { $0.day == model.today }
            .sorted { ($0.scheduledAt ?? $0.day) < ($1.scheduledAt ?? $1.day) }
    }

    var body: some View {
        GeometryReader { safeArea in
            let settledProgress: CGFloat = expanded ? 1 : 0
            let progress = reduceMotion ? settledProgress : dragProgress ?? settledProgress
            ZStack {
                dailyList
                    .accessibilityHidden(expanded)
                    .allowsHitTesting(!expanded)
                GeometryReader { screen in
                    TodayHabitatZoom(
                        model: model,
                        geometry: .init(card: transitionSource ?? cardFrame, viewport: screen.frame(in: .global)),
                        insets: safeArea.safeAreaInsets,
                        progress: progress,
                        expanded: expanded,
                        close: { setExpanded(false) }
                    )
                    .allowsHitTesting(expanded)
                    .accessibilityHidden(!expanded)
                }
                .ignoresSafeArea(.container)
            }
            .background(.white)
            .simultaneousGesture(habitatGesture(viewportHeight: safeArea.size.height))
        }
        .onChange(of: isDragging) { _, active in
            guard !active else { return }
            if dragProgress != nil { setExpanded(expanded) }
            resetDrag()
        }
        .sheet(item: $timerPlan) { plan in
            NavigationStack { TimerView(model: model, plan: plan) }
        }
    }

    private var dailyList: some View {
        List {
            header.listRowSeparator(.hidden)
            if let timer = model.state.timer,
               let plan = model.state.plans.first(where: { $0.id == timer.planID }) {
                Button("继续\(plan.title)计时", systemImage: "timer") { timerPlan = plan }
                    .listRowSeparator(.hidden)
            }
            if let pet = model.state.displayedPet {
                Button {
                    transitionSource = cardFrame
                    setExpanded(true)
                } label: {
                    TodayHabitatCard(model: model, pet: pet)
                        .clipShape(.rect(cornerRadius: HabitatZoomGeometry.cardRadius))
                }
                .buttonStyle(.plain)
                .onGeometryChange(for: CGRect.self, of: { $0.frame(in: .global) }) { cardFrame = $0 }
                .accessibilityHint("打开全屏栖息地")
                .listRowSeparator(.hidden)
                .padding(.bottom, 12)
            }
            Section {
                if todayPlans.isEmpty {
                    HStack {
                        Text("今天无计划训练").foregroundStyle(.secondary)
                        Spacer()
                        AddPlanButton { open(.addPlan(model.today)) }
                    }
                    .listRowSeparator(.hidden)
                }
                ForEach(todayPlans) { plan in
                    todayRow(plan)
                }
            } header: {
                Text("今日训练").font(.title3.bold()).foregroundStyle(.primary)
            }
            ForEach(model.state.plans.filter { model.state.status(of: $0, at: model.now) == .grace }) { plan in
                Button { open(.plan(plan)) } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(plan.title + "待补记").font(.headline)
                        Text("最晚 " + DisplayDate.dateTime(plan.graceEnds)).font(.caption).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading).padding(12)
                    .background(.quaternary.opacity(0.53), in: .rect(cornerRadius: 18))
                }
                .buttonStyle(.plain).listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .onScrollGeometryChange(for: CGFloat.self, of: { $0.contentOffset.y + $0.contentInsets.top }) {
            _, offset in scrollOffset = offset
        }
    }

    private var header: some View {
        let minutes = model.state.trainingMinutes(from: model.today, until: TrainingCalendar.addingDays(1, to: model.today))
        let hours = (Double(minutes) / 60).formatted(.number.precision(.fractionLength(0...2)))
        return HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 5) {
                Text(DisplayDate.day(model.today)).font(.subheadline).foregroundStyle(.secondary)
                Text("今天已经锻炼\(hours)小时")
                    .font(.system(size: 30, weight: .bold)).minimumScaleFactor(0.7)
                    .accessibilityAddTraits(.isHeader)
                Text("你距离目标还有\(max(0, model.state.goalMinutes - minutes))分钟")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            Button { open(.settings) } label: { Image(systemName: "gearshape").frame(width: 36, height: 36) }
                .buttonStyle(.glass)
                .accessibilityLabel("设置")
        }
        .padding(.vertical, 8)
    }

    private func habitatGesture(viewportHeight: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 12, coordinateSpace: .global)
            .updating($isDragging) { _, active, _ in active = true }
            .onChanged { value in
                guard let distance = drag.distance(translation: value.translation, expanded: expanded,
                                                   scrollOffset: scrollOffset) else { return }
                dragDistance = distance
                guard distance > 0 || dragProgress != nil else { return }
                if dragProgress == nil, !expanded {
                    // Keep the card's resting position while the list springs back from its overscroll.
                    transitionSource = cardFrame.offsetBy(dx: 0, dy: min(0, scrollOffset))
                }
                dragProgress = HabitatZoomDrag.progress(distance: distance, viewportHeight: viewportHeight,
                                                        expanded: expanded)
            }
            .onEnded { _ in
                if dragProgress != nil {
                    setExpanded(HabitatZoomDrag.completes(distance: dragDistance) ? !expanded : expanded)
                }
                resetDrag()
            }
    }

    private func resetDrag() {
        drag = HabitatZoomDrag()
        dragDistance = 0
    }

    private func todayRow(_ plan: TrainingPlan) -> some View {
        HStack {
            Button { open(.plan(plan)) } label: { PlanLabel(plan: plan, showsDay: false) }
                .buttonStyle(.plain)
            Spacer(minLength: 8)
            if model.state.status(of: plan, at: model.now) == .done {
                Image(systemName: "checkmark.circle.fill").accessibilityLabel("已完成")
            } else if recordOptions == plan.id {
                Button { startTimer(plan) } label: { Image(systemName: "timer").frame(minWidth: 32, minHeight: 32) }
                    .buttonStyle(.glass).accessibilityLabel("计时")
                Button { open(.manual(plan, nil)) } label: { Image(systemName: "square.and.pencil").frame(minWidth: 32, minHeight: 32) }
                    .buttonStyle(.glass).accessibilityLabel("直接记录")
            } else {
                Button(model.state.timer?.planID == plan.id ? "计时中" : "记录") {
                    if model.state.timer?.planID == plan.id { timerPlan = plan }
                    else { withAnimation(reduceMotion ? nil : .snappy(duration: 0.22)) { recordOptions = plan.id } }
                }
                .buttonStyle(.glass).font(.subheadline.weight(.semibold))
            }
        }
        .padding(.vertical, 6).listRowSeparator(.hidden)
        .planRowActions(model: model, plan: plan, open: open)
    }

    private func setExpanded(_ value: Bool) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.42, extraBounce: 0)) {
            expanded = value
            dragProgress = nil
        }
    }

    private func startTimer(_ plan: TrainingPlan) {
        if model.state.timer?.planID == plan.id || model.change({ state, now in
            try state.startTimer(for: plan.id, at: now)
        }) { timerPlan = plan }
    }
}

private struct TodayHabitatCard: View {
    let model: AppModel
    let pet: Pet
    var previewHeight: CGFloat = 148

    private static let surface = Color(.sRGB, white: 0.97, opacity: 1)

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                PixelImage(art: PixelArtwork.shared.habitat(pet.habitat))
                    .scaledToFill().frame(height: previewHeight).clipped()
                PetPortrait(species: pet.species, stage: model.stage(of: pet), size: 115)
            }
            .frame(height: previewHeight)
            .clipped()
            .overlay(alignment: .bottom) {
                LinearGradient(colors: [.clear, Self.surface], startPoint: .top, endPoint: .bottom)
                    .frame(height: 34)
                    .allowsHitTesting(false)
            }
            .accessibilityHidden(true)
            PetStats(model: model, pet: pet, compact: true)
                .padding([.horizontal, .bottom], 12)
        }
        .background(Self.surface)
    }
}

private struct TodayHabitatZoom: View, Animatable {
    let model: AppModel
    let geometry: HabitatZoomGeometry
    let insets: EdgeInsets
    nonisolated var progress: CGFloat
    let expanded: Bool
    let close: () -> Void

    nonisolated var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    var body: some View {
        let fraction = min(1, max(0, progress))
        let frame = geometry.frame(at: fraction)
        let viewport = geometry.viewport
        let pet = model.state.displayedPet
        let previewOpacity = geometry.card.isEmpty ? 0 : max(0, 1 - fraction * 3)
        ZStack {
            HabitatCanvas(habitat: pet?.habitat ?? .garden, pet: pet, stage: pet.map { model.stage(of: $0) } ?? 1,
                          animating: expanded, isMemorial: model.state.activePet == nil)
                .frame(width: viewport.width, height: viewport.height)
                .background(.white)
                .scaleEffect(frame.width / max(1, viewport.width))
            if let pet, previewOpacity > 0 {
                TodayHabitatCard(model: model, pet: pet,
                                 previewHeight: 148 + max(0, frame.height - geometry.card.height))
                    .frame(width: frame.width, height: frame.height, alignment: .top)
                    .opacity(previewOpacity)
            }
        }
        .frame(width: frame.width, height: frame.height)
        .overlay {
            VStack(alignment: .leading) {
                if let pet { PetStats(model: model, pet: pet, interactiveAge: true).padding(.horizontal, 20) }
                Spacer()
                Button(action: close) {
                    Label("上滑查看今天", systemImage: "chevron.up")
                        .font(.callout.weight(.semibold))
                        .padding(.horizontal, 12).padding(.vertical, 7)
                }
                .buttonStyle(.glass).frame(maxWidth: .infinity)
            }
            .padding(.top, 12 + insets.top * fraction)
            .padding(.bottom, 12 + insets.bottom * fraction)
            .opacity(max(0, (fraction - 0.6) / 0.4))
            .allowsHitTesting(fraction >= 0.99)
        }
        .clipShape(.rect(cornerRadius: geometry.cornerRadius(at: fraction)))
        .opacity(fraction > 0 ? 1 : 0)
        .position(x: frame.midX - viewport.minX, y: frame.midY - viewport.minY)
    }
}

struct PlanLabel: View {
    let plan: TrainingPlan
    var showsDay = true

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "figure.mixed.cardio").font(.title3)
                .frame(width: 43, height: 43)
                .background(.quaternary, in: .rect(cornerRadius: 13))
            VStack(alignment: .leading, spacing: 5) {
                Text(plan.title).font(.headline)
                Text([showsDay ? DisplayDate.day(plan.day) : nil, plan.scheduledAt.map(DisplayDate.clock),
                      "\(plan.minutes) 分钟"].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

extension View {
    func planRowActions(model: AppModel, plan: TrainingPlan, open: @escaping (SheetRoute) -> Void) -> some View {
        #if os(iOS)
        swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) { model.change { state, _ in state.deletePlan(plan.id) } } label: {
                Label("删除", systemImage: "trash")
            }
            Button { open(.editPlan(plan)) } label: { Label("编辑", systemImage: "pencil") }.tint(.gray)
        }
        #else
        contextMenu {
            Button("编辑") { open(.editPlan(plan)) }
            Button("删除", role: .destructive) { model.change { state, _ in state.deletePlan(plan.id) } }
        }
        #endif
    }
}

private struct AddPlanButton: View {
    let action: () -> Void

    var body: some View {
        Button("新增计划", action: action).buttonStyle(.glass)
    }
}

struct PlansView: View {
    let model: AppModel
    let open: (SheetRoute) -> Void
    @State private var selected = TrainingCalendar.day(Date())
    @State private var showWeek = false
    @State private var showPicker = false

    private var week: Date { TrainingCalendar.week(selected) }
    private var calendar: Calendar { TrainingCalendar.calendar }
    private var weekPlans: [TrainingPlan] {
        model.state.plans.filter { TrainingCalendar.week($0.day) == week }
            .sorted { ($0.scheduledAt ?? $0.day) < ($1.scheduledAt ?? $1.day) }
    }

    var body: some View {
        List {
            summary.listRowSeparator(.hidden)
            Section {
                let rows = showWeek ? weekPlans : weekPlans.filter { $0.day == selected }
                if rows.isEmpty {
                    Text(showWeek ? "本周无训练计划" : "这天无训练计划")
                        .foregroundStyle(.secondary).listRowSeparator(.hidden)
                }
                ForEach(rows) { plan in
                    Button { open(.plan(plan)) } label: {
                        HStack {
                            PlanLabel(plan: plan)
                            Spacer()
                            Text(model.state.status(of: plan, at: model.now).rawValue)
                                .font(.caption.weight(.medium))
                                .padding(.vertical, 5).padding(.horizontal, 8)
                                .background(.quaternary, in: .capsule)
                        }.padding(.vertical, 4)
                    }
                    .buttonStyle(.plain).listRowSeparator(.hidden)
                    .planRowActions(model: model, plan: plan, open: open)
                }
                AddPlanButton { open(.addPlan(max(selected, model.today))) }
                    .listRowSeparator(.hidden)
                    .frame(maxWidth: .infinity)
            } header: {
                HStack {
                    Text(showWeek ? "本周安排" : "当天安排").font(.headline)
                    Spacer()
                    Button(showWeek ? "查看当天" : "显示全周") { showWeek.toggle() }.font(.subheadline)
                }
                .padding(.top, 14)
            }
        }
        .listStyle(.plain)
        .navigationTitle("训练计划")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("新增计划", systemImage: "plus") { open(.addPlan(max(selected, model.today))) }
            }
        }
        .sheet(isPresented: $showPicker) {
            NavigationStack {
                DatePicker("选择计划日期", selection: $selected, displayedComponents: .date)
                    .datePickerStyle(.graphical).labelsHidden().padding()
                    .navigationTitle("选择日期").compactNavigationTitle()
                    .toolbar { Button("完成") { selected = TrainingCalendar.day(selected); showPicker = false } }
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var summary: some View {
        VStack(spacing: 12) {
            HStack(spacing: 0) {
                Button { selected = TrainingCalendar.addingDays(-7, to: selected) } label: {
                    Image(systemName: "chevron.left").frame(width: 44, height: 44)
                        .contentShape(.rect)
                }.accessibilityLabel("上一周")
                Button { showPicker = true } label: {
                    VStack(spacing: 2) {
                        let year = calendar.component(.yearForWeekOfYear, from: week)
                        let number = calendar.component(.weekOfYear, from: week)
                        Text("\(year, format: .number.grouping(.never)) 年第 \(number) 周").font(.headline)
                        Text(DisplayDate.day(week) + "–" + DisplayDate.day(TrainingCalendar.addingDays(6, to: week)))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(.rect)
                }
                .accessibilityHint("打开日历选择日期")
                Button { selected = TrainingCalendar.addingDays(7, to: selected) } label: {
                    Image(systemName: "chevron.right").frame(width: 44, height: 44)
                        .contentShape(.rect)
                }.accessibilityLabel("下一周")
            }.buttonStyle(.plain)
            HStack(spacing: 2) {
                ForEach(0..<7) { offset in
                    let day = TrainingCalendar.addingDays(offset, to: week)
                    let isSelected = TrainingCalendar.day(selected) == day
                    Button {
                        selected = day
                        showWeek = false
                    } label: {
                        VStack(spacing: 4) {
                            Text(["一", "二", "三", "四", "五", "六", "日"][offset]).font(.caption2)
                            Text("\(calendar.component(.day, from: day))").font(.headline)
                            Circle().fill(.primary.opacity(weekPlans.contains { $0.day == day } ? 0.6 : 0)).frame(width: 4, height: 4)
                        }
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(isSelected ? Color.primary.opacity(0.08) : .clear, in: .rect(cornerRadius: 12))
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(DisplayDate.day(day))
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            HStack {
                let completed = weekPlans.filter { model.state.status(of: $0, at: model.now) == .done }.count
                Text("本周已完成 **\(completed) / \(weekPlans.count)**")
                Spacer()
                let minutes = model.state.trainingMinutes(from: week, until: TrainingCalendar.addingDays(7, to: week))
                Text("本周训练时长 **\(minutes) 分钟**")
            }.font(.caption).foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }
}

struct ReviewView: View {
    let model: AppModel
    let open: (SheetRoute) -> Void
    @State private var day: Date?

    private var grouped: [Date: [Workout]] {
        Dictionary(grouping: model.state.workouts.filter { day == nil || $0.day == day }, by: \.day)
    }

    var body: some View {
        List {
            Heatmap(today: model.today, workouts: model.state.workouts, selected: $day)
                .listRowSeparator(.hidden).padding(.bottom, 14)
            HStack {
                Text(day.map(DisplayDate.day) ?? "训练记录").font(.headline)
                Spacer()
                if day != nil { Button("全部记录") { day = nil }.font(.subheadline) }
            }.listRowSeparator(.hidden)
            if grouped.isEmpty {
                Text("暂无训练记录").foregroundStyle(.secondary).listRowSeparator(.hidden)
            }
            ForEach(grouped.keys.sorted(by: >), id: \.self) { date in
                Section(DisplayDate.day(date)) {
                    ForEach((grouped[date] ?? []).sorted { $0.start > $1.start }) { workout in
                        Button { open(.workout(workout)) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(workout.title).font(.headline)
                                    Text(DisplayDate.clock(workout.start)).font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text("\(workout.minutes) 分钟").font(.subheadline).foregroundStyle(.secondary)
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain).listRowSeparator(.hidden)
                        #if os(iOS)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                model.change { state, now in state.deleteWorkout(workout.id, at: now) }
                            } label: { Label("删除", systemImage: "trash") }
                            Button { open(.manual(nil, workout)) } label: { Label("编辑", systemImage: "pencil") }.tint(.gray)
                        }
                        #endif
                    }
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("训练回顾")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("手动记录", systemImage: "plus") { open(.manual(nil, nil)) }
            }
        }
    }
}

private struct Heatmap: View {
    let today: Date
    let workouts: [Workout]
    @Binding var selected: Date?

    var body: some View {
        let end = TrainingCalendar.week(today)
        let first = TrainingCalendar.addingDays(-51 * 7, to: end)
        let totals = Dictionary(grouping: workouts, by: \.day).mapValues { $0.reduce(0) { $0 + $1.minutes } }
        VStack(alignment: .leading, spacing: 8) {
            Text("训练热力图").font(.headline)
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 4) {
                    ForEach(0..<52) { index in
                        let week = TrainingCalendar.addingDays(index * 7, to: first)
                        let day = TrainingCalendar.calendar.component(.day, from: week)
                        VStack(spacing: 4) {
                            Text(day <= 7 ? "\(TrainingCalendar.calendar.component(.month, from: week))月" : " ")
                                .fixedSize().font(.system(size: 8)).foregroundStyle(.secondary)
                            ForEach(0..<7) { offset in
                                let date = TrainingCalendar.addingDays(offset, to: week)
                                let minutes = totals[date, default: 0]
                                Button {
                                    selected = date == selected ? nil : date
                                } label: {
                                    RoundedRectangle(cornerRadius: 3).fill(minutes == 0 ? Color.gray.opacity(0.12) :
                                        Color(red: 0.13, green: 0.54, blue: 0.24).opacity(min(1, 0.25 + Double(minutes) / 75)))
                                        .frame(width: 13, height: 13)
                                        .overlay {
                                            if selected == date { RoundedRectangle(cornerRadius: 3).strokeBorder(.primary) }
                                        }
                                        .opacity(date > today ? 0 : 1)
                                }
                                .buttonStyle(.plain).disabled(date > today || minutes == 0)
                                .accessibilityHidden(date > today || minutes == 0)
                                .accessibilityLabel("\(DisplayDate.day(date))，训练 \(minutes) 分钟")
                            }
                        }
                        .frame(width: 13)
                    }
                }
                .padding(.leading, 4)
            }
            .defaultScrollAnchor(.trailing).scrollIndicators(.hidden)
            .frame(height: 132)
        }
    }
}

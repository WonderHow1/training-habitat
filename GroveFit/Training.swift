import Foundation

enum Beijing {
    static let zone = TimeZone(identifier: "Asia/Shanghai")!
    static var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = zone
        value.firstWeekday = 2
        return value
    }

    static func day(_ date: Date) -> Date { calendar.startOfDay(for: date) }
    static func add(_ count: Int, to date: Date) -> Date { calendar.date(byAdding: .day, value: count, to: date)! }
    static func week(_ date: Date) -> Date {
        let weekday = calendar.component(.weekday, from: date)
        return add(-((weekday + 5) % 7), to: day(date))
    }

    static func format(_ date: Date, _ pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.calendar = calendar
        formatter.timeZone = zone
        formatter.dateFormat = pattern
        return formatter.string(from: date)
    }

    static let demoStart = calendar.date(from: DateComponents(year: 2026, month: 11, day: 16, hour: 9))!
}

enum PlanStatus: String, Codable {
    case pending = "待训练", grace = "待补记", missed = "已漏练", done = "已完成"
}

enum RecordSource: String, Codable, CaseIterable {
    case manual = "手动记录", device = "设备自动记录", healthManual = "健康 App 手动录入"
}

struct Plan: Identifiable, Codable {
    var id = UUID()
    let name: String
    let target: Int
    var date: Date
    var effective: Date
    var status: PlanStatus = .pending
    var missPet: UUID?
    var growthPet: UUID?
    var workoutID: UUID?
    var corrected = false

    var cutoff: Date { Beijing.add(1, to: date) }
    var graceEnd: Date { Beijing.add(1, to: cutoff) }
    var correctionEnd: Date { Beijing.add(7, to: cutoff) }
}

struct Workout: Identifiable, Codable {
    var id = UUID()
    var name: String
    let start: Date
    let minutes: Int
    var source: RecordSource
    var importKeys: [String] = []
    var planID: UUID?
    var end: Date { start.addingTimeInterval(Double(minutes) * 60) }

    var importKey: String? {
        guard source != .manual else { return nil }
        return "\(source.rawValue)|\(Int(start.timeIntervalSince1970))|\(minutes)|\(name)"
    }
}

struct CarePeriod: Codable {
    let start: Date
    var end: Date?
}

struct Pet: Identifiable, Codable {
    var id = UUID()
    let name: String
    var care: [CarePeriod]
    var died = false
}

struct DemoError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

struct Training: Codable {
    var now = Beijing.demoStart
    var plans: [Plan] = []
    var workouts: [Workout] = []
    var pets: [Pet] = []
    var activeID: UUID?
    var onboarded = false
    var healthAccess = false
    var reminders = true

    var today: Date { Beijing.day(now) }
    var currentWeek: Date { Beijing.week(now) }
    var activePet: Pet? { pets.first { $0.id == activeID } }
    var latestPet: Pet? { pets.max { ($0.care.last?.start ?? .distantPast) < ($1.care.last?.start ?? .distantPast) } }
    var recoverable: [Pet] { pets.filter { $0.died && hearts($0.id) > 0 } }
    var orderedPlans: [Plan] { plans.sorted { ($0.date, $0.effective) < ($1.date, $1.effective) } }

    func hearts(_ id: UUID) -> Int {
        max(0, 3 - plans.filter { $0.status == .missed && $0.missPet == id }.count)
    }

    func growth(_ id: UUID) -> Int {
        plans.filter { $0.status == .done && $0.growthPet == id }.count
    }

    func petID(at date: Date, throughEnd: Bool = false) -> UUID? {
        pets.first { pet in
            pet.care.contains { period in
                guard period.start <= date else { return false }
                guard let end = period.end else { return true }
                return date < end || (throughEnd && date == end)
            }
        }?.id
    }

    mutating func stopCare(at date: Date, died: Bool) {
        guard let index = pets.firstIndex(where: { $0.id == activeID }) else { return }
        pets[index].died = died
        pets[index].care[pets[index].care.count - 1].end = date
        activeID = nil
    }

    mutating func adopt(_ text: String) throws {
        let name = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard activeID == nil else { throw DemoError("你已有一只在养的伙伴。") }
        guard (1...12).contains(name.count) else { throw DemoError("宠物名字需要 1–12 个字符。") }
        let pet = Pet(name: name, care: [CarePeriod(start: now)])
        pets.append(pet)
        activeID = pet.id
    }

    mutating func restore(_ id: UUID) throws {
        guard recoverable.contains(where: { $0.id == id }),
              let index = pets.firstIndex(where: { $0.id == id }) else { throw DemoError("这只伙伴暂时无法恢复。") }
        stopCare(at: now, died: false)
        pets[index].died = false
        pets[index].care.append(CarePeriod(start: now))
        activeID = id
    }

    mutating func addPlan(_ text: String, on chosen: Date, target: Int) throws {
        let name = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let date = Beijing.day(chosen)
        guard (1...30).contains(name.count), (1...1440).contains(target) else {
            throw DemoError("请填写训练项目和 1–1440 分钟的目标时长。")
        }
        guard date >= today, Beijing.week(date) == currentWeek else { throw DemoError("请选择本周的今天或之后。") }
        plans.append(Plan(name: name, target: target, date: date, effective: now))
    }

    mutating func reschedule(_ id: UUID, to chosen: Date) throws {
        let date = Beijing.day(chosen)
        guard let index = plans.firstIndex(where: { $0.id == id }), plans[index].status == .pending,
              now < plans[index].cutoff else { throw DemoError("这项训练已无法改期。") }
        guard date >= today, Beijing.week(date) == Beijing.week(plans[index].date) else {
            throw DemoError("改期须在原计划同一周，且选择今天或之后。")
        }
        if date != plans[index].date {
            plans[index].date = date
            plans[index].effective = now
        }
    }

    mutating func advance(to date: Date) throws {
        guard date >= now else { throw DemoError("请选择当前时间或之后。") }
        struct Event {
            let index: Int
            let date: Date
            let cutoff: Bool
        }
        var events: [Event] = []
        for (index, plan) in plans.enumerated() where plan.status == .pending || plan.status == .grace {
            if plan.status == .pending && plan.cutoff <= date {
                events.append(Event(index: index, date: plan.cutoff, cutoff: true))
            }
            if plan.graceEnd <= date {
                events.append(Event(index: index, date: plan.graceEnd, cutoff: false))
            }
        }
        events.sort {
            if $0.date != $1.date { return $0.date < $1.date }
            if $0.cutoff != $1.cutoff { return $0.cutoff }
            return $0.index < $1.index
        }
        for event in events {
            if event.cutoff {
                plans[event.index].missPet = petID(at: event.date, throughEnd: true)
                plans[event.index].status = .grace
            } else {
                plans[event.index].status = .missed
                if let id = plans[event.index].missPet, id == activeID, hearts(id) == 0 {
                    stopCare(at: event.date, died: true)
                }
            }
        }
        now = date
    }

    func validate(_ workout: Workout) throws {
        guard (1...30).contains(workout.name.count), (1...1440).contains(workout.minutes) else {
            throw DemoError("请填写训练项目和 1–1440 分钟的实际时长。")
        }
        guard workout.end <= now else { throw DemoError("训练结束时间不能晚于当前演示时间。") }
    }

    func exactMatch(_ workout: Workout) -> Workout? {
        guard let key = workout.importKey else { return nil }
        return workouts.first { $0.importKeys.contains(key) }
    }

    func possibleMatch(_ workout: Workout) -> Workout? {
        workouts.first {
            ($0.source == .manual) != (workout.source == .manual)
                && abs($0.start.timeIntervalSince(workout.start)) <= 300
                && abs($0.minutes - workout.minutes) <= 2
        }
    }

    mutating func save(_ workout: Workout, mergedInto target: UUID? = nil) throws -> UUID {
        try validate(workout)
        if let existing = exactMatch(workout) { return existing.id }
        let key = workout.importKey
        if let target, let index = workouts.firstIndex(where: { $0.id == target }) {
            if let key { workouts[index].importKeys.append(key) }
            if workout.source == .device && workouts[index].planID == nil {
                let keys = workouts[index].importKeys
                workouts[index] = Workout(
                    id: target, name: workout.name, start: workout.start,
                    minutes: workout.minutes, source: .device, importKeys: keys
                )
            }
            return target
        }
        var added = workout
        if let key { added.importKeys.append(key) }
        workouts.append(added)
        return added.id
    }

    func mismatch(_ workout: Workout, for plan: Plan) -> String? {
        if let assigned = workout.planID { return assigned == plan.id ? "这条记录已经关联。" : "这场训练已计入另一项计划。" }
        if plan.status == .done { return "这项计划已经完成。" }
        if Beijing.day(workout.start) != plan.date || workout.end >= plan.cutoff { return "训练须在计划日期内开始并结束。" }
        if workout.start < plan.effective { return "训练开始时间早于计划生效时间。" }
        if workout.minutes < plan.target { return "单次实际时长未达到目标。" }
        if plan.status == .missed {
            if now >= plan.correctionEnd { return "7 天更正窗口已关闭。" }
            if workout.source != .device { return "补记期已结束，仅设备自动记录可更正。" }
        }
        return nil
    }

    mutating func confirm(workout id: UUID, for planID: UUID) throws {
        guard let ri = workouts.firstIndex(where: { $0.id == id }), let pi = plans.firstIndex(where: { $0.id == planID }) else {
            throw DemoError("找不到对应记录或计划。")
        }
        if workouts[ri].planID == planID && plans[pi].workoutID == id { return }
        if let message = mismatch(workouts[ri], for: plans[pi]) { throw DemoError(message) }
        let corrected = plans[pi].status == .missed
        plans[pi].corrected = corrected
        plans[pi].growthPet = corrected ? plans[pi].missPet : petID(at: workouts[ri].end)
        plans[pi].status = .done
        plans[pi].workoutID = id
        workouts[ri].planID = planID
    }

    func draft(for plan: Plan?, source: RecordSource) -> Workout {
        let minutes = plan?.target ?? 25
        let duration = Double(minutes) * 60
        let latest = min(now, plan?.cutoff.addingTimeInterval(-60) ?? now).addingTimeInterval(-duration)
        var begin = latest
        if let plan {
            let suggested = max(plan.effective, plan.date.addingTimeInterval(9 * 3600))
            if suggested <= latest { begin = suggested }
            if Beijing.day(begin) != plan.date || begin < plan.effective { begin = now.addingTimeInterval(-duration) }
        }
        return Workout(name: source == .manual ? (plan?.name ?? "") : "户外运动", start: begin, minutes: minutes, source: source)
    }
}

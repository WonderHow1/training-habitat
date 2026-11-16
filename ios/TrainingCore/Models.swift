import Foundation

enum TrainingCalendar {
    static let timeZone = TimeZone(identifier: "Asia/Shanghai")!

    static var calendar: Calendar {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = timeZone
        return calendar
    }

    static func day(_ date: Date) -> Date { calendar.startOfDay(for: date) }

    static func addingDays(_ count: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: count, to: date)!
    }

    static func week(_ date: Date) -> Date { calendar.dateInterval(of: .weekOfYear, for: date)!.start }

    static func combining(day: Date, time: Date) -> Date {
        let parts = calendar.dateComponents([.hour, .minute], from: time)
        return calendar.date(bySettingHour: parts.hour!, minute: parts.minute!, second: 0, of: day)!
    }
}

enum Species: String, Codable, CaseIterable, Identifiable {
    case cat, dog, rabbit, hamster, guineaPig, chinchilla, parrot, turtle, hedgehog, goldfish

    var id: String { rawValue }

    var name: String {
        switch self {
        case .cat: "猫"
        case .dog: "狗"
        case .rabbit: "兔子"
        case .hamster: "仓鼠"
        case .guineaPig: "荷兰猪"
        case .chinchilla: "龙猫"
        case .parrot: "鹦鹉"
        case .turtle: "乌龟"
        case .hedgehog: "刺猬"
        case .goldfish: "金鱼"
        }
    }

    var weightGrams: Int {
        switch self {
        case .cat: 3200
        case .dog: 6000
        case .rabbit: 1800
        case .hamster: 120
        case .guineaPig: 850
        case .chinchilla: 540
        case .parrot: 95
        case .turtle: 420
        case .hedgehog: 390
        case .goldfish: 35
        }
    }

    var weightLabel: String {
        weightGrams < 1000 ? "\(weightGrams) 克" :
            "\((Double(weightGrams) / 1000).formatted(.number.precision(.fractionLength(0...2)))) 公斤"
    }
}

enum Habitat: String, Codable, CaseIterable, Identifiable {
    case garden, gym, track = "running-track", living, bedroom

    var id: String { rawValue }

    var name: String {
        switch self {
        case .garden: "草地"
        case .gym: "健身房"
        case .track: "操场跑道"
        case .living: "客厅"
        case .bedroom: "卧室"
        }
    }
}

enum PlanStatus: String {
    case upcoming = "待训练", grace = "待补记", missed = "已漏练", done = "已完成"
}

struct TrainingPlan: Identifiable, Codable, Equatable {
    let id: UUID
    var title: String
    var day: Date
    var scheduledAt: Date?
    var minutes: Int
    var effectiveAt: Date

    var deadline: Date { TrainingCalendar.addingDays(1, to: day) }
    var graceEnds: Date { TrainingCalendar.addingDays(1, to: deadline) }
    var correctionEnds: Date { TrainingCalendar.addingDays(7, to: deadline) }
}

enum WorkoutSource: String, Codable {
    case manual, healthUnverified, healthAutomatic
}

struct Workout: Identifiable, Codable, Equatable {
    var id = UUID()
    var title: String
    var start: Date
    var end: Date
    var seconds: Int
    var source: WorkoutSource = .manual
    var externalID: UUID? = nil
    var planID: UUID? = nil

    var minutes: Int { seconds / 60 }
    var day: Date { TrainingCalendar.day(start) }
}

struct Pet: Identifiable, Codable, Equatable {
    struct Tenure: Codable, Equatable {
        let start: Date
        var end: Date?

        func contains(_ date: Date) -> Bool { start <= date && (end.map { date < $0 } ?? true) }
    }

    var id = UUID()
    let name: String
    let species: Species
    var habitat: Habitat
    let adoptedAt: Date
    var tenures: [Tenure]
    var needsRecovery = false

    func age(at now: Date) -> Int {
        let end = needsRecovery ? tenures.last?.end ?? now : now
        let calendar = TrainingCalendar.calendar
        return max(0, calendar.dateComponents([.day], from: TrainingCalendar.day(adoptedAt), to: TrainingCalendar.day(end)).day ?? 0)
    }
}

struct MissedPlan: Codable, Equatable {
    let planID: UUID
    let petID: UUID?
}

struct TrainingTimer: Codable, Equatable {
    let planID: UUID
    let startedAt: Date
}

enum TrainingError: LocalizedError {
    case name, minutes, schedule, workout, ineligible, pet, timer

    var errorDescription: String? {
        switch self {
        case .name: "请输入名称。"
        case .minutes: "请核对训练时长。"
        case .schedule: "请选择同周内尚未截止的日期，并核对计划时间。"
        case .workout: "请填写至少一分钟、已经结束的训练。"
        case .ineligible: "这条训练暂时无法关联到该计划。"
        case .pet: "当前无法领养或恢复这只宠物。"
        case .timer: "请先结束正在计时的训练。"
        }
    }
}

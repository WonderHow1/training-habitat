import Foundation

@main
struct GroveRules {
    static func main() throws {
        func time(_ day: Int, _ hour: Int = 9, _ minute: Int = 0) -> Date {
            Beijing.calendar.date(from: DateComponents(year: 2026, month: 11, day: day, hour: hour, minute: minute))!
        }
        func rejects(_ operation: () throws -> Void) {
            do { try operation(); fatalError("Expected validation failure") } catch {}
        }
        func setup() throws -> Training {
            var training = Training()
            try training.adopt("阿团")
            try training.addPlan("操场慢跑", on: time(16), target: 25)
            return training
        }
        func workout(_ source: RecordSource = .manual, _ day: Int = 16, _ hour: Int = 10, _ minute: Int = 0, _ duration: Int = 25) -> Workout {
            Workout(name: "户外运动", start: time(day, hour, minute), minutes: duration, source: source)
        }
        do {
            var t = try setup()
            let id = t.activeID!
            let plan = t.plans[0].id
            try t.advance(to: time(16, 11))
            let record = try t.save(workout())
            try t.confirm(workout: record, for: plan)
            try t.confirm(workout: record, for: plan)
            assert(t.hearts(id) == 3 && t.growth(id) == 1 && t.plans[0].status == .done)
            rejects { try t.reschedule(plan, to: time(18)) }
            let decoded = try JSONDecoder().decode(Training.self, from: JSONEncoder().encode(t))
            assert(decoded.workouts[0].planID == plan && decoded.activeID == id)
        }
        do {
            var t = try setup()
            let plan = t.plans[0].id
            try t.advance(to: time(16, 12))
            let tooShort = try t.save(workout(.manual, 16, 10, 0, 15))
            let alsoShort = try t.save(workout(.manual, 16, 11, 0, 15))
            rejects { try t.confirm(workout: tooShort, for: plan) }
            rejects { try t.confirm(workout: alsoShort, for: plan) }
            assert(t.workouts.count == 2)
            try t.reschedule(plan, to: time(17))
            assert(t.plans[0].id == plan && t.plans[0].target == 25)
            rejects { try t.reschedule(plan, to: time(23)) }
            try t.advance(to: time(18, 0))
            assert(t.plans[0].status == .grace)
            rejects { try t.reschedule(plan, to: time(19)) }
            let midnight = try t.save(workout(.manual, 17, 23, 35))
            rejects { try t.confirm(workout: midnight, for: plan) }
            let onDate = try t.save(workout(.manual, 17))
            try t.confirm(workout: onDate, for: plan)
        }
        do {
            var t = try setup()
            let plan = t.plans[0].id
            try t.advance(to: time(17, 12))
            let anotherDay = try t.save(workout(.manual, 17))
            rejects { try t.confirm(workout: anotherDay, for: plan) }
            try t.advance(to: time(18, 0))
            let owner = t.activeID!
            assert(t.plans[0].status == .missed && t.hearts(owner) == 2)
            try t.advance(to: t.now)
            assert(t.hearts(owner) == 2)
            let manual = try t.save(workout(.manual))
            rejects { try t.confirm(workout: manual, for: plan) }
            let health = try t.save(workout(.healthManual))
            rejects { try t.confirm(workout: health, for: plan) }
            let imported = try t.save(workout(.device))
            try t.confirm(workout: imported, for: plan)
            assert(t.hearts(owner) == 3 && t.growth(owner) == 1 && t.plans[0].corrected)
            let same = try t.save(workout(.device))
            assert(same == imported)
        }
        do {
            var t = try setup()
            try t.addPlan("核心训练", on: time(17), target: 20)
            try t.addPlan("拉伸", on: time(18), target: 15)
            try t.addPlan("同日训练", on: time(19), target: 15)
            try t.addPlan("之后的训练", on: time(20), target: 15)
            let old = t.activeID!
            try t.advance(to: time(20, 0))
            assert(t.activeID == nil && t.hearts(old) == 0 && t.plans[3].missPet == old)
            try t.adopt("栗栗")
            let fresh = t.activeID!
            try t.advance(to: time(21, 0))
            assert(t.hearts(fresh) == 3)
            let first = try t.save(workout(.device))
            try t.confirm(workout: first, for: t.plans[0].id)
            assert(t.hearts(old) == 0 && t.recoverable.isEmpty)
            let second = try t.save(workout(.device, 17))
            try t.confirm(workout: second, for: t.plans[1].id)
            assert(t.hearts(old) == 1 && t.activeID == fresh)
            try t.restore(old)
            assert(t.activeID == old && t.hearts(fresh) == 3 && t.growth(old) == 2)
            try t.advance(to: time(26))
            let expired = try t.save(workout(.device, 18))
            rejects { try t.confirm(workout: expired, for: t.plans[2].id) }
        }
        do {
            var t = try setup()
            try t.addPlan("核心训练", on: time(16), target: 25)
            try t.advance(to: time(16, 12))
            let existing = try t.save(workout())
            try t.confirm(workout: existing, for: t.plans[0].id)
            let device = workout(.device)
            assert(t.possibleMatch(device)?.id == existing)
            let imported = try t.save(device, mergedInto: existing)
            assert(t.workouts.count == 1 && imported == existing)
            rejects { try t.confirm(workout: imported, for: t.plans[1].id) }
        }
        do {
            var t = try setup()
            try t.advance(to: time(18, 0))
            let manual = try t.save(workout(.manual, 16, 9, 0))
            let device = workout(.device, 16, 8, 57)
            assert(t.possibleMatch(device)?.id == manual)
            let merged = try t.save(device, mergedInto: manual)
            assert(t.workouts.count == 1 && merged == manual && t.workouts[0].start == device.start)
            rejects { try t.confirm(workout: merged, for: t.plans[0].id) }
        }
        print("Swift business rules passed: adoption, persistence, rescheduling, duration, cutoff, grace, missed workouts, correction, deduplication and recovery.")
    }
}

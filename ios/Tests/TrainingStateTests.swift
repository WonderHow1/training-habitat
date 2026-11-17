import CoreGraphics
import Foundation

private let day = ISO8601DateFormatter().date(from: "2026-11-16T00:00:00+08:00")!

private func time(_ days: Int, _ hours: Int = 0, _ minutes: Int = 0) -> Date {
    TrainingCalendar.addingDays(days, to: day).addingTimeInterval(Double(hours * 3600 + minutes * 60))
}

private func workout(_ day: Int, _ hour: Int, _ length: Int, source: WorkoutSource = .manual, external: UUID? = nil) -> Workout {
    let start = time(day, hour)
    return Workout(title: "跑步", start: start, end: start.addingTimeInterval(Double(length * 60)), seconds: length * 60,
                   source: source, externalID: external)
}

private func adopted() throws -> TrainingState {
    var state = TrainingState()
    try state.completeOnboarding(goal: 30, name: "团团", species: .cat, habitat: .garden, at: time(0))
    return state
}

private func onboardingAndPersistentDataUsedAfterSecondOpen() throws {
    let temporary = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString, directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: temporary) }
    let file = temporary.appending(path: "current.json")
    let store = LocalStore(file: file)
    var state = try store.load()
    try check(!state.didOnboard)
    try checkThrows {
        try state.completeOnboarding(goal: 9, name: "团团", species: .rabbit, habitat: .gym, at: time(0))
    }
    try state.completeOnboarding(goal: 10, name: " 小栗 ", species: .rabbit, habitat: .gym, at: time(0))
    try state.savePlan(title: "跑步", day: day, time: time(0,18), minutes: 20, at: time(0))
    let id = try require(state.plans.first?.id)
    try state.startTimer(for: id, at: time(0, 18))
    try store.save(state)
    let reloaded = try LocalStore(file: file).load()
    try check(reloaded == state)
    try check(reloaded.activePet?.name == "小栗")
    try check(reloaded.timer?.startedAt == time(0,18))
}

private func damagedStoreSurfacesErrorAndKeepsFile() throws {
    let file = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: file) }
    let data = Data("unreadable".utf8)
    try data.write(to: file)
    try checkThrows { _ = try LocalStore(file: file).load() }
    try check(try Data(contentsOf: file) == data)
}

private func workoutMinutesEarnExperienceRegardlessOfDailyGoal() throws {
    var state = try adopted()
    try state.savePlan(title: "跑步", day: day, time: nil, minutes: 17, at: time(0))
    let plan = try require(state.plans.first)
    let pet = try require(state.activePetID)
    let first = workout(0, 10, 17)
    let second = workout(1, 11, 10)
    try state.saveWorkout(first, for: plan.id, at: time(0, 11))
    try check(state.status(of: plan, at: time(0, 11)) == .done)
    try check(state.experience(of: pet, at: time(0, 11)) == 17)
    try state.saveWorkout(second, at: time(1, 12))
    try check(state.experience(of: pet, at: time(1, 12)) == 27)
    try check(state.experience(of: pet, at: time(0, 11)) == 17)
    var shortened = second
    shortened.seconds = 6 * 60 + 30
    try state.saveWorkout(shortened, at: time(1, 12))
    try check(state.experience(of: pet, at: time(1, 12)) == 23)
    state.deleteWorkout(second.id, at: time(1, 13))
    try check(state.experience(of: pet, at: time(1, 13)) == 17)
    try check(state.status(of: plan, at: time(1, 13)) == .done)
    state.deletePlan(plan.id)
    try check(state.workouts.count == 1)
    try check(state.workouts.first?.planID == nil)
}

private func reschedulingRetainsIdentityAndRejectsCrossWeek() throws {
    var state = try adopted()
    try state.savePlan(title: "跑步", day: day, time: nil, minutes: 20, at: time(0))
    let initial = try require(state.plans.first)
    let date = time(2)
    try state.savePlan(id: initial.id, title: initial.title, day: date, time: time(0, 18, 45), minutes: 20, at: time(0, 4))
    try check(state.plans.first?.id == initial.id)
    try check(state.plans.first?.day == date)
    try check(state.plans.first?.scheduledAt == time(2, 18, 45))
    try checkThrows {
        try state.savePlan(id: initial.id, title: initial.title, day: time(7), time: nil, minutes: 20, at: time(0, 4))
    }
}

private func midnightGraceDeviceCorrectionAndDuplicate() throws {
    var state = try adopted()
    try state.savePlan(title: "跑步", day: day, time: nil, minutes: 20, at: time(0))
    let plan = try require(state.plans.first)
    let pet = try require(state.activePetID)
    try check(state.eligiblePlans(for: workout(0, 23, 60), at: time(1)).isEmpty)
    try check(state.status(of: plan, at: plan.deadline) == .grace)
    try check(state.eligiblePlans(for: workout(0, 11, 20), at: plan.graceEnds.addingTimeInterval(-1)).count == 1)
    try check(state.eligiblePlans(for: workout(0, 11, 20), at: plan.graceEnds).isEmpty)
    try check(state.eligiblePlans(for: workout(0, 11, 20, source: .healthUnverified), at: plan.graceEnds).isEmpty)
    state.reconcile(at: plan.graceEnds)
    state.reconcile(at: plan.graceEnds)
    try check(state.health(of: pet) == 2)
    try check(state.misses.count == 1)
    let external = UUID()
    let record = workout(0, 11, 30, source: .healthAutomatic, external: external)
    try check(state.eligiblePlans(for: record, at: plan.correctionEnds).isEmpty)
    try state.saveWorkout(record, for: plan.id, at: time(3))
    try state.saveWorkout(workout(0, 11, 30, source: .healthAutomatic, external: external), for: plan.id, at: time(3))
    try check(state.workouts.count == 1)
    try check(state.health(of: pet) == 3)
    try check(state.experience(of: pet, at: time(3)) == 30)
    state.deleteWorkout(record.id, at: time(3))
    try check(state.health(of: pet) == 2)
}

private func delayedSettlementAndRecoveryLeaveNewPetUntouched() throws {
    var state = try adopted()
    let old = try require(state.activePetID)
    for offset in 0...2 {
        try state.savePlan(title: "计划 \(offset)", day: time(offset), time: nil, minutes: 20, at: time(0))
    }
    state.reconcile(at: time(5))
    try check(state.activePetID == nil)
    try check(state.health(of: old) == 0)
    try state.adopt(name: "新伙伴", species: .rabbit, habitat: .living, at: time(5))
    let new = try require(state.activePetID)
    let plan = try require(state.plans.first)
    try state.saveWorkout(workout(0, 11, 35, source: .healthAutomatic, external: UUID()), for: plan.id, at: time(5))
    try check(state.activePetID == new)
    try check(state.health(of: new) == 3)
    try check(state.health(of: old) == 1)
    try check(state.recoverablePets().map(\.id) == [old])
    try state.restore(old, at: time(5, 1))
    try check(state.activePetID == old)
    try check(state.experience(of: old, at: time(5, 1)) == 35)
    try check(state.experience(of: new, at: time(5, 1)) == 0)
}

private func headingPetTurnsAndPausesAtTheEndsOfItsLane() throws {
    let outbound = HorizontalPetStroll(elapsed: 1, distance: 52)
    let rightEdge = HorizontalPetStroll(elapsed: 2.25, distance: 52)
    let inbound = HorizontalPetStroll(elapsed: 3.5, distance: 52)
    let leftEdge = HorizontalPetStroll(elapsed: 4.75, distance: 52)
    let nextLoop = HorizontalPetStroll(elapsed: 5, distance: 52)
    let stationary = HorizontalPetStroll(elapsed: 3, distance: 0)
    try check(outbound.offset == 26 && !outbound.movingLeft && outbound.step != nil)
    try check(rightEdge.offset == 52 && !rightEdge.movingLeft && rightEdge.step == nil)
    try check(inbound.offset == 26 && inbound.movingLeft && inbound.step != nil)
    try check(leftEdge.offset == 0 && leftEdge.movingLeft && leftEdge.step == nil)
    try check(nextLoop.offset == 0 && !nextLoop.movingLeft && nextLoop.step == 0)
    try check(stationary.offset == 0 && stationary.step == nil)
}

private func terrainRejectsWallsAndShoreAndKeepsRouteInView() throws {
    for habitat in Habitat.allCases {
        let terrain = WalkTerrain(habitat: habitat, visibleWidth: 82)
        let high = terrain.destination(near: CGPoint(x: 44, y: 190))
        let low = terrain.destination(near: CGPoint(x: 84, y: 56))
        try check(high.y <= 101)
        try check(low.x <= 72)
        if habitat == .garden { try check(low.x < 57) }
        let route = terrain.waypoints(from: high, to: low)
        try check(route.last?.x == low.x && route.last?.y == low.y)
        for point in route {
            let clamped = terrain.destination(near: point)
            try check(clamped.x == point.x && clamped.y == point.y)
        }
    }
}

private func habitatZoomMovesBetweenCardAndFullViewport() throws {
    let card = CGRect(x: 16, y: 203, width: 370, height: 260)
    let screen = CGRect(x: 0, y: 0, width: 402, height: 874)
    let zoom = HabitatZoomGeometry(card: card, viewport: screen)
    try check(zoom.frame(at: 0) == card)
    try check(zoom.frame(at: 0.5) == CGRect(x: 8, y: 101.5, width: 386, height: 567))
    try check(zoom.frame(at: 1) == screen)
    let screenRadii: [CGFloat] = [55, 55, 48, 0]
    for radius in screenRadii {
        let frames = (0...4).map { zoom.cornerRadius(toward: radius, at: CGFloat($0) / 4) }
        try check(frames == [22, 22 + (radius - 22) / 4, (22 + radius) / 2, radius - (radius - 22) / 4, radius])
    }
    try check(HabitatZoomGeometry(card: .zero, viewport: screen).frame(at: 1) == screen)
}

private func habitatPullConsumesScrollBeforeZoomAndReverses() throws {
    var pull = HabitatZoomDrag()
    try check(pull.distance(translation: CGSize(width: 2, height: 25), expanded: false, scrollOffset: 60) == nil)
    try check(pull.distance(translation: CGSize(width: 2, height: 86), expanded: false, scrollOffset: 0) == 0)
    try check(pull.distance(translation: CGSize(width: 2, height: 125), expanded: false, scrollOffset: -18) == 39)
    try check(!HabitatZoomDrag.completes(distance: 39))
    try check(pull.distance(translation: CGSize(width: 2, height: 155), expanded: false, scrollOffset: -30) == 69)
    try check(HabitatZoomDrag.completes(distance: 69))
    try check(pull.distance(translation: CGSize(width: 2, height: 70), expanded: false, scrollOffset: 15) == 0)

    var atTop = HabitatZoomDrag()
    try check(atTop.distance(translation: CGSize(width: 2, height: 28), expanded: false, scrollOffset: -8) == 28)
    var close = HabitatZoomDrag()
    try check(close.distance(translation: CGSize(width: 4, height: -63), expanded: true, scrollOffset: 0) == 63)
    try check(close.distance(translation: CGSize(width: 4, height: 16), expanded: true, scrollOffset: 0) == 0)
    try check(HabitatZoomDrag.progress(distance: 240, viewportHeight: 750, expanded: true) == 0)
    try check(HabitatZoomDrag.progress(distance: 120, viewportHeight: 750, expanded: false) == 0.5)
    var horizontal = HabitatZoomDrag()
    try check(horizontal.distance(translation: CGSize(width: 40, height: 10), expanded: false, scrollOffset: 0) == nil)
    try check(horizontal.distance(translation: CGSize(width: 40, height: 80), expanded: false, scrollOffset: 0) == nil)
}

private func workoutWheelsDeriveDurationAndPreserveExistingTiming() throws {
    var timing = WorkoutTiming(start: time(0, 23, 50), end: time(1, 0, 10))
    let now = time(2, 12)
    let record = try require(timing.entry(title: "跑步", existing: nil, at: now))
    try check(record.seconds == 1_200 && record.day == day)
    try check(timing.entry(title: "跑步", existing: nil, at: time(1)) == nil)

    timing.moveStartDay(to: time(1, 8))
    try check(timing.start == time(1, 23, 50) && timing.end == time(2, 0, 10))
    timing.end = timing.start
    try check(timing.entry(title: "跑步", existing: nil, at: now) == nil)
    timing.end = timing.start.addingTimeInterval(59)
    try check(timing.entry(title: "跑步", existing: nil, at: now) == nil)

    var imported = record
    imported.source = .healthAutomatic
    imported.externalID = UUID()
    imported.seconds = 840
    let original = WorkoutTiming(start: imported.start, end: imported.end)
    let renamed = try require(original.entry(title: "夜跑", existing: imported, at: now))
    try check(renamed.title == "夜跑" && renamed.seconds == 840 && renamed.externalID == imported.externalID)
    let changed = WorkoutTiming(start: imported.start, end: time(1, 0, 15))
    let edited = try require(changed.entry(title: "夜跑", existing: imported, at: now))
    try check(edited.seconds == 1_500 && edited.id == imported.id)
}

private func timerRetainsPausesAndRecordsOnlyActiveTime() throws {
    var state = try adopted()
    let start = time(0, 9)
    func offset(_ seconds: TimeInterval) -> Date { start.addingTimeInterval(seconds) }
    try state.savePlan(title: "跑步", day: day, time: nil, minutes: 1, at: time(0))
    let plan = try require(state.plans.first)
    try state.startTimer(for: plan.id, at: start)
    let id = try require(state.timer?.sessionID)

    state.pauseTimer(at: offset(25))
    state.pauseTimer(at: offset(30))
    let encoded = try JSONEncoder().encode(state)
    state = try JSONDecoder().decode(TrainingState.self, from: encoded)
    try check(state.timer?.sessionID == id && state.timer?.isPaused == true)
    try check(state.timer?.seconds(at: offset(300)) == 25)
    try checkThrows { try state.finishTimer(at: offset(300)) }
    try check(state.workouts.isEmpty && state.timer != nil)

    state.resumeTimer(at: offset(300))
    state.resumeTimer(at: offset(310))
    state.pauseTimer(at: offset(335))
    try check(state.timer?.seconds(at: offset(400)) == 60)
    try state.finishTimer(at: offset(400))
    let entry = try require(state.workouts.first)
    try check(entry.start == start && entry.end == offset(335) && entry.seconds == 60)
    try check(entry.planID == plan.id && state.timer == nil)
    try state.finishTimer(at: offset(401))
    try check(state.workouts.count == 1)
}

private func timerOpensSnapshotsSavedBeforePausingWasAvailable() throws {
    struct LegacyTimer: Codable {
        let planID: UUID
        let startedAt: Date
    }
    let legacy = LegacyTimer(planID: UUID(), startedAt: time(0))
    let decoded = try JSONDecoder().decode(TrainingTimer.self, from: JSONEncoder().encode(legacy))
    try check(decoded.planID == legacy.planID && !decoded.isPaused)
    try check(decoded.seconds(at: time(0, 0, 2)) == 120)
}

private struct Failure: Error, CustomStringConvertible {
    let description: String
}

private func check(_ condition: @autoclosure () throws -> Bool, line: UInt = #line) throws {
    guard try condition() else { throw Failure(description: "Assertion at line \(line)") }
}

private func require<T>(_ value: T?, line: UInt = #line) throws -> T {
    guard let value else { throw Failure(description: "Missing value at line \(line)") }
    return value
}

private func checkThrows(_ action: () throws -> Void, line: UInt = #line) throws {
    do { try action() } catch { return }
    throw Failure(description: "Expected an error at line \(line)")
}

@main
struct TrainingChecks {
    static func main() throws {
        let tests: [(String, () throws -> Void)] = [
            ("onboarding and persistent data", onboardingAndPersistentDataUsedAfterSecondOpen),
            ("damaged store is preserved", damagedStoreSurfacesErrorAndKeepsFile),
            ("one XP per recorded minute regardless of daily goal", workoutMinutesEarnExperienceRegardlessOfDailyGoal),
            ("rescheduling keeps identity", reschedulingRetainsIdentityAndRejectsCrossWeek),
            ("midnight, grace and device correction", midnightGraceDeviceCorrectionAndDuplicate),
            ("delayed settlement and pet recovery", delayedSettlementAndRecoveryLeaveNewPetUntouched),
            ("walkable terrain", terrainRejectsWallsAndShoreAndKeepsRouteInView),
            ("heading pet walks, turns, and pauses within its lane", headingPetTurnsAndPausesAtTheEndsOfItsLane),
            ("habitat zoom follows the card and screen edges", habitatZoomMovesBetweenCardAndFullViewport),
            ("habitat pull respects scroll, axis and reversal", habitatPullConsumesScrollBeforeZoomAndReverses),
            ("workout time wheels derive and preserve duration", workoutWheelsDeriveDurationAndPreserveExistingTiming),
            ("timer persists pauses and records active time exactly once", timerRetainsPausesAndRecordsOnlyActiveTime),
            ("existing timer snapshots reopen", timerOpensSnapshotsSavedBeforePausingWasAvailable)
        ]
        var failures: [String] = []
        for (name, run) in tests {
            do {
                try run()
                print("PASS  " + name)
            } catch {
                failures.append(name + ": " + String(describing: error))
            }
        }
        for failure in failures { print("FAIL  " + failure) }
        print("\(tests.count - failures.count)/\(tests.count) checks passed")
        if !failures.isEmpty { exit(1) }
    }
}

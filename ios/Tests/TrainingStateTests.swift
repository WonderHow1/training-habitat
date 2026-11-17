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

private func dailyGoalEditsValidateAndPersist() throws {
    var state = try adopted()
    let pet = try require(state.activePet)
    try state.saveWorkout(workout(0, 10, 20), at: time(0, 11))
    try checkThrows { try state.setDailyGoal(9, at: time(0, 11)) }
    try checkThrows { try state.setDailyGoal(1441, at: time(0, 11)) }
    try check(state.goalMinutes == 30)
    try state.setDailyGoal(125, at: time(0, 11))
    let reopened = try JSONDecoder().decode(TrainingState.self, from: JSONEncoder().encode(state))
    try check(reopened.goalMinutes == 125)
    try check(reopened.activePet == pet && reopened.experience(of: pet.id, at: time(0, 11)) == 20)
    try state.setDailyGoal(10, at: time(0, 11))
    try check(state.goalMinutes == 10)
}

private func onboardingGoalWheelsCoverExactlyTheValidRange() throws {
    let values = DailyTrainingGoal.allowedHours.flatMap { hour in
        DailyTrainingGoal.minutes(in: hour).map { hour * 60 + $0 }
    }
    try check(values == Array(DailyTrainingGoal.allowedMinutes))
    try check(DailyTrainingGoal.minutes(in: 0) == 10...59)
    try check(DailyTrainingGoal.minutes(in: 24) == 0...0)
}

private func workoutOverlapDetectsIntervalsButExcludesTheEditedRecord() throws {
    var state = try adopted()
    var recorded = workout(0, 10, 20)
    recorded.seconds = 60 // A paused timer's elapsed time can be shorter than its time range.
    let now = time(0, 12)
    try state.saveWorkout(recorded, at: now)
    try check(state.overlappingWorkouts(for: recorded).isEmpty)
    let duplicate = workout(0, 10, 20)
    try check(state.overlappingWorkouts(for: duplicate).map(\.id) == [recorded.id])
    let start = time(0, 10, 15)
    let partial = Workout(title: "下肢力量", start: start, end: time(0, 10, 35), seconds: 1200)
    try check(state.overlappingWorkouts(for: partial).map(\.id) == [recorded.id])
    let next = Workout(title: "拉伸", start: recorded.end, end: time(0, 10, 30), seconds: 600)
    try check(state.overlappingWorkouts(for: next).isEmpty)
    try check(state.workouts.count == 1)
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

private func petLevelAndGrowthUseTheSameExperienceThresholds() throws {
    for (total, level, stage, points) in [(0, 1, 1, 0), (99, 1, 1, 99), (100, 2, 2, 0),
                                          (199, 2, 2, 99), (200, 3, 3, 0), (350, 4, 3, 50)] {
        let progress = PetExperience(total: total)
        try check(progress.level == level && progress.stage == stage && progress.levelPoints == points)
    }
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
    try check(state.status(of: plan, at: plan.graceEnds) == .missed)
    try check(state.misses.isEmpty)
    let external = UUID()
    let record = workout(0, 11, 30, source: .healthAutomatic, external: external)
    try check(state.eligiblePlans(for: record, at: plan.correctionEnds).isEmpty)
    try state.saveWorkout(record, for: plan.id, at: time(3))
    try state.saveWorkout(workout(0, 11, 30, source: .healthAutomatic, external: external), for: plan.id, at: time(3))
    try check(state.workouts.count == 1)
    try check(state.experience(of: pet, at: time(3)) == 30)
    state.deleteWorkout(record.id, at: time(3))
    try check(state.status(of: plan, at: time(3)) == .missed)
}

private func dailyHeartsSettleAtMidnightOnceAndUseTheGoalInEffect() throws {
    var state = TrainingState()
    try state.completeOnboarding(goal: 30, name: "团团", species: .cat, habitat: .garden, at: time(0, 12))
    let pet = try require(state.activePetID)
    state.reconcile(at: time(1))
    try check(state.health(of: pet) == Pet.maximumHearts)

    try state.saveWorkout(workout(1, 9, 12), at: time(1, 12))
    try state.saveWorkout(workout(1, 10, 18), at: time(1, 12))
    try state.savePlan(title: "第一项", day: time(2), time: nil, minutes: 20, at: time(1, 12))
    try state.savePlan(title: "第二项", day: time(2), time: nil, minutes: 20, at: time(1, 12))
    try state.saveWorkout(workout(2, 9, 20), at: time(2, 12))
    state.reconcile(at: time(3).addingTimeInterval(-1))
    try check(state.health(of: pet) == Pet.maximumHearts)
    try state.setDailyGoal(15, at: time(3, 9))
    state.reconcile(at: time(3, 10))
    try check(state.health(of: pet) == 2)
    try check(state.dailyHeartLosses(for: pet) == [.init(day: time(2), petID: pet, goalMinutes: 30)])
    try state.saveWorkout(workout(3, 10, 15), at: time(3, 12))
    state.reconcile(at: time(4))
    try check(state.health(of: pet) == 2)
    try check(state.misses.isEmpty)
    try check(state.plans.allSatisfy { state.status(of: $0, at: time(4)) == .missed })
    state.reconcile(at: time(5))
    try check(state.health(of: pet) == 1)
    try check(state.dailyHeartLosses(for: pet).last?.day == time(4))
    let reloaded = try JSONDecoder().decode(TrainingState.self, from: JSONEncoder().encode(state))
    try check(reloaded.dailyHeartLosses(for: pet) == state.dailyHeartLosses(for: pet))
}

private func oldSnapshotsKeepExistingLossesWithoutChargingPastDays() throws {
    var state = try adopted()
    let pet = try require(state.activePetID)
    try state.savePlan(title: "旧计划", day: time(0), time: nil, minutes: 20, at: time(0))
    let plan = try require(state.plans.first)
    var legacy = try require(JSONSerialization.jsonObject(with: JSONEncoder().encode(state)) as? [String: Any])
    legacy.removeValue(forKey: "dailyHeartTracking")
    legacy["misses"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode([MissedPlan(planID: plan.id, petID: pet)]))
    state = try JSONDecoder().decode(TrainingState.self, from: JSONSerialization.data(withJSONObject: legacy))
    state.reconcile(at: time(10, 12))
    state.reconcile(at: time(11))
    try check(state.health(of: pet) == 2)
    try check(state.dailyHeartLosses(for: pet).isEmpty)
    state.reconcile(at: time(12))
    try check(state.health(of: pet) == 1)
    try check(state.dailyHeartLosses(for: pet).map(\.day) == [time(11)])
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
    try check(state.displayedPet?.tenures.last?.end == time(3))
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

private func headingPetStaysInItsLaneAndCanStopMidWalk() throws {
    var stroll = HorizontalPetStroll()
    var random = SystemRandomNumberGenerator()
    var now = time(0)
    for _ in 0..<32 {
        let origin = stroll.sample(at: now).fraction
        let duration = stroll.walk(distance: 78, at: now, using: &random)
        let midTime = now.addingTimeInterval(duration / 2)
        let middle = stroll.sample(at: midTime)
        let end = stroll.sample(at: now.addingTimeInterval(duration + 1))
        try check(stroll.isWalking && middle.step != nil && end.step == nil)
        try check((0...1).contains(end.fraction) && abs(end.fraction - origin) >= 0.21)
        try check(stroll.movingLeft == (end.fraction < origin))
        try check((min(origin, end.fraction)...max(origin, end.fraction)).contains(middle.fraction))
        stroll.stop(at: midTime)
        now = now.addingTimeInterval(duration + 2)
        let stopped = stroll.sample(at: now)
        try check(!stroll.isWalking && stopped.step == nil && stopped.fraction == middle.fraction)
    }
    try check(stroll.walk(distance: 0, at: now, using: &random) == 0 && !stroll.isWalking)
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
    let result = try require(state.finishTimer(at: offset(400)))
    let entry = try require(state.workouts.first)
    try check(entry.start == start && entry.end == offset(335) && entry.seconds == 60)
    try check(entry.planID == plan.id && state.timer == nil)
    try check(result.id == entry.id && result.minutes == 1 && result.outcome == .completedPlan)
    try check(try state.finishTimer(at: offset(401)) == nil)
    try check(state.workouts.count == 1)
}

private func timerReportsWhySavedTrainingDidNotCompleteItsPlan() throws {
    var state = try adopted()
    let start = time(0, 9)
    try state.savePlan(title: "跑步", day: day, time: nil, minutes: 2, at: time(0))
    let plan = try require(state.plans.first)
    try state.startTimer(for: plan.id, at: start)
    let shortEnd = start.addingTimeInterval(66)
    let short = try require(state.finishTimer(at: shortEnd))
    try check(short.minutes == 1 && short.outcome == .belowTarget(requiredMinutes: 2))
    try check(state.workouts.first?.planID == nil && state.status(of: plan, at: shortEnd) == .upcoming)

    try state.startTimer(for: plan.id, at: plan.deadline.addingTimeInterval(-60))
    let late = try require(state.finishTimer(at: plan.deadline.addingTimeInterval(60)))
    try check(late.minutes == 2 && late.outcome == .unlinked)
    try check(state.workouts.count == 2)
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
            ("daily goal edits validate and survive reload", dailyGoalEditsValidateAndPersist),
            ("onboarding goal wheels match the allowed duration", onboardingGoalWheelsCoverExactlyTheValidRange),
            ("workout overlaps exclude self and adjacent intervals", workoutOverlapDetectsIntervalsButExcludesTheEditedRecord),
            ("one XP per recorded minute regardless of daily goal", workoutMinutesEarnExperienceRegardlessOfDailyGoal),
            ("XP levels and three growth stages share thresholds", petLevelAndGrowthUseTheSameExperienceThresholds),
            ("rescheduling keeps identity", reschedulingRetainsIdentityAndRejectsCrossWeek),
            ("midnight, grace and device correction", midnightGraceDeviceCorrectionAndDuplicate),
            ("one heart per missed full day using the historical goal", dailyHeartsSettleAtMidnightOnceAndUseTheGoalInEffect),
            ("legacy health migrates without retroactive losses", oldSnapshotsKeepExistingLossesWithoutChargingPastDays),
            ("delayed settlement and pet recovery", delayedSettlementAndRecoveryLeaveNewPetUntouched),
            ("walkable terrain", terrainRejectsWallsAndShoreAndKeepsRouteInView),
            ("heading pet walks within bounds and can stop in place", headingPetStaysInItsLaneAndCanStopMidWalk),
            ("habitat zoom follows the card and screen edges", habitatZoomMovesBetweenCardAndFullViewport),
            ("habitat pull respects scroll, axis and reversal", habitatPullConsumesScrollBeforeZoomAndReverses),
            ("workout time wheels derive and preserve duration", workoutWheelsDeriveDurationAndPreserveExistingTiming),
            ("timer persists pauses and records active time exactly once", timerRetainsPausesAndRecordsOnlyActiveTime),
            ("timer distinguishes below-target and otherwise unlinked saves", timerReportsWhySavedTrainingDidNotCompleteItsPlan),
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

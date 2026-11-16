import Foundation

struct TrainingState: Codable, Equatable {
    private(set) var goalMinutes = 30
    private(set) var didOnboard = false
    private(set) var reminders = false
    private(set) var plans: [TrainingPlan] = []
    private(set) var workouts: [Workout] = []
    private(set) var pets: [Pet] = []
    private(set) var activePetID: UUID?
    private(set) var misses: [MissedPlan] = []
    private(set) var timer: TrainingTimer?

    var activePet: Pet? { pets.first { $0.id == activePetID } }
    var displayedPet: Pet? { activePet ?? pets.last }
    var recentProjects: [String] {
        var seen = Set<String>()
        return (workouts.sorted { $0.start > $1.start }.map(\.title) + plans.reversed().map(\.title))
            .filter { seen.insert($0).inserted }
    }

    mutating func completeOnboarding(goal: Int, name: String, species: Species, habitat: Habitat, at now: Date) throws {
        guard !didOnboard else { return }
        guard (10...1440).contains(goal) else { throw TrainingError.minutes }
        try adopt(name: name, species: species, habitat: habitat, at: now)
        goalMinutes = goal
        didOnboard = true
    }

    mutating func adopt(name: String, species: Species, habitat: Habitat, at now: Date) throws {
        guard activePetID == nil else { throw TrainingError.pet }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty, cleanName.count <= 12 else { throw TrainingError.name }
        let pet = Pet(name: cleanName, species: species, habitat: habitat, adoptedAt: now, tenures: [.init(start: now)])
        pets.append(pet)
        activePetID = pet.id
    }

    func status(of plan: TrainingPlan, at now: Date) -> PlanStatus {
        if workouts.contains(where: { $0.planID == plan.id }) { return .done }
        if plan.graceEnds <= now { return .missed }
        return now < plan.deadline ? .upcoming : .grace
    }

    func health(of petID: UUID) -> Int {
        let completed = Set(workouts.compactMap(\.planID))
        return max(0, 3 - misses.count { $0.petID == petID && !completed.contains($0.planID) })
    }

    func recoverablePets() -> [Pet] {
        pets.filter { $0.needsRecovery && $0.id != activePetID && health(of: $0.id) > 0 }
    }

    mutating func restore(_ id: UUID, at now: Date) throws {
        guard recoverablePets().contains(where: { $0.id == id }),
              let index = pets.firstIndex(where: { $0.id == id }) else { throw TrainingError.pet }
        closeActiveTenure(at: now)
        pets[index].needsRecovery = false
        pets[index].tenures.append(.init(start: now))
        activePetID = id
    }

    mutating func setHabitat(_ habitat: Habitat) {
        if let index = pets.firstIndex(where: { $0.id == activePetID }) { pets[index].habitat = habitat }
    }

    mutating func setReminders(_ enabled: Bool) { reminders = enabled }

    func trainingMinutes(from first: Date, until end: Date) -> Int {
        workouts.lazy.filter { first <= $0.day && $0.day < end }.reduce(0) { $0 + $1.minutes }
    }

    func experience(of petID: UUID, at now: Date) -> Int {
        experienceEntries(of: petID, at: now).reduce(0) { $0 + $1.minutes }
    }

    func experienceEntries(of petID: UUID, at now: Date) -> [Workout] {
        let byDay = Dictionary(grouping: workouts.filter { $0.end <= now }, by: \.day)
        return byDay.values.flatMap { day -> [Workout] in
            guard day.reduce(0, { $0 + $1.minutes }) >= goalMinutes else { return [] }
            return day.filter { owner(at: $0.end) == petID }
        }
    }

    mutating func savePlan(id: UUID? = nil, title: String, day: Date, time: Date?, minutes: Int, at now: Date) throws {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw TrainingError.name }
        guard (1...1439).contains(minutes) else { throw TrainingError.minutes }
        let day = TrainingCalendar.day(day)
        let scheduled = time.map { TrainingCalendar.combining(day: day, time: $0) }
        if let id {
            guard let index = plans.firstIndex(where: { $0.id == id }) else { throw TrainingError.schedule }
            let previous = plans[index]
            if previous.day != day || previous.scheduledAt != scheduled {
                guard status(of: previous, at: now) == .upcoming, day >= TrainingCalendar.day(now),
                      TrainingCalendar.week(day) == TrainingCalendar.week(previous.day) else { throw TrainingError.schedule }
            }
            plans[index].title = title
            plans[index].day = day
            plans[index].scheduledAt = scheduled
            plans[index].minutes = minutes
            if previous.day != day { plans[index].effectiveAt = now }
            if let entry = workouts.firstIndex(where: { $0.planID == id }),
               !fits(workouts[entry], plan: plans[index], at: now) {
                workouts[entry].planID = nil
                reconcile(at: now, revisedAt: now)
            }
        } else {
            guard day >= TrainingCalendar.day(now) else { throw TrainingError.schedule }
            plans.append(.init(id: UUID(), title: title, day: day, scheduledAt: scheduled, minutes: minutes, effectiveAt: now))
        }
    }

    mutating func deletePlan(_ id: UUID) {
        plans.removeAll { $0.id == id }
        misses.removeAll { $0.planID == id }
        if let index = workouts.firstIndex(where: { $0.planID == id }) { workouts[index].planID = nil }
        if timer?.planID == id { timer = nil }
    }

    func eligiblePlans(for record: Workout, at now: Date) -> [TrainingPlan] {
        guard record.planID == nil else { return [] }
        return plans.filter { plan in
            !workouts.contains { $0.planID == plan.id } && fits(record, plan: plan, at: now) &&
            (now < plan.graceEnds || (record.source == .healthAutomatic && now < plan.correctionEnds))
        }.sorted { ($0.scheduledAt ?? $0.day) < ($1.scheduledAt ?? $1.day) }
    }

    mutating func saveWorkout(_ entry: Workout, for planID: UUID? = nil, at now: Date) throws {
        var record = entry
        record.title = record.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !record.title.isEmpty else { throw TrainingError.name }
        guard (60...86_400).contains(record.seconds), record.start < record.end, record.end <= now,
              record.end.timeIntervalSince(record.start) >= Double(record.seconds) else { throw TrainingError.workout }
        if let key = record.externalID, let existing = workouts.first(where: { $0.externalID == key && $0.id != record.id }) {
            if let planID, existing.planID == nil { try link(existing.id, to: planID, at: now) }
            return
        }
        reconcile(at: now)
        if let index = workouts.firstIndex(where: { $0.id == record.id }) {
            let plan = plans.first { $0.id == workouts[index].planID }
            record.planID = plan.flatMap { fits(record, plan: $0, at: now) ? $0.id : nil }
            workouts[index] = record
            reconcile(at: now, revisedAt: now)
        } else {
            record.planID = nil
            if let planID, eligiblePlans(for: record, at: now).contains(where: { $0.id == planID }) {
                record.planID = planID
            }
            workouts.append(record)
        }
    }

    mutating func deleteWorkout(_ id: UUID, at now: Date) {
        workouts.removeAll { $0.id == id }
        reconcile(at: now, revisedAt: now)
    }

    mutating func link(_ workoutID: UUID, to planID: UUID, at now: Date) throws {
        guard let index = workouts.firstIndex(where: { $0.id == workoutID }) else { throw TrainingError.ineligible }
        if workouts[index].planID == planID { return }
        guard eligiblePlans(for: workouts[index], at: now).contains(where: { $0.id == planID }) else {
            throw TrainingError.ineligible
        }
        reconcile(at: now)
        workouts[index].planID = planID
    }

    mutating func startTimer(for planID: UUID, at now: Date) throws {
        guard timer == nil, plans.contains(where: { $0.id == planID }) else { throw TrainingError.timer }
        timer = .init(planID: planID, startedAt: now)
    }

    mutating func clearTimer() { timer = nil }

    mutating func reconcile(at now: Date, revisedAt: Date? = nil) {
        let existing = Set(misses.map(\.planID))
        for plan in plans.sorted(by: { $0.graceEnds < $1.graceEnds })
            where plan.graceEnds <= now && !existing.contains(plan.id) && status(of: plan, at: now) == .missed {
            let petID = owner(at: plan.deadline)
            misses.append(.init(planID: plan.id, petID: petID))
            if petID == activePetID { settleDeath(at: revisedAt ?? plan.graceEnds) }
        }
        settleDeath(at: now)
    }

    private func fits(_ workout: Workout, plan: TrainingPlan, at now: Date) -> Bool {
        workout.day == plan.day && workout.start >= plan.effectiveAt && workout.end < plan.deadline &&
            workout.end <= now && workout.seconds >= plan.minutes * 60
    }

    private func owner(at date: Date) -> UUID? {
        pets.first { $0.tenures.contains { $0.contains(date) } }?.id
    }

    private mutating func settleDeath(at date: Date) {
        guard let id = activePetID, health(of: id) == 0, let index = pets.firstIndex(where: { $0.id == id }) else { return }
        pets[index].needsRecovery = true
        closeActiveTenure(at: date)
        activePetID = nil
    }

    private mutating func closeActiveTenure(at date: Date) {
        if let index = pets.firstIndex(where: { $0.id == activePetID }), let last = pets[index].tenures.indices.last {
            pets[index].tenures[last].end = max(date, pets[index].tenures[last].start)
        }
    }
}

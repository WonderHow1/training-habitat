import SwiftUI

struct PetStats: View {
    let model: AppModel
    let pet: Pet
    var compact = false
    var interactiveAge = false
    @State private var showAdoption = false

    var body: some View {
        let xp = PetExperience(total: model.state.experience(of: pet.id, at: model.now))
        let hp = model.state.health(of: pet.id)
        VStack(alignment: .leading, spacing: compact ? 5 : 10) {
            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text(pet.name).font(compact ? .title2.bold() : .system(size: 47, weight: .heavy))
                    .lineLimit(1).minimumScaleFactor(0.65)
                Text(hp > 0 ? PetExperience.stageName(for: xp.level) : "已离世")
                    .font(.subheadline.weight(.semibold))
            }
            PetHeartRow(remaining: hp)
            HStack(spacing: 10) {
                Text("Lv.\(xp.level)")
                ProgressView(value: Double(xp.levelPoints), total: Double(PetExperience.pointsPerLevel))
                Text("\(xp.levelPoints) / \(PetExperience.pointsPerLevel) XP").monospacedDigit()
            }
            .font(.caption.weight(.semibold))
            .padding(compact ? 0 : 8)
            .background(.white.opacity(compact ? 0 : 0.50), in: .capsule)
            ViewThatFits(in: .horizontal) {
                HStack { ageChip; weightChip }
                VStack(alignment: .leading) { ageChip; weightChip }
            }
        }
        .foregroundStyle(Color(red: 0.12, green: 0.21, blue: 0.31))
        .frame(maxWidth: compact ? .infinity : 325, alignment: .leading)
    }

    private var ageChip: some View {
        Group {
            if interactiveAge {
                Button { showAdoption.toggle() } label: { ageLabel }.buttonStyle(.plain)
            } else { ageLabel }
        }
        .accessibilityHint(interactiveAge ? "切换年龄和领养日期" : "")
    }

    private var ageLabel: some View {
        pill(showAdoption ? "领养于 \(DisplayDate.adoption(pet.adoptedAt))" : "年龄 \(pet.age(at: model.now)) 天")
    }

    private var weightChip: some View { pill("体重 \(pet.species.weightLabel)") }

    private func pill(_ title: String) -> some View {
        Text(title).font(.caption.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 5)
            .background((compact ? Color.black.opacity(0.05) : Color.white.opacity(0.50)), in: .capsule)
            .fixedSize()
    }
}

struct PetPage: View {
    let model: AppModel
    let active: Bool
    let open: (SheetRoute) -> Void
    @State private var guide = false
    @State private var background = false
    @State private var adoption = false
    @State private var recovery: Pet?

    var body: some View {
        ZStack(alignment: .topLeading) {
            let pet = model.state.displayedPet
            HabitatCanvas(habitat: pet?.habitat ?? .garden, pet: pet, stage: pet.map { model.stage(of: $0) } ?? 1,
                          animating: active, isMemorial: model.state.activePet == nil)
                .ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    if let pet {
                        PetStats(model: model, pet: pet, interactiveAge: true)
                    }
                    Spacer(minLength: 8)
                    Button { guide = true } label: { Image(systemName: "pawprint.fill").padding(9) }
                        .buttonStyle(.glass).accessibilityLabel("宠物图鉴")
                }
                Spacer()
                if let pet { panel(pet) }
            }
            .padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 55)
        }
        .sheet(isPresented: $guide) {
            NavigationStack { PetGuide() }
                .compactSheet(estimatedHeight: 550)
        }
        .sheet(isPresented: $background) {
            if let pet = model.state.activePet {
                HabitatSelection(pet: pet, stage: model.stage(of: pet)) { value in
                    if model.change({ state, _ in state.setHabitat(value) }) { background = false }
                }
                .compactSheet(estimatedHeight: 408)
            }
        }
        .sheet(isPresented: $adoption) {
            NavigationStack { AdoptAgain(model: model) }
                .compactSheet(estimatedHeight: 418)
        }
        .confirmationDialog("恢复宠物", isPresented: Binding(get: { recovery != nil }, set: { if !$0 { recovery = nil } }),
                            titleVisibility: .visible, presenting: recovery) { pet in
            Button("恢复\(pet.name)") { model.change { state, now in try state.restore(pet.id, at: now) } }
        } message: { pet in
            Text("将\(pet.name)设为现在照料的宠物。")
        }
    }

    private func panel(_ pet: Pet) -> some View {
        let awarded = model.state.experienceEntries(of: pet.id, at: model.now)
        let xp = PetExperience(total: awarded.reduce(0) { $0 + $1.minutes })
        let losses = model.state.misses
            .filter { event in event.petID == pet.id && !model.state.workouts.contains { $0.planID == event.planID } }
            .compactMap { event in model.state.plans.first { $0.id == event.planID } }
            .sorted { $0.day > $1.day }
        return VStack(alignment: .leading, spacing: 11) {
            HStack {
                Text("经验与血量").font(.headline)
                Spacer()
                if model.state.activePet != nil {
                    Button("更换背景") { background = true }.buttonStyle(.glass).font(.caption.bold())
                } else {
                    Button("重新领养") { adoption = true }.buttonStyle(.glass).font(.caption.bold())
                }
            }
            Text("Lv.\(xp.level) · \(xp.levelPoints) / \(PetExperience.pointsPerLevel) XP")
                .font(.subheadline.weight(.semibold))
            if let workout = awarded.max(by: { $0.end < $1.end }) {
                Button { open(.workout(workout)) } label: {
                    Label("经验 +\(workout.minutes) XP · \(workout.title)", systemImage: "checkmark.circle")
                        .lineLimit(1)
                }
                .buttonStyle(.glass).font(.footnote)
            }
            if let dailyLoss = model.state.dailyHeartLosses(for: pet.id).last,
               losses.first.map({ $0.day <= dailyLoss.day }) ?? true {
                Label {
                    Text("血量 −1 · \(DisplayDate.day(dailyLoss.day))未达 \(dailyLoss.goalMinutes) 分钟目标")
                } icon: {
                    PixelHeart(isFilled: false)
                }
                .font(.footnote)
            } else if let missed = losses.first {
                Button { open(.plan(missed)) } label: {
                    Label {
                        Text("血量 −1 · " + missed.title).lineLimit(1)
                    } icon: {
                        PixelHeart(isFilled: false)
                    }
                }
                .buttonStyle(.glass).font(.footnote)
            }
            ForEach(model.state.recoverablePets()) { pet in
                Button("恢复\(pet.name)") { recovery = pet }.buttonStyle(.bordered)
            }
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: 24))
    }
}

private struct HabitatSelection: View {
    let pet: Pet
    let stage: Int
    let save: (Habitat) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var selection: Habitat

    init(pet: Pet, stage: Int, save: @escaping (Habitat) -> Void) {
        self.pet = pet
        self.stage = stage
        self.save = save
        _selection = State(initialValue: pet.habitat)
    }

    var body: some View {
        ZStack {
            HabitatStill(habitat: selection, species: pet.species, stage: stage).ignoresSafeArea()
            VStack {
                HStack {
                    Button("取消") { dismiss() }
                    Spacer()
                    Button("保存") { save(selection) }
                }
                .buttonStyle(.glass)
                Spacer()
                Picker("栖息地背景", selection: $selection) {
                    ForEach(Habitat.allCases) { Text($0.name).tag($0) }
                }
                .padding(10).glassEffect(.regular, in: .capsule)
            }
            .padding(18)
        }
    }
}

private struct AdoptAgain: View {
    let model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var species = Species.cat
    @State private var habitat = Habitat.garden
    @State private var name = "团团"

    var body: some View {
        Form {
            PetPortrait(species: species, size: 145, interactive: true).id(species).frame(maxWidth: .infinity)
            SpeciesPicker(selection: $species)
            TextField("宠物名字", text: $name)
            Picker("栖息地背景", selection: $habitat) {
                ForEach(Habitat.allCases) { Text($0.name).tag($0) }
            }
        }
        .measuringSheetScrollContent()
        .navigationTitle("重新领养").compactNavigationTitle()
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("取消") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("领养") {
                    if model.change({ state, now in try state.adopt(name: name, species: species, habitat: habitat, at: now) }) { dismiss() }
                }
            }
        }
    }
}

private struct PetGuide: View {
    @Environment(\.dismiss) private var dismiss
    @State private var current: Species?
    @State private var stage = 1

    var body: some View {
        ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 10) {
                ForEach(Species.allCases) { pet in
                    Button {
                        stage = 1
                        current = pet
                    } label: {
                        VStack(spacing: 3) {
                            PetPortrait(species: pet, size: 84, animatePreview: true)
                            Text(pet.name).font(.caption.weight(.medium))
                        }
                        .frame(maxWidth: .infinity, minHeight: 106)
                        .background(.quaternary.opacity(0.6), in: .rect(cornerRadius: 18))
                    }
                    .buttonStyle(.plain)
                }
            }.padding()
        }
        .measuringSheetScrollContent()
        .navigationTitle("宠物图鉴").compactNavigationTitle()
        .toolbar { Button("完成") { dismiss() } }
        .sheet(isPresented: Binding(get: { current != nil }, set: { if !$0 { current = nil } })) {
            VStack(spacing: 10) {
                HStack {
                    Text("宠物预览").font(.title3.bold())
                    Spacer()
                    Button("关闭", systemImage: "xmark") { current = nil }.labelStyle(.iconOnly).buttonStyle(.glass)
                }
                TabView(selection: $current) {
                    ForEach(Species.allCases) { species in
                        PetPortrait(species: species, stage: stage, size: 226, interactive: true).tag(Optional(species))
                    }
                }
                #if os(iOS)
                .tabViewStyle(.page(indexDisplayMode: .never))
                #endif
                .frame(height: 245)
                Text(current?.name ?? "").font(.headline)
                Picker("成长阶段", selection: $stage) {
                    Text("幼年").tag(1)
                    Text("青年").tag(2)
                    Text("成年").tag(3)
                }
                .pickerStyle(.segmented)
            }
            .padding(18)
            .scrollableSheetContent(navigationBar: false)
            .compactSheet(estimatedHeight: 366)
        }
    }
}

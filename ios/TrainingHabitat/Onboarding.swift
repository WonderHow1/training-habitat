import SwiftUI

struct Onboarding: View {
    private enum Step: Int {
        case goal, pet, name, growth, hearts, habitat

        var title: String {
            switch self {
            case .goal: "设定每日训练目标"
            case .pet: "领养宠物"
            case .name: "给宠物起个名字"
            case .growth: "宠物会长大"
            case .hearts: "照顾宠物的爱心"
            case .habitat: "选择栖息地"
            }
        }
    }
    let model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var step = Step.goal
    @State private var goingBack = false
    @State private var colorIndex = 0
    @State private var goal = 30
    @State private var showsGoalPicker = false
    @State private var species = Species.cat
    @State private var habitat = Habitat.garden
    @State private var name = "团团"
    @FocusState private var isEditingName: Bool
    @State private var showsPetHint = false
    @State private var didInteractWithPet = false

    private let rainbow: [UInt32] = [0xfa8198, 0xffa258, 0xffda49, 0x91d568, 0x57cfbf, 0x7cafff, 0xc492f5]
    private let ink = Color(red: 0.08, green: 0.19, blue: 0.29)
    private let prominentInputFont = Font.system(size: 72, weight: .heavy, design: .rounded)

    var body: some View {
        GeometryReader { geometry in
            let top = min(150, max(64, geometry.size.height * 0.14))
            ZStack {
                color(rainbow[colorIndex]).ignoresSafeArea()
                if step == .habitat {
                    habitatBackground
                        .transition(.opacity)
                }
                ZStack {
                    let previewSize = min(176, max(118, geometry.size.height * 0.28))
                    if step == .habitat {
                        habitatStep(top: top)
                    } else if step == .name {
                        namingPage(top: top, previewSize: previewSize, viewportHeight: geometry.size.height)
                    } else {
                        page(top: top, previewSize: previewSize)
                    }
                }
                .id(step)
                .transition(pageTransition)
                .zIndex(1)
            }
        }
        .foregroundStyle(ink)
        .sheet(isPresented: $showsGoalPicker) {
            OnboardingGoalPicker(goal: goal) { goal = $0 }
                .compactSheet(estimatedHeight: 282)
        }
        .task(id: reduceMotion || step == .habitat) {
            guard !reduceMotion, step != .habitat else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(2)) } catch { return }
                withAnimation(.easeInOut(duration: 0.65)) {
                    colorIndex = (colorIndex + 1) % rainbow.count
                }
            }
        }
        .task(id: step) {
            guard step == .pet, !didInteractWithPet else { return }
            do { try await Task.sleep(for: .milliseconds(550)) } catch { return }
            guard !didInteractWithPet else { return }
            withAnimation(reduceMotion ? nil : .snappy(duration: 0.28, extraBounce: 0.14)) {
                showsPetHint = true
            }
        }
    }

    private var pageTransition: AnyTransition {
        guard !reduceMotion else { return .identity }
        return .asymmetric(
            insertion: .offset(x: goingBack ? -56 : 56, y: 10)
                .combined(with: .scale(scale: 0.96)).combined(with: .opacity),
            removal: .offset(x: goingBack ? 32 : -32, y: -4)
                .combined(with: .scale(scale: 0.985)).combined(with: .opacity)
        )
    }

    private func page(top: CGFloat, previewSize: CGFloat) -> some View {
        ViewThatFits(in: .vertical) {
            VStack(alignment: .leading, spacing: 12) {
                title.padding(.top, top)
                if step == .goal { Spacer(minLength: 10) }
                pageContent(previewSize: previewSize, choiceSpacing: 64)
                Spacer(minLength: 10)
                controls
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    title
                    pageContent(previewSize: previewSize, choiceSpacing: 24)
                    controls
                }
                .padding(.vertical, 16)
            }
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 14)
    }

    private func namingPage(top: CGFloat, previewSize: CGFloat, viewportHeight: CGFloat) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                title.padding(.top, top)
                pageContent(previewSize: previewSize, choiceSpacing: 0)
                Spacer(minLength: 10)
                controls
            }
            .frame(minHeight: max(0, viewportHeight - 14), alignment: .topLeading)
            .padding(.horizontal, 28)
            .padding(.bottom, 14)
        }
        .scrollIndicators(.hidden)
    }

    @ViewBuilder
    private func pageContent(previewSize: CGFloat, choiceSpacing: CGFloat) -> some View {
        switch step {
        case .goal:
            VStack(spacing: 12) {
                Button {
                    showsGoalPicker = true
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text("\(goal, format: .number.grouping(.never))")
                            .font(prominentInputFont)
                        Text("分钟").font(.headline)
                        Image(systemName: "chevron.up.chevron.down").font(.footnote.weight(.semibold))
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("每日目标训练时长")
                .accessibilityValue("\(goal) 分钟")
                .accessibilityHint("打开时间滚轮")
                .frame(maxWidth: .infinity)
                if goal > DailyTrainingGoal.cautionThreshold {
                    Text(DailyTrainingGoal.cautionMessage)
                        .font(.footnote.weight(.semibold)).multilineTextAlignment(.center)
                }
            }
        case .pet:
            VStack(spacing: 4) {
                PetPortrait(species: species, size: previewSize, interactive: true, onInteraction: dismissPetHint)
                    .id(species)
                    .overlay(alignment: .topTrailing) {
                        if showsPetHint {
                            petHint
                                .offset(x: 10, y: 4)
                                .transition(.scale(scale: 0.8, anchor: .bottomLeading).combined(with: .opacity))
                        }
                    }
                    .padding(.bottom, choiceSpacing)
                SpeciesPicker(selection: $species, isOnboarding: true)
            }
        case .name:
            VStack(spacing: 20) {
                PetPortrait(species: species, size: previewSize, interactive: true).id(species)
                TextField("团团", text: $name)
                    .font(prominentInputFont)
                    .multilineTextAlignment(.center)
                    .padding(.vertical, 6)
                    .focused($isEditingName)
                    .submitLabel(.done)
                    .onSubmit { isEditingName = false }
                    .accessibilityLabel("宠物名字")
            }
        case .growth:
            OnboardingGrowthDemo(startingSpecies: species, previewSize: previewSize)
        case .hearts:
            OnboardingHeartsDemo(species: species, previewSize: previewSize)
        case .habitat:
            EmptyView()
        }
    }

    private var petHint: some View {
        Text("点我试试！")
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .padding(.bottom, 9)
            .background {
                PixelSpeechBubble()
                    .fill(.white.opacity(0.94), style: FillStyle(antialiased: false))
            }
            .allowsHitTesting(false)
    }

    private func dismissPetHint() {
        didInteractWithPet = true
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.16)) { showsPetHint = false }
    }

    private var habitatBackground: some View {
        ZStack {
            HabitatStill(habitat: habitat, species: species)
                .ignoresSafeArea()
            LinearGradient(colors: [.black.opacity(0.47), .clear, .clear, .black.opacity(0.74)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        }
        .allowsHitTesting(false)
    }

    private func habitatStep(top: CGFloat) -> some View {
        VStack(alignment: .leading) {
            title.padding(.top, top)
            Spacer()
            VStack(spacing: 6) {
                Text("栖息地背景").font(.footnote)
                Picker("栖息地背景", selection: $habitat) {
                    ForEach(Habitat.allCases) { Text($0.name).tag($0) }
                }
                .tint(.white)
                .labelsHidden()
            }
            .frame(maxWidth: .infinity, alignment: .center)
            .padding(.bottom, 32)
            controls
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 28).padding(.bottom, 14)
    }

    private var title: some View {
        Text(step.title)
            .font(.system(size: 33, weight: .heavy))
            .accessibilityAddTraits(.isHeader)
    }

    private var controls: some View {
        HStack {
            if let previous = Step(rawValue: step.rawValue - 1) {
                Button("返回") { move(to: previous) }.buttonStyle(.plain)
            }
            Spacer()
            Button {
                if let next = Step(rawValue: step.rawValue + 1) {
                    move(to: next)
                } else {
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.32)) {
                        _ = model.change { state, now in
                            try state.completeOnboarding(goal: goal, name: name, species: species, habitat: habitat, at: now)
                        }
                    }
                }
            } label: {
                Label(step == .habitat ? "开始训练" : "继续", systemImage: "chevron.right")
                    .labelStyle(.titleAndIcon).fontWeight(.bold)
            }
            .buttonStyle(.plain)
            .disabled(step == .name && (name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 12))
        }
        .frame(minHeight: 44)
    }

    private func move(to next: Step) {
        if step == .name { isEditingName = false }
        goingBack = next.rawValue < step.rawValue
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.44, extraBounce: 0.12)) {
            showsPetHint = false
            step = next
        }
    }

    private func color(_ value: UInt32) -> Color {
        Color(red: Double(value >> 16) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}

private struct PixelSpeechBubble: Shape {
    func path(in rect: CGRect) -> Path {
        let pixel: CGFloat = 3
        let left = rect.minX
        let right = rect.maxX
        let top = rect.minY
        let bottom = rect.maxY - 3 * pixel
        let tail = left + 5 * pixel
        let points: [(CGFloat, CGFloat)] = [
            (left + 2 * pixel, top), (right - 2 * pixel, top),
            (right - 2 * pixel, top + pixel), (right - pixel, top + pixel),
            (right - pixel, top + 2 * pixel), (right, top + 2 * pixel),
            (right, bottom - 2 * pixel), (right - pixel, bottom - 2 * pixel),
            (right - pixel, bottom - pixel), (right - 2 * pixel, bottom - pixel),
            (right - 2 * pixel, bottom), (tail + 4 * pixel, bottom),
            (tail + 4 * pixel, bottom + pixel), (tail + 3 * pixel, bottom + pixel),
            (tail + 3 * pixel, bottom + 2 * pixel), (tail + 2 * pixel, bottom + 2 * pixel),
            (tail + 2 * pixel, rect.maxY), (tail, rect.maxY), (tail, bottom),
            (left + 2 * pixel, bottom), (left + 2 * pixel, bottom - pixel),
            (left + pixel, bottom - pixel), (left + pixel, bottom - 2 * pixel),
            (left, bottom - 2 * pixel), (left, top + 2 * pixel),
            (left + pixel, top + 2 * pixel), (left + pixel, top + pixel),
            (left + 2 * pixel, top + pixel)
        ]
        var path = Path()
        path.addLines(points.map { CGPoint(x: $0.0, y: $0.1) })
        path.closeSubpath()
        return path
    }
}

private struct OnboardingGrowthDemo: View {
    let startingSpecies: Species
    let previewSize: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var speciesIndex = 0
    @State private var level = 1
    @State private var points = 0

    private var examples: [Species] { [startingSpecies] + Species.allCases.filter { $0 != startingSpecies } }

    var body: some View {
        let species = examples[speciesIndex]
        VStack(spacing: 20) {
            PetPortrait(species: species, stage: PetExperience.stage(for: level), size: previewSize)
                .id(species)
                .accessibilityHidden(true)
            VStack(spacing: 8) {
                Text("示例 · \(species.name) · Lv.\(level) \(PetExperience.stageName(for: level))")
                    .font(.subheadline.weight(.semibold))
                ProgressView(value: Double(points), total: Double(PetExperience.pointsPerLevel))
                    .tint(Color.primary.opacity(0.78))
                    .accessibilityLabel("当前等级经验")
                Text("\(points) / \(PetExperience.pointsPerLevel) XP")
                    .font(.caption.monospacedDigit())
            }
            .frame(maxWidth: 248)
            VStack(spacing: 8) {
                Text("每记录满 1 分钟训练，获得 1 XP。每积满 \(PetExperience.pointsPerLevel) XP，宠物升一级。")
                    .font(.body)
                HStack {
                    Text("Lv.1 幼年")
                    Text("Lv.2 青年")
                    Text("Lv.3 起成年")
                }
                .font(.footnote.weight(.semibold))
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .task(id: reduceMotion || scenePhase != .active) {
            guard !reduceMotion, scenePhase == .active else { return }
            do {
                while !Task.isCancelled {
                    level = 1
                    points = 0
                    try await Task.sleep(for: .milliseconds(650))
                    for nextLevel in 2...PetExperience.stageNames.count {
                        for tick in 1...4 {
                            withAnimation(.linear(duration: 0.28)) {
                                points = PetExperience.pointsPerLevel * tick / 4
                            }
                            try await Task.sleep(for: .milliseconds(300))
                        }
                        level = nextLevel
                        points = 0
                        try await Task.sleep(for: .milliseconds(1200))
                    }
                    speciesIndex = (speciesIndex + 1) % examples.count
                }
            } catch { return }
        }
    }
}

private struct OnboardingHeartsDemo: View {
    let species: Species
    let previewSize: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var hearts = Pet.maximumHearts

    var body: some View {
        VStack(spacing: 20) {
            PetPortrait(species: species, size: previewSize)
                .saturation(hearts > 0 ? 1 : 0)
                .opacity(hearts > 0 ? 1 : 0.43)
                .accessibilityHidden(true)
            VStack(spacing: 8) {
                PetHeartRow(remaining: hearts, width: 22, spacing: 10)
                    .accessibilityHidden(true)
                Text(hearts == Pet.maximumHearts ? "示例 · 初始 \(hearts) 颗心" :
                        "示例 · 未达标第 \(Pet.maximumHearts - hearts) 天 · " +
                        (hearts > 0 ? "剩余 \(hearts) 颗心" : "宠物已离世"))
                    .font(.subheadline.weight(.semibold))
            }
            VStack(spacing: 8) {
                Text("宠物领养时有 \(Pet.maximumHearts) 颗心。从首个完整日开始，按北京时间结算。当天训练时长没达到每日目标，就会失去一颗心。")
                    .font(.body)
                Text("爱心归零时，宠物会离世。")
                    .font(.subheadline.weight(.semibold))
            }
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .task(id: reduceMotion || scenePhase != .active) {
            guard !reduceMotion, scenePhase == .active else { return }
            do {
                while !Task.isCancelled {
                    hearts = Pet.maximumHearts
                    for remaining in stride(from: Pet.maximumHearts - 1, through: 0, by: -1) {
                        try await Task.sleep(for: .milliseconds(950))
                        withAnimation(.easeInOut(duration: 0.32)) { hearts = remaining }
                    }
                    try await Task.sleep(for: .milliseconds(1550))
                }
            } catch { return }
        }
    }
}

struct SpeciesPicker: View {
    @Binding var selection: Species
    var isOnboarding = false

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 5), spacing: isOnboarding ? 14 : 8) {
            ForEach(Species.allCases) { species in
                let isSelected = selection == species
                Button { selection = species } label: {
                    VStack(spacing: isOnboarding ? 4 : 2) {
                        if isOnboarding {
                            onboardingThumbnail(for: species)
                        } else {
                            PetPortrait(species: species, size: 33)
                        }
                        Text(species.name).font((isOnboarding ? Font.subheadline : .caption2).weight(isSelected ? .bold : .regular))
                            .underline(!isOnboarding && isSelected)
                            .lineLimit(1).minimumScaleFactor(0.75)
                    }
                    .padding(.horizontal, isOnboarding ? 4 : 0)
                    .padding(.vertical, isOnboarding ? 5 : 0)
                    .background(isOnboarding && isSelected ? Color.black.opacity(0.13) : .clear,
                                in: .rect(cornerRadius: 9))
                    .frame(maxWidth: .infinity, minHeight: 49)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
    }

    private func onboardingThumbnail(for species: Species) -> some View {
        let artwork = PixelArtwork.shared
        let sprite = artwork.pet(species)?.resting.first
        return Group {
            if let sprite, let image = artwork.image(sprite),
               let cropped = image.cropping(to: artwork.visibleBounds(for: sprite, image: image)) {
                Image(decorative: cropped, scale: 1)
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
            } else {
                Color.clear
            }
        }
        .frame(width: 38, height: 38)
    }
}

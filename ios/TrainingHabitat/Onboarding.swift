import SwiftUI

struct Onboarding: View {
    private enum Step: Int { case goal, pet, habitat }
    let model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var step = Step.goal
    @State private var goingBack = false
    @State private var colorIndex = 0
    @State private var goalInput = "30"
    @State private var species = Species.cat
    @State private var habitat = Habitat.garden
    @State private var name = "团团"

    private let rainbow: [UInt32] = [0xfa8198, 0xffa258, 0xffda49, 0x91d568, 0x57cfbf, 0x7cafff, 0xc492f5]
    private let ink = Color(red: 0.08, green: 0.19, blue: 0.29)
    private var goal: Int { Int(goalInput) ?? 0 }

    var body: some View {
        GeometryReader { geometry in
            let top = min(150, max(64, geometry.size.height * 0.14))
            ZStack {
                color(rainbow[colorIndex]).ignoresSafeArea()
                if step == .habitat {
                    habitatStep(top: top).transition(.opacity)
                } else {
                    page(top: top, previewSize: min(176, max(118, geometry.size.height * 0.28)))
                        .id(step)
                        .transition(reduceMotion ? .identity : .asymmetric(
                            insertion: .offset(x: goingBack ? -28 : 28).combined(with: .opacity),
                            removal: .offset(x: goingBack ? 20 : -20).combined(with: .opacity)
                        ))
                }
            }
        }
        .foregroundStyle(ink)
        .task(id: reduceMotion || step == .habitat) {
            guard !reduceMotion, step != .habitat else { return }
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(2)) } catch { return }
                withAnimation(.easeInOut(duration: 0.65)) {
                    colorIndex = (colorIndex + 1) % rainbow.count
                }
            }
        }
    }

    private func page(top: CGFloat, previewSize: CGFloat) -> some View {
        ViewThatFits(in: .vertical) {
            VStack(alignment: .leading, spacing: 12) {
                title.padding(.top, top)
                Spacer(minLength: 10)
                pageContent(previewSize: previewSize)
                Spacer(minLength: 10)
                controls
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    title
                    pageContent(previewSize: previewSize)
                    controls
                }
                .padding(.vertical, 16)
            }
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 14)
    }

    @ViewBuilder
    private func pageContent(previewSize: CGFloat) -> some View {
        if step == .goal {
            VStack(spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    TextField("30", text: $goalInput)
                        .digitsKeyboard()
                        .multilineTextAlignment(.center)
                        .frame(width: 30 + CGFloat(max(2, min(4, goalInput.count))) * 40)
                        .font(.system(size: 72, weight: .heavy, design: .rounded))
                        .accessibilityLabel("每日目标分钟数")
                    Text("分钟").font(.headline)
                }
                .frame(maxWidth: .infinity)
                if goal < 10 || goal > 120 {
                    Text(goal < 10 ? "每日目标至少 10 分钟。" : "每日目标超过 2 小时。请留出休息时间，避免过度训练。")
                        .font(.footnote.weight(.semibold)).multilineTextAlignment(.center)
                }
            }
        } else {
            VStack(spacing: 4) {
                PetPortrait(species: species, size: previewSize, interactive: true).id(species)
                SpeciesPicker(selection: $species)
                Text("宠物名字").font(.footnote)
                TextField("团团", text: $name)
                    .font(.title3.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .padding(.vertical, 6)
                    .accessibilityLabel("宠物名字")
            }
        }
    }

    private func habitatStep(top: CGFloat) -> some View {
        ZStack {
            HabitatStill(habitat: habitat, species: species)
                .ignoresSafeArea()
            LinearGradient(colors: [.black.opacity(0.47), .clear, .clear, .black.opacity(0.74)],
                           startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea().allowsHitTesting(false)
            VStack(alignment: .leading) {
                title.padding(.top, top)
                Spacer()
                Text("栖息地背景").font(.footnote)
                Picker("栖息地背景", selection: $habitat) {
                    ForEach(Habitat.allCases) { Text($0.name).tag($0) }
                }
                .tint(.white)
                .labelsHidden()
                .padding(.bottom, 16)
                controls
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 28).padding(.bottom, 14)
        }
    }

    private var title: some View {
        Text(step == .goal ? "设定每日训练目标" : step == .pet ? "领养宠物" : "选择栖息地")
            .font(.system(size: 33, weight: .heavy))
            .accessibilityAddTraits(.isHeader)
    }

    private var controls: some View {
        HStack {
            if step != .goal {
                Button("返回") { move(to: step == .pet ? .goal : .pet) }.buttonStyle(.plain)
            }
            Spacer()
            Button {
                switch step {
                case .goal: move(to: .pet)
                case .pet: move(to: .habitat)
                case .habitat:
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
            .disabled(step == .goal ? !(10...1440).contains(goal) :
                        step == .pet && (name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || name.count > 12))
        }
        .frame(minHeight: 44)
    }

    private func move(to next: Step) {
        goingBack = next.rawValue < step.rawValue
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.32)) { step = next }
    }

    private func color(_ value: UInt32) -> Color {
        Color(red: Double(value >> 16) / 255, green: Double((value >> 8) & 255) / 255, blue: Double(value & 255) / 255)
    }
}

struct SpeciesPicker: View {
    @Binding var selection: Species

    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 5), spacing: 8) {
            ForEach(Species.allCases) { species in
                Button { selection = species } label: {
                    VStack(spacing: 2) {
                        PetPortrait(species: species, size: 33)
                        Text(species.name).font(.caption2.weight(selection == species ? .bold : .regular))
                            .underline(selection == species)
                            .lineLimit(1).minimumScaleFactor(0.75)
                    }
                    .frame(maxWidth: .infinity, minHeight: 49)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == species ? .isSelected : [])
            }
        }
    }
}

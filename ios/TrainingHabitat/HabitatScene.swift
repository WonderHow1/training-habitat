import SpriteKit
import SwiftUI
#if os(iOS)
import UIKit
#endif

struct HabitatStill: View {
    let habitat: Habitat
    let species: Species
    var stage = 1

    var body: some View {
        GeometryReader { geometry in
            let scale = max(geometry.size.width / 88, geometry.size.height / 192)
            ZStack {
                PixelImage(art: PixelArtwork.shared.habitat(habitat))
                    .frame(width: 88 * scale, height: 192 * scale)
                    .accessibilityHidden(true)
                PetPortrait(species: species, stage: stage, size: 39 * scale, interactive: true)
                    .padding(.top, 12 * scale)
                    .id(species)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipped()
        }
    }
}

struct HabitatCanvas: View {
    let habitat: Habitat
    var pet: Pet?
    var stage = 1
    var animating = true
    var isMemorial = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var scene = HabitatScene()

    var body: some View {
        SpriteView(scene: scene, isPaused: !animating)
            .accessibilityLabel(habitat.name + (pet.map { "，" + $0.name } ?? ""))
            .onChange(of: habitat, initial: true) { _, _ in sync() }
            .onChange(of: pet?.id, initial: true) { _, _ in sync() }
            .onChange(of: stage) { _, _ in sync() }
            .onChange(of: isMemorial) { _, _ in sync() }
            .onChange(of: reduceMotion, initial: true) { _, _ in sync() }
            .clipped()
    }

    private func sync() {
        scene.display(habitat: habitat, pet: pet, stage: stage, reduced: reduceMotion, memorial: isMemorial)
    }
}

@MainActor
final class HabitatScene: SKScene {
    private let artwork = PixelArtwork.shared
    private let backdrop = SKSpriteNode()
    private let sprite = SKSpriteNode()
    private let mark = SKNode()
    private var habitat: Habitat = .garden
    private var currentPet: UUID?
    private var species: Species?
    private var stage = 1
    private var sprites: PixelArtwork.Sprites?
    private var resting: SKTexture?
    private var reduced = false
    private var memorial = false
    private var strollOrigin = CGPoint(x: 44, y: 96)
    #if os(iOS)
    private var touchStart: CGPoint?
    #endif

    override init() {
        super.init(size: CGSize(width: 88, height: 192))
        scaleMode = .aspectFill
        backgroundColor = .clear
        backdrop.size = size
        backdrop.position = CGPoint(x: 44, y: 96)
        addChild(backdrop)
        sprite.size = CGSize(width: 39, height: 39)
        sprite.anchorPoint = CGPoint(x: 0.5, y: 0.34)
        sprite.position = strollOrigin
        sprite.zPosition = 2
        addChild(sprite)
        for (x, y) in [(0, 0), (0, 1), (0, -1), (1, 0), (-1, 0)] {
            let pixel = SKSpriteNode(color: .white, size: CGSize(width: 1, height: 1))
            pixel.position = CGPoint(x: x, y: y)
            mark.addChild(pixel)
        }
        mark.zPosition = 1
        mark.isHidden = true
        addChild(mark)
    }

    required init?(coder: NSCoder) { return nil }

    func display(habitat: Habitat, pet: Pet?, stage: Int, reduced: Bool, memorial: Bool) {
        let priorStage = self.stage
        let samePet = pet?.id == currentPet
        let reset = !samePet || self.habitat != habitat
        guard reset || priorStage != stage || self.reduced != reduced || self.memorial != memorial || backdrop.texture == nil else { return }
        self.habitat = habitat
        self.stage = stage
        self.reduced = reduced
        self.memorial = memorial
        backdrop.texture = artwork.texture(artwork.habitat(habitat))
        currentPet = pet?.id
        species = pet?.species
        sprites = pet.flatMap { artwork.pet($0.species) }
        resting = artwork.texture(sprites?.resting[stage - 1])
        sprite.isHidden = pet == nil
        sprite.alpha = memorial ? 0.42 : 1
        sprite.removeAllActions()
        stopTrip()
        if reset {
            strollOrigin = CGPoint(x: 44, y: 96)
            sprite.position = strollOrigin
            sprite.xScale = 1
        }
        sprite.texture = resting
        if samePet && priorStage < stage && !reduced && !memorial, let sprites, let resting {
            let growth = (priorStage - 1)..<(stage - 1)
            let textures = growth.flatMap { sprites.growth[$0] }.compactMap { artwork.texture($0) } + [resting]
            sprite.run(.animate(with: textures, timePerFrame: 0.08), withKey: "reaction")
            scheduleStroll(after: Double(textures.count) * 0.08 + 2.6)
        } else {
            scheduleStroll(after: 3)
        }
    }

    private var terrain: WalkTerrain {
        let width = view.map { min(88, $0.bounds.width / max($0.bounds.width / 88, $0.bounds.height / 192, 0.001)) } ?? 88
        return WalkTerrain(habitat: habitat, visibleWidth: width)
    }

    #if os(iOS)
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        touchStart = touches.first?.location(in: self)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        defer { touchStart = nil }
        guard let start = touchStart, let point = touches.first?.location(in: self),
              hypot(point.x - start.x, point.y - start.y) < 6 else { return }
        respond(to: point)
    }
    #elseif os(macOS)
    override func mouseUp(with event: NSEvent) {
        respond(to: event.location(in: self))
    }
    #endif

    private func respond(to point: CGPoint) {
        guard !sprite.isHidden, !memorial else { return }
        if abs(point.x - sprite.position.x) < 13 && abs(point.y - sprite.position.y) < 13 {
            react()
            return
        }
        move(to: terrain.destination(near: point), marked: true)
    }

    private func react() {
        guard let sprites, let resting else { return }
        stopTrip()
        sprite.removeAction(forKey: "reaction")
        let frames = sprites.reactions[stage - 1]
        var actions = (reduced ? Array(frames.prefix(1)) : frames).compactMap { frame -> SKAction? in
            guard let texture = artwork.texture(frame.png) else { return nil }
            return .sequence([.setTexture(texture), .wait(forDuration: reduced ? 0.36 : Double(frame.duration) / 1000)])
        }
        actions.append(.setTexture(resting))
        sprite.run(.sequence(actions), withKey: "reaction")
        scheduleStroll(after: 3)
    }

    private func stopTrip() {
        removeAction(forKey: "stroll")
        sprite.removeAction(forKey: "trip")
        sprite.removeAction(forKey: "walk")
        mark.isHidden = true
    }

    private func move(to destination: CGPoint, marked: Bool) {
        guard let sprites, let resting, let species else { return }
        stopTrip()
        sprite.removeAction(forKey: "reaction")
        if marked {
            mark.position = destination
            mark.isHidden = false
        }
        var previous = sprite.position
        let actions = terrain.waypoints(from: previous, to: destination).flatMap { point -> [SKAction] in
            let dx = point.x - previous.x
            let distance = hypot(dx, point.y - previous.y)
            previous = point
            let normallyLeft = [Species.cat, .dog, .rabbit, .chinchilla].contains(species)
            let move = SKAction.move(to: point, duration: reduced ? 0 : Double(distance) * 0.035)
            guard abs(dx) >= 1 else { return [move] }
            let face = SKAction.run { [weak self] in
                self?.sprite.xScale = (dx < 0) == normallyLeft ? 1 : -1
            }
            return [face, move]
        }
        if !reduced && species != .goldfish {
            let walk = sprites.walk[stage - 1].compactMap { artwork.texture($0) }
            if !walk.isEmpty {
                sprite.run(.repeatForever(.animate(with: walk, timePerFrame: 0.135)), withKey: "walk")
            }
        }
        sprite.run(.sequence(actions + [.run { [weak self] in
            guard let self else { return }
            self.sprite.removeAction(forKey: "walk")
            self.sprite.texture = resting
            self.mark.isHidden = true
            if marked { self.strollOrigin = destination }
            self.scheduleStroll(after: 2.6)
        }]), withKey: "trip")
    }

    private func scheduleStroll(after pause: TimeInterval) {
        guard !reduced, !memorial, !sprite.isHidden else { return }
        run(.sequence([.wait(forDuration: pause), .run { [weak self] in
            guard let self else { return }
            let point = CGPoint(x: self.strollOrigin.x + .random(in: -14...14),
                                y: self.strollOrigin.y + .random(in: -7...7))
            self.move(to: self.terrain.destination(near: point), marked: false)
        }]), withKey: "stroll")
    }
}

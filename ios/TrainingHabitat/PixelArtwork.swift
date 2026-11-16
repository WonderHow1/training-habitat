import Foundation
import ImageIO
import SpriteKit
import SwiftUI

@MainActor
final class PixelArtwork {
    struct Frame: Decodable {
        let png: String
        let duration: Int
    }

    struct Sprites: Decodable {
        let resting: [String]
        let walk: [[String]]
        let reactions: [[Frame]]
        let growth: [[String]]
    }

    private struct Content: Decodable {
        let habitats: [String: String]
        let pets: [String: Sprites]
    }

    static let shared = PixelArtwork()
    private let content: Content?
    private var images: [String: CGImage] = [:]
    private var textures: [String: SKTexture] = [:]

    private init() {
        content = Bundle.main.url(forResource: "PixelArtwork", withExtension: "json")
            .flatMap { try? Data(contentsOf: $0) }
            .flatMap { try? JSONDecoder().decode(Content.self, from: $0) }
    }

    func habitat(_ habitat: Habitat) -> String? { content?.habitats[habitat.rawValue] }
    func pet(_ species: Species) -> Sprites? { content?.pets[species.rawValue] }

    func image(_ key: String?) -> CGImage? {
        guard let key else { return nil }
        if let cached = images[key] { return cached }
        guard let data = Data(base64Encoded: key),
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
        images[key] = image
        return image
    }

    func texture(_ key: String?) -> SKTexture? {
        guard let key else { return nil }
        if let cached = textures[key] { return cached }
        guard let image = image(key) else { return nil }
        let texture = SKTexture(cgImage: image)
        texture.filteringMode = .nearest
        textures[key] = texture
        return texture
    }
}

struct PixelImage: View {
    let art: String?

    var body: some View {
        if let image = PixelArtwork.shared.image(art) {
            Image(decorative: image, scale: 1).resizable().interpolation(.none)
        } else {
            Color.clear
        }
    }
}

struct PetPortrait: View {
    private enum Playback: Equatable {
        case reaction(UUID)
        case growth(Int, Int)
    }

    let species: Species
    var stage = 1
    var size: CGFloat
    var interactive = false
    var animatePreview = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pose: String?
    @State private var playback: Playback?

    private var sprites: PixelArtwork.Sprites? { PixelArtwork.shared.pet(species) }

    var body: some View {
        Group {
            if interactive {
                Button { playback = .reaction(UUID()) } label: { portrait }
                    .buttonStyle(.plain)
                    .accessibilityLabel("摸摸\(species.name)")
            } else {
                portrait
            }
        }
        .onChange(of: stage) { previous, next in
            playback = .growth(previous, next)
        }
        .task(id: playback) {
            pose = nil
            guard let playback, let sprites else { return }
            switch playback {
            case .reaction:
                let frames = sprites.reactions[stage - 1]
                for frame in reduceMotion ? Array(frames.prefix(1)) : frames {
                    guard !Task.isCancelled else { return }
                    pose = frame.png
                    try? await Task.sleep(for: .milliseconds(reduceMotion ? 350 : frame.duration))
                }
            case let .growth(from, to):
                guard !reduceMotion else { return }
                let parts = sprites.growth[(min(from, to) - 1)..<(max(from, to) - 1)]
                let forward = Array(parts.joined())
                for frame in from < to ? forward : Array(forward.reversed()) {
                    guard !Task.isCancelled else { return }
                    pose = frame
                    try? await Task.sleep(for: .milliseconds(80))
                }
            }
            if !Task.isCancelled { pose = nil }
        }
        .task(id: reduceMotion) {
            guard animatePreview, !reduceMotion else { return }
            let index = Species.allCases.firstIndex(of: species) ?? 0
            do {
                try await Task.sleep(for: .milliseconds(index * 240 + 450))
                while !Task.isCancelled {
                    playback = .reaction(UUID())
                    try await Task.sleep(for: .seconds(7))
                }
            } catch {
                return
            }
        }
    }

    private var portrait: some View {
        PixelImage(art: pose ?? sprites?.resting[stage - 1])
            .frame(width: size, height: size)
    }
}

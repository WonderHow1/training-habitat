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
    private var croppedImages: [String: CGImage] = [:]
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

    func croppedImage(_ key: String?) -> CGImage? {
        guard let key else { return nil }
        if let cached = croppedImages[key] { return cached }
        guard let image = image(key) else { return nil }

        let width = image.width
        let height = image.height
        let bytesPerRow = width * 4
        let rgba = CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                                      bytesPerRow: bytesPerRow, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: rgba),
              let pixels = context.data?.assumingMemoryBound(to: UInt8.self) else { return image }
        context.setBlendMode(.copy)
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

        var left = width
        var top = height
        var right = -1
        var bottom = -1
        for y in 0..<height {
            for x in 0..<width where pixels[y * bytesPerRow + x * 4 + 3] > 0 {
                left = min(left, x)
                top = min(top, y)
                right = max(right, x)
                bottom = max(bottom, y)
            }
        }
        guard left <= right, top <= bottom else { return image }
        let bounds = CGRect(x: left, y: top, width: right - left + 1, height: bottom - top + 1)
        let cropped = image.cropping(to: bounds) ?? image
        croppedImages[key] = cropped
        return cropped
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
    var visibleHeight: CGFloat?

    var body: some View {
        if let visibleHeight, let image = PixelArtwork.shared.croppedImage(art) {
            Image(decorative: image, scale: 1).resizable().interpolation(.none)
                .frame(width: visibleHeight * CGFloat(image.width) / CGFloat(image.height), height: visibleHeight)
        } else if let image = PixelArtwork.shared.image(art) {
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
    var walksHorizontally = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var pose: String?
    @State private var playback: Playback?
    @State private var strollStarted = Date()

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

    @ViewBuilder private var portrait: some View {
        let art = pose ?? sprites?.resting[stage - 1]
        if walksHorizontally, let sprites {
            strollingPortrait(resting: sprites.resting[stage - 1], steps: sprites.walk[stage - 1])
        } else {
            PixelImage(art: art)
                .frame(width: size, height: size)
        }
    }

    private func strollingPortrait(resting: String, steps: [String]) -> some View {
        let walkingFrames = species == .goldfish ? [] : steps
        let frames = [resting] + walkingFrames + (pose.map { [$0] } ?? [])
        let width = frames.compactMap { key -> CGFloat? in
            guard let image = PixelArtwork.shared.croppedImage(key) else { return nil }
            return size * CGFloat(image.width) / CGFloat(image.height)
        }.max() ?? size

        return GeometryReader { lane in
            let slot = min(width, lane.size.width)
            let distance = reduceMotion ? 0 : min(54, lane.size.width - slot)
            TimelineView(.animation(minimumInterval: 1 / 30, paused: distance == 0 || scenePhase != .active)) { clock in
                let stroll = HorizontalPetStroll(elapsed: clock.date.timeIntervalSince(strollStarted), distance: distance)
                let step = stroll.step.flatMap { walkingFrames.isEmpty ? nil : walkingFrames[$0 % walkingFrames.count] }
                let scale: CGFloat = distance == 0 || stroll.movingLeft == species.walkingSpriteFacesLeft ? 1 : -1
                PixelImage(art: pose ?? step ?? resting, visibleHeight: size * slot / width)
                    .scaleEffect(x: scale, y: 1)
                    .position(x: slot / 2 + stroll.offset, y: size / 2)
            }
        }
        .frame(height: size)
    }
}

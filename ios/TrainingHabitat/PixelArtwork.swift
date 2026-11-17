import Foundation
import ImageIO
import SpriteKit
import SwiftUI
#if os(iOS)
import UIKit
#endif

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
    @State private var stroll = HorizontalPetStroll()

    private var sprites: PixelArtwork.Sprites? { PixelArtwork.shared.pet(species) }

    var body: some View {
        Group {
            if walksHorizontally {
                portrait
            } else {
                petControl { portrait }
            }
        }
        .onChange(of: stage) { previous, next in
            playback = .growth(previous, next)
        }
        .task(id: playback) {
            pose = nil
            guard let playback else { return }
            defer {
                if !Task.isCancelled, self.playback == playback {
                    pose = nil
                    self.playback = nil
                }
            }
            guard let sprites else { return }
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
            strollingPortrait(resting: sprites.resting[stage - 1], steps: sprites.walk[stage - 1],
                              reactions: sprites.reactions[stage - 1])
        } else {
            PixelImage(art: art)
                .frame(width: size, height: size)
        }
    }

    @ViewBuilder
    private func petControl<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        if interactive {
            Button(action: react) {
                content().contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("摸摸\(species.name)")
        } else {
            content()
        }
    }

    private func react() {
        if walksHorizontally { stroll.stop(at: .now) }
        playback = .reaction(UUID())
    }

    private func strollingPortrait(resting: String, steps: [String], reactions: [PixelArtwork.Frame]) -> some View {
        let walkingFrames = species == .goldfish ? [] : steps
        let frames = [resting] + walkingFrames + reactions.map(\.png)
        let width = frames.compactMap { key -> CGFloat? in
            guard let image = PixelArtwork.shared.croppedImage(key) else { return nil }
            return size * CGFloat(image.width) / CGFloat(image.height)
        }.max() ?? size

        return GeometryReader { lane in
            let slot = min(width, lane.size.width)
            let distance = min(78, lane.size.width - slot)
            let rightAlignedStart = lane.size.width - slot - distance
            let canWalk = !reduceMotion && scenePhase == .active && playback == nil && distance > 0
            TimelineView(.animation(minimumInterval: 1 / 30, paused: !canWalk || !stroll.isWalking)) { clock in
                let sample = stroll.sample(at: clock.date)
                let step = sample.step.flatMap { walkingFrames.isEmpty ? nil : walkingFrames[$0 % walkingFrames.count] }
                let scale: CGFloat = reduceMotion || stroll.movingLeft == species.walkingSpriteFacesLeft ? 1 : -1
                PixelImage(art: pose ?? step ?? resting, visibleHeight: size * slot / width)
                    .scaleEffect(x: scale, y: 1)
                    #if os(iOS)
                    .overlay {
                        if interactive { TitlePetTapTarget(label: "摸摸\(species.name)", react: react) }
                    }
                    #endif
                    .position(x: rightAlignedStart + slot / 2 + sample.fraction * distance, y: size / 2)
            }
            .task(id: canWalk ? distance : 0) {
                stroll.stop(at: .now)
                guard canWalk else { return }
                var random = SystemRandomNumberGenerator()
                while !Task.isCancelled {
                    do {
                        try await Task.sleep(for: .seconds(Double.random(in: 0.8...2.7, using: &random)))
                        try Task.checkCancellation()
                        guard playback == nil else { return }
                        let duration = stroll.walk(distance: distance, at: .now, using: &random)
                        try await Task.sleep(for: .seconds(duration))
                        try Task.checkCancellation()
                        stroll.stop(at: .now)
                    } catch {
                        return
                    }
                }
            }
        }
        .frame(height: size)
    }
}

#if os(iOS)
private struct TitlePetTapTarget: UIViewRepresentable {
    let label: String
    let react: () -> Void

    func makeUIView(context: Context) -> TargetView {
        let view = TargetView()
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = true
        view.accessibilityTraits = .button
        return view
    }

    func updateUIView(_ view: TargetView, context: Context) {
        view.accessibilityLabel = label
        view.react = react
    }

    static func dismantleUIView(_ view: TargetView, coordinator: ()) {
        view.detach()
    }

    final class TargetView: UIView, UIGestureRecognizerDelegate {
        var react: (() -> Void)?
        private weak var attachedWindow: UIWindow?
        private lazy var tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))

        override func didMoveToWindow() {
            super.didMoveToWindow()
            detach()
            attachedWindow = window
            tap.cancelsTouchesInView = false
            tap.delegate = self
            window?.addGestureRecognizer(tap)
        }

        func detach() {
            attachedWindow?.removeGestureRecognizer(tap)
            attachedWindow = nil
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            guard let window, window.isKeyWindow, window.rootViewController?.presentedViewController == nil,
                  !bounds.isEmpty, bounds.insetBy(dx: -8, dy: -6).contains(touch.location(in: self)) else { return false }
            // The large title's hosting view can paint the pet while suppressing its hit testing.
            // Recognize only taps on the visible sprite and let other UIKit gestures continue.
            var ancestor: UIView? = self
            while let view = ancestor {
                if view.isHidden || view.alpha < 0.01 { return false }
                if view !== self, view.clipsToBounds, !view.bounds.contains(touch.location(in: view)) { return false }
                ancestor = view.superview
            }
            return true
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool { true }

        override func accessibilityActivate() -> Bool {
            guard let react else { return false }
            react()
            return true
        }

        @objc private func handleTap() {
            react?()
        }
    }
}
#endif

import CoreGraphics

struct HabitatZoomDrag {
    private var isVertical: Bool?
    private var origin: CGFloat?

    mutating func distance(translation: CGSize, expanded: Bool, scrollOffset: CGFloat) -> CGFloat? {
        let height = translation.height
        let atTop = scrollOffset <= 2
        if isVertical == nil {
            isVertical = abs(height) > abs(translation.width)
            if expanded || atTop { origin = 0 }
        }
        guard isVertical == true else { return nil }

        // A pull that started farther down only counts once the list reaches its top.
        if origin == nil, atTop, height > 0 {
            origin = max(0, height + min(0, scrollOffset))
        }
        guard let origin else { return nil }
        return max(0, expanded ? origin - height : height - origin)
    }

    static func progress(distance: CGFloat, viewportHeight: CGFloat, expanded: Bool) -> CGFloat {
        let fraction = min(1, distance / max(180, viewportHeight * 0.32))
        return expanded ? 1 - fraction : fraction
    }

    static func completes(distance: CGFloat) -> Bool { distance >= 64 }
}

struct HabitatZoomGeometry {
    static let cardRadius: CGFloat = 22
    let card: CGRect
    let viewport: CGRect

    func frame(at progress: CGFloat) -> CGRect {
        guard !card.isEmpty else { return viewport }
        return CGRect(
            x: interpolate(card.minX, viewport.minX, progress),
            y: interpolate(card.minY, viewport.minY, progress),
            width: interpolate(card.width, viewport.width, progress),
            height: interpolate(card.height, viewport.height, progress)
        )
    }

    func cornerRadius(toward screenRadius: CGFloat, at progress: CGFloat) -> CGFloat {
        interpolate(Self.cardRadius, screenRadius, progress)
    }

    private func interpolate(_ from: CGFloat, _ to: CGFloat, _ progress: CGFloat) -> CGFloat {
        from + (to - from) * progress
    }
}

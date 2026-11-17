import Foundation

struct HorizontalPetStroll {
    struct Sample {
        let fraction: CGFloat
        let step: Int?
    }

    private var origin: CGFloat = 0.5
    private var destination: CGFloat = 0.5
    private var startedAt: Date?
    private var duration: TimeInterval = 0
    private(set) var movingLeft = false

    var isWalking: Bool { startedAt != nil }

    func sample(at now: Date) -> Sample {
        guard let startedAt else { return .init(fraction: origin, step: nil) }
        let elapsed = max(0, now.timeIntervalSince(startedAt))
        let progress = min(1, elapsed / duration)
        return .init(fraction: origin + (destination - origin) * progress,
                     step: progress < 1 ? Int(elapsed / 0.135) : nil)
    }

    mutating func stop(at now: Date) {
        origin = sample(at: now).fraction
        startedAt = nil
    }

    mutating func walk<R: RandomNumberGenerator>(distance: CGFloat, at now: Date, using random: inout R) -> TimeInterval {
        stop(at: now)
        guard distance > 0 else { return 0 }
        let minimumTravel: CGFloat = 0.22
        movingLeft = origin >= minimumTravel && (origin > 1 - minimumTravel || Bool.random(using: &random))
        let choices = movingLeft ? 0...(origin - minimumTravel) : (origin + minimumTravel)...1
        destination = CGFloat.random(in: choices, using: &random)
        duration = max(0.2, Double(abs(destination - origin) * distance) / Double.random(in: 20...34, using: &random))
        startedAt = now
        return duration
    }
}

struct WalkTerrain {
    let habitat: Habitat
    var visibleWidth: CGFloat = 88

    func destination(near point: CGPoint) -> CGPoint {
        let candidates = (46...101).compactMap { row -> CGPoint? in
            let y = CGFloat(row)
            guard let span = horizontalRange(y: y) else { return nil }
            return CGPoint(x: min(span.upperBound, max(span.lowerBound, point.x)), y: y)
        }
        return candidates.min { distance($0, point) < distance($1, point) } ?? CGPoint(x: 44, y: 96)
    }

    func waypoints(from: CGPoint, to: CGPoint) -> [CGPoint] {
        let steps = max(1, Int(abs(to.y - from.y).rounded(.up)))
        let rows = (0...steps).map { from.y + (to.y - from.y) * CGFloat($0) / CGFloat(steps) }
        if rows.enumerated().allSatisfy({ index, y in
            let x = from.x + (to.x - from.x) * CGFloat(index) / CGFloat(steps)
            return horizontalRange(y: y)?.contains(x) == true
        }) {
            return [to]
        }
        let rightEdges: [CGFloat] = rows.compactMap { horizontalRange(y: $0)?.upperBound }
        let x = min(from.x, to.x, rightEdges.min() ?? 44)
        return [CGPoint(x: x, y: from.y), CGPoint(x: x, y: to.y), to]
    }

    private func horizontalRange(y: CGFloat) -> ClosedRange<CGFloat>? {
        let left = max(13, 57 - visibleWidth / 2)
        var right = min(75, 31 + visibleWidth / 2)
        if habitat == .garden {
            let bottom = max(84, 192 - y + 8)
            let shore = (73 - (bottom - 84) * 0.38 + sin(bottom / 11) * 5).rounded()
            right = min(right, shore - 13)
        }
        return left <= right ? left...right : nil
    }

    private func distance(_ lhs: CGPoint, _ rhs: CGPoint) -> CGFloat {
        let dx = lhs.x - rhs.x
        let dy = lhs.y - rhs.y
        return dx * dx + dy * dy
    }
}

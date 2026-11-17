import Foundation

struct HorizontalPetStroll {
    let offset: CGFloat
    let movingLeft: Bool
    let step: Int?

    init(elapsed: TimeInterval, distance: CGFloat) {
        guard distance > 0 else {
            offset = 0
            movingLeft = false
            step = nil
            return
        }
        let crossing = Double(distance) / 26
        let leg = crossing + 0.5
        let phase = max(0, elapsed).truncatingRemainder(dividingBy: 2 * leg)
        movingLeft = phase >= leg
        let timeInLeg = movingLeft ? phase - leg : phase
        let fraction = min(1, timeInLeg / crossing)
        offset = distance * (movingLeft ? 1 - fraction : fraction)
        step = timeInLeg < crossing ? Int(timeInLeg / 0.135) : nil
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

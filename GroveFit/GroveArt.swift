import SwiftUI

enum Grove {
    static let paper = Color(hex: 0xFAF7EF)
    static let card = Color(hex: 0xFFFDFA)
    static let ink = Color(hex: 0x282E24)
    static let muted = Color(hex: 0x646B58)
    static let green = Color(hex: 0x334D37)
    static let line = Color(hex: 0xE6E2D4)
    static let moss = Color(hex: 0xE8EDD9)
    static let amber = Color(hex: 0xF5E7C2)
    static let coral = Color(hex: 0xBC594D)
    static let blush = Color(hex: 0xFAE5DB)
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double(hex >> 16 & 255) / 255, green: Double(hex >> 8 & 255) / 255, blue: Double(hex & 255) / 255)
    }
}

struct Meadow: View {
    var stage = 0
    var dead = false

    private let rabbit = [
        ".....DDD.......DDD.....",
        "....DLLDD.....DDLLD....",
        "....DLPOD.....DOPLD....",
        "....DLPOD.....DOPLD....",
        "....DLOODDDDDDDOOLD....",
        "....DLOOOOOOOOOOOLD....",
        "...DLOOOOLLLLOOOOOLD...",
        "..DLOOOOOOOOOOOOOOOLD..",
        "..DLOOOCDOOOODOCOOLD..",
        "..DOOOOCDOOOODOCOOOD..",
        "..DOOPCCCCDCCCCPPOOD..",
        "...DOCCCCCDCCCCCOOD...",
        "....DDOCCCCCCCODDD....",
        ".....DOCCCCCCCOD......",
        "....DOOCWWWWCOOD.DD...",
        "...DOOCCWWWWCCOODOLD..",
        "...DOOCCCCCCCCOODOLD..",
        "....DCCODDDDOCCD.DD...",
        "....DDDD....DDDD......"
    ]

    var body: some View {
        Canvas { context, size in
            let xUnit = size.width / 120
            let yUnit = size.height / 80
            func r(_ x: Int, _ y: Int, _ w: Int, _ h: Int, _ hex: UInt32) {
                let rect = CGRect(x: Double(x) * xUnit, y: Double(y) * yUnit, width: Double(w) * xUnit, height: Double(h) * yUnit)
                context.fill(Path(rect), with: .color(Color(hex: hex)))
            }
            func cloud(_ x: Int, _ y: Int) {
                r(x + 3, y, 10, 2, 0xFFFBDA)
                r(x, y + 2, 18, 3, 0xFFFBDA)
                r(x + 6, y + 5, 10, 1, 0xF7ECC0)
            }
            func bush(_ x: Int, _ y: Int, large: Bool) {
                let width = large ? 17 : 12
                r(x + 3, y, width - 6, 3, 0x9BAD71)
                r(x + 1, y + 3, width - 2, 3, 0x9BAD71)
                r(x, y + 6, width, 4, 0x82965D)
                r(x + width / 2, y + 2, 2, 2, 0xC7CD8D)
                r(x + 2, y + 7, 2, 2, 0xBCC786)
            }

            r(0, 0, 120, 80, dead ? 0xDDDCD0 : 0xF6EDBD)
            r(0, 29, 120, 21, dead ? 0xE1E0D1 : 0xF9EFC8)
            r(86, 8, 12, 13, 0xF5D17E)
            r(84, 11, 16, 7, 0xF5D17E)
            r(88, 10, 5, 2, 0xFBE1A1)
            cloud(12, 11)
            cloud(104, 22)
            cloud(56, 6)
            for (x, y) in [(35, 22), (73, 26), (17, 29), (109, 11), (47, 14)] {
                r(x, y + 1, 5, 1, 0xFFF8D6)
                r(x + 2, y - 1, 1, 5, 0xFFF8D6)
            }

            for (x, top, width) in [(0, 39, 21), (5, 34, 17), (14, 31, 14), (22, 35, 22), (32, 40, 30), (72, 36, 32), (83, 31, 24), (100, 35, 14), (109, 39, 11)] {
                r(x, top, width, 51 - top, 0xD4DBA4)
            }
            r(0, 49, 120, 31, dead ? 0xC8CAB0 : 0xC0CE8F)
            r(0, 65, 120, 15, dead ? 0xBDBFA5 : 0xB1C181)
            r(0, 65, 12, 3, 0xC0CE8F)
            r(87, 65, 33, 4, 0xC0CE8F)
            bush(6, 42, large: true)
            bush(22, 44, large: false)
            bush(99, 40, large: true)
            bush(88, 44, large: false)
            for (x, y) in [(5, 59), (26, 58), (23, 74), (36, 64), (8, 70), (93, 58), (106, 74), (83, 72), (113, 62), (74, 76), (47, 77)] {
                r(x, y, 6, 1, 0x98AC68)
                r(x + 2, y - 3, 1, 3, 0x98AC68)
                r(x + 4, y - 2, 1, 3, 0x98AC68)
            }
            for (x, y) in [(14, 60), (29, 68), (97, 66), (112, 55)] {
                r(x, y, 1, 5, 0x8A9E63)
                r(x - 1, y, 3, 2, 0xFFF6C1)
                r(x, y - 1, 1, 4, 0xFFF6C1)
                r(x, y + 1, 1, 1, 0xDFC16C)
            }
            r(36, 69, 50, 4, 0x9AAC73)
            r(42, 67, 38, 8, 0x9AAC73)
            if dead {
                r(52, 47, 18, 23, 0x7A8573)
                r(55, 43, 12, 8, 0x7A8573)
                r(54, 49, 14, 18, 0xA8B09A)
                r(59, 51, 3, 12, 0x778272)
                r(56, 54, 9, 3, 0x778272)
                r(48, 67, 26, 4, 0x829073)
                return
            }
            let palette: [Character: UInt32] = ["D": 0x533B28, "L": 0xF2BB84, "O": 0xDA8D56, "P": 0xDE9586, "C": 0xFFE9BF, "W": stage > 0 ? 0xB4C47F : 0xFFE9BF]
            for (row, line) in rabbit.enumerated() {
                for (column, pixel) in line.enumerated() {
                    if let hex = palette[pixel] { r(37 + column * 2, 32 + row * 2, 2, 2, hex) }
                }
            }
            if stage == 2 {
                r(57, 39, 9, 3, 0x718655)
                r(60, 36, 3, 8, 0x718655)
                r(62, 34, 5, 4, 0xA3B764)
            }
            r(60, 21, 2, 8, 0xFFFAE0)
            r(57, 24, 8, 2, 0xFFFAE0)
        }
        .accessibilityHidden(true)
    }
}

struct PixelHeart: View {
    var filled: Bool

    var body: some View {
        Canvas { context, size in
            let pixels = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."]
            for (y, line) in pixels.enumerated() {
                for (x, pixel) in line.enumerated() where pixel == "#" {
                    let u = size.width / 7
                    let v = size.height / 6
                    let rect = CGRect(x: Double(x) * u, y: Double(y) * v, width: u, height: v)
                    let color = filled ? (y == 1 && x == 1 ? Color(hex: 0xFFBAA1) : Grove.coral) : Grove.line
                    context.fill(Path(rect), with: .color(color))
                }
            }
        }
        .frame(width: 21, height: 18)
        .accessibilityHidden(true)
    }
}

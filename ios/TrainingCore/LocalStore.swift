import Foundation

struct LocalStore {
    let file: URL

    private struct Snapshot: Codable {
        let version: Int
        let state: TrainingState
    }

    static func appStorage() throws -> LocalStore {
        let appSupport = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
                                                     appropriateFor: nil, create: true)
        var directory = appSupport.appending(path: "TrainingHabitat", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        #if os(iOS)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        #endif
        return LocalStore(file: directory.appending(path: "training.json"))
    }

    func load() throws -> TrainingState {
        let data: Data
        do {
            data = try Data(contentsOf: file)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            return TrainingState()
        }
        let snapshot = try JSONDecoder().decode(Snapshot.self, from: data)
        guard snapshot.version == 1 else { throw CocoaError(.fileReadUnknown) }
        return snapshot.state
    }

    func save(_ state: TrainingState) throws {
        let data = try JSONEncoder().encode(Snapshot(version: 1, state: state))
        #if os(iOS)
        try data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: file, options: [.atomic])
        #endif
    }
}

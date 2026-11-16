import HealthKit
import SwiftUI

@main
struct HealthCheckApp: App {
    var body: some Scene {
        WindowGroup { HealthCheckView() }
    }
}

struct HealthCheckView: View {
    @State private var status = "请先在「健康」App 确认最近有一条体能训练，再点下方按钮。"
    @State private var checking = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Personal Team · 真机验证") {
                    Text("读取最近 30 天的训练。这里只显示读取数量和最近一条的时长。")
                    Text(status).accessibilityIdentifier("health-check-result")
                    Button("请求权限并读取") { Task { await check() } }
                        .disabled(checking)
                    if checking { ProgressView() }
                }
            }
            .navigationTitle("Apple 健康自检")
        }
    }

    @MainActor
    private func check() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            status = "当前设备无法使用 HealthKit，请在 iPhone 上验证。"
            return
        }
        checking = true
        defer { checking = false }

        do {
            let store = HKHealthStore()
            try await store.requestAuthorization(toShare: [], read: [HKObjectType.workoutType()])
            let after = Calendar.current.date(byAdding: .day, value: -30, to: Date())!
            let predicate = HKQuery.predicateForSamples(withStart: after, end: Date(), options: .strictStartDate)
            let query = HKSampleQueryDescriptor(
                predicates: [HKSamplePredicate<HKWorkout>.workout(predicate)],
                sortDescriptors: [SortDescriptor(\.endDate, order: .reverse)],
                limit: 20
            )
            let workouts = try await query.result(for: store)
            if let first = workouts.first {
                status = "读取成功，返回 \(workouts.count) 条训练。最近一条约 \(Int(first.duration / 60)) 分钟。"
            } else {
                status = "没有读到训练。若健康 App 中已有近期训练，请核对该 App 的读取授权后重试。"
            }
        } catch {
            status = "读取失败。\(error.localizedDescription)"
        }
    }
}

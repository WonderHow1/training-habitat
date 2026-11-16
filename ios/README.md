# 训练栖地 · iPhone 个人版

以 `prototype-v1.2` 为界面与素材基线，使用 SwiftUI、原生 Liquid Glass 和 SpriteKit。工程最低支持 iOS 26，含首次引导、今天的全屏栖息地、计划、回顾、宠物图鉴、训练计时与本地提醒。训练、宠物和提醒配置存放在 App 的本机容器。

## 用免费 Apple 账户安装

1. 安装完整的 Xcode 26 或更新版本，并完成首次启动。直接用真机时，安装 iOS 开发所需的组件即可。 [Apple Xcode 下载](https://apps.apple.com/cn/app/xcode/id497799835) · [平台组件说明](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components)
2. 打开 `TrainingHabitat.xcodeproj`。在 Xcode 的 `Settings → Accounts` 加入自己的 Apple 账户，选中 `TrainingHabitat` 目标，在 `Signing & Capabilities` 中启用自动签名，并选择自己的 `Personal Team`。
3. 用线连接并解锁 iPhone，按提示信任 Mac。开启 iPhone 的「设置 → 隐私与安全性 → 开发者模式」，按系统提示完成重启和确认。 [Apple 开发者模式说明](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)
4. 选择 `TrainingHabitat` scheme 和这台 iPhone，点 Xcode 的运行按钮。首次打开后设定目标、领养、选背景，再到「计划」新增一项训练做验收。

免费个人签名的安装凭证 7 天有效，期满后使用相同 Team 和 Bundle Identifier 从 Xcode 再运行。保留手机上的 App 以便更新安装沿用原容器。 [Apple 个人团队限制](https://developer.apple.com/help/account/basics/about-your-developer-account)

## Apple 健康真机自检

主 App 用手动记录。相同工程的 `HealthCheck` 是独立的签名和只读验证目标。它只声明基础 HealthKit 能力，查询最近 30 天的体能训练，显示最多 20 条读取结果的数量与最近一条时长。

1. 先在 iPhone 的「健康」App 确认有一条最近 30 天的体能训练。
2. 为 `HealthCheck` 目标选择相同 Personal Team，切换同名 scheme，然后运行到 iPhone。
3. 点「请求权限并读取」，允许读取体能训练。有返回样本即可证明此次签名、授权和查询均可用。显示零条记录时检查样本和读取授权，再重试。如果 Xcode 拒绝 HealthKit 签名，以该 iPhone 和 Personal Team 的错误为准，主 App 仍可单独运行。 [Apple iOS 能力支持表](https://developer.apple.com/help/account/reference/supported-capabilities-ios) · [HealthKit 授权说明](https://developer.apple.com/documentation/healthkit/protecting-user-privacy)

## 本机规则与验证

个人版用带版本号的原子 JSON 文件保存一份完整训练状态。写入成功后才更新界面状态，读到损坏文件会显示错误和重试入口。数据目录标记为排除备份。每日 XP 按训练开始所在的北京时间日期归日，每条有效训练取整分钟。达成当天目标后，XP 归训练结束时正在养的宠物。可独立检查跨午夜、24 小时补记、7 天设备更正、重新领养和撤销扣血。

在仓库根目录运行 `ios/scripts/check.sh`，可用 macOS 命令行工具验证上述规则、本机持久化、项目目标、签名配置和像素资源。完整 Xcode 安装后可先运行 `xcodebuild -project ios/TrainingHabitat.xcodeproj -scheme TrainingHabitat -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build`，再执行真机安装。

随包像素资源来自定稿标签，包括十种宠物的三阶段形象、点击动作、走路帧、升阶帧和五种栖息地。开发时用 Node.js 22.2 或以上运行 `node ios/scripts/export-pixel-art.mjs` 可从 Git 标签重新导出资源。

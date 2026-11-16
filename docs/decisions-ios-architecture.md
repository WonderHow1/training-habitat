# 训练栖地 iOS 技术方案

2026-11-17 · 首测架构已选定 · 原型基线 `prototype-v1.2`（`a4fa1c1`）

当前交付采用方案 A 的免费个人版，使用 Xcode Personal Team 安装到自己的 iPhone，Apple 健康先单独做真机自检。安装和验证见 [iPhone 个人版](../ios/README.md)。

首测面向中国大陆使用 iPhone 的大学生，通过 TestFlight 定向邀请。最低系统为 iOS 26。App 免登录，训练与宠物数据保存在手机上，参与者主动提交首测汇总。体验以 [日常原型](../design-demos/ios-prototype.html) 和 [新用户引导原型](../design-demos/new-user.html) 为准，计划截止、补记、更正及首测口径参照 [MVP 产品方案](mvp-product-plan.md)。

## 技术选型

| 方案 | 技术栈及适用条件 | 中国大陆使用条件 | 成本、维护及主要风险 |
| --- | --- | --- | --- |
| **A．本机优先的原生 iOS，已选定** | SwiftUI、SpriteKit、SwiftData、HealthKit、UserNotifications。训练、宠物与提醒在设备端运行，首测结果由参与者主动提交 | TestFlight 在中国大陆商店可下载，校内试用走外部测试员审核流程 | 应用服务器 ¥0/月。项目方维护 Apple 开发者账号、签名、发版和试用汇总。换机或卸载后，本机历史的恢复能力有限。 |
| **B．原生 iOS 加非健康设置同步** | A 加 CloudKit 私有数据库。给有跨设备需求的用户同步独立主题、提醒偏好和背景选择 | 中国大陆 iCloud 由云上贵州运营。发布前用目标区 Apple 账号验证同步及退出账户场景 | 无自建服务器，私有库占用户 iCloud 配额。项目方维护独立的数据模型、容器和冲突规则。离线编辑、未登录 iCloud 和存储不足需回退到本机体验。 |
| **C．原生 iOS 加国内首测汇总服务** | A 加腾讯云 CloudBase 上海环境，使用 HTTPS 云函数和数据库接收经同意的最小汇总。适合主动提交已影响样本完整度，且确需自动汇总的下一轮 | 上海环境可用。CloudBase 生产 HTTP 访问需绑定已备案的自定义域名 | 个人版刊例 ¥39.9/月，官方页面显示连续包月活动价 ¥19.9/月，另计超额、域名及运维人力。项目方维护服务端凭据、访问权限、留存删除和费用告警。主要风险是收集范围外溢、漏报和重试重复。 |

方案 A 能完整覆盖已确认的首测范围，固定成本最低，且能把开发时间留给结算正确性和宠物体验。B 仅同步独立于健康记录的偏好。个人健康数据及依赖健康记录计算的明细留在本机。C 的采集范围须在启用前单独审核。 [TestFlight 中国大陆商店](https://apps.apple.com/cn/app/testflight/id899247664) · [Apple TestFlight 审核说明](https://developer.apple.com/cn/help/app-store-connect/test-a-beta-version/testflight-overview/) · [iCloud 中国大陆运营说明](https://support.apple.com/zh-cn/111754) · [CloudKit 私有库](https://developer.apple.com/documentation/cloudkit/ckcontainer/privateclouddatabase) · [CloudBase 计费](https://cloud.tencent.com/document/product/876/140498) · [CloudBase HTTP 访问](https://cloud.tencent.com/document/product/876/130728) · [Apple 审核指南 §5.1.3](https://developer.apple.com/app-store/review/guidelines/#health-and-health-research)

## 方案 A 的实现

| 层 | 交付做法 |
| --- | --- |
| 页面与导航 | 一个 iPhone Xcode 工程，用 SwiftUI 实现首次引导、今天、计划、回顾和宠物。引导使用定稿中的方向转场及放大预览，完成后进入全屏栖息地。系统控件使用原生 Liquid Glass，像素画和浅灰控件以定稿为验收参考。保留减少动态效果和 VoiceOver 路径。 |
| 像素场景 | SwiftUI 的 `SpriteView` 嵌入 SpriteKit。把原型的像素图和关键帧离线转换为随包资源，使用最近邻采样保持像素边缘。10 种宠物、3 个阶段、5 个背景共用同一个场景实现。每个背景配置可行走区域、停留点及点击目标投影。全屏场景绘制动画，图鉴绘制可见项，离开页面暂停帧更新。 |
| 训练规则 | 用纯 Swift 实现可传入时间的计划与宠物结算。采用北京时间和 ISO 周，日期与实际时间分开表达。原计划截止为次日 00:00，随后 24 小时补记。从补记结束到原截止满 7 天之间，只有符合来源和时间条件的自动记录可用于更正。App 启动、回到前台、确认关联或编辑记录时触发结算。 |
| 本机存储 | SwiftData 保存计划、训练、关联、宠物领养区间、结算事件、目标和设置。用版本化模型管理升级，由一个写入入口校验并提交。按计划 ID 去重扣血，计划与训练各自最多关联一次。记录修改、更正或删除后，从相关记录重算 XP 和血量。 |
| Apple 健康 | 用 HealthKit 只读 `HKWorkout`，在用户主动点导入时申请权限并查询最近候选记录。保存 UUID、起止时间、实际时长和需要的来源标记，以 UUID 重复导入只保留一份。用时段与时长提示手填重复，由用户确认。对明确手填及无法确认自动来源的条目，仅按普通补记规则处理。没有可读记录时保留手动入口。 |
| 通知与计时 | UserNotifications 调度训练日与补记提醒，改期、完成或删除时更新关联提醒。提醒内容使用通用文案。计时保存起止基准，恢复前台时重新计算，计划结算以保存的时间和记录状态为准。 |

工程使用 Xcode 26 或更新版本和 iOS 26 SDK，部署目标设为 iOS 26。Apple 自 2026 年 4 月 28 日起按这一工具链版本要求接收上传。 [Apple 提交流程要求](https://developer.apple.com/news/upcoming-requirements/?id=04282026a) · [Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass) · [SpriteKit](https://developer.apple.com/documentation/spritekit) · [像素采样](https://developer.apple.com/documentation/spritekit/sktexture/filteringmode) · [SwiftData](https://developer.apple.com/documentation/swiftdata) · [HealthKit 隐私](https://developer.apple.com/documentation/healthkit/protecting-user-privacy) · [HealthKit 来源标记](https://developer.apple.com/documentation/healthkit/metadata-keys) · [本地通知](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app)

### 需要锁定的规则

- **计划与经验。** 计划按单场训练是否达标来结算，经验按定稿的每日总训练时长结算。达到当天目标后，当天训练每分钟计 1 XP，每 100 XP 升一级，Lv.1、Lv.2、Lv.3 分别进入幼年、青年、成年。旧 MVP 的「完成计划推进一次成长」进入验收用例时，应改为分别检查计划完成和每日经验。
- **跨宠物更正。** 建议按定稿把 XP 归给训练结束时在养的宠物，更正时只把扣血撤回到原扣血对象。旧 MVP 另有更正奖励归属，开工前用「旧宠物死亡后领养新宠物」的用例确认。
- **日期边界。** 实际起止时间用于判断训练是否跨日，实际有效时长用于达标和经验。若后续增加修改目标入口，建议以生效日期保存目标，历史按其当日目标重算。跨午夜训练的每日 XP 归日规则和不足整分钟的取整口径需与验收用例一起确认。

### 首测数据与发布

- 参与者预览后主动分享到首测收集渠道。初始汇总以试用编号、约定计划数、用户自报完成数和对漏练后行为的反馈为主，标注自报口径。以同一口径比较各组。App 的健康明细、UUID、精确训练时间、运动来源、HealthKit 派生的识别性事件留在设备端。若自报完整度有限，记录哪些样本缺失，并根据 MVP 约定保留已承诺计划的分母。
- 对健康相关数据采用设备文件保护，关闭 SwiftData 云同步，核对包含这些数据的文件与备份路径。隐私说明覆盖权限用途、数据留存与清除方式。希望把 Apple 健康数据用于研究或汇总时，先按实际目的审核数据范围、同意及研究要求。 [Apple HealthKit 隐私](https://developer.apple.com/documentation/healthkit/protecting-user-privacy) · [Apple 审核指南 §5.1.3](https://developer.apple.com/app-store/review/guidelines/#health-and-health-research) · [Apple 文件备份说明](https://developer.apple.com/documentation/foundation/optimizing-your-app-s-data-for-icloud-backup) · [《个人信息保护法》](https://hbca.miit.gov.cn/xxgk/zcwj/flfg/art/2022/art_bdbf836daf6049788148d12f343c4a77.html)
- 用 TestFlight 外部测试组定向邀请，首个外部构建需 Apple 审核，构建的测试期最长 90 天。后续公开上架时，依据实际功能与主体核验中国大陆上架和备案材料。 [TestFlight 审核与有效期](https://developer.apple.com/cn/help/app-store-connect/test-a-beta-version/testflight-overview/) · [中国大陆上架信息](https://developer.apple.com/cn/help/app-store-connect/reference/app-information/app-information)

## 人力与预算

以下是排期估算。假设已有 Mac 和 iOS 26 真机，由 1 位能独立开发 SwiftUI 与提交 TestFlight 的开发者实施，现有像素素材和规则测试可作为移植参考。

| 工作 | 工时 | 可验收结果 |
| --- | --- | --- |
| 工程和签名、数据模型、规则测试夹具 | 2–3 人日 | 真机可装，建立本机数据存储和可测试时钟 |
| 计划、计时、补记、更正、宠物血量与 XP | 5–7 人日 | 手动流程可运行，关键规则可用单元测试复验 |
| SwiftUI 页面、引导、手势与回顾 | 5–7 人日 | 日常与首次入口完整，转场和布局对照定稿 |
| 像素资源转换、三阶段动作与 5 个地图 | 4–7 人日 | 点按、散步、成长和图鉴可用，窄屏与帧率真机检查 |
| Apple 健康、提醒、试用汇总及发版回归 | 6–9 人日 | 真机验证授权、导入、重复合并和通知，构建送审 |
| **合计** | **22–33 人日** | 一人全职约 5–7 周开发，另排审核和两周有效试用窗口 |

- **持续现金。** A 的 App 后端和数据库订阅费用为 ¥0/月。Apple Developer Program 官方标价 US$99/年，按地区以注册页本币实价为准。公开隐私页面的托管与域名、设备采购和招募费用按现有资源另计。 [Apple 开发者会员与收费](https://developer.apple.com/cn/help/account/membership/program-enrollment)
- **外包测算示例。** 按自行设定的 ¥1,500–2,500/人日，A 的 22–33 人日对应约 ¥3.3–8.25 万。金额用于预算讨论，实际以报价为准。若新增 B 的有限偏好同步，预留 4–7 人日。若新增 C 的汇总服务、权限和删除流程，预留 5–9 人日。
- **首测验收。** 用 Swift Testing 移植 A01–A15 的规则矩阵并按当前 XP 口径补测。用真机验证隔日、24 小时、7 天边界、重复导入、换宠物、拒绝权限、进程退出后恢复和旧版本数据升级。用 XCUITest 验证引导、手动记录、原生栖息地和减少动态效果。第一轮以两周完成率为主指标，按末项截止后 24 小时出初步结果、7 天锁定结果。

首测发布前待确认招募人数、预算上限与负责人，以及 XP 边界和来源验收口径。只有跨设备需求或自动汇总成为首测交付条件时，才重新评估架构选型。

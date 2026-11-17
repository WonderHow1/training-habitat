# 训练栖地 iOS MVP 产品介绍片

新版为 [训练栖地竖屏短片](vertical/训练栖地-竖屏短片.mp4)。它使用像素猫团团、原生操作录屏、内嵌简体中文字幕以及无旁白的配乐和触点音效。时码和制作说明见[竖屏短片说明](vertical/README.md)。

## 横版初稿

[MP4 成片](训练栖地-iOS-MVP-产品介绍.mp4)为 1 分 14 秒、1920×1080、30 fps，内嵌简体中文字幕。配音用 macOS 本地普通话语音合成，配乐与提示音来自 Huashu-Design 素材库。

成片从一周三项计划、只留下一次记录的示例切入。介绍首批用户、漏练和漏记、为什么用像素猫反馈训练，以及两周首测计划。在 iOS 界面中演示设目标、领养、选栖息地、排计划、改期、计时、补记和回顾。操作画面从项目已有的原生验证截图中剪辑，日期与项目名来自多组测试数据。升阶使用应用随包的橘猫像素帧。

- [导演稿](导演稿.md)和[旁白与字幕时间轴](narration.json)记录内容与剪辑顺序。
- [HTML 画面预览](film.html)支持定位到任意镜头。配音、配乐和提示音在 MP4 中。
- [方向确认](direction-approved.md)、[事实依据](product-facts.md)和[打磨记录](polish-log.md)保留前期方案与核对记录。

在项目根目录执行 `node design-demos/product-film/render-film.mjs <输出目录> --stills-only` 可用本机 Chrome 验证并导出分镜关键帧。移去 `--stills-only` 可同时导出 30fps 的 H.264 画面。用 `python3 design-demos/product-film/verify-film.py <MP4 文件>` 对成片作技术校验，可通过 `FFMPEG`、`FFPROBE` 指定工具路径。

# 训练栖地竖屏短片

[观看成片](训练栖地-竖屏短片.mp4)。时长 68.8 秒，9:16，1080×1920，30 fps。简体中文说明直接嵌入画面。声音为原创合成配乐和操作提示音，无人声旁白。

| 段落 | 画面 |
| --- | --- |
| 00:00–00:12 | 保留 B 方案的像素开场，由猫团团出场。说明首批用户为排过训练、也漏过练的 iPhone 大学生，解释课业冲突和漏记怎样打断一周的训练。 |
| 00:12–00:26 | 点开操场跑步，进入编辑和日期选择，把计划从 11 月 17 日改到 18 日。保存后回到计划详情核对新日期。 |
| 00:26–00:40 | 在「今天」点「记录」和计时，显示计时器开始运行。剪短等待后点「结束并记录」，显示已保存且计划已完成。 |
| 00:40–01:00 | 打开昨天的「待补记」计划，分别选择 18:01 和 18:21，核对 20 分钟和日期后确认保存。 |
| 01:00–01:09 | 在「回顾」看到新增的两次训练。以猫的真实像素成长帧和两周首测计划收束。 |

所有操作来自 iOS 模拟器对原生 App 的单次连续屏幕录制，使用三条示例计划。成片剪掉空等，在真实点击的时间和位置叠加触点。计时等待剪短处有字幕提示。为保留每一步的操作结果，改期保存、计时保存和补记确认分别留出可读时间。

## 重新合成

需要 Python 的 Pillow、NumPy，以及带 libx264 和 libass 的 FFmpeg。把原始录屏 `take01.mov` 放入同一输出目录。本次采集的文件保存在本机临时目录 `/tmp/habitat-vertical/`。所有时间和触点见[剪辑清单](timeline.json)。

```sh
python3 design-demos/product-film/vertical/title_cards.py <输出目录>
python3 design-demos/product-film/vertical/assemble.py design-demos/product-film/vertical/timeline.json <输出目录> <输出目录>/film.mp4
python3 design-demos/product-film/verify-film.py <输出目录>/film.mp4 --portrait-timeline design-demos/product-film/vertical/timeline.json
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s design-demos/product-film/vertical
```

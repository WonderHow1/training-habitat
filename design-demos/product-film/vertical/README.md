# 训练栖地真机像素版

[观看成片](训练栖地-竖屏短片.mp4)。时长约 50 秒，9:16，1080×1920，60 fps。片内嵌简体中文字幕，声音为原创配乐和触点音效。

| 段落 | 画面 |
| --- | --- |
| 00:00–00:12 | 像素草地推进，猫团团出场。文字错拍入场，日程卡片跨天移动，记录页用像素卡片说明课业冲突和训练漏记。 |
| 00:12–00:21 | 打开操场跑步计划，进入编辑和日历，把 11 月 17 日改到 18 日并保存。结果页显示新日期。 |
| 00:21–00:28 | 展开记录选项并开始计时。剪掉等待后点击结束，保存提示确认计划已完成。 |
| 00:28–00:42 | 打开昨天的待补记计划，分别设置 18:01 和 18:21，核对 20 分钟后确认保存。 |
| 00:42–00:50 | 到「回顾」查看新增的两条训练。像素经验条填充，团团的三阶段造型依次出现，最后显示产品名。 |

操作来自 iPhone 15。通过 macOS 的 iPhone 镜像控制，分段采集独立录制包及其示例数据。操作段按原速播放，保留原生界面过渡。等待计时只在开始与结束之间剪短并在画面上注明。触点根据实际点按位置和时间叠加。

## 重新合成

需要 Python 的 Pillow、NumPy，以及带 libx264 和 libass 的 FFmpeg。本次真机采集的四个 MOV 源文件保存在 `/tmp/habitat-vertical/iphone-edit/`。把它们放在同一输出目录。准确入点、出点、画幅裁切和触点见[剪辑清单](timeline.json)。

```sh
python3 design-demos/product-film/vertical/title_cards.py <输出目录>
python3 design-demos/product-film/vertical/assemble.py design-demos/product-film/vertical/timeline.json <输出目录> <输出目录>/film.mp4
python3 design-demos/product-film/verify-film.py <输出目录>/film.mp4 --portrait-timeline design-demos/product-film/vertical/timeline.json
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s design-demos/product-film/vertical
```

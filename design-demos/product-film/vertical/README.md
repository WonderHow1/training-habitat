# 训练栖地真机像素版

[观看成片](训练栖地-竖屏短片.mp4)。时长约 77 秒，9:16，1080×1920，60 fps。片内嵌简体中文字幕，声音为原创配乐和触点音效。

| 段落 | 画面 |
| --- | --- |
| 00:00–00:12 | 像素猫团团出场。日程卡片移动和记录卡片说明目标用户遇到的课业冲突和训练漏记。 |
| 00:12–00:24 | 新手引导介绍每日训练时长目标、十种可领养宠物、自定义名字，以及用记录时长累计 XP、升级和三阶段成长。 |
| 00:24–00:29 | 展示宠物的三颗爱心，细说首个完整日、北京时间结算、未达标扣心和归零规则。 |
| 00:29–00:39 | 展示草地、健身房、操场跑道、客厅与卧室，演示点场景移动和点团团互动。随后用原生真机录屏展示「宠物」页的经验、爱心和更换背景入口。 |
| 00:39–00:48 | 打开操场跑步计划，进入编辑和日历，把 11 月 17 日改到 18 日并保存。结果页显示新日期。 |
| 00:48–00:55 | 展开记录选项并开始计时。剪掉等待后点击结束，保存提示确认计划已完成。 |
| 00:55–01:09 | 打开昨天的待补记计划，分别设置 18:01 和 18:21，核对 20 分钟后确认保存。 |
| 01:09–01:17 | 到「回顾」查看新增的两条训练。像素经验条填充，团团的三阶段造型依次出现，最后显示产品名。 |

新手引导用随 App 打包的十种宠物、五种栖息地和猫的原版动作帧制作。栖息地实景和训练操作来自 iPhone 15 独立录制包及其示例数据。操作段按原速播放，触点根据实际点按位置和时间叠加。计时等待剪短处有字幕提示。

## 重新合成

需要 Python 的 Pillow、NumPy，以及带 libx264 和 libass 的 FFmpeg。五个真机 MOV 源文件保存在 `/tmp/habitat-vertical/iphone-edit/`。把它们放在同一输出目录。准确入点、出点、画幅裁切和触点见[剪辑清单](timeline.json)。

```sh
python3 design-demos/product-film/vertical/title_cards.py <输出目录>
python3 design-demos/product-film/vertical/onboarding_cards.py <输出目录>
python3 design-demos/product-film/vertical/assemble.py design-demos/product-film/vertical/timeline.json <输出目录> <输出目录>/film.mp4
python3 design-demos/product-film/verify-film.py <输出目录>/film.mp4 --portrait-timeline design-demos/product-film/vertical/timeline.json
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s design-demos/product-film/vertical
```

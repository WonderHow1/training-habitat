# 训练栖地真机像素版

[观看成片](训练栖地-竖屏短片.mp4)。时长约 81 秒，9:16，1080×1920，60 fps。片内嵌简体中文字幕，声音为原创配乐和触点音效。

| 段落 | 画面 |
| --- | --- |
| 00:00–00:12 | 像素猫团团出场。日程卡片移动和记录卡片说明目标用户遇到的课业冲突和训练漏记。 |
| 00:12–00:24 | 新手引导介绍每日训练时长目标、十种可领养宠物、自定义名字，以及用记录时长累计 XP、升级和三阶段成长。 |
| 00:24–00:29 | 展示宠物的三颗爱心，细说首个完整日、北京时间结算、未达标扣心和归零规则。 |
| 00:29–00:34 | 展示草地、健身房、操场跑道、客厅与卧室，演示点场景移动和点团团互动。 |
| 00:34–00:43 | 在真机的「今天」页点团团卡片进入全屏栖息地，点团团看爱心反馈，点草地引导团团走过去，再上滑返回。 |
| 00:43–00:51 | 打开操场跑步计划，进入编辑和日历，把 11 月 17 日改到 18 日并保存。结果页显示新日期。 |
| 00:51–00:58 | 展开记录选项并开始计时。剪掉等待后点击结束，保存提示确认计划已完成。 |
| 00:58–01:12 | 打开昨天的待补记计划，分别设置 18:01 和 18:21，核对 20 分钟后确认保存。 |
| 01:12–01:21 | 到「回顾」查看新增的两条训练。像素经验条填充，团团的三阶段造型依次出现，最后显示产品名。 |

新手引导用随 App 打包的十种宠物、五种栖息地和猫的原版动作帧制作。栖息地实景和训练操作来自 iPhone 15 独立录制包及其示例数据。改期、计时和补记用新版随内容调整高度的底部弹层重录，保存结果和回顾来自同一次演示。操作段按原速播放，像素触点跟随实际点按和滑动。计时等待剪短处有字幕提示。

## 重新合成

需要 Python 的 Pillow、NumPy，以及带 libx264 和 libass 的 FFmpeg。六个真机 MOV 源文件保存在 `/tmp/habitat-vertical/iphone-edit/`。把它们放在同一输出目录。准确入点、出点、画幅裁切和手势坐标见[剪辑清单](timeline.json)。

```sh
python3 design-demos/product-film/vertical/title_cards.py <输出目录>
python3 design-demos/product-film/vertical/onboarding_cards.py <输出目录>
python3 design-demos/product-film/vertical/assemble.py design-demos/product-film/vertical/timeline.json <输出目录> <输出目录>/film.mp4
python3 design-demos/product-film/verify-film.py <输出目录>/film.mp4 --portrait-timeline design-demos/product-film/vertical/timeline.json
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s design-demos/product-film/vertical
```

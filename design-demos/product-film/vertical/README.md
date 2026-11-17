# 训练栖地竖屏短片

[竖屏前后段预览](训练栖地-竖屏前后段预览.mp4)包含 4 秒像素猫开场、8 秒用户与痛点、6 秒成长与首测收尾。画幅 9:16，1080×1920，30 fps。原生像素猫团团在草地出场。两段字幕分别解释课业冲突打断计划、练完漏记导致回顾不完整。音乐和触点音效由合成器生成，全片无旁白。

原生录屏计划插在痛点和收尾之间。独立录制包使用示例数据。一场未到期的操场跑步用于改期，一分钟的核心训练用于计时，昨天的力量训练用于演示待补记和确认保存。最后到「回顾」核对结果。录制时根据实际点击坐标加触点圈，计时等待剪短并用字幕说明。

当前预览只包含已经渲染的前后段。新录屏素材待采集。模拟器启动后未交付可交互画面，真机测试启动时 Xcode 提示设备仍锁定。

## 复现预览

在本机准备 Python 的 Pillow、NumPy，以及带 libx264 和 libass 的 FFmpeg。运行命令时把 `<输出目录>` 换成同一个可写目录。

```sh
python3 design-demos/product-film/vertical/title_cards.py <输出目录>
python3 design-demos/product-film/vertical/assemble.py design-demos/product-film/vertical/preview.json <输出目录> <输出目录>/preview.mp4
python3 design-demos/product-film/verify-film.py <输出目录>/preview.mp4 --portrait-preview
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s design-demos/product-film/vertical
```

录屏剪辑清单的 `shots` 每项包括录屏文件 `file`、源视频起点 `start`、成片时长 `duration`、流程 `flow`、标题 `title`、字幕 `caption`、背景色 `color` 和 `touches`。触点为成片片段内秒数、屏幕归一化横纵坐标和持续秒数。需要调整倍速时可用 `speed`，变速剪掉等待时另加字幕。完整片用 `verify-film.py --portrait-timeline <剪辑清单>` 校验格式和流程覆盖。

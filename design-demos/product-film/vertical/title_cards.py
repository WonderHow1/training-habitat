"""Render the portrait opener, pain points and outro from the iOS pixel artwork."""

import argparse
import base64
from functools import lru_cache
import io
import json
from pathlib import Path
import subprocess

from PIL import Image, ImageDraw, ImageFont


WIDTH, HEIGHT, FPS = 1080, 1920, 30
ART = Path(__file__).resolve().parents[3] / "ios/TrainingHabitat/PixelArtwork.json"
FONT = "/Library/Fonts/Hiragino Sans GB.ttc"
INK = "#17281f"
SECONDARY = "#3e5648"
WHITE = "#f7f8f4"
SKY = "#d1e7fa"
GREEN = "#e6efda"
ORANGE = "#9c462e"


@lru_cache(maxsize=None)
def font(size, bold):
    return ImageFont.truetype(FONT, size, index=2 if bold else 0)


def label(draw, text, x, y, size, *, color=INK, bold=False, anchor="lt"):
    face = font(size, bold)
    bounds = draw.textbbox((x, y), text, font=face, anchor=anchor)
    assert bounds[0] >= 46 and bounds[2] <= WIDTH - 46, text
    draw.text((x, y), text, font=face, anchor=anchor, fill=color)


def ramp(value):
    value = max(0, min(1, value))
    return value * value * (3 - 2 * value)


def art(encoded):
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGBA")


def pixel(image, scale):
    return image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)


class Titles:
    def __init__(self):
        artwork = json.loads(ART.read_text())
        cat = artwork["pets"]["cat"]
        self.stages = [art(frame) for frame in cat["resting"]]
        self.reaction = [(art(frame["png"]), frame["duration"]) for frame in cat["reactions"][0]]
        self.growth = [art(frame) for frame in cat["growth"][0]]
        self.garden = pixel(art(artwork["habitats"]["garden"]), 13)

    def animal(self, canvas, cat, x, ground, scale):
        sprite = pixel(cat, scale)
        canvas.paste(sprite, (x - sprite.width // 2, ground - 35 * scale), sprite)

    def opener(self, t):
        canvas = Image.new("RGB", (WIDTH, HEIGHT), SKY)
        scene = self.garden.crop((32, 774, 1112, 1754))
        canvas.paste(scene, (0, 940))
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((0, 940, WIDTH, 990), fill="#d2e9f8")
        label(draw, "训练栖地", 76, 156, 42, bold=True)
        label(draw, "你在训练，", 72, 334, 115, bold=True)
        dy = round((1 - ramp((t - .36) / .44)) * 32)
        if t > .36:
            label(draw, "它在长大。", 72, 505 + dy, 115, bold=True)
        label(draw, "每次训练，都能看到团团的变化。", 77, 705, 42, color=SECONDARY)
        remaining = max(0, t - 1.25) * 1000
        cat = self.stages[0]
        if t >= 1.25:
            for frame, duration in self.reaction:
                if remaining < duration:
                    cat = frame
                    break
                remaining -= duration
        base = 1510
        draw.ellipse((352, base - 16, 680, base + 19), fill="#547d50")
        self.animal(canvas, cat, 520, base, 22)
        return canvas

    def pain(self, t):
        second = t >= 4
        canvas = Image.new("RGB", (WIDTH, HEIGHT), GREEN if second else WHITE)
        draw = ImageDraw.Draw(canvas)
        label(draw, "为排过训练、也漏过练的", 75, 188, 40, color=SECONDARY)
        label(draw, "iPhone 大学生设计", 75, 251, 40, color=SECONDARY)
        if second:
            label(draw, "练完忘了记。", 73, 454, 105, bold=True)
            label(draw, "回头想看进度，", 78, 631, 51)
            label(draw, "这一场已经找不到。", 78, 707, 51)
            label(draw, "本周训练", 96, 1032, 48, bold=True)
            entries = [("周一", "跑步", "已记录"), ("周三", "力量训练", "无记录"), ("周五", "跑步", "无记录")]
        else:
            label(draw, "课业一冲突，", 73, 454, 105, bold=True)
            label(draw, "训练就容易搁置。", 78, 631, 65)
            label(draw, "校园情境示意", 96, 1032, 48, bold=True)
            entries = [("周二", "傍晚跑步", "排了计划"), ("周二", "课程作业", "时间冲突"), ("周三", "跑步", "改期接上")]
        for i, (day, title, status) in enumerate(entries):
            if (t % 4) < .16 + i * .13:
                break
            y = 1142 + i * 127
            draw.line((96, y - 33, 983, y - 33), fill="#8d9c8c", width=2)
            label(draw, day, 96, y, 43, bold=True)
            label(draw, title, 280, y, 43)
            label(draw, status, 966, y, 42, color=ORANGE if i == 1 or second and i == 2 else SECONDARY, anchor="rt")
        return canvas

    def outro(self, t):
        canvas = Image.new("RGB", (WIDTH, HEIGHT), WHITE)
        draw = ImageDraw.Draw(canvas)
        label(draw, "把训练记录", 74, 213, 96, bold=True)
        label(draw, "变成看得见的成长。", 74, 353, 92, bold=True)
        label(draw, "每记录满 1 分钟训练，获得 1 XP。", 77, 544, 42, color=SECONDARY)
        draw.line((76, 1051, 1004, 1051), fill="#aebda8", width=2)
        if t < 1.0 and self.growth:
            frame = self.growth[min(len(self.growth) - 1, int(t * len(self.growth)))]
            self.animal(canvas, frame, 539, 1028, 16)
        else:
            for x, name, cat in zip((232, 540, 847), ("幼年", "青年", "成年"), self.stages, strict=True):
                self.animal(canvas, cat, x, 1028, 11)
                label(draw, name, x, 1099, 40, bold=True, anchor="mt")
        if t > 1.55:
            label(draw, "两周首测计划", 76, 1338, 48, bold=True)
            label(draw, "看计划完成率，也看漏练后有没有回来。", 76, 1432, 40, color=SECONDARY)
        label(draw, "训练栖地  iOS MVP", 76, 1722, 38, bold=True)
        return canvas


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    titles = Titles()
    for name, scene, duration in (("opening", titles.opener, 4), ("pain", titles.pain, 8), ("outro", titles.outro, 6)):
        video = args.directory / (name + ".mp4")
        command = [
            args.ffmpeg, "-y", "-v", "error", "-f", "rawvideo", "-pixel_format", "rgb24",
            "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS), "-i", "-",
            "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", str(video),
        ]
        with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
            for frame in range(duration * FPS):
                image = scene(frame / FPS)
                if frame == min(duration * FPS - 1, 75):
                    image.save(args.directory / (name + ".jpg"), quality=94)
                encoder.stdin.write(image.tobytes())
            encoder.stdin.close()
            if encoder.wait():
                raise subprocess.CalledProcessError(encoder.returncode, command)


if __name__ == "__main__":
    main()

"""Render the opening, illustrated pain points, and animated pixel-cat ending."""

import argparse
import base64
from functools import lru_cache
import io
import json
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageColor, ImageDraw, ImageFont


WIDTH, HEIGHT, FPS = 1080, 1920, 60
OPENING, PAIN, OUTRO = 4, 8, 4
ART = Path(__file__).resolve().parents[3] / "ios/TrainingHabitat/PixelArtwork.json"
FONT = "/Library/Fonts/Hiragino Sans GB.ttc"
INK = "#192820"
SECONDARY = "#45594f"
WHITE = "#f8faf6"
GREEN = "#edf5e4"
BLUE = "#ddecff"
ORANGE = "#934226"


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


def appear(canvas, text, x, y, size, progress, *, color=INK, bold=False, anchor="lt", travel=40):
    if progress <= 0:
        return
    y += round((1 - progress) * travel)
    face = font(size, bold)
    x0, y0, x1, y1 = face.getbbox(text, anchor=anchor)
    layer = Image.new("RGBA", (x1 - x0 + 4, y1 - y0 + 4))
    ink = (*ImageColor.getrgb(color), round(255 * progress))
    ImageDraw.Draw(layer).text((2 - x0, 2 - y0), text, font=face, anchor=anchor, fill=ink)
    canvas.paste(layer, (x + x0 - 2, y + y0 - 2), layer)


@lru_cache(maxsize=None)
def gradient(start, end):
    a, b = ImageColor.getrgb(start), ImageColor.getrgb(end)
    strip = Image.new("RGB", (1, HEIGHT))
    strip.putdata([tuple(round(x + (y - x) * i / (HEIGHT - 1)) for x, y in zip(a, b)) for i in range(HEIGHT)])
    return strip.resize((WIDTH, HEIGHT))


def art(encoded):
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGBA")


def pixel(image, scale):
    return image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)


def pixel_panel(draw, x, y, width, height, color, step=12):
    right, bottom = x + width, y + height
    draw.polygon(((x, y + step), (x + step, y + step), (x + step, y), (right - step, y),
                  (right - step, y + step), (right, y + step), (right, bottom - step),
                  (right - step, bottom - step), (right - step, bottom), (x + step, bottom),
                  (x + step, bottom - step), (x, bottom - step)), fill=color)


def tile_wipe(next_frame, previous, progress):
    if progress <= 0:
        return previous.copy()
    for row in range(16):
        for column in range(9):
            threshold = ((row + column) + ((row ^ column) % 4) / 4) / 24
            if progress < threshold:
                x, y = 120 * column, 120 * row
                next_frame.paste(previous.crop((x, y, x + 120, y + 120)), (x, y))
    return next_frame


class Titles:
    def __init__(self):
        artwork = json.loads(ART.read_text())
        cat = artwork["pets"]["cat"]
        self.stages = [art(frame) for frame in cat["resting"]]
        self.reaction = [(art(frame["png"]), frame["duration"]) for frame in cat["reactions"][0]]
        self.growth = [art(frame) for frame in cat["growth"][0]]
        self.garden = pixel(art(artwork["habitats"]["garden"]), 14)

    def animal(self, canvas, cat, x, ground, scale):
        sprite = pixel(cat, scale)
        canvas.paste(sprite, (x - sprite.width // 2, ground - 35 * scale), sprite)

    def opener(self, t):
        canvas = gradient("#f5f9ff", "#bedbf5").copy()
        rise = ramp((t + .16) / .86)
        horizon = round(917 + 315 * (1 - rise))
        drift = round(23 * ramp(t / 3.7))
        scene = self.garden.crop((62 + drift, 789, 1142 + drift, 789 + HEIGHT - horizon))
        canvas.paste(scene, (0, horizon))
        draw = ImageDraw.Draw(canvas)
        appear(canvas, "训练栖地", 76, 145, 41, ramp((t + .15) / .50), bold=True, travel=20)
        appear(canvas, "你在训练，", 72, 315, 118, ramp((t - .02) / .52), bold=True)
        appear(canvas, "它在长大。", 72, 479, 118, ramp((t - .34) / .53), bold=True)
        appear(canvas, "每次训练，都能看到团团的变化。", 78, 682, 42,
               ramp((t - .74) / .51), color=SECONDARY)
        pop = ramp((t - .31) / .6)
        ground = round(horizon + 624 - 78 * math.sin(pop * math.pi))
        center = round(562 - 26 * pop)
        scale = round(17 + 6 * pop)
        shadow = round(110 + 55 * pop)
        draw.ellipse((center - shadow, horizon + 608, center + shadow, horizon + 644), fill="#527751")
        elapsed = (t - 1.66) * 1000
        frame = self.stages[0]
        if elapsed >= 0:
            for pose, duration in self.reaction:
                if elapsed < duration:
                    frame = pose
                    break
                elapsed -= duration
        self.animal(canvas, frame, center, ground, scale)
        return canvas

    def pain(self, t):
        canvas = self.pain_frame(t)
        time = t % 4
        if time < .32:
            previous = self.opener(OPENING - 1 / FPS) if t < 4 else self.pain_frame(4 - 1 / FPS)
            return tile_wipe(canvas, previous, ramp(time / .32))
        return canvas

    def pain_frame(self, t):
        second = t >= 4
        time = t - 4 if second else t
        canvas = gradient("#f9faf5", "#e7efe0").copy() if second else gradient("#fcfdfb", "#ecf1f8").copy()
        appear(canvas, "给排过训练、也漏过练的", 77, 147, 41, ramp((time + .12) / .50), color=SECONDARY)
        appear(canvas, "iPhone 大学生", 77, 218, 47, ramp((time + .10) / .55), bold=True)
        appear(canvas, "练完忘了记。" if second else "课业一冲突，",
               72, 434, 106, ramp((time - .06) / .54), bold=True)
        appear(canvas, "回头看进度，少了这一场。" if second else "原定的训练就容易搁置。",
               78, 605, 50, ramp((time - .28) / .54), color=SECONDARY)
        if second:
            self.history(canvas, time)
        else:
            self.calendar(canvas, time)
        return canvas

    def calendar(self, canvas, t):
        draw = ImageDraw.Draw(canvas)
        label(draw, "校园情境示意", 81, 878, 37, color=SECONDARY)
        progress = ramp((t - .28) / .60)
        for day, x in (("周二", 78), ("周三", 554)):
            pixel_panel(draw, x, 976, 448, 588, "#ffffff", 18)
            appear(canvas, day, x + 46, 1028, 47, progress, bold=True)
        moved = ramp((t - 1.58) / .83)
        x = round(105 + 476 * moved)
        y = round(1160 + math.sin(moved * math.pi) * -52)
        if t > .52:
            pixel_panel(draw, x, y, 393, 120, "#ddecff")
            label(draw, "傍晚跑步", x + 30, y + 41, 43, bold=True)
        warning = ramp((t - 1.05) / .41)
        if warning > 0:
            top = round(1324 + (1 - warning) * 50)
            pixel_panel(draw, 105, top, 393, 125, "#f9e7df")
            appear(canvas, "课程作业撞期", 133, top + 45, 40, warning, color=ORANGE, bold=True)
        appear(canvas, "改期后接着练", 580, 1467, 35, ramp((t - 2.18) / .62), color=SECONDARY)

    def history(self, canvas, t):
        draw = ImageDraw.Draw(canvas)
        label(draw, "本周训练", 82, 878, 37, color=SECONDARY)
        for index, (day, project, state) in enumerate((("周一", "跑步", "已记录"),
                                                        ("周三", "力量训练", "没有记录"))):
            p = ramp((t - .32 - index * .19) / .56)
            if p <= 0:
                continue
            y = round(991 + index * 182 + (1 - p) * 64)
            missing = index == 1 and t > 1.33
            fill = "#fcfaf3" if missing else "#ffffff"
            pixel_panel(draw, 80, y, 914, 149, fill, 16)
            appear(canvas, day, 110, y + 52, 38, p, color=SECONDARY, bold=True)
            appear(canvas, project, 252, y + 47, 48, p, bold=True)
            appear(canvas, state, 956, y + 54, 36, p, color=ORANGE if index else SECONDARY, anchor="rt")
        appear(canvas, "这次练过，回顾里却是空白。", 84, 1455, 39,
               ramp((t - 1.47) / .55), color=SECONDARY)

    def outro(self, t):
        canvas = gradient("#fbfcf7", "#e6f0d9").copy()
        draw = ImageDraw.Draw(canvas)
        appear(canvas, "把训练记录", 74, 211, 100, ramp((t + .02) / .55), bold=True)
        appear(canvas, "变成看得见的成长。", 74, 349, 92, ramp((t - .21) / .57), bold=True)
        appear(canvas, "每记录满 1 分钟训练，获得 1 XP。", 77, 542, 43,
               ramp((t - .52) / .49), color=SECONDARY)
        bar = ramp((t - .72) / 1.15)
        for block in range(22):
            x = 77 + 42 * block
            tone = "#557952" if block < round(22 * bar) else "#cdd9c5"
            draw.rectangle((x, 714, x + 32, 735), fill=tone)
        if t < 1.30 and self.growth:
            frame = self.growth[min(len(self.growth) - 1, int(t / 1.30 * len(self.growth)))]
            self.animal(canvas, frame, 540, 1237, 20)
        else:
            for i, (x, name, cat) in enumerate(zip((235, 540, 845), ("幼年", "青年", "成年"), self.stages, strict=True)):
                p = ramp((t - 1.2 - i * .16) / .58)
                if p > 0:
                    offset = round(69 * (1 - p))
                    self.animal(canvas, cat, x, 1210 + offset, 13)
                    appear(canvas, name, x, 1281, 43, p, bold=True, anchor="mt", travel=18)
        appear(canvas, "训练栖地", 540, 1572, 58, ramp((t - 1.9) / .61), bold=True, anchor="mt")
        return canvas


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    args.directory.mkdir(parents=True, exist_ok=True)
    titles = Titles()
    scenes = (("opening", titles.opener, OPENING), ("pain", titles.pain, PAIN), ("outro", titles.outro, OUTRO))
    for name, scene, duration in scenes:
        video = args.directory / (name + ".mp4")
        command = [
            args.ffmpeg, "-y", "-v", "error", "-f", "rawvideo", "-pixel_format", "rgb24",
            "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS), "-i", "-",
            "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", str(video),
        ]
        with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
            for frame in range(duration * FPS):
                image = scene(frame / FPS)
                if frame == min(duration * FPS - 1, int(2.5 * FPS)):
                    image.save(args.directory / (name + ".jpg"), quality=94)
                encoder.stdin.write(image.tobytes())
            encoder.stdin.close()
            if encoder.wait():
                raise subprocess.CalledProcessError(encoder.returncode, command)


if __name__ == "__main__":
    main()
